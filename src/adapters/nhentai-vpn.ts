import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { 
  CircuitBreaker, 
  fetchWithRateLimit,
  NetworkError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

/**
 * Simple nHentai adapter for VPN users
 * Based on ASMHentai's proven approach
 */
class NHentaiVPNAdapter implements Adapter {
  id = "nhentai-vpn";
  label = "nHentai";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };
  
  private circuitBreaker = new CircuitBreaker(5, 60000);

  /** Simple in-memory cache for gallery JSON.  Clears itself after TTL. */
  private galleryCache = new Map<string, { data: any; ts: number }>();
  private static readonly GALLERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      const headers = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };
      
      const response = await fetchWithRateLimit(
        url,
        { headers, signal, timeout: 15000 },
        "nHentai"
      );
      
      return await response.text();
    });
  }

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
}

export default new NHentaiVPNAdapter(); 