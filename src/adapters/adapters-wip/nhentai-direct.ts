import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "../Adapter";
import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "../../services/netLimiter";
import settingsStore from "../../services/settings";
import proxyManager from "../../services/proxyManager";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "../../services/adapterUtils";

const BASE_URL = "https://nhentai.net";

/**
 * nHentai adapter using direct URL patterns instead of API calls
 * This approach is more resilient to blocking since it doesn't rely on API endpoints
 * 
 * URL Patterns:
 * - Gallery: https://nhentai.net/g/{id}/
 * - Page: https://nhentai.net/g/{id}/{page}/
 * - Search: https://nhentai.net/search/?q={query}&page={page}
 * 
 * This bypasses the need for API calls which are more heavily monitored/blocked
 */
class NHentaiDirectAdapter implements Adapter {
  id = "nhentai";
  label = "nHentai";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: true,
    multiLanguage: true,
    authentication: 'none',
    rateLimit: {
      requests: 3,
      period: 2000, // More conservative: 3 requests per 2 seconds
    }
  };
  
  private circuitBreaker = new CircuitBreaker(3, 30000);
  private galleryCache = new SimpleCache<{ details: MangaMeta, pageCount: number }>(600000); // 10 minute cache
  private searchCache = new SimpleCache<MangaMeta[]>(300000); // 5 minute cache

  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      // Use very browser-like headers to avoid detection
      const headers = { 
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Referer": "https://nhentai.net/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate", 
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1"
      };
      
      // Get the best available proxy
      const proxyAgent = await proxyManager.getBestProxy("nhentai");
      
      const options: any = {
        headers,
        signal,
        redirect: 'follow'
      };
      
      if (proxyAgent) {
        options.agent = proxyAgent;
        console.log("nHentai: Using proxy for request");
      } else if (settingsStore.get("nhentaiProxyEnabled")) {
        throw new NetworkError(
          "No working proxy available for nHentai. Please check your proxy configuration or disable proxy requirement.",
          503
        );
      }
      
      const response = await fetchWithTimeout(url, options, 15000);
      
      if (response.status === 429) {
        noteRateLimit();
        throw new RateLimitError("Rate limited by nHentai", 60);
      }
      
      if (response.status === 403) {
        throw new NetworkError(
          "Access forbidden (403). Try using a different proxy or VPN location.",
          403
        );
      }
      
      if (response.status === 404) {
        throw new NetworkError("Content not found", 404);
      }
      
      if (!response.ok) {
        throw new NetworkError(
          `Request failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }
      
      noteSuccess();
      
      const html = await response.text();
      
      // Check for blocking/protection
      if (html.includes("cloudflare") || html.includes("cf-ray")) {
        throw new NetworkError("Cloudflare protection detected. Try a different proxy.", 403);
      }
      
      if (html.includes("blocked") || html.includes("access denied")) {
        throw new NetworkError("Access blocked. Use a VPN or proxy.", 403);
      }
      
      return html;
    });
  }

  private async getGalleryData(mangaId: string, signal?: AbortSignal): Promise<{ details: MangaMeta, pageCount: number }> {
    const cached = this.galleryCache.get(mangaId);
    if (cached) {
      console.log(`nHentai: Using cached data for gallery ${mangaId}`);
      return cached;
    }

    const url = `${BASE_URL}/g/${mangaId}/`;
    console.log(`nHentai: Fetching gallery data for ${mangaId} from ${url}`);
    const html = await this.fetchHtml(url, signal);

    const details = this.parseGalleryDetails(html, mangaId);
    const pageCount = this.extractPageCountFromHtml(html);

    if (pageCount === 0) {
      console.warn(`nHentai: Could not determine page count for gallery ${mangaId}.`);
    }

    const galleryData = { details, pageCount };
    this.galleryCache.set(mangaId, galleryData);

    return galleryData;
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const query = (options?.query ?? "").trim();
      const page = options?.page || 1;
      
      // Create cache key
      const cacheKey = `search_${query}_${page}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        return { results: cached, hasMore: true };
      }

      let url: string;
      if (query.length > 0) {
        // Search with query
        const encodedQuery = encodeURIComponent(query);
        url = `${BASE_URL}/search/?q=${encodedQuery}&page=${page}`;
      } else {
        // Browse popular/recent
        url = `${BASE_URL}/?page=${page}`;
      }

      console.log(`nHentai: Fetching ${url}`);
      const html = await this.fetchHtml(url, signal);
      
      const results = this.parseSearchResults(html);
      
      // Cache results
      this.searchCache.set(cacheKey, results);
      
      // Check if there are more pages (look for "Next" button/link)
      const hasMore = html.includes('class="next"') || html.includes('>Next<') || html.includes(`page=${page + 1}`);
      
      console.log(`nHentai: Found ${results.length} results, hasMore: ${hasMore}`);
      
      return { results, hasMore };
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getMangaList error:", error);
      throw new NetworkError("Failed to fetch gallery list from nHentai");
    }
  }

  async getMangaDetails(mangaId: string, signal?: AbortSignal): Promise<MangaMeta> {
    try {
      const { details } = await this.getGalleryData(mangaId, signal);
      return details;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getMangaDetails error:", error);
      throw new NetworkError(`Failed to fetch gallery details for ${mangaId}`);
    }
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
      // For nHentai, each gallery is a single chapter
      const { details, pageCount } = await this.getGalleryData(mangaId, signal);
      
      return [
        {
          id: mangaId,
          title: `Read ${details.title}`,
          number: "1",
          pages: pageCount,
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapter info for ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const { pageCount } = await this.getGalleryData(chapterId, signal);
      
      if (pageCount === 0) {
        throw new ParseError("Could not determine page count for gallery");
      }
      
      console.log(`nHentai: Gallery ${chapterId} has ${pageCount} pages`);
      
      // Generate page URLs using the direct pattern you discovered
      const pages: PageMeta[] = [];
      for (let i = 1; i <= pageCount; i++) {
        pages.push({
          index: i - 1,
          url: `${BASE_URL}/g/${chapterId}/${i}/`,
          // We could extract actual image URLs by visiting each page, but the viewer URL works too
          alternativeUrls: [
            // Try to construct direct image URLs if we can determine the pattern
            `${BASE_URL}/g/${chapterId}/${i}/`
          ]
        });
      }
      
      return pages;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for gallery ${chapterId}`);
    }
  }

  private parseSearchResults(html: string): MangaMeta[] {
    const results: MangaMeta[] = [];
    
    try {
      // Look for gallery containers - nHentai uses consistent class names
      const galleryMatches = html.matchAll(/<div class="gallery"[^>]*>[\s\S]*?<\/div>/g);
      
      for (const match of galleryMatches) {
        const galleryHtml = match[0];
        
        // Extract gallery ID from href
        const idMatch = galleryHtml.match(/href="\/g\/(\d+)\//);
        if (!idMatch) continue;
        
        const id = idMatch[1];
        
        // Extract title
        const titleMatch = galleryHtml.match(/<div class="caption">([^<]+)</);
        const title = titleMatch ? titleMatch[1].trim() : `Gallery ${id}`;
        
        // Extract cover image
        const coverMatch = galleryHtml.match(/data-src="([^"]+)"/);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;
        
        // Extract tags if available
        const tags: string[] = [];
        const tagMatches = galleryHtml.matchAll(/class="tag"[^>]*>([^<]+)</g);
        for (const tagMatch of tagMatches) {
          tags.push(tagMatch[1].trim());
        }
        
        results.push({
          id,
          title,
          coverUrl,
          tags,
          mature: true, // nHentai content is always mature
        });
      }
      
    } catch (error) {
      console.warn("Failed to parse some search results:", error);
    }
    
    return results;
  }

  private parseGalleryDetails(html: string, mangaId: string): MangaMeta {
    try {
      // Extract title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)</);
      const title = titleMatch ? titleMatch[1].trim() : `Gallery ${mangaId}`;
      
      // Extract subtitle/alternative title
      const subtitleMatch = html.match(/<h2[^>]*>([^<]+)</);
      const alternativeTitle = subtitleMatch ? subtitleMatch[1].trim() : undefined;
      
      // Extract tags and metadata
      const tags: string[] = [];
      let artist: string | undefined;
      let language: string | undefined;
      
      const tagMatches = html.matchAll(/<span class="tags">[\s\S]*?<\/span>/g);
      for (const tagMatch of tagMatches) {
        const tagSection = tagMatch[0];
        
        if (tagSection.includes('class="tag"')) {
          const individualTags = tagSection.matchAll(/class="tag"[^>]*>([^<]+)</g);
          for (const tag of individualTags) {
            const tagName = tag[1].trim();
            
            if (tagSection.includes("Artists:")) {
              artist = tagName;
            } else if (tagSection.includes("Languages:")) {
              language = tagName;
            } else {
              tags.push(tagName);
            }
          }
        }
      }
      
      // Extract cover image
      const coverMatch = html.match(/<img[^>]+class="lazyload"[^>]+data-src="([^"]+)"/);
      const coverUrl = coverMatch ? coverMatch[1] : undefined;
      
      return {
        id: mangaId,
        title,
        coverUrl,
        artist,
        tags,
        alternativeTitles: alternativeTitle ? [alternativeTitle] : [],
        mature: true,
        description: `${language || "Unknown language"} • ${tags.slice(0, 3).join(", ")}`
      };
      
    } catch (error) {
      console.warn("Failed to parse gallery details:", error);
      return {
        id: mangaId,
        title: `Gallery ${mangaId}`,
        mature: true
      };
    }
  }

  private extractPageCountFromHtml(html: string): number {
    try {
      // Look for page count indicators in the HTML
      const pageCountMatches = [
        // Look for "X pages" text
        html.match(/(\d+)\s+pages?/i),
        // Look for thumbnail count
        html.match(/thumb-container[\s\S]*?(\d+)[\s\S]*?thumb/),
        // Look for last page number in pagination
        html.match(/class="page"[^>]*>(\d+)</g)?.pop()?.match(/(\d+)/)
      ];
      
      for (const match of pageCountMatches) {
        if (match && match[1]) {
          const count = parseInt(match[1]);
          if (count > 0 && count < 10000) { // Reasonable range
            return count;
          }
        }
      }
      
      // Fallback: count thumbnail images
      const thumbMatches = html.match(/class="gallerythumb"/g);
      if (thumbMatches) {
        return thumbMatches.length;
      }
      
    } catch (error) {
      console.warn("Failed to extract page count:", error);
    }
    
    return 0;
  }

  // Test connectivity specifically for the direct URL approach
  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }> {
    const suggestions: string[] = [];
    
    try {
      // Test the main page instead of API
      const testUrl = `${BASE_URL}/`;
      const html = await this.fetchHtml(testUrl);
      
      if (html.includes("nhentai") || html.includes("gallery")) {
        return {
          success: true,
          message: "Successfully connected to nHentai using direct URLs",
          suggestions: []
        };
      } else {
        throw new Error("Unexpected page content");
      }
      
    } catch (error: any) {
      let message = "Connection failed";
      
      if (error instanceof NetworkError) {
        if (error.statusCode === 403) {
          message = "Access blocked (403)";
          suggestions.push("Enable nHentai proxy in settings");
          suggestions.push("Try using Tor or a different VPN location");
        } else if (error.statusCode === 408) {
          message = "Connection timed out";
          suggestions.push("Enable proxy in settings");
          suggestions.push("Check if Tor is running");
        }
      } else if (error.code === 'ETIMEDOUT') {
        message = "Connection timed out - likely blocked";
        suggestions.push("Enable Tor in settings");
        suggestions.push("Use a VPN from a different country");
      }
      
      if (suggestions.length === 0) {
        suggestions.push("Check your internet connection");
        suggestions.push("Try enabling Tor or proxy in settings");
      }
      
      return {
        success: false,
        message: `${message}: ${error.message}`,
        suggestions
      };
    }
  }
}

export default new NHentaiDirectAdapter();
