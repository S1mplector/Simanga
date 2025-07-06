import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "../services/netLimiter";
import settingsStore from "../services/settings";
import proxyManager from "../services/proxyManager";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

// Multiple mirror domains to try
const DOMAINS = [
  "nhentai.net",
  "nhentai.to", 
  "nhentai.xxx",
  "nhentai.io"
];

// User agent rotation for better evasion
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
];

/**
 * Enhanced nHentai adapter with multiple evasion techniques:
 * Mirror domain rotation
 * User agent rotation  
 * Advanced headers
 * Multiple proxy strategies
 * Cloudflare bypass attempts
 * Request timing variation
 */
class NHentaiEnhancedAdapter implements Adapter {
  id = "nhentai";
  label = "nHentai Enhanced";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: true,
    multiLanguage: true,
    authentication: 'none',
    rateLimit: {
      requests: 2,
      period: 3000, // Very conservative: 2 requests per 3 seconds
    }
  };
  
  private circuitBreaker = new CircuitBreaker(2, 45000); // More forgiving circuit breaker
  private galleryCache = new SimpleCache<{ details: MangaMeta, pageCount: number }>(900000); // 15 minute cache
  private searchCache = new SimpleCache<MangaMeta[]>(600000); // 10 minute cache
  private workingDomain: string = DOMAINS[0];
  private requestCount = 0;

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private getAdvancedHeaders(referer?: string): Record<string, string> {
    return {
      "User-Agent": this.getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9,tr;q=0.8,ja;q=0.7",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Referer": referer || `https://${this.workingDomain}/`,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": referer ? "same-origin" : "none",
      "Sec-Fetch-User": "?1",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "DNT": "1",
      // Additional evasion headers
      "X-Forwarded-For": this.generateRandomIP(),
      "X-Real-IP": this.generateRandomIP()
    };
  }

  private generateRandomIP(): string {
    // Generate a random IP from common ranges
    const ranges = [
      [8, 8, 8], // Google DNS range
      [1, 1, 1], // Cloudflare DNS range  
      [208, 67, 222], // OpenDNS range
      [64, 6, 64], // Verisign range
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    return `${range[0]}.${range[1]}.${range[2]}.${Math.floor(Math.random() * 255)}`;
  }

  private async tryDomains<T>(
    operation: (domain: string) => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: any;
    
    // Start with the working domain, then try others
    const domainsToTry = [this.workingDomain, ...DOMAINS.filter(d => d !== this.workingDomain)];
    
    for (const domain of domainsToTry) {
      try {
        console.log(`nHentai Enhanced: Trying ${context} with domain ${domain}`);
        const result = await operation(domain);
        
        // Update working domain if this one succeeded and it's different
        if (domain !== this.workingDomain) {
          console.log(`nHentai Enhanced: Updated working domain to ${domain}`);
          this.workingDomain = domain;
        }
        
        return result;
      } catch (error: any) {
        console.warn(`nHentai Enhanced: Domain ${domain} failed for ${context}:`, error.message);
        lastError = error;
        
        // If this was a rate limit or 403, try next domain immediately
        if (error instanceof NetworkError && (error.statusCode === 429 || error.statusCode === 403)) {
          continue;
        }
        
        // For other errors, add a small delay before trying next domain
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw lastError || new NetworkError(`All domains failed for ${context}`);
  }

  private async fetchHtml(path: string, signal?: AbortSignal, referer?: string): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      // Add some randomness to request timing
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
      
      return this.tryDomains(async (domain) => {
        const url = `https://${domain}${path}`;
        console.log(`nHentai Enhanced: Fetching ${url}`);
        
        const headers = this.getAdvancedHeaders(referer);
        
        // Get proxy agent (try multiple strategies)
        const proxyAgent = await this.getBestProxy();
        
        const options: any = {
          headers,
          signal,
          redirect: 'follow',
          // Add some connection options to help with blocking
          timeout: 20000,
        };
        
        if (proxyAgent) {
          options.agent = proxyAgent;
          console.log("nHentai Enhanced: Using proxy for request");
        }
        
        const response = await fetchWithTimeout(url, options, 20000);
        
        // Check for specific blocking patterns
        if (response.status === 429) {
          noteRateLimit();
          // Increase delay for next request
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new RateLimitError("Rate limited by nHentai", 120);
        }
        
        if (response.status === 403) {
          throw new NetworkError(`Access forbidden (403) on ${domain}. Trying next domain.`, 403);
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
        
        // Enhanced blocking detection
        const blockingPatterns = [
          /cloudflare/i,
          /cf-ray/i,
          /blocked/i,
          /access denied/i,
          /forbidden/i,
          /not available in your country/i,
          /geo-blocked/i,
          /ddos protection/i,
          /checking your browser/i
        ];
        
        const isBlocked = blockingPatterns.some(pattern => pattern.test(html));
        if (isBlocked) {
          throw new NetworkError(`Domain ${domain} appears to be blocked or protected`, 403);
        }
        
        // Verify this looks like nHentai content
        if (!html.includes("nhentai") && !html.includes("gallery") && !html.includes("doujin")) {
          throw new NetworkError(`Unexpected content from ${domain}`, 403);
        }
        
        this.requestCount++;
        return html;
      }, `fetch ${path}`);
    });
  }

  private async getBestProxy(): Promise<any> {
    // Try multiple proxy strategies
    
    // 1. First try the configured proxy manager
    try {
      const proxyAgent = await proxyManager.getBestProxy("nhentai");
      if (proxyAgent) {
        return proxyAgent;
      }
    } catch (error) {
      console.warn("nHentai Enhanced: Proxy manager failed:", error);
    }
    
    // 2. If that fails and proxy is required, throw error
    if (settingsStore.get("nhentaiProxyEnabled")) {
      throw new NetworkError(
        "No working proxy available for nHentai. Please check your proxy configuration.",
        503
      );
    }
    
    // 3. Allow direct connection if proxy not required
    return null;
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const query = (options?.query ?? "").trim();
      const page = options?.page || 1;
      
      // Create cache key
      const cacheKey = `search_${query}_${page}_${this.workingDomain}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        return { results: cached, hasMore: true };
      }

      let path: string;
      if (query.length > 0) {
        // Search with query
        const encodedQuery = encodeURIComponent(query);
        path = `/search/?q=${encodedQuery}&page=${page}`;
      } else {
        // Browse popular/recent
        path = `/?page=${page}`;
      }

      const html = await this.fetchHtml(path, signal);
      const results = this.parseSearchResults(html);
      
      // Cache results
      this.searchCache.set(cacheKey, results);
      
      // Check if there are more pages
      const hasMore = html.includes('class="next"') || 
                     html.includes('>Next<') || 
                     html.includes(`page=${page + 1}`) ||
                     html.includes('rel="next"');
      
      console.log(`nHentai Enhanced: Found ${results.length} results, hasMore: ${hasMore}`);
      
      return { results, hasMore };
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai Enhanced getMangaList error:", error);
      
      // Provide helpful error messages
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ETIMEDOUT') {
        throw new NetworkError(
          "Connection timed out. nHentai is likely blocked in your region. " +
          "Try enabling Tor or a VPN in settings."
        );
      }
      
      throw new NetworkError("Failed to fetch gallery list from nHentai. Try using a proxy or VPN.");
    }
  }

  private async getGalleryData(mangaId: string, signal?: AbortSignal): Promise<{ details: MangaMeta, pageCount: number }> {
    const cached = this.galleryCache.get(`${mangaId}_${this.workingDomain}`);
    if (cached) {
      console.log(`nHentai Enhanced: Using cached data for gallery ${mangaId}`);
      return cached;
    }

    const path = `/g/${mangaId}/`;
    const html = await this.fetchHtml(path, signal);

    const details = this.parseGalleryDetails(html, mangaId);
    const pageCount = this.extractPageCountFromHtml(html);

    if (pageCount === 0) {
      console.warn(`nHentai Enhanced: Could not determine page count for gallery ${mangaId}.`);
    }

    const galleryData = { details, pageCount };
    this.galleryCache.set(`${mangaId}_${this.workingDomain}`, galleryData);

    return galleryData;
  }

  async getMangaDetails(mangaId: string, signal?: AbortSignal): Promise<MangaMeta> {
    try {
      const { details } = await this.getGalleryData(mangaId, signal);
      return details;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai Enhanced getMangaDetails error:", error);
      throw new NetworkError(`Failed to fetch gallery details for ${mangaId}`);
    }
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
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
      console.error("nHentai Enhanced getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapter info for ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const { pageCount } = await this.getGalleryData(chapterId, signal);
      
      if (pageCount === 0) {
        throw new ParseError("Could not determine page count for gallery");
      }
      
      console.log(`nHentai Enhanced: Gallery ${chapterId} has ${pageCount} pages`);
      
      // Generate page URLs - we'll fetch the actual image URLs when needed
      const pages: PageMeta[] = [];
      for (let i = 1; i <= pageCount; i++) {
        pages.push({
          index: i - 1,
          url: `https://${this.workingDomain}/g/${chapterId}/${i}/`,
        });
      }
      
      return pages;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai Enhanced getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for gallery ${chapterId}`);
    }
  }

  private parseSearchResults(html: string): MangaMeta[] {
    const results: MangaMeta[] = [];
    
    try {
      // Multiple patterns for different layouts
      const patterns = [
        /<div class="gallery"[^>]*>[\s\S]*?<\/div>/g,
        /<a href="\/g\/(\d+)\/"[^>]*>[\s\S]*?<\/a>/g,
        /<div[^>]*class="[^"]*gallery[^"]*"[^>]*>[\s\S]*?<\/div>/g
      ];
      
      for (const pattern of patterns) {
        const matches = html.matchAll(pattern);
        
        for (const match of matches) {
          const galleryHtml = match[0];
          
          // Extract gallery ID
          const idMatch = galleryHtml.match(/href="\/g\/(\d+)\//);
          if (!idMatch) continue;
          
          const id = idMatch[1];
          
          // Skip duplicates
          if (results.some(r => r.id === id)) continue;
          
          // Extract title
          const titlePatterns = [
            /<div class="caption">([^<]+)</,
            /alt="([^"]+)"/,
            /title="([^"]+)"/,
            /<h\d[^>]*>([^<]+)<\/h\d>/
          ];
          
          let title = `Gallery ${id}`;
          for (const titlePattern of titlePatterns) {
            const titleMatch = galleryHtml.match(titlePattern);
            if (titleMatch) {
              title = titleMatch[1].trim();
              break;
            }
          }
          
          // Extract cover image
          const coverPatterns = [
            /data-src="([^"]+)"/,
            /src="([^"]+)"/,
            /url\('([^']+)'\)/
          ];
          
          let coverUrl: string | undefined;
          for (const coverPattern of coverPatterns) {
            const coverMatch = galleryHtml.match(coverPattern);
            if (coverMatch && coverMatch[1].includes('thumbnail')) {
              coverUrl = coverMatch[1];
              break;
            }
          }
          
          results.push({
            id,
            title: this.decodeEntities(title),
            coverUrl,
            mature: true, // nHentai content is always mature
          });
        }
        
        if (results.length > 0) break; // Found results with this pattern
      }
      
    } catch (error) {
      console.warn("Failed to parse some search results:", error);
    }
    
    return results;
  }

  private parseGalleryDetails(html: string, mangaId: string): MangaMeta {
    try {
      // Extract title
      const titlePatterns = [
        /<h1[^>]*>([^<]+)</,
        /<title>([^<]+?)\s*\|\s*nHentai</,
        /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</
      ];
      
      let title = `Gallery ${mangaId}`;
      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match) {
          title = match[1].trim();
          break;
        }
      }
      
      // Extract subtitle/alternative title
      const subtitleMatch = html.match(/<h2[^>]*>([^<]+)</);
      const alternativeTitle = subtitleMatch ? subtitleMatch[1].trim() : undefined;
      
      // Extract tags and metadata
      const tags: string[] = [];
      let artist: string | undefined;
      let language: string | undefined;
      
      // Look for tag sections
      const tagSectionRegex = /<span class="tags">[\s\S]*?<\/span>/g;
      const tagSections = html.match(tagSectionRegex) || [];
      
      for (const section of tagSections) {
        const tagMatches = section.match(/class="tag"[^>]*>([^<]+)</g) || [];
        
        for (const tagMatch of tagMatches) {
          const tagName = tagMatch.replace(/class="tag"[^>]*>/, '').replace(/<.*/, '').trim();
          
          if (section.includes("Artists:") || section.includes("artist")) {
            artist = tagName;
          } else if (section.includes("Languages:") || section.includes("language")) {
            language = tagName;
          } else if (tagName && !tagName.includes(":")) {
            tags.push(tagName);
          }
        }
      }
      
      // Extract cover image
      const coverPatterns = [
        /<img[^>]+class="lazyload"[^>]+data-src="([^"]+)"/,
        /<img[^>]+src="([^"]+)"[^>]*cover/,
        /<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/
      ];
      
      let coverUrl: string | undefined;
      for (const pattern of coverPatterns) {
        const match = html.match(pattern);
        if (match) {
          coverUrl = match[1];
          break;
        }
      }
      
      return {
        id: mangaId,
        title: this.decodeEntities(title),
        coverUrl,
        artist,
        tags: tags.slice(0, 10), // Limit tags
        alternativeTitles: alternativeTitle ? [this.decodeEntities(alternativeTitle)] : [],
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
      const patterns = [
        /(\d+)\s+pages?/i,
        /Pages:\s*(\d+)/i,
        /thumb-container[\s\S]*?(\d+)[\s\S]*?thumb/,
        /class="page"[^>]*>(\d+)</g
      ];
      
      for (const pattern of patterns) {
        const matches = html.match(pattern);
        if (matches) {
          if (pattern.global) {
            // For global patterns, get the last match (highest page number)
            const allMatches = html.matchAll(pattern as RegExp);
            let lastMatch: RegExpMatchArray | undefined;
            for (const match of allMatches) {
              lastMatch = match;
            }
            if (lastMatch && lastMatch[1]) {
              const count = parseInt(lastMatch[1]);
              if (count > 0 && count < 10000) return count;
            }
          } else {
            // For non-global patterns, use first match
            const count = parseInt(matches[1]);
            if (count > 0 && count < 10000) return count;
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

  // Enhanced connectivity test
  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }> {
    const suggestions: string[] = [];
    
    try {
      // Test all domains
      let successfulDomain: string | null = null;
      
      for (const domain of DOMAINS) {
        try {
          const testUrl = `https://${domain}/`;
          const headers = this.getAdvancedHeaders();
          const response = await fetchWithTimeout(testUrl, { headers }, 10000);
          
          if (response.ok) {
            const html = await response.text();
            if (html.includes("nhentai") || html.includes("gallery")) {
              successfulDomain = domain;
              this.workingDomain = domain;
              break;
            }
          }
        } catch (error) {
          console.log(`Domain ${domain} failed connectivity test:`, error);
        }
      }
      
      if (successfulDomain) {
        return {
          success: true,
          message: `Successfully connected to nHentai using ${successfulDomain}`,
          suggestions: []
        };
      }
      
      throw new Error("All domains failed");
      
    } catch (error: any) {
      let message = "Connection failed to all nHentai domains";
      
      suggestions.push("Enable Tor or VPN - nHentai is likely blocked in your region");
      suggestions.push("Try different proxy settings in SiManga");
      suggestions.push("Check if your ISP blocks adult content");
      suggestions.push("Try connecting from a different network");
      
      return {
        success: false,
        message: `${message}: ${error.message}`,
        suggestions
      };
    }
  }
}

export default new NHentaiEnhancedAdapter();
