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

// Default to localhost for self-hosted MangaHook instances
const DEFAULT_API_BASE = "http://localhost:3000/api";

interface MangaHookMangaList {
  mangaList: Array<{
    id: string;
    image: string;
    title: string;
    chapter: string;
    view: string;
    description: string;
  }>;
  metaData: {
    totalStories: number;
    totalPages: number;
    type: Array<{ id: string; type: string }>;
    state: Array<{ id: string; type: string }>;
    category: Array<{ id: string; type: string }>;
  };
}

interface MangaHookMangaDetail {
  id: string;
  title: string;
  image: string;
  authors?: string[];
  status?: string;
  description?: string;
  genres?: string[];
  totalChapters?: number;
  chapters?: Array<{
    id: string;
    title: string;
    chapterNumber?: string;
    dateUploaded?: string;
  }>;
}

interface MangaHookChapter {
  id: string;
  title: string;
  images: string[];
}

class MangaHookAdapter implements Adapter {
  id = "mangahook";
  label = "MangaHook (Self-hosted)";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };

  private circuitBreaker = new CircuitBreaker(5, 60000);
  private mangaCache = new SimpleCache<MangaHookMangaDetail>(600000); // 10 minute cache
  private chapterCache = new SimpleCache<ChapterMeta[]>(300000); // 5 minute cache

  /**
   * Get the API base URL from settings or use default
   */
  private getApiBase(): string {
    const customUrl = settingsStore.get("mangahookApiUrl");
    return customUrl || DEFAULT_API_BASE;
  }

  /**
   * Fetch JSON from MangaHook API with proper error handling
   */
  private async fetchJson<T>(url: string): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();
      
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
      
      // Build proxy list
      const proxies: string[] = settingsStore.get("proxies") || [];
      const dispatchers: any[] = [];
      
      if (proxies.length > 0) {
        for (const proxy of proxies) {
          try {
            const agent = /^socks/i.test(proxy) ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
            dispatchers.push(agent);
          } catch (err) {
            console.warn("Invalid proxy for MangaHook:", proxy);
          }
        }
      }
      
      // Always try direct connection last
      dispatchers.push(undefined);
      
      let lastError: any;
      let isConnectionRefused = false;
      
      for (const agent of dispatchers) {
        const init: any = {
          headers: {
            "User-Agent": ua,
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
          },
        };
        
        if (agent) {
          init.agent = agent;
        }
        
        try {
          const res = await fetchWithTimeout(url, init, 10000); // Reduced timeout for local server
          
          if (res.status === 429) {
            noteRateLimit();
            const retryAfter = res.headers.get("retry-after");
            throw new RateLimitError(
              "MangaHook rate limit exceeded. Please wait before trying again.",
              retryAfter ? parseInt(retryAfter) : 60
            );
          }
          
          if (!res.ok) {
            if (res.status >= 500) {
              throw new NetworkError(`MangaHook server error (${res.status})`, res.status);
            } else if (res.status === 404) {
              throw new NetworkError("Content not found on MangaHook", 404);
            } else {
              throw new NetworkError(`MangaHook request failed with status ${res.status}`, res.status);
            }
          }
          
          noteSuccess();
          
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            throw new ParseError("MangaHook returned non-JSON response");
          }
          
          try {
            return await res.json() as T;
          } catch {
            throw new ParseError("Failed to parse MangaHook response");
          }
        } catch (err: any) {
          // Check for connection refused error
          if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            isConnectionRefused = true;
          }
          lastError = err;
          if (err instanceof AdapterError && !err.retryable) {
            throw err;
          }
          continue;
        }
      }
      
      // Provide helpful error message for self-hosted setup
      if (isConnectionRefused) {
        const apiBase = this.getApiBase();
        throw new NetworkError(
          `Cannot connect to MangaHook at ${apiBase}. ` +
          `Please ensure:\n` +
          `1. You have cloned and started the MangaHook server from https://github.com/kiraaziz/mangahook-api\n` +
          `2. Run 'npm install' and 'npm run start' in the server directory\n` +
          `3. The server is running on the correct port\n` +
          `4. You can configure a custom URL in Settings > MangaHook API URL`,
          0
        );
      }
      
      throw lastError ?? new NetworkError("All connection attempts to MangaHook failed");
    });
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
      const search = options?.query;
      const apiBase = this.getApiBase();
      let url: string;
      
      if (search && search.trim()) {
        // Search endpoint - need to check if MangaHook has a specific search endpoint
        // For now, we'll fetch all and filter client-side
        url = `${apiBase}/mangaList`;
      } else {
        // List all manga
        url = `${apiBase}/mangaList`;
      }
      
      const response = await this.fetchJson<MangaHookMangaList>(url);
      
      if (!response.mangaList || !Array.isArray(response.mangaList)) {
        throw new ParseError("Invalid response format from MangaHook");
      }
      
      let results = response.mangaList.map(manga => ({
        id: manga.id,
        title: manga.title,
      }));
      
      // Client-side search if needed
      if (search && search.trim()) {
        const searchTerm = search.toLowerCase().trim();
        results = results.filter(manga => 
          manga.title.toLowerCase().includes(searchTerm)
        );
      }
      
      const finalResults = results.slice(0, 100); // Limit to 100 results
      
      // If we got 100 results, there might be more
      const hasMore = results.length > 100;
      const total = response.metaData?.totalStories;
      
      return { results: finalResults, hasMore, total };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("MangaHook getMangaList error:", error);
      throw new NetworkError("Failed to fetch manga list from MangaHook");
    }
  }

  async getChapterList(mangaId: string): Promise<ChapterMeta[]> {
    try {
      // Check cache first
      const cacheKey = `chapters_${mangaId}`;
      const cached = this.chapterCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      const apiBase = this.getApiBase();
      // Fetch manga details which includes chapters
      const url = `${apiBase}/manga/${mangaId}`;
      const mangaDetail = await this.fetchJson<MangaHookMangaDetail>(url);
      
      // Cache the manga detail
      this.mangaCache.set(mangaId, mangaDetail);
      
      if (!mangaDetail.chapters || !Array.isArray(mangaDetail.chapters)) {
        throw new ParseError("No chapters found for this manga");
      }
      
      const chapters: ChapterMeta[] = mangaDetail.chapters.map(chapter => ({
        id: chapter.id,
        title: chapter.title || `Chapter ${chapter.chapterNumber || chapter.id}`,
      }));
      
      // MangaHook might return chapters in mixed order, so sort them
      chapters.sort((a, b) => {
        // Try to extract chapter numbers
        const getNumber = (title: string): number => {
          const match = title.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
          return match ? parseFloat(match[1]) : 0;
        };
        
        const numA = getNumber(a.title);
        const numB = getNumber(b.title);
        
        // Sort descending (newest first)
        return numB - numA;
      });
      
      // Cache the results
      this.chapterCache.set(cacheKey, chapters);
      
      return chapters;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("MangaHook getChapterList error:", error);
      throw new NetworkError(`Failed to fetch chapters for manga ${mangaId}`);
    }
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    try {
      const apiBase = this.getApiBase();
      // MangaHook API structure might require manga ID + chapter ID
      // We'll try direct chapter endpoint first
      let url = `${apiBase}/chapter/${chapterId}`;
      
      // First attempt: direct chapter endpoint
      let chapterData: MangaHookChapter;
      try {
        chapterData = await this.fetchJson<MangaHookChapter>(url);
      } catch (error) {
        // If direct chapter endpoint fails, we might need manga ID
        // Try to extract from cache or make additional request
        if (error instanceof NetworkError && error.statusCode === 404) {
          throw new ParseError(
            "Chapter not found. MangaHook may require additional parameters."
          );
        }
        throw error;
      }
      
      if (!chapterData.images || !Array.isArray(chapterData.images)) {
        throw new ParseError("No pages found for this chapter");
      }
      
      return chapterData.images.map((imageUrl, index) => ({
        index,
        url: imageUrl.startsWith('http') ? imageUrl : `https:${imageUrl}`,
      }));
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("MangaHook getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter ${chapterId}`);
    }
  }
}

export default new MangaHookAdapter(); 