import * as cheerio from "cheerio";
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

// Simple per-site rate limiter (pattern modelled after MangaDexRateLimiter)
class WeebCentralRateLimiter {
  private lastRequestTime = 0;
  private requestsInWindow = 0;
  private windowStart = Date.now();

  // WeebCentral doesn't advertise a quota, start conservatively
  private readonly WINDOW_MS = 60_000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 20; // at most 20 req/min
  private MIN_REQUEST_INTERVAL = 1000; // 1s between requests (can be relaxed later)

  async acquire() {
    const now = Date.now();

    // reset 1-minute window if elapsed
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.windowStart = now;
      this.requestsInWindow = 0;
      // Restore default spacing once we have a fresh window
      this.MIN_REQUEST_INTERVAL = 1000;
    }

    // Ensure minimum spacing between individual requests
    const sinceLast = now - this.lastRequestTime;
    if (sinceLast < this.MIN_REQUEST_INTERVAL) {
      await new Promise(r => setTimeout(r, this.MIN_REQUEST_INTERVAL - sinceLast));
    }

    // If we hit per-window quota, pause until new window begins
    if (this.requestsInWindow >= this.MAX_REQUESTS_PER_WINDOW) {
      const wait = this.WINDOW_MS - (now - this.windowStart) + 100;
      if (wait > 0) {
        console.log(`WeebCentral rate limit: waiting ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        this.windowStart = Date.now();
        this.requestsInWindow = 0;
      }
    }

    this.lastRequestTime = Date.now();
    this.requestsInWindow++;
  }
}

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
  private rateLimiter = new WeebCentralRateLimiter();
  private circuitBreaker = new CircuitBreaker(3, 30000); // More lenient: 3 failures, 30 second timeout
  private seriesCache = new SimpleCache<{ id: string; slug: string }>(600000); // 10 minute cache
  private responseCache = new SimpleCache<cheerio.CheerioAPI>(120000); // 2 minute HTML cache
  private pendingRequests = new Map<string, Promise<cheerio.CheerioAPI>>(); // Request deduplication

  /**
   * Fetch with proper headers and proxy rotation
   */
  private async fetchDom(url: string): Promise<cheerio.CheerioAPI> {
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
      await this.rateLimiter.acquire();
      
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
          const dom = cheerio.load(text);
          
          // Cache successful responses
          this.responseCache.set(url, dom);
          
          // Remove from pending requests
          this.pendingRequests.delete(url);
          
          return dom;
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
      const $ = await this.fetchDom(url);
      console.log("WeebCentral: Received HTML");
      
      // Extract series links and titles
      const results: MangaMeta[] = [];
      const seenIds = new Set<string>();
      
      $('a[href*="/series/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const match = href.match(/\/series\/([A-Z0-9]+)/);
        if (match && match[1]) {
          const id = match[1];
          if (seenIds.has(id)) return;

          let title = $(element).find('.text-ellipsis').text().trim();
          if (!title) {
            title = $(element).attr('title') || $(element).find('img').attr('alt') || '';
          }
          if (!title) {
            title = $(element).text().trim();
          }
          
          if (title) {
            seenIds.add(id);
            results.push({ id, title: title.replace(/ cover$/, '').trim() });
          }
        }
      });
      
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
      const $ = await this.fetchDom(url);
      
      // Extract chapter links
      const chapters: ChapterMeta[] = [];
      const seenIds = new Set<string>();
      
      $('a[href*="/chapters/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const match = href.match(/\/chapters\/([A-Z0-9]+)/);
        if (!match || !match[1]) return;

          const chapterId = match[1];
          if (seenIds.has(chapterId)) return;

        // Clean & standardise the visible text
        let rawText = $(element).text().replace(/\s+/g, ' ').trim();

        // Strip off reading-state blobs, CSS artefacts, timestamps, etc.
        rawText = rawText
          .replace(/Last\s*Read.*$/i, '')                       // remove "Last Read …"
          .replace(/\.[A-Za-z0-9_-]+\s*\{[^}]*\}/g, '')       // remove ".st0 { fill: #xxxx }"
          .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?/g, '') // ISO-8601 timestamp
          .replace(/\s+/g, ' ')                                  // collapse again after removals
          .trim();

        // Extract chapter number if present
        const numMatch = rawText.match(/(?:Chapter|Ch\.|Ep\.?|Episode|#)\s*(\d+(?:\.\d+)?)/i);
        const chapNumber = numMatch ? numMatch[1] : undefined;

        // Remove the leading label so the remainder becomes the chapter title
        if (chapNumber) {
          rawText = rawText.replace(/(?:Chapter|Ch\.|Ep\.?|Episode|#)\s*\d+(?:\.\d+)?\s*:?/i, '').trim();
        }

        const displayTitle = chapNumber ? `Ch ${chapNumber}${rawText ? ': ' + rawText : ''}` : rawText;

            seenIds.add(chapterId);
            chapters.push({
              id: chapterId,
          title: displayTitle || `Chapter ${chapNumber ?? chapters.length + 1}`,
          number: chapNumber,
            });
      });
      
      console.log(`WeebCentral: Found ${chapters.length} chapters`);
      
      if (chapters.length === 0) {
        throw new ParseError("No chapters found. This manga may not have any chapters available.");
      }
      
      // Sort chapters by number (descending, newest first)
      chapters.sort((a, b) => {
        const numA = a.number ? parseFloat(a.number) : NaN;
        const numB = b.number ? parseFloat(b.number) : NaN;

        if (isNaN(numA) && isNaN(numB)) return 0;
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;
        return numB - numA; // newest first
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
      const $ = await this.fetchDom(url);
      
      const pages: PageMeta[] = [];

      // Strategy 1: Find images from preload links
      $('link[rel="preload"][as="image"]').each((index, element) => {
        const href = $(element).attr('href');
        if (href) {
          pages.push({ index, url: href });
        }
      });

      if (pages.length > 0) {
        return pages;
      }

      // Strategy 2: Find images from embedded script data
      let scriptData: string | undefined;
      $('script').each((_, element) => {
        const scriptContent = $(element).html();
        if (scriptContent && (scriptContent.includes('"images":') || scriptContent.includes('images = ['))) {
          scriptData = scriptContent;
          return false; // break the loop
        }
      });

      if (scriptData) {
        const imageArrayMatch = scriptData.match(/"images":\s*(\[[^\]]*\])/) || scriptData.match(/images\s*=\s*(\[[^\]]*\])/);
        if (imageArrayMatch && imageArrayMatch[1]) {
          try {
            const imageUrls = JSON.parse(imageArrayMatch[1]);
            if (Array.isArray(imageUrls)) {
              return imageUrls.map((url, index) => ({ index, url }));
            }
          } catch (e) {
            console.error("Failed to parse image data from script", e);
          }
        }
      }

      // Strategy 3: Find images directly from <img> tags
      $('#reader-images img, .reader-content img, main img').each((index, element) => {
        const src = $(element).attr('src');
        if (src && !src.includes('/static/') && !src.includes('logo') && !src.includes('icon')) {
           pages.push({ index, url: src.startsWith('http') ? src : `${BASE_URL}${src}` });
        }
      });
      
      if (pages.length > 0) {
        return pages;
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