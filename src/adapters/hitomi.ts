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
  ParseError,
  AdapterError
} from "../services/adapterUtils";

/**
 * Adapter for https://hitomi.la
 *
 * Note: Hitomi loads content dynamically via JavaScript, making direct HTML scraping ineffective.
 * This adapter uses alternative approaches to access gallery data.
 */
class HitomiAdapter implements Adapter {
  id = "hitomi";
  label = "Hitomi";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };
  
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private readonly CONTENT_CDN = "ltn.gold-usergeneratedcontent.net";

  private async fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

      let dispatcher: any = undefined;
      if (settingsStore.get("hitomiProxyEnabled")) {
        const proxyStrings: string[] = settingsStore.get("proxies") || [];
        if (proxyStrings.length > 0) {
          const proxy = proxyStrings[0];
          try {
            dispatcher = /^socks/i.test(proxy) ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
            console.debug("Hitomi using proxy:", proxy);
          } catch (err) {
            console.warn("Invalid proxy string for Hitomi, using direct connection", proxy, err);
          }
        }
      }

      const init: any = {
        headers: { 
          "User-Agent": ua, 
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Referer": "https://hitomi.la/",
          "Origin": "https://hitomi.la"
        },
        signal,
      };
      if (dispatcher) {
        (init as any).agent = dispatcher;
      }

      const response = await fetchWithRateLimit(url, init, "Hitomi");
      
      if (!response.ok) {
        throw new NetworkError(`Hitomi request failed with status ${response.status}`, response.status);
      }
      
      return response;
    });
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const search = options?.query;
      console.log("Hitomi: getMangaList called with search:", search);
      
      const results: MangaMeta[] = [];
      
      if (search && search.trim()) {
        // If user provided a specific gallery ID, use it
        const galleryId = search.trim();
        if (/^\d+$/.test(galleryId)) {
          try {
            const readerUrl = `https://hitomi.la/reader/${galleryId}.html`;
            const response = await this.fetchWithRetry(readerUrl, signal);
            
            if (response.ok) {
              const html = await response.text();
              const titleMatch = html.match(/<title>([^<]+)\s*\|\s*Hitomi\.la<\/title>/);
              const title = titleMatch ? this.decodeEntities(titleMatch[1].trim()) : `Gallery ${galleryId}`;
              
              results.push({
                id: galleryId,
                title: title
              });
              
              console.log(`Hitomi: Found gallery ${galleryId}: ${title}`);
              return { results, hasMore: false };
            }
          } catch (err) {
            console.log(`Hitomi: Gallery ${galleryId} not found or error:`, err);
          }
        }
        
        // For non-numeric searches, inform the user
        throw new NetworkError(
          "Hitomi search requires a specific gallery ID number. " +
          "Try entering a gallery ID (e.g., '2500000')."
        );
      }
      
      // No search term - try to show some sample galleries
      console.log("Hitomi: No search term, attempting to show sample galleries");
      
      // Try a range of recent gallery IDs
      const baseIds = [2900000, 2800000, 2700000, 2600000, 2500000];
      const attempts = [];
      
      for (const baseId of baseIds) {
        for (let offset = 0; offset < 10; offset += 2) {
          attempts.push(baseId + offset);
        }
      }
      
      // Try galleries in parallel for faster results
      const promises = attempts.map(async (galleryId) => {
        try {
          const readerUrl = `https://hitomi.la/reader/${galleryId}.html`;
          const response = await this.fetchWithRetry(readerUrl, signal);
          
          if (response.ok) {
            const html = await response.text();
            const titleMatch = html.match(/<title>([^<]+)\s*\|\s*Hitomi\.la<\/title>/);
            
            if (titleMatch) {
              return {
                id: String(galleryId),
                title: this.decodeEntities(titleMatch[1].trim())
              };
            }
          }
        } catch (err) {
          // Ignore individual failures
        }
        return null;
      });
      
      const galleryResults = await Promise.all(promises);
      
      for (const gallery of galleryResults) {
        if (gallery) {
          results.push(gallery);
          if (results.length >= 20) break; // Limit results
        }
      }
      
      if (results.length === 0) {
        throw new NetworkError(
          "Unable to fetch galleries from Hitomi. " +
          "Try entering a specific gallery ID in the search box (e.g., '2500000')."
        );
      }
      
      console.log(`Hitomi: Found ${results.length} sample galleries`);
      return { results, hasMore: false };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Hitomi getMangaList error:", error);
      throw new NetworkError("Failed to fetch manga list from Hitomi. The site may be down or blocked.");
    }
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
      // Hitomi galleries are single-chapter
      let pageCount = 0;
      let title = "Full Gallery";
      
      try {
        const readerUrl = `https://hitomi.la/reader/${mangaId}.html`;
        const response = await this.fetchWithRetry(readerUrl, signal);
        const html = await response.text();
        
        // Extract page count from reader page
        const pageMatch = html.match(/(?:pages?|Pictures?)[\s:]*(\d+)|(\d+)\s*(?:pages?|pictures?)/i);
        if (pageMatch) {
          pageCount = parseInt(pageMatch[1] || pageMatch[2], 10);
        }
        
        // Extract title
        const titleMatch = html.match(/<title>([^<]+)\s*\|\s*Hitomi\.la<\/title>/);
        if (titleMatch) {
          title = this.decodeEntities(titleMatch[1].trim());
        }
      } catch (err) {
        console.warn("Hitomi: Could not fetch reader page details:", err);
      }

      return [
        {
          id: mangaId,
          title: pageCount > 0 ? `${title} • ${pageCount} pages` : title,
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Hitomi getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapter info for gallery ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const readerUrl = `https://hitomi.la/reader/${chapterId}.html`;
      console.log(`Hitomi: Fetching reader page ${readerUrl}`);
      
      const response = await this.fetchWithRetry(readerUrl, signal);
      const html = await response.text();
      const pages: PageMeta[] = [];

      // Method 1: Try to extract galleryinfo from script
      const galleryInfoMatch = html.match(/var\s+galleryinfo\s*=\s*({[\s\S]*?});/);
      if (galleryInfoMatch) {
        try {
          // Parse the gallery info
          const galleryInfo = JSON.parse(galleryInfoMatch[1]);
          console.log(`Hitomi: Found galleryinfo for ${chapterId}`);
          
          if (galleryInfo.files && Array.isArray(galleryInfo.files)) {
            for (let i = 0; i < galleryInfo.files.length; i++) {
              const file = galleryInfo.files[i];
              
              // Construct image URL based on the file info
              const hash = file.hash;
              const ext = file.haswebp ? 'webp' : (file.name.split('.').pop() || 'jpg');
              
              let imageUrl = '';
              
              if (hash) {
                // Hitomi's URL structure for images
                const lastChar = hash[hash.length - 1];
                const lastNumber = parseInt(lastChar, 16);
                
                // Determine subdomain based on last character of hash
                let subdomain = 'a';
                if (lastNumber < 0x30) {
                  subdomain = 'a';
                } else if (lastNumber < 0x39) {
                  subdomain = 'b';
                } else {
                  subdomain = 'a';
                }
                
                const lastThree = hash.slice(-3);
                const subdir = lastThree.slice(0, 2);
                
                // Construct URL
                if (file.haswebp) {
                  imageUrl = `https://${subdomain}.hitomi.la/webp/${lastChar}/${subdir}/${hash}.webp`;
                } else {
                  imageUrl = `https://${subdomain}.hitomi.la/images/${lastChar}/${subdir}/${hash}.${ext}`;
                }
              } else if (file.name) {
                // Fallback to direct file name
                imageUrl = `https://a.hitomi.la/galleries/${chapterId}/${file.name}`;
              }
              
              if (imageUrl) {
                pages.push({
                  index: i,
                  url: imageUrl
                });
              }
            }
          }
          
          if (pages.length > 0) {
            console.log(`Hitomi: Found ${pages.length} pages from galleryinfo`);
            return pages;
          }
        } catch (e) {
          console.warn("Hitomi: Failed to parse galleryinfo:", e);
        }
      }

      // Method 2: Look for reader data in other script patterns
      const readerDataMatch = html.match(/reader\.load\(({[\s\S]*?})\)/);
      if (readerDataMatch) {
        try {
          const readerData = JSON.parse(readerDataMatch[1]);
          if (readerData.images && Array.isArray(readerData.images)) {
            for (let i = 0; i < readerData.images.length; i++) {
              pages.push({
                index: i,
                url: readerData.images[i]
              });
            }
          }
        } catch (e) {
          console.warn("Hitomi: Failed to parse reader data:", e);
        }
      }

      // Method 3: Extract any image URLs directly from the HTML
      if (pages.length === 0) {
        const imgRegex = /https?:\/\/[a-z]\.hitomi\.la\/(?:images|webp|galleries)\/[^"'\s]+/gi;
        const matches = html.match(imgRegex);
        
        if (matches && matches.length > 0) {
          const uniqueUrls = [...new Set(matches)];
          console.log(`Hitomi: Found ${uniqueUrls.length} image URLs via regex`);
          
          uniqueUrls.forEach((url, index) => {
            pages.push({
              index: index,
              url: url
            });
          });
        }
      }

      if (pages.length === 0) {
        throw new ParseError(
          "No images found in gallery. The gallery may be unavailable or require JavaScript to load. " +
          "Hitomi's dynamic content loading makes it difficult to access galleries directly."
        );
      }

      return pages;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Hitomi getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for gallery ${chapterId}`);
    }
  }

  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#x2F;/g, "/")
      .replace(/&#x5C;/g, "\\")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }
}

export default new HitomiAdapter();