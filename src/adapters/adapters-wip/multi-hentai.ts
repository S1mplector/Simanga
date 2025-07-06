import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire } from "../services/netLimiter";
import settingsStore from "../services/settings";
import nhentaiProxyManager from "../services/nhentaiProxyManager";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

// Alternative nHentai-compatible sites
const ALTERNATIVE_SITES = [
  {
    name: "ASMHentai",
    baseUrl: "https://asmhentai.com",
    searchPath: "/search/?q=",
    galleryPath: "/g/",
    working: true
  },
  {
    name: "HentaiHaven", 
    baseUrl: "https://hentaihaven.xxx",
    searchPath: "/search?q=",
    galleryPath: "/gallery/",
    working: false // Needs implementation
  },
  {
    name: "Hitomi",
    baseUrl: "https://hitomi.la",
    searchPath: "/search.html?q=",
    galleryPath: "/reader/",
    working: false // Different format
  }
];

/**
 * Multi-source adapter that aggregates content from nHentai-like sites
 * When nHentai is blocked, it falls back to alternative sources
 * This provides better reliability for users in restricted regions
 */
class MultiHentaiAdapter implements Adapter {
  id = "multi-hentai";
  label = "Multi Hentai (Aggregated)";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: true,
    authentication: 'none',
    rateLimit: {
      requests: 2,
      period: 2000,
    }
  };
  
  private circuitBreaker = new CircuitBreaker(3, 30000);
  private searchCache = new SimpleCache<MangaMeta[]>(300000); // 5 minute cache
  private availableSources: string[] = [];

  constructor() {
    // Test sources on startup
    this.testAvailableSources();
  }

  private async testAvailableSources(): Promise<void> {
    console.log("Testing alternative hentai sources...");
    
    const testPromises = ALTERNATIVE_SITES.map(async (site) => {
      try {
        const response = await fetchWithTimeout(site.baseUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, 5000);
        
        if (response.ok) {
          console.log(`✅ ${site.name} is available`);
          this.availableSources.push(site.name);
          return site.name;
        }
      } catch (error) {
        console.log(`❌ ${site.name} is not available:`, error);
      }
      return null;
    });
    
    await Promise.allSettled(testPromises);
    console.log(`Available sources: ${this.availableSources.join(', ')}`);
  }

  private async fetchFromASMHentai(query: string, signal?: AbortSignal): Promise<MangaMeta[]> {
    const url = `https://asmhentai.com/search/?q=${encodeURIComponent(query)}`;
    
    const proxy = await nhentaiProxyManager.getBestNHentaiProxy();
    const options: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://asmhentai.com/',
      },
      signal
    };
    
    if (proxy) {
      options.agent = proxy;
    }
    
    const response = await fetchWithTimeout(url, options, 15000);
    
    if (!response.ok) {
      throw new NetworkError(`ASMHentai request failed: ${response.status}`);
    }
    
    const html = await response.text();
    return this.parseASMHentaiResults(html);
  }

  private parseASMHentaiResults(html: string): MangaMeta[] {
    const results: MangaMeta[] = [];
    
    try {
      const regex = /<a href="\/g\/(\d+)\/">[\s\S]*?alt="([^"]+)"/g;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
        const [_, id, title] = match;
        
        results.push({
          id: `asm_${id}`, // Prefix to identify source
          title: this.decodeEntities(title),
          mature: true,
          description: "From ASMHentai"
        });
        
        if (results.length >= 20) break; // Limit results
      }
    } catch (error) {
      console.warn("Failed to parse ASMHentai results:", error);
    }
    
    return results;
  }

  private async fetchFromHitomi(query: string, signal?: AbortSignal): Promise<MangaMeta[]> {
    // For now, return sample results since Hitomi needs special handling
    return [
      {
        id: "hitomi_sample",
        title: "Sample Hitomi Gallery",
        mature: true,
        description: "From Hitomi - Integration coming soon..."
      }
    ];
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const query = (options?.query ?? "").trim();
      const page = options?.page || 1;
      
      if (!query) {
        return {
          results: [
            {
              id: "info_search",
              title: "Enter a search term to find content across multiple sources",
              description: "This adapter searches ASMHentai, Hitomi, and other alternative sites when nHentai is blocked.",
              mature: false
            }
          ],
          hasMore: false
        };
      }
      
      // Create cache key
      const cacheKey = `multi_${query}_${page}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        return { results: cached, hasMore: true };
      }

      const allResults: MangaMeta[] = [];
      
      // Try multiple sources in parallel
      const sourcePromises: Promise<MangaMeta[]>[] = [];
      
      if (this.availableSources.includes("ASMHentai")) {
        sourcePromises.push(
          this.fetchFromASMHentai(query, signal).catch(error => {
            console.warn("ASMHentai search failed:", error);
            return [];
          })
        );
      }
      
      if (this.availableSources.includes("Hitomi")) {
        sourcePromises.push(
          this.fetchFromHitomi(query, signal).catch(error => {
            console.warn("Hitomi search failed:", error);
            return [];
          })
        );
      }
      
      // Wait for all sources to respond
      const sourceResults = await Promise.all(sourcePromises);
      
      // Combine results from all sources
      for (const results of sourceResults) {
        allResults.push(...results);
      }
      
      // Remove duplicates and sort by relevance
      const uniqueResults = this.deduplicateResults(allResults);
      const sortedResults = this.sortByRelevance(uniqueResults, query);
      
      // Cache results
      this.searchCache.set(cacheKey, sortedResults);
      
      console.log(`Multi-Hentai: Found ${sortedResults.length} results from ${sourceResults.length} sources`);
      
      return { 
        results: sortedResults,
        hasMore: sortedResults.length >= 20,
        total: sortedResults.length
      };
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Multi-Hentai getMangaList error:", error);
      throw new NetworkError("Failed to search across alternative hentai sources");
    }
  }

  private deduplicateResults(results: MangaMeta[]): MangaMeta[] {
    const seen = new Set<string>();
    const unique: MangaMeta[] = [];
    
    for (const result of results) {
      // Create a normalized title for comparison
      const normalizedTitle = result.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
      
      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        unique.push(result);
      }
    }
    
    return unique;
  }

  private sortByRelevance(results: MangaMeta[], query: string): MangaMeta[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    
    return results.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a.title, queryWords);
      const scoreB = this.calculateRelevanceScore(b.title, queryWords);
      return scoreB - scoreA; // Higher score first
    });
  }

  private calculateRelevanceScore(title: string, queryWords: string[]): number {
    const normalizedTitle = title.toLowerCase();
    let score = 0;
    
    for (const word of queryWords) {
      if (normalizedTitle.includes(word)) {
        score += word.length; // Longer matches get higher scores
        
        // Boost score if it's an exact word match
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        if (wordRegex.test(normalizedTitle)) {
          score += 10;
        }
        
        // Boost score if it's at the beginning of the title
        if (normalizedTitle.startsWith(word)) {
          score += 5;
        }
      }
    }
    
    return score;
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    try {
      // Extract source and ID
      const [source, actualId] = mangaId.includes('_') ? mangaId.split('_', 2) : ['unknown', mangaId];
      
      // For now, all sources have single-chapter galleries
      return [
        {
          id: mangaId,
          title: `Read Gallery • Source: ${source}`,
          number: "1",
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Multi-Hentai getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapter info for ${mangaId}`);
    }
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      const [source, actualId] = chapterId.includes('_') ? chapterId.split('_', 2) : ['unknown', chapterId];
      
      if (source === "asm") {
        return this.getASMHentaiPages(actualId, signal);
      }
      
      // Fallback for unknown sources
      throw new ParseError(`Unsupported source: ${source}. This gallery may not be viewable through the multi-source adapter.`);
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("Multi-Hentai getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for gallery ${chapterId}`);
    }
  }

  private async getASMHentaiPages(galleryId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    const url = `https://asmhentai.com/g/${galleryId}/`;
    
    const proxy = await nhentaiProxyManager.getBestNHentaiProxy();
    const options: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://asmhentai.com/',
      },
      signal
    };
    
    if (proxy) {
      options.agent = proxy;
    }
    
    const response = await fetchWithTimeout(url, options, 15000);
    
    if (!response.ok) {
      throw new NetworkError(`ASMHentai gallery request failed: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract directory and page count (ASMHentai specific logic)
    const dirMatch = html.match(/id="load_dir" value="(\d+)"/);
    if (!dirMatch) throw new ParseError("Failed to locate gallery directory");
    const dir = dirMatch[1];
    
    const pageCountMatch = html.match(/id="t_pages" value="(\d+)"/);
    if (!pageCountMatch) throw new ParseError("Failed to determine page count");
    const pageCount = parseInt(pageCountMatch[1], 10);
    
    // Determine file extension
    const extMatch = html.match(new RegExp(`https?://images\\.asmhentai\\.com/${dir}/${galleryId}/1t\\.(jpg|jpeg|png|webp|gif)`, "i"));
    const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase();
    
    // Generate page URLs
    const pages: PageMeta[] = [];
    for (let i = 1; i <= pageCount; i++) {
      pages.push({
        index: i - 1,
        url: `https://images.asmhentai.com/${dir}/${galleryId}/${i}.${ext}`,
      });
    }
    
    return pages;
  }

  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  }

  // Test connectivity across all sources
  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }> {
    await this.testAvailableSources();
    
    if (this.availableSources.length > 0) {
      return {
        success: true,
        message: `Multi-Hentai adapter working. Available sources: ${this.availableSources.join(', ')}`,
        suggestions: []
      };
    }
    
    const suggestions = [
      "Check your internet connection",
      "Try enabling Tor or VPN",
      "Adult content sites may be blocked in your region",
      "Consider using a different network"
    ];
    
    return {
      success: false,
      message: "No alternative hentai sources are currently accessible",
      suggestions
    };
  }
}

export default new MultiHentaiAdapter();
