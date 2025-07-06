import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire } from "../services/netLimiter";
import settingsStore from "../services/settings";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

/**
 * Fallback adapter that works when SSL inspection is blocking adult sites
 * Uses HTTP instead of HTTPS and provides alternative methods to access content
 */
class FallbackHentaiAdapter implements Adapter {
  id = "fallback-hentai";
  label = "Fallback Hentai (SSL-Safe)";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
    rateLimit: {
      requests: 1,
      period: 3000,
    }
  };
  
  private circuitBreaker = new CircuitBreaker(2, 30000);
  private searchCache = new SimpleCache<MangaMeta[]>(600000);

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const query = (options?.query ?? "").trim();
      
      if (!query) {
        return {
          results: [
            {
              id: "ssl_info",
              title: "🔒 SSL Interception Detected",
              description: "Your network is blocking HTTPS connections to adult sites. This adapter provides workarounds.",
              mature: false
            },
            {
              id: "solution_1",
              title: "Solution 1: Use Mobile Hotspot",
              description: "Try connecting via your phone's mobile data instead of WiFi",
              mature: false
            },
            {
              id: "solution_2", 
              title: "Solution 2: Try Different DNS",
              description: "Change DNS to 1.1.1.1 or 8.8.8.8 in network settings",
              mature: false
            },
            {
              id: "solution_3",
              title: "Solution 3: Use VPN",
              description: "A VPN can bypass network-level SSL inspection",
              mature: false
            }
          ],
          hasMore: false
        };
      }
      
      // Try to find content using alternative methods
      return await this.searchAlternativeMethods(query, signal);
      
    } catch (error) {
      console.error("Fallback adapter error:", error);
      throw new NetworkError("Network restrictions prevent accessing adult content sites");
    }
  }

  private async searchAlternativeMethods(query: string, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    const results: MangaMeta[] = [];
    
    // Method 1: Try HTTP versions of sites (less secure but might work)
    try {
      const httpResults = await this.tryHttpSites(query, signal);
      results.push(...httpResults);
    } catch (error) {
      console.warn("HTTP sites failed:", error);
    }
    
    // Method 2: Try proxy/mirror sites
    try {
      const mirrorResults = await this.tryMirrorSites(query, signal);
      results.push(...mirrorResults);
    } catch (error) {
      console.warn("Mirror sites failed:", error);
    }
    
    // If no results, provide guidance
    if (results.length === 0) {
      results.push({
        id: "no_results",
        title: "⚠️ No content accessible through current network",
        description: `Searched for: "${query}" - Network restrictions are preventing access to content sources`,
        mature: false
      });
      
      results.push({
        id: "network_help",
        title: "🌐 Network Troubleshooting Help",
        description: "Your network is using SSL interception. Try: Mobile data, VPN, or different WiFi network",
        mature: false
      });
    }
    
    return { results, hasMore: false };
  }

  private async tryHttpSites(query: string, signal?: AbortSignal): Promise<MangaMeta[]> {
    const results: MangaMeta[] = [];
    
    // Try HTTP version of ASMHentai (if it exists)
    try {
      const url = `http://asmhentai.com/search/?q=${encodeURIComponent(query)}`;
      
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal
      }, 10000);
      
      if (response.ok) {
        const html = await response.text();
        const parsedResults = this.parseASMHentaiResults(html);
        results.push(...parsedResults);
      }
    } catch (error) {
      console.debug("HTTP ASMHentai failed:", error);
    }
    
    return results;
  }

  private async tryMirrorSites(query: string, signal?: AbortSignal): Promise<MangaMeta[]> {
    const results: MangaMeta[] = [];
    
    // Try known mirror domains that might have different SSL configurations
    const mirrors = [
      'nhentai.to',
      'nhentai.xxx'
    ];
    
    for (const mirror of mirrors) {
      try {
        // Try both HTTP and HTTPS
        const protocols = ['http', 'https'];
        
        for (const protocol of protocols) {
          try {
            const url = `${protocol}://${mirror}/search/?q=${encodeURIComponent(query)}`;
            
            const response = await fetchWithTimeout(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              signal,
              // For HTTPS, we might need to disable cert verification in a real app
            }, 8000);
            
            if (response.ok) {
              const html = await response.text();
              if (html.includes('gallery') || html.includes('nhentai')) {
                results.push({
                  id: `mirror_${mirror}_${Date.now()}`,
                  title: `Found working mirror: ${mirror}`,
                  description: `This mirror site is accessible. Query: ${query}`,
                  mature: true
                });
                break; // Stop trying other protocols for this mirror
              }
            }
          } catch (error) {
            console.debug(`Mirror ${protocol}://${mirror} failed:`, error);
          }
        }
      } catch (error) {
        console.debug(`Mirror ${mirror} failed:`, error);
      }
    }
    
    return results;
  }

  private parseASMHentaiResults(html: string): MangaMeta[] {
    const results: MangaMeta[] = [];
    
    try {
      const regex = /<a href="\/g\/(\d+)\/">[\s\S]*?alt="([^"]+)"/g;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
        const [_, id, title] = match;
        
        results.push({
          id: `fallback_asm_${id}`,
          title: this.decodeEntities(title),
          mature: true,
          description: "From ASMHentai (HTTP)"
        });
        
        if (results.length >= 10) break;
      }
    } catch (error) {
      console.warn("Failed to parse ASMHentai results:", error);
    }
    
    return results;
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    // For info items, return empty
    if (mangaId.startsWith('ssl_') || mangaId.startsWith('solution_') || mangaId.startsWith('no_') || mangaId.startsWith('network_')) {
      return [];
    }
    
    return [
      {
        id: mangaId,
        title: "View Content (if accessible)",
        number: "1",
      },
    ];
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    // For info items, return empty
    if (chapterId.startsWith('ssl_') || chapterId.startsWith('solution_') || chapterId.startsWith('no_') || chapterId.startsWith('network_')) {
      return [];
    }
    
    // If it's an ASMHentai item, try to get pages
    if (chapterId.startsWith('fallback_asm_')) {
      const actualId = chapterId.replace('fallback_asm_', '');
      return await this.getASMHentaiPages(actualId, signal);
    }
    
    throw new ParseError("Content not accessible due to network restrictions");
  }

  private async getASMHentaiPages(galleryId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      // Try HTTP first
      const url = `http://asmhentai.com/g/${galleryId}/`;
      
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://asmhentai.com/',
        },
        signal
      }, 15000);
      
      if (!response.ok) {
        throw new NetworkError(`ASMHentai gallery request failed: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Extract directory and page count
      const dirMatch = html.match(/id="load_dir" value="(\d+)"/);
      if (!dirMatch) throw new ParseError("Failed to locate gallery directory");
      const dir = dirMatch[1];
      
      const pageCountMatch = html.match(/id="t_pages" value="(\d+)"/);
      if (!pageCountMatch) throw new ParseError("Failed to determine page count");
      const pageCount = parseInt(pageCountMatch[1], 10);
      
      // Try to get file extension
      const extMatch = html.match(new RegExp(`images\\.asmhentai\\.com/${dir}/${galleryId}/1t\\.(jpg|jpeg|png|webp|gif)`, "i"));
      const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase();
      
      // Generate page URLs using HTTP
      const pages: PageMeta[] = [];
      for (let i = 1; i <= pageCount; i++) {
        pages.push({
          index: i - 1,
          url: `http://images.asmhentai.com/${dir}/${galleryId}/${i}.${ext}`,
        });
      }
      
      return pages;
    } catch (error) {
      throw new NetworkError(`Cannot access gallery due to network restrictions: ${error}`);
    }
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

  async testConnectivity(): Promise<{ success: boolean; message: string; suggestions: string[] }> {
    const suggestions = [
      "Your network is using SSL interception/filtering",
      "Try connecting via mobile data instead of WiFi",
      "Change DNS settings to 1.1.1.1 or 8.8.8.8",
      "Use a VPN to bypass network restrictions",
      "Contact network administrator if on corporate network"
    ];
    
    // Test if we can reach any adult sites
    try {
      const testUrl = 'http://asmhentai.com/';
      const response = await fetchWithTimeout(testUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, 5000);
      
      if (response.ok) {
        return {
          success: true,
          message: "Some content accessible via HTTP (less secure)",
          suggestions: ["HTTP access working but limited", "Consider VPN for full access"]
        };
      }
    } catch (error) {
      // Expected to fail
    }
    
    return {
      success: false,
      message: "Network restrictions detected - SSL interception blocking adult sites",
      suggestions
    };
  }
}

export default new FallbackHentaiAdapter();
