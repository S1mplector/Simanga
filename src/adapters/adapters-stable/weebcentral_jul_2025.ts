import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "../services/netLimiter";
import settingsStore from "../services/settings";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  CircuitBreaker,
  SimpleCache,
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError,
} from "../services/adapterUtils";

const BASE_URL = "https://weebcentral.com";

class WeebCentralAdapter implements Adapter {
  id = "weebcentral";
  label = "WeebCentral";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };

  private proxyIndex = 0;
  private circuitBreaker = new CircuitBreaker(3, 30000); // More lenient: 3 failures, 30 second timeout
  private seriesCache = new SimpleCache<{ id: string; slug: string }>(600000); // 10 minute cache
  private responseCache = new SimpleCache<string>(120000); // 2 minute HTML cache
  private pendingRequests = new Map<string, Promise<string>>(); // Request deduplication

  /**
   * Fetch with proper headers and proxy rotation
   */
  private async fetchHtml(url: string): Promise<string> {
    // Check cache first
    const cached = this.responseCache.get(url);
    if (cached) {
      console.log("WeebCentral: Using cached response for", url);
      return cached;
    }
    
    // Check if there's already a pending request for this URL
    const pending = this.pendingRequests.get(url);
    if (pending) {
      console.log("WeebCentral: Reusing pending request for", url);
      return pending;
    }
    
    // Create new request
    const requestPromise = this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
      
      // Build proxy list
      const proxies: string[] = settingsStore.get("proxies") || [];
      const dispatchers: any[] = [];
      
      console.log("WeebCentral: Available proxies:", proxies.length);
      
      // Try direct connection first for better performance
      dispatchers.push(undefined);
      
      // Then try proxies if direct fails
      if (proxies.length > 0) {
        for (const proxy of proxies) {
          try {
            const agent = /^socks/i.test(proxy) ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
            dispatchers.push(agent);
          } catch (err) {
            console.warn("Invalid proxy for WeebCentral:", proxy);
          }
        }
      }
      
      let lastError: any;
      
      for (const agent of dispatchers) {
        const init: any = {
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        };
        
        if (agent) {
          init.agent = agent;
        }
        
        try {
          console.log("WeebCentral: Attempting fetch with", agent ? "proxy" : "direct connection");
          const res = await fetchWithTimeout(url, init, 15000);
          console.log("WeebCentral: Response status:", res.status);
          
          if (res.status === 429) {
            noteRateLimit();
            throw new RateLimitError("WeebCentral rate limit exceeded", 60);
          }
          
          if (res.status === 403) {
            noteRateLimit();
            throw new NetworkError("Access forbidden. WeebCentral may be blocking requests.", 403);
          }
          
          if (!res.ok) {
            throw new NetworkError(`WeebCentral request failed with status ${res.status}`, res.status);
          }
          
          noteSuccess();
          const text = await res.text();
          
          // Cache successful responses
          this.responseCache.set(url, text);
          
          // Remove from pending requests
          this.pendingRequests.delete(url);
          
          return text;
        } catch (err) {
          lastError = err;
          if (err instanceof AdapterError && !err.retryable) {
            throw err;
          }
          continue;
        }
      }
      
      throw lastError ?? new NetworkError("All connection attempts to WeebCentral failed");
    }).catch(err => {
      // Clean up pending request on error
      this.pendingRequests.delete(url);
      throw err;
    });
    
    // Store as pending request
    this.pendingRequests.set(url, requestPromise);
    
    return requestPromise;
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    const search = options?.query;
    console.log("WeebCentral: getMangaList called with search:", search);
    
    try {
      let url: string;
      const term = (search ?? "").trim();
      
      if (term) {
        // Use the data endpoint for search results
        url = `${BASE_URL}/search/data?text=${encodeURIComponent(term)}&display_mode=Full+Display`;
      } else {
        // Browse homepage for latest/popular manga
        url = BASE_URL;
      }
      
      console.log("WeebCentral: Fetching URL:", url);
      const html = await this.fetchHtml(url);
      console.log("WeebCentral: Received HTML length:", html.length);
      
      // Extract series links and titles
      const results: MangaMeta[] = [];
      const seenIds = new Set<string>();
      
      // Pattern for search results: <a href="https://weebcentral.com/series/ID/slug">
      const linkPattern = /href="https?:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/([^"]+)"/g;
      let match;
      
      while ((match = linkPattern.exec(html)) !== null) {
        const [_, id, slug] = match;
        
        if (!seenIds.has(id)) {
          seenIds.add(id);
          this.seriesCache.set(id, { id, slug });
        }
      }
      
      // Extract titles from the HTML
      // Look for title in the link text or nearby elements
      const titlePattern = /<a[^>]+href="https?:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/[^"]+">[\s\S]*?<div[^>]*class="[^"]*text-ellipsis[^"]*"[^>]*>([^<]+)<\/div>|<a[^>]+href="https?:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/[^"]+">([^<]+)<\/a>/g;
      
      while ((match = titlePattern.exec(html)) !== null) {
        const id = match[1] || match[3];
        const title = (match[2] || match[4]).trim();
        
        if (seenIds.has(id) && title && !results.find(r => r.id === id)) {
          results.push({ id, title });
        }
      }
      
      // If no titles found with pattern, try getting from image alt text
      if (results.length === 0) {
        const altPattern = /href="https?:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/[^"]+">[\s\S]*?alt="([^"]+)"/g;
        while ((match = altPattern.exec(html)) !== null) {
          const [_, id, altText] = match;
          if (seenIds.has(id)) {
            const title = altText.replace(/ cover$/, '').trim();
            if (title && !results.find(r => r.id === id)) {
              results.push({ id, title });
            }
          }
        }
      }
      
      // For homepage, also check article elements
      if (!term && results.length === 0) {
        const articlePattern = /<article[^>]*data-tip="([^"]+)"[^>]*>[\s\S]*?href="\/series\/([A-Z0-9]+)\//g;
        while ((match = articlePattern.exec(html)) !== null) {
          const [_, title, id] = match;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            results.push({ id, title });
          }
        }
      }
      
      console.log(`WeebCentral: Found ${results.length} manga`);
      
      if (results.length === 0 && term) {
        throw new ParseError(`No manga found for "${term}". Try different search terms.`);
      }
      
      const finalResults = results.slice(0, 100); // Limit to 100 results
      
      // WeebCentral doesn't provide clear pagination info
      const hasMore = results.length > 100;
      
      return { results: finalResults, hasMore };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("WeebCentral getMangaList error:", error);
      throw new NetworkError("Failed to fetch manga list from WeebCentral");
    }
  }

  async getChapterList(mangaId: string): Promise<ChapterMeta[]> {
    try {
      // Get slug from cache or construct URL
      const cached = this.seriesCache.get(mangaId);
      let url: string;
      
      if (cached) {
        url = `${BASE_URL}/series/${mangaId}/${cached.slug}`;
      } else {
        // If not cached, we need to search for it or use the ID directly
        url = `${BASE_URL}/series/${mangaId}`;
      }
      
      console.log("WeebCentral: Fetching chapter list from:", url);
      const html = await this.fetchHtml(url);
      
      // Extract chapter links
      const chapters: ChapterMeta[] = [];
      const seenIds = new Set<string>();
      
      // Updated pattern for chapter links
      // Look for: <a href="https://weebcentral.com/chapters/CHAPTER_ID">
      const chapterPattern = /href="https?:\/\/weebcentral\.com\/chapters\/([A-Z0-9]+)"[^>]*>[\s\S]*?(?:Chapter\s+(\d+(?:\.\d+)?)|Ch\.\s*(\d+(?:\.\d+)?)|#(\d+(?:\.\d+)?))/gi;
      let match;
      
      while ((match = chapterPattern.exec(html)) !== null) {
        const chapterId = match[1];
        const chapterNum = match[2] || match[3] || match[4];
        
        if (!seenIds.has(chapterId) && chapterNum) {
          seenIds.add(chapterId);
          chapters.push({
            id: chapterId,
            title: `Chapter ${chapterNum}`,
          });
        }
      }
      
      // Alternative pattern - look for chapter in span elements
      if (chapters.length === 0) {
        const spanPattern = /href="https?:\/\/weebcentral\.com\/chapters\/([A-Z0-9]+)"[^>]*>[\s\S]*?<span[^>]*>Chapter\s+(\d+(?:\.\d+)?)<\/span>/gi;
        while ((match = spanPattern.exec(html)) !== null) {
          const [_, chapterId, chapterNum] = match;
          if (!seenIds.has(chapterId)) {
            seenIds.add(chapterId);
            chapters.push({
              id: chapterId,
              title: `Chapter ${chapterNum}`,
            });
          }
        }
      }
      
      // New pattern to handle Episode format and other variations
      if (chapters.length === 0) {
        // More flexible pattern that captures the chapter link and finds the title in a nearby span
        const flexiblePattern = /href="https?:\/\/weebcentral\.com\/chapters\/([A-Z0-9]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*"[^>]*>(?:(Chapter|Episode|Ch\.|Ep\.?)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?))<\/span>/gi;
        
        while ((match = flexiblePattern.exec(html)) !== null) {
          const chapterId = match[1];
          const prefix = match[2] || "Chapter";
          const chapterNum = match[3] || match[4];
          
          if (!seenIds.has(chapterId) && chapterNum) {
            seenIds.add(chapterId);
            chapters.push({
              id: chapterId,
              title: `${prefix} ${chapterNum}`,
            });
          }
        }
      }
      
      console.log(`WeebCentral: Found ${chapters.length} chapters`);
      
      if (chapters.length === 0) {
        throw new ParseError("No chapters found. This manga may not have any chapters available.");
      }
      
      // Sort chapters by number (descending, newest first)
      chapters.sort((a, b) => {
        const numA = parseFloat(a.title.replace(/[^0-9.]/g, ''));
        const numB = parseFloat(b.title.replace(/[^0-9.]/g, ''));
        return numB - numA;
      });
      
      return chapters;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("WeebCentral getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapters for manga ${mangaId}`);
    }
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    try {
      const url = `${BASE_URL}/chapters/${chapterId}`;
      const html = await this.fetchHtml(url);
      
      // First, try to extract from preload links
      const preloadPattern = /rel="preload"\s+href="([^"]+)"\s+as="image"/g;
      const preloadUrls: string[] = [];
      let match;
      
      while ((match = preloadPattern.exec(html)) !== null) {
        preloadUrls.push(match[1]);
      }
      
      if (preloadUrls.length > 0) {
        // Use preload URLs to determine the pattern
        const firstUrl = preloadUrls[0];
        const urlMatch = firstUrl.match(/(.+\/)(\d+)-(\d{3})\.(jpg|png|webp)/);
        
        if (urlMatch) {
          const [_, basePath, chapterNum, pageNum, extension] = urlMatch;
          
          // Find total pages from HTML
          const totalPagesMatch = html.match(/data-total-pages="(\d+)"|"total_pages":\s*(\d+)|of\s+(\d+)\s+pages/i);
          const totalPages = totalPagesMatch 
            ? parseInt(totalPagesMatch[1] || totalPagesMatch[2] || totalPagesMatch[3]) 
            : 50; // Default to 50 if not found
          
          const pages: PageMeta[] = [];
          for (let i = 1; i <= totalPages; i++) {
            const paddedPage = String(i).padStart(3, '0');
            pages.push({
              index: i - 1,
              url: `${basePath}${chapterNum}-${paddedPage}.${extension}`,
            });
          }
          
          return pages;
        }
      }
      
      // Alternative: Look for image URLs in JavaScript
      const scriptPattern = /"images":\s*\[([\s\S]*?)\]|images\s*=\s*\[([\s\S]*?)\]/;
      const scriptMatch = html.match(scriptPattern);
      
      if (scriptMatch) {
        const imagesStr = scriptMatch[1] || scriptMatch[2];
        const imageUrls = imagesStr.match(/"([^"]+)"/g);
        
        if (imageUrls && imageUrls.length > 0) {
          return imageUrls.map((url, idx) => ({
            index: idx,
            url: url.replace(/"/g, ''),
          }));
        }
      }
      
      // Last resort: Look for any image tags in the reader section
      const imgPattern = /<img[^>]+src="([^"]+(?:jpg|png|webp))"[^>]*>/g;
      const images: string[] = [];
      
      while ((match = imgPattern.exec(html)) !== null) {
        const imgUrl = match[1];
        // Filter out UI images
        if (!imgUrl.includes('/static/') && !imgUrl.includes('logo') && !imgUrl.includes('icon')) {
          images.push(imgUrl);
        }
      }
      
      if (images.length > 0) {
        return images.map((url, idx) => ({
          index: idx,
          url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
        }));
      }
      
      throw new ParseError("No pages found for this chapter. The chapter may not be available yet.");
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("WeebCentral getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter ${chapterId}`);
    }
  }
}

export default new WeebCentralAdapter(); 