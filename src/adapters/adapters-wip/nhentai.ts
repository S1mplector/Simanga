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

const API_BASE = "https://nhentai.net/api";
const IMAGE_BASE = "https://t.nhentai.net";

/**
 * nHentai adapter with improved error handling and metadata support
 * Notes:
 *  - nHentai calls every book a "gallery". There are no chapters, so we fake a
 *    single chapter entry with the same id as the gallery itself.
 *  - Includes cover images and additional metadata
 *  - Better proxy support with sequential fallback instead of racing
 */
class NHentaiAdapter implements Adapter {
  id = "nhentai";
  label = "nHentai";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: true,
    multiLanguage: true, // nHentai has language tags
    authentication: 'none',
    rateLimit: {
      requests: 5,
      period: 1000, // 5 requests per second
    }
  };
  
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private galleryCache = new SimpleCache<any>(300000); // 5 minute cache
  private metadataCache = new SimpleCache<MangaMeta>(600000); // 10 minute cache for full metadata

  private async fetchJson(url: string, signal?: AbortSignal): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      // Build headers with better bot detection avoidance
      const headers = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Referer": "https://nhentai.net/",
        "Origin": "https://nhentai.net",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors", 
        "Sec-Fetch-Site": "same-origin",
        "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      };
      
      // Get the best available proxy for nHentai
      const proxyAgent = await proxyManager.getBestProxy("nhentai");
      
      if (proxyAgent) {
        console.log("nHentai: Using proxy connection");
        try {
          const response = await this.attemptFetch(url, { headers, agent: proxyAgent, signal, redirect: 'follow' }, "proxy");
          return response;
        } catch (proxyError: any) {
          console.log("nHentai: Proxy connection failed:", proxyError.message);
          
          // If proxy is explicitly enabled, don't fall back to direct
          if (settingsStore.get("nhentaiProxyEnabled")) {
            throw new NetworkError(
              "Proxy connection failed and direct connections are disabled for nHentai. Please check your proxy settings or try different proxy servers.",
              503
            );
          }
        }
      }
      
      // Try direct connection only if proxy is not enabled or failed
      if (!settingsStore.get("nhentaiProxyEnabled")) {
        try {
          const response = await this.attemptFetch(url, { headers, signal, redirect: 'follow' }, "direct");
          return response;
        } catch (directError: any) {
          console.log("nHentai: Direct connection failed:", directError.message);
          
          // Provide specific error messages for common connection issues
          if (directError.code === 'ECONNRESET' || directError.code === 'ECONNREFUSED') {
            throw new NetworkError(
              "Connection blocked or reset. nHentai is likely blocked by your ISP or government. Enable proxy in settings to bypass restrictions.",
              503
            );
          }
          
          if (directError.code === 'ETIMEDOUT' || directError.message.includes('timeout')) {
            throw new NetworkError(
              "Connection timed out. nHentai may be blocked in your region. Try enabling proxy in settings.",
              408
            );
          }
          
          if (directError instanceof NetworkError && directError.statusCode === 403) {
            throw new NetworkError(
              "Access forbidden (403). nHentai is blocked in your region. Enable proxy in settings and configure a VPN or proxy server.",
              403
            );
          }
          
          throw new NetworkError(
            `Connection failed: ${directError.message}. If you're in a region that blocks adult content, enable proxy in settings.`,
            500
          );
        }
      } else {
        throw new NetworkError(
          "No working proxy available and direct connections are disabled for nHentai. Please check your proxy configuration.",
          503
        );
      }
    });
  }
  
  private async attemptFetch(url: string, options: any, connectionType: string): Promise<any> {
    console.log(`nHentai: Attempting ${connectionType} connection to ${url}`);
    
    const response = await fetchWithTimeout(url, options, 15000); // Increased timeout
    
    if (response.status === 429) {
      noteRateLimit();
      const retryAfter = response.headers.get("retry-after");
      throw new RateLimitError(
        "nHentai rate limit exceeded. Please wait before trying again.",
        retryAfter ? parseInt(retryAfter) : 60
      );
    }
    
    if (response.status === 403) {
      const text = await response.text();
      if (text.includes("cloudflare") || text.includes("cf-browser-verification") || text.includes("cf-ray")) {
        throw new NetworkError(
          "Cloudflare protection detected. Try using a different proxy server or VPN location.",
          403
        );
      }
      throw new NetworkError(
        "Access forbidden (403). nHentai is blocked in your region or detected automated access.",
        403
      );
    }
    
    if (response.status === 404) {
      throw new NetworkError("Content not found on nHentai", 404);
    }
    
    if (response.status === 503) {
      throw new NetworkError(
        "Service unavailable (503). nHentai may be experiencing downtime or under heavy load.",
        503
      );
    }
    
    if (!response.ok) {
      throw new NetworkError(
        `nHentai request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    
    noteSuccess();
    
    // Check content type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      
      // Check for various blocking/protection mechanisms
      if (text.includes("cloudflare") || text.includes("cf-browser-verification")) {
        throw new NetworkError(
          "Cloudflare protection detected. Please use a proxy or VPN to access nHentai.",
          403
        );
      }
      
      if (text.includes("blocked") || text.includes("restricted") || text.includes("forbidden")) {
        throw new NetworkError(
          "Access blocked. nHentai is restricted in your region. Use a VPN or proxy to access.",
          403
        );
      }
      
      if (text.includes("bot") || text.includes("automation") || text.includes("captcha")) {
        throw new NetworkError(
          "Bot detection triggered. Try using a different user agent or proxy.",
          403
        );
      }
      
      // If we get HTML instead of JSON, it's likely a routing issue or site change
      if (text.includes("<html")) {
        throw new ParseError(
          "nHentai returned HTML instead of JSON. The API may have changed or you're being redirected."
        );
      }
      
      throw new ParseError(
        "nHentai returned unexpected content type. The site may have changed."
      );
    }
    
    try {
      const json = await response.json();
      console.log(`nHentai: ${connectionType} succeeded`);
      return json;
    } catch (error) {
      throw new ParseError("Failed to parse JSON response from nHentai");
    }
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const term = (options?.query ?? "").trim();
      const page = options?.page || 1;

      let endpoint: string;
      if (term.length) {
        // Check if it's a tag search
        if (term.startsWith("tag:")) {
          const tag = term.substring(4).trim();
          endpoint = `${API_BASE}/galleries/tagged?tag_id=${encodeURIComponent(tag)}&page=${page}`;
        } else {
          endpoint = `${API_BASE}/galleries/search?query=${encodeURIComponent(term)}&page=${page}&sort=popular`;
        }
      } else {
        // Browse all galleries, sorted by recent
        endpoint = `${API_BASE}/galleries/all?page=${page}`;
      }

      console.log("nHentai: Fetching", endpoint);
      const json = await this.fetchJson(endpoint, signal);
      
      if (!json.result || !Array.isArray(json.result)) {
        console.error("nHentai: Invalid response structure:", json);
        throw new ParseError("Invalid response format from nHentai - missing result array");
      }

      const results = json.result.map((gallery: any) => {
        const meta = this.extractMetadata(gallery);
        // Cache the full gallery data for later use
        this.galleryCache.set(`gallery_${gallery.id}`, gallery);
        this.metadataCache.set(String(gallery.id), meta);
        return meta;
      });
      
      // nHentai includes pagination info
      const hasMore = json.num_pages ? page < json.num_pages : false;
      const total = json.per_page && json.num_pages ? json.per_page * json.num_pages : undefined;
      
      console.log(`nHentai: Found ${results.length} results, hasMore: ${hasMore}`);
      
      return { results, hasMore, total };
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
      // Check cache first
      const cached = this.metadataCache.get(mangaId);
      if (cached) return cached;
      
      const gallery = await this.fetchGallery(mangaId, signal);
      const meta = this.extractMetadata(gallery);
      
      // Cache the result
      this.metadataCache.set(mangaId, meta);
      
      return meta;
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
      const gallery = await this.fetchGallery(mangaId, signal);
      
      const pages = gallery.num_pages || 0;
      const title = this.pickBestTitle(gallery.title);
      const uploadDate = gallery.upload_date ? new Date(gallery.upload_date * 1000) : undefined;

      return [
        {
          id: mangaId,
          title: `Read ${title}`,
          pages: pages,
          publishedAt: uploadDate,
          number: "1",
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getChapterList error:", error);
      throw new NetworkError(`Failed to fetch gallery info for ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const gallery = await this.fetchGallery(chapterId, signal);
      
      const mediaId = gallery.media_id;
      const pages: any[] = gallery.images?.pages || [];
      
      if (!mediaId || pages.length === 0) {
        throw new ParseError("Invalid gallery data - missing media_id or pages");
      }

      const extMap: Record<string, string> = { 
        j: "jpg", 
        p: "png", 
        g: "gif", 
        w: "webp" 
      };

      return pages.map((page, idx) => {
        const ext = extMap[page.t] || "jpg";
        const pageNum = idx + 1;
        
        return {
          index: idx,
          url: `https://i.nhentai.net/galleries/${mediaId}/${pageNum}.${ext}`,
          width: page.w,
          height: page.h,
          // Provide alternative URLs for fallback
          alternativeUrls: [
            `https://i2.nhentai.net/galleries/${mediaId}/${pageNum}.${ext}`,
            `https://i3.nhentai.net/galleries/${mediaId}/${pageNum}.${ext}`,
          ]
        } as PageMeta;
      });
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for gallery ${chapterId}`);
    }
  }

  private async fetchGallery(galleryId: string, signal?: AbortSignal): Promise<any> {
    // Check cache first
    const cacheKey = `gallery_${galleryId}`;
    const cached = this.galleryCache.get(cacheKey);
    if (cached) {
      console.log("nHentai: Using cached gallery data for", galleryId);
      return cached;
    }
    
    const url = `${API_BASE}/gallery/${galleryId}`;
    const gallery = await this.fetchJson(url, signal);
    
    if (!gallery || typeof gallery !== 'object') {
      throw new ParseError("Invalid gallery data from nHentai");
    }
    
    // Cache the result
    this.galleryCache.set(cacheKey, gallery);
    
    return gallery;
  }

  private extractMetadata(gallery: any): MangaMeta {
    const title = this.pickBestTitle(gallery.title);
    const tags = gallery.tags || [];
    
    // Extract various tag types
    const tagsByType: Record<string, string[]> = {};
    tags.forEach((tag: any) => {
      const type = tag.type || "tag";
      if (!tagsByType[type]) tagsByType[type] = [];
      tagsByType[type].push(tag.name);
    });
    
    // Get cover image
    let coverUrl: string | undefined;
    if (gallery.media_id && gallery.images?.cover) {
      const cover = gallery.images.cover;
      const ext = cover.t === 'j' ? 'jpg' : cover.t === 'p' ? 'png' : 'jpg';
      coverUrl = `${IMAGE_BASE}/galleries/${gallery.media_id}/cover.${ext}`;
    }
    
    return {
      id: String(gallery.id),
      title,
      coverUrl,
      author: tagsByType.artist?.join(", "),
      tags: [
        ...(tagsByType.tag || []),
        ...(tagsByType.category || []).map(c => `category:${c}`),
        ...(tagsByType.language || []).map(l => `language:${l}`),
        ...(tagsByType.character || []).map(c => `character:${c}`),
        ...(tagsByType.parody || []).map(p => `parody:${p}`)
      ],
      alternativeTitles: [
        gallery.title?.japanese,
        gallery.title?.pretty
      ].filter(Boolean),
      lastUpdated: gallery.upload_date ? new Date(gallery.upload_date * 1000) : undefined,
      mature: true, // nHentai content is always mature
      description: `${gallery.num_pages || 0} pages • ${tagsByType.language?.join(", ") || "Unknown language"}`
    };
  }

  private pickBestTitle(titles: any): string {
    if (!titles) return "Untitled";
    return titles.english || titles.pretty || titles.japanese || "Untitled";
  }

  // Test connectivity to nHentai and provide diagnostic information
  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }> {
    const suggestions: string[] = [];
    
    try {
      // Try a simple API call
      const testUrl = `${API_BASE}/galleries/all?page=1`;
      await this.fetchJson(testUrl);
      
      return {
        success: true,
        message: "Successfully connected to nHentai API",
        suggestions: []
      };
      
    } catch (error: any) {
      let message = "Connection failed";
      
      if (error instanceof NetworkError) {
        if (error.statusCode === 403) {
          message = "Access blocked (403)";
          suggestions.push("Enable nHentai proxy in settings");
          suggestions.push("Configure a VPN or proxy server");
          suggestions.push("Try connecting from a different region");
        } else if (error.statusCode === 503) {
          message = "Service unavailable (503)";
          suggestions.push("nHentai may be experiencing downtime");
          suggestions.push("Try again later");
        } else if (error.statusCode === 408) {
          message = "Connection timed out";
          suggestions.push("Enable proxy in settings if in a restricted region");
          suggestions.push("Check your internet connection");
        }
      } else if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
        message = "Connection blocked by ISP or firewall";
        suggestions.push("Enable nHentai proxy in settings");
        suggestions.push("Use a VPN service");
        suggestions.push("Contact your ISP about content restrictions");
      } else if (error.code === 'ETIMEDOUT') {
        message = "Connection timed out - likely blocked";
        suggestions.push("Enable proxy in settings");
        suggestions.push("Use a VPN from a different country");
      }
      
      // Add general suggestions if none were added
      if (suggestions.length === 0) {
        suggestions.push("Check your internet connection");
        suggestions.push("Try enabling proxy in settings");
        suggestions.push("Verify your VPN is working if using one");
      }
      
      return {
        success: false,
        message: `${message}: ${error.message}`,
        suggestions
      };
    }
  }

  // Helper method to check if the user is likely in a restricted region
  private async checkRegionalRestrictions(): Promise<{ restricted: boolean; country?: string; suggestions: string[] }> {
    try {
      // Try to determine user's location (this is just for helpful suggestions)
      const response = await fetchWithTimeout('https://httpbin.org/ip', {}, 5000);
      const data = await response.json();
      
      // Known countries that commonly block adult content sites
      const restrictedCountries = [
        'CN', 'IN', 'ID', 'MY', 'SG', 'TH', 'VN', 'KR', 'AU', 'TR', 'AE', 'SA'
      ];
      
      // This is a simplified check - in reality, you'd need a geolocation service
      // For now, just provide general guidance
      return {
        restricted: false, // We can't determine this reliably
        suggestions: [
          "If you're in a country that restricts adult content, use a VPN",
          "Configure proxy settings in the app",
          "Try connecting from a different region"
        ]
      };
      
    } catch (error) {
      return {
        restricted: false,
        suggestions: [
          "Check your internet connection",
          "If in a restricted region, use a VPN or proxy"
        ]
      };
    }
  }
}

export default new NHentaiAdapter();