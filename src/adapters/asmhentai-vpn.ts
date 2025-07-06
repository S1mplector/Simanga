import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire } from "../services/netLimiter";
import settingsStore from "../services/settings";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { 
  CircuitBreaker, 
  fetchWithTimeout, 
  fetchWithRateLimit,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

/**
 * Adapter for https://asmhentai.com
 *
 * The site does not expose a public JSON API but its HTML is fairly easy to
 * scrape and most importantly the image URLs follow a predictable schema
 * (https://images.asmhentai.com/<dir>/<galleryId>/<page>.<ext>).  Every gallery
 * lives in a single chapter, so we mirror the pattern used in the nHentai
 * adapter and emit a single "Full Book" chapter.
 * Woohoo! More hentai adapters!
 */
class ASMHentaiAdapter implements Adapter {
  id = "asmhentai-vpn";
  label = "ASM Hentai";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };
  
  private circuitBreaker = new CircuitBreaker(5, 60000);

  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      // Cloudflare / anti-bot rules are light – spoofing a normal UA is enough.
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
      
      const headers = { "User-Agent": ua };
      
      // Prepare parallel connection attempts
      const attempts: Promise<string>[] = [];
      
      // Always try direct connection
      attempts.push(
        this.fetchWithRetry(url, { headers, signal }, "direct")
      );
      
      // Also try with proxy if enabled
      if (settingsStore.get("asmhentaiProxyEnabled")) {
        const proxyStrings: string[] = settingsStore.get("proxies") || [];
        
        if (proxyStrings.length > 0) {
          const proxy = proxyStrings[0];
          try {
            const agent = /^socks/i.test(proxy) ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
            attempts.push(
              this.fetchWithRetry(url, { headers, signal, agent }, `proxy: ${proxy}`)
            );
          } catch (err) {
            console.warn("Invalid proxy string for ASMHentai:", proxy);
          }
        }
      }
      
      // Race all attempts and use the first successful one
      try {
        console.log(`ASMHentai: Racing ${attempts.length} connection attempts for ${url}`);
        const result = await Promise.race(attempts);
        return result;
      } catch (firstError) {
        // If all attempts fail, wait for all to complete to get better error info
        const results = await Promise.allSettled(attempts);
        
        // Find the most relevant error
        let bestError = firstError;
        for (const result of results) {
          if (result.status === 'rejected') {
            const err = result.reason;
            if (err instanceof ParseError || err instanceof RateLimitError) {
              bestError = err;
              break;
            } else if (err instanceof NetworkError && err.statusCode === 403) {
              bestError = err;
            }
          }
        }
        
        throw bestError;
      }
    });
  }
  
  private async fetchWithRetry(url: string, init: any, connectionType: string): Promise<string> {
    const startTime = Date.now();
    let lastError: any;
    
    // Only 1 attempt per connection type for faster failures
    try {
      console.log(`ASMHentai: Attempting fetch via ${connectionType}`);
      
      const response = await fetchWithRateLimit(url, init, "ASMHentai");
      
      const elapsed = Date.now() - startTime;
      console.log(`ASMHentai: ${connectionType} succeeded in ${elapsed}ms`);
      
      return await response.text();
    } catch (err) {
      console.log(`ASMHentai: ${connectionType} failed after ${Date.now() - startTime}ms:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const term = (options?.query ?? "").trim();
      const page = options?.page || 1;

      // If the user hasn't typed a query yet, just show the latest galleries from
      // the front-page so the list isn't empty by default.
      const url = term
        ? `https://asmhentai.com/search/?q=${encodeURIComponent(term)}&page=${page}`
        // Front page triggers Cloudflare challenge; use harmless single-letter search instead.
        : `https://asmhentai.com/search/?q=a&page=${page}`;
      
      const html = await this.fetchHtml(url, signal);

      const results: MangaMeta[] = [];
      
      // Updated patterns to match current ASMHentai structure
      const patterns = [
        // Pattern 1: Gallery links with h5 titles
        /<a[^>]+href="\/g\/(\d+)\/"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>/g,
        // Pattern 2: Preview items with title attributes
        /<div[^>]+class="[^"]*preview_item[^"]*"[^>]*>[\s\S]*?<a[^>]+href="\/g\/(\d+)\/"[^>]*>[\s\S]*?title="([^"]+)"/g,
        // Pattern 3: Direct link with h5 child
        /<a[^>]+href="\/g\/(\d+)\/"[^>]*><h5>([^<]+)<\/h5>/g,
        // Pattern 4: Link with any title attribute
        /<a[^>]+href="\/g\/(\d+)\/"[^>]*title="([^"]+)"/g,
        // Pattern 5: Original pattern (fallback)
        /<a\s+href="\/g\/(\d+)\/"[^>]*>[\s\S]*?(?:alt|title)="([^"]+)"/g,
      ];
      
      const seen = new Set<string>();
      
      for (const pattern of patterns) {
        let m: RegExpExecArray | null;
        const regex = new RegExp(pattern);
        
        while ((m = regex.exec(html)) !== null) {
          const [_, id, rawTitle] = m;
          if (!seen.has(id)) {
            seen.add(id);
            results.push({ id, title: this.decodeEntities(rawTitle.trim()) });
          }
        }
        
        // If we found results with this pattern, we can stop
        if (results.length > 0) {
          console.log(`ASMHentai: Found ${results.length} galleries using pattern`);
          break;
        }
      }

      if (results.length === 0) {
        console.warn("ASMHentai: No results found, HTML structure may have changed");
        
        // Log some debug info
        const hasGalleryLinks = html.includes('href="/g/');
        console.log("Has gallery links:", hasGalleryLinks);
        
        if (hasGalleryLinks) {
          // Try to extract at least the IDs
          const idPattern = /href="\/g\/(\d+)\/"/g;
          let idMatch;
          while ((idMatch = idPattern.exec(html)) !== null) {
            const id = idMatch[1];
            if (!seen.has(id)) {
              seen.add(id);
              results.push({ id, title: `Gallery ${id}` });
            }
          }
          
          if (results.length > 0) {
            console.log(`ASMHentai: Found ${results.length} galleries by ID only`);
            return { results, hasMore: false };
          }
        }
        
        throw new ParseError("No manga found. The site structure may have changed or the site may be down.");
      }

      // ASMHentai doesn't provide clear pagination info in HTML, so we assume there might be more
      // if we found a full page of results (let's say 20+)
      const hasMore = results.length >= 20;
      
      return { results, hasMore };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("ASMHentai getMangaList error:", error);
      throw new NetworkError("Failed to fetch manga list from ASMHentai");
    }
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
      const html = await this.fetchHtml(`https://asmhentai.com/g/${mangaId}/`, signal);
      const pageCount = this.extractPageCount(html);
      
      if (!pageCount) {
        console.warn("ASMHentai: Could not determine page count for", mangaId);
      }
      
      return [
        {
          id: mangaId, // single-chapter model
          title: pageCount ? `Full Book • ${pageCount} pages` : "Full Book",
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("ASMHentai getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapter info for manga ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const html = await this.fetchHtml(`https://asmhentai.com/g/${chapterId}/`, signal);

      const dirMatch = html.match(/id="load_dir"\s+value="(\d+)"/);
      if (!dirMatch) {
        throw new ParseError("Failed to locate gallery directory. The site structure may have changed.");
      }
      const dir = dirMatch[1];

      const pageCount = this.extractPageCount(html);
      if (!pageCount) {
        throw new ParseError("Unable to determine page count for this gallery");
      }

      // Determine the file extension from the first thumbnail (e.g., 1t.jpg → jpg)
      // Try multiple patterns to handle variations
      const extPatterns = [
        new RegExp(`https?://images\\.asmhentai\\.com/${dir}/${chapterId}/1t\\.(jpg|jpeg|png|webp|gif)`, "i"),
        new RegExp(`https?://images\\.asmhentai\\.com/[^/]+/${chapterId}/1t\\.(jpg|jpeg|png|webp|gif)`, "i"),
        /src="[^"]*\/1t\.(jpg|jpeg|png|webp|gif)"/i
      ];
      
      let ext = "jpg"; // default
      for (const pattern of extPatterns) {
        const match = html.match(pattern);
        if (match) {
          ext = match[1].toLowerCase();
          break;
        }
      }

      // Build the full-size page URLs.  Thumbnails use the same path but append a
      // trailing "t" before the extension.
      const pages: PageMeta[] = [];
      for (let i = 1; i <= pageCount; i++) {
        pages.push({
          index: i - 1,
          url: `https://images.asmhentai.com/${dir}/${chapterId}/${i}.${ext}`,
        });
      }

      return pages;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("ASMHentai getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter ${chapterId}`);
    }
  }

  /**
   * Extract the total page count from a gallery HTML document.
   */
  private extractPageCount(html: string): number {
    // Try multiple patterns to be more resilient
    const patterns = [
      /id="t_pages"\s+value="(\d+)"/,
      /Pages:\s*(\d+)/i,
      /(\d+)\s*pages?/i,
      /<h2[^>]*>.*?(\d+)\s*Pages.*?<\/h2>/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        if (!isNaN(count) && count > 0) {
          return count;
        }
      }
    }
    
    return 0;
  }

  /**
   * Very small HTML-entity decoder for titles (e.g., &#x27; → ').  We skip a full
   * dependency on an entity library – this covers the common cases we see in
   * titles and is enough for display purposes.
   */
  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/&#x2F;/g, "/")
      .replace(/&#x5C;/g, "\\");
  }
}

export default new ASMHentaiAdapter(); 