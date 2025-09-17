import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { 
  CircuitBreaker, 
  fetchWithRateLimit,
  NetworkError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";
import puppeteer from "puppeteer";

/**
 * @class NHentaiVPNAdapter
 * @implements {Adapter}
 *
 * @description
 * This adapter provides an interface for scraping manga from nHentai.net.
 * It is designed to be resilient to network issues and employs several strategies
 * - A circuit breaker is implemented to prevent spamming the site if it's down or blocking requests.
 * - It includes a simple in-memory cache for gallery data to speed up repeated requests for the same manga.
 * - Does not require a VPN/proxy but is named to distinguish from potential future implementations.
 */
class NHentaiVPNAdapter implements Adapter {
  id = "nhentai-vpn";
  label = "nHentai";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'cookie',
  };
  
  /** A circuit breaker to prevent repeated failed requests to the source. */
  private circuitBreaker = new CircuitBreaker(3, 120000); // More conservative: 3 failures, 2min cooldown

  /** Simple in-memory cache for gallery JSON. Clears itself after TTL. */
  private galleryCache = new Map<string, { data: any; ts: number }>();
  private static readonly GALLERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /** Optional cookie header for authenticated/session-based access */
  private cookieHeader?: string;

  /**
   * Fetches HTML content from a given URL with rate limiting and a circuit breaker.
   * @param url The URL to fetch.
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to the HTML content as a string.
   * @throws {NetworkError} If the fetch fails or the circuit breaker is open.
   */
  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      // Use more comprehensive headers to appear like a real browser
      const headers: Record<string, string> = { 
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Referer": "https://nhentai.net/",
        "DNT": "1"
      };
      if (this.cookieHeader) headers["Cookie"] = this.cookieHeader;
      
      // Add random delay to appear more human-like (500ms to 2s)
      const delay = Math.random() * 1500 + 500;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const response = await fetchWithRateLimit(
          url,
          { headers, signal, timeout: 20000 },
          "nHentai"
        );
        return await response.text();
      } catch (err: any) {
        // If forbidden, try puppeteer fallback to establish a session and retry once
        if (err instanceof NetworkError && err.statusCode === 403) {
          console.warn("nHentai: 403 detected, attempting Puppeteer fallback to establish session");
          const html = await this.puppeteerFetchHtml(url);
          if (html) return html;
        }
        throw err;
      }
    });
  }

  private async puppeteerFetchHtml(url: string): Promise<string | undefined> {
    let browser;
    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.setExtraHTTPHeaders({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Give any JS-based checks time
      await new Promise((r) => setTimeout(r, 1500));
      const content = await page.content();
      // Persist cookies as header for future fetches
      const cookies = await page.cookies();
      if (cookies && cookies.length) {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        this.cookieHeader = cookieHeader;
      }
      return content;
    } catch (e) {
      console.error("nHentai Puppeteer fallback failed:", e);
      return undefined;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Searches for manga or gets the latest uploads from the homepage.
   * @param options Search options, including query and page number.
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to a list of manga metadata.
   */
  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean }> {
    try {
      const term = (options?.query ?? "").trim();
      const page = options?.page || 1;

      const url = term
        ? `https://nhentai.net/search/?q=${encodeURIComponent(term)}&page=${page}`
        : `https://nhentai.net/?page=${page}`;
      
      console.log(`nHentai: Fetching ${url}`);
      const html = await this.fetchHtml(url, signal);

      const results: MangaMeta[] = [];
      const seen = new Set<string>();
      
      // Split by gallery divs and process each one
      const parts = html.split('<div class="gallery"');
      
      for (let i = 1; i < parts.length; i++) {
        const galleryHtml = parts[i];
        
        // Extract ID from href
        const idMatch = galleryHtml.match(/href="\/g\/(\d+)\//);
        if (!idMatch) continue;
        
        const id = idMatch[1];
        if (seen.has(id)) continue;
        seen.add(id);
        
        // Extract title from caption
        const titleMatch = galleryHtml.match(/<div class="caption">([^<]+)</);
        const title = titleMatch ? this.decodeEntities(titleMatch[1].trim()) : `Gallery ${id}`;
        
        // Extract cover URL - prioritize data-src
        let coverUrl: string | undefined;
        
        // Look for data-src first (most common)
        const dataSrcMatch = galleryHtml.match(/data-src="([^"]+)"/);
        if (dataSrcMatch) {
          coverUrl = dataSrcMatch[1];
        } else {
          // Fallback to src attribute
          const srcMatch = galleryHtml.match(/<img[^>]+src="([^"]+)"[^>]*>/);
          if (srcMatch && !srcMatch[1].includes('data:image')) {
            coverUrl = srcMatch[1];
          }
        }
        
        // Ensure cover URL is absolute
        if (coverUrl) {
          if (coverUrl.startsWith('//')) {
            coverUrl = 'https:' + coverUrl;
          } else if (coverUrl.startsWith('/')) {
            coverUrl = 'https://nhentai.net' + coverUrl;
          }
        }
        
        results.push({ 
          id, 
          title,
          coverUrl,
          mature: true 
        });
      }
      
      console.log(`nHentai: Found ${results.length} results`);
      if (results.length > 0) {
        console.log('Sample results with covers:', results.slice(0, 3).map(r => ({ 
          id: r.id, 
          title: r.title.substring(0, 40) + '...', 
          cover: r.coverUrl ? 'YES' : 'NO' 
        })));
      }
      
      // Check for next page
      const hasMore = html.includes('class="next"') || html.includes(`page=${page + 1}`);
      
      return { results, hasMore };
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai error:", error);
      throw new NetworkError("Failed to fetch gallery list");
    }
  }

  /**
   * Retrieves detailed metadata for a specific manga.
   * @param mangaId The ID of the manga (gallery ID).
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to the manga's detailed metadata.
   */
  async getMangaDetails(mangaId: string, signal?: AbortSignal): Promise<MangaMeta> {
    try {
      const html = await this.fetchHtml(`https://nhentai.net/g/${mangaId}/`, signal);
      
      // Extract title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)</) || html.match(/<title>([^<]+?)\s*[|-]/);
      const title = titleMatch ? this.decodeEntities(titleMatch[1].trim()) : `Gallery ${mangaId}`;
      
      // Extract cover from gallery page
      let coverUrl: string | undefined;
      
      // Try to find cover in the #cover div
      const coverMatch = html.match(/<div id="cover"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/);
      if (coverMatch) {
        coverUrl = coverMatch[1];
        if (coverUrl.startsWith('//')) {
          coverUrl = 'https:' + coverUrl;
        }
      }
      
      // Extract tags and metadata
      const tags: string[] = [];
      let artist: string | undefined;
      
      // Look for tag containers
      const tagContainers = html.match(/<div[^>]*class="tag-container[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
      for (const container of tagContainers) {
        if (container.includes('Artists:')) {
          const artistMatch = container.match(/<span class="name">([^<]+)</);
          if (artistMatch) artist = artistMatch[1];
        } else {
          const tagMatches = container.matchAll(/<span class="name">([^<]+)</g);
          for (const match of tagMatches) {
            tags.push(match[1]);
          }
        }
      }
      
      return {
        id: mangaId,
        title,
        coverUrl,
        artist,
        tags: tags.slice(0, 10),
        mature: true
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai error:", error);
      throw new NetworkError(`Failed to fetch details for ${mangaId}`);
    }
  }

  /**
   * Retrieves the list of chapters for a manga. For nHentai, each gallery is a single chapter.
   * @param mangaId The ID of the manga (gallery ID).
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to an array containing a single chapter.
   */
  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
      const galleryData = await this.getGalleryData(mangaId, signal);
      const pageCount: number | undefined = galleryData.num_pages || galleryData.images?.pages?.length;

      return [{
        id: mangaId,
        title: "Read Gallery",
        number: "1",
        pages: pageCount || undefined,
      }];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai error:", error);
      throw new NetworkError(`Failed to fetch chapters for ${mangaId}`);
    }
  }

  /**
   * Fetches and caches the core gallery JSON data from the manga's page.
   * This data contains the media ID and page information necessary for fetching images.
   * @param galleryId The ID of the gallery.
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to the parsed gallery JSON data.
   * @throws {ParseError} If the gallery JSON cannot be found or parsed.
   */
  private async getGalleryData(galleryId: string, signal?: AbortSignal): Promise<any> {
    const cached = this.galleryCache.get(galleryId);
    const now = Date.now();
    if (cached && now - cached.ts < NHentaiVPNAdapter.GALLERY_TTL_MS) {
      return cached.data;
    }

    // Fetch HTML then extract gallery JSON (same logic as before)
    const html = await this.fetchHtml(`https://nhentai.net/g/${galleryId}/`, signal);

    const galleryJsonMatch = html.match(/window\._gallery\s*=\s*JSON\.parse\("(.+?)"\);/);
    if (!galleryJsonMatch) {
      throw new ParseError("Failed to find gallery data");
    }

    const escapedJson = galleryJsonMatch[1];
    const jsonString = escapedJson
      .replace(/\\u0022/g, '"')
      .replace(/\\u002F/g, '/')
      .replace(/\\u003C/g, '<')
      .replace(/\\u003D/g, '=')
      .replace(/\\u003E/g, '>');

    const data = JSON.parse(jsonString);

    // Store in cache
    this.galleryCache.set(galleryId, { data, ts: now });

    // Cleanup stale entries occasionally (lazy)
    if (this.galleryCache.size > 100) {
      for (const [key, value] of this.galleryCache) {
        if (now - value.ts > NHentaiVPNAdapter.GALLERY_TTL_MS) {
          this.galleryCache.delete(key);
        }
      }
    }

    return data;
  }

  /**
   * Retrieves the list of pages for a given chapter (gallery).
   * @param chapterId The ID of the chapter (which is the gallery ID).
   * @param signal An AbortSignal to cancel the request.
   * @returns A promise that resolves to an array of page metadata.
   */
  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const galleryData = await this.getGalleryData(chapterId, signal);

      const mediaId = galleryData.media_id;
      const images = galleryData.images.pages;
      console.log(`nHentai: Gallery ${chapterId} has ${images.length} pages, media_id: ${mediaId}`);

      // Build page URLs using the image format data
      const pages: PageMeta[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        // t = type: j=jpg, p=png, g=gif, w=webp
        const ext = img.t === 'j' ? 'jpg' : img.t === 'p' ? 'png' : img.t === 'g' ? 'gif' : 'webp';
        
        pages.push({
          index: i,
          url: `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
          alternativeUrls: [
            `https://i2.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
            `https://i3.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
            `https://i5.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
          ]
        });
      }

      return pages;
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("nHentai error:", error);
      throw new NetworkError(`Failed to fetch pages for ${chapterId}`);
    }
  }

  /**
   * Extracts the total page count from the gallery's HTML.
   * It tries to parse the embedded gallery JSON first, then falls back to regex patterns
   * and finally counts thumbnail images as a last resort.
   * @param html The HTML content of the gallery page.
   * @returns The number of pages, or 0 if not found.
   * @deprecated This method is less reliable than getGalleryData and should be used as a fallback only.
   */
  private extractPageCount(html: string): number {
    // Try to extract from the gallery JSON first
    const galleryJsonMatch = html.match(/window\._gallery\s*=\s*JSON\.parse\("(.+?)"\);/);
    if (galleryJsonMatch) {
      try {
        const escapedJson = galleryJsonMatch[1];
        const jsonString = escapedJson
          .replace(/\\u0022/g, '"')
          .replace(/\\u002F/g, '/')
          .replace(/\\u003C/g, '<')
          .replace(/\\u003D/g, '=')
          .replace(/\\u003E/g, '>');
        
        const galleryData = JSON.parse(jsonString);
        if (galleryData.num_pages) {
          return galleryData.num_pages;
        }
      } catch (e) {
        console.warn("Failed to parse gallery JSON for page count");
      }
    }
    
    // Fallback patterns
    const patterns = [
      /(\d+)\s+pages?/i,
      /<div[^>]*info[^>]*>[\s\S]*?<div>Pages:\s*<[^>]*>(\d+)</i,
      /<span[^>]*tags[^>]*>[\s\S]*?(\d+)\s*pages/i,
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
    
    // Count thumbnails as last resort
    const thumbs = html.match(/class="gallerythumb"/g);
    if (thumbs) {
      return thumbs.length;
    }
    
    return 0;
  }

  /**
   * Decodes HTML entities in a string.
   * @param str The string to decode.
   * @returns The decoded string.
   */
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
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

  // Authentication and connectivity helpers
  async authenticate(credentials: { cookie: string }): Promise<void> {
    const cookie = (credentials?.cookie || "").trim();
    if (!cookie) {
      throw new AdapterError("Cookie is required for authentication", "AUTH_ERROR", false);
    }
    this.cookieHeader = cookie;
  }

  async isAuthenticated(): Promise<boolean> {
    return Boolean(this.cookieHeader);
  }

  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }>{
    try {
      const html = await this.fetchHtml("https://nhentai.net/", undefined);
      const blocked = /forbidden|captcha|cloudflare|attention required/i.test(html);
      if (blocked) {
        return {
          success: false,
          message: "Access appears blocked or gated (anti-bot)",
          suggestions: [
            "Provide a valid session cookie via authenticate({ cookie })",
            "Wait and retry due to rate limiting",
            "Use Puppeteer fallback by triggering a request (handled automatically on 403)",
          ],
        };
      }
      return { success: true, message: "Connectivity OK", suggestions: [] };
    } catch (e: any) {
      const msg = e?.message || String(e);
      return {
        success: false,
        message: `Connectivity check failed: ${msg}`,
        suggestions: [
          "Try again later (possible rate-limit)",
          "Provide a session cookie",
          "Ensure network reachability",
        ],
      };
    }
  }
}

export default new NHentaiVPNAdapter();