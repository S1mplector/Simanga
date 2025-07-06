import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import settingsStore from "../services/settings";
import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "../services/netLimiter";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

const API_BASE = "https://api.mangadex.org";

// MangaDex-specific rate limiter
class MangaDexRateLimiter {
  private lastRequestTime = 0;
  private requestsInWindow = 0;
  private windowStart = Date.now();
  private readonly WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 30; // Conservative limit
  private MIN_REQUEST_INTERVAL = 500; // 500ms between requests (mutable to allow dynamic adjustment)

  async acquire() {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.windowStart = now;
      this.requestsInWindow = 0;
    }

    // Wait if we're going too fast
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }

    // Check if we're at the limit for this window
    if (this.requestsInWindow >= this.MAX_REQUESTS_PER_WINDOW) {
      const waitTime = this.WINDOW_MS - (now - this.windowStart) + 100;
      if (waitTime > 0) {
        console.log(`MangaDex rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Reset window after waiting
        this.windowStart = Date.now();
        this.requestsInWindow = 0;
      }
    }

    this.lastRequestTime = Date.now();
    this.requestsInWindow++;
  }

  handleRateLimitHeaders(headers: any) {
    const remaining = parseInt(headers['x-ratelimit-remaining']);
    const limit = parseInt(headers['x-ratelimit-limit']);
    
    if (!isNaN(remaining) && !isNaN(limit)) {
      console.log(`MangaDex rate limit: ${remaining}/${limit} requests remaining`);
      
      // If we're getting low on requests, slow down
      if (remaining < 5) {
        this.MIN_REQUEST_INTERVAL = 2000; // Slow down to 2s between requests
      }
    }
  }
}

class MangaDexAdapter implements Adapter {
  id = "mangadex";
  label = "MangaDex";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: true,
    multiLanguage: true,
    rateLimit: {
      requests: 30,
      period: 60000, // 1 minute
    },
    authentication: 'none',
    supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ja', 'zh', 'ko'],
  };

  private proxyIndex = 0;
  private rateLimiter = new MangaDexRateLimiter();
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private chapterCache = new SimpleCache<ChapterMeta[]>(600000); // 10 minute cache for chapters
  private tagMap: Map<string, string> | null = null; // name(lower) -> id

  /** Load tag list once and cache */
  private async ensureTagsLoaded() {
    if (this.tagMap) return;
    try {
      const json = await this.fetchJson(`${API_BASE}/manga/tag`);
      if (Array.isArray(json?.data)) {
        const map = new Map<string, string>();
        json.data.forEach((t: any) => {
          const id = t.id;
          const names = t.attributes?.name ?? {};
          Object.values(names).forEach((n: any) => {
            if (typeof n === "string") map.set(n.toLowerCase(), id);
          });
        });
        this.tagMap = map;
      } else {
        this.tagMap = new Map();
      }
    } catch (err) {
      console.warn("Failed to load MangaDex tags", err);
      this.tagMap = new Map();
    }
  }

  /**
   * MangaDex rejects requests that do not include a User-Agent header.  Node's
   * built-in fetch (used inside Electron's main process) omits this header by
   * default, which leads to 403 responses and an empty manga list on first
   * load.  We centralise a helper that always adds a decent UA string and
   * performs basic error handling.
   */
  private async fetchJson(url: string): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      // Use both global and MangaDex-specific rate limiters
    await rlAcquire();
      await this.rateLimiter.acquire();

    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

    // Build an ordered list of proxy endpoints.
    const proxyStrings: string[] = [];
    const userProxies: string[] = settingsStore.get("proxies") || [];
    proxyStrings.push(...userProxies);

    if (settingsStore.get("torEnabled")) {
      [
        "socks5://127.0.0.1:9050", // tor daemon default
        "socks5://127.0.0.1:9150", // Tor Browser default
      ].forEach((p) => {
        if (!proxyStrings.includes(p)) proxyStrings.push(p);
      });
    }

    // Map each proxy URL → agent instance (or undefined for direct connection).
    const dispatchers: (any | undefined)[] = proxyStrings.map((proxy) => {
      try {
        console.debug("MangaDex candidate proxy", proxy);
        return /^socks/i.test(proxy) ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
      } catch (err) {
        console.warn("Invalid proxy string, skipping", proxy, err);
        return undefined;
      }
    });

    // Always attempt a plain direct connection last.
    dispatchers.push(undefined);

    let lastErr: any = undefined;

    for (const dispatcher of dispatchers) {
      const init: any = {
        headers: { "User-Agent": ua, Accept: "application/json" },
        timeout: 30000, // 30 second timeout
      } as any;

      if (dispatcher) {
        (init as any).agent = dispatcher;
      }

      try {
        let res: any;

        // transient network retries per dispatcher
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
              res = await fetchWithTimeout(url, init, init.timeout);
            break;
          } catch (err: any) {
            if (err?.code === "UND_ERR_SOCKET" || err?.code === "ECONNRESET" || err?.code === "ECONNREFUSED") {
              if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                continue;
              }
            }
            throw err;
          }
        }

          // Handle rate limit headers
          if (res.headers) {
            this.rateLimiter.handleRateLimitHeaders(res.headers);
          }

        // if blocked, try dev mirror first
        if (res.status === 403) {
          const altUrl = url.replace("api.mangadex.org", "api.mangadex.dev");
          try {
              res = await fetchWithTimeout(altUrl, init, init.timeout);
          } catch (_) {/* ignore */}
        }

        if (res.status === 429) {
          noteRateLimit();
            const retryAfter = res.headers.get("retry-after");
            throw new RateLimitError(
              "MangaDex rate limit exceeded. Please wait before trying again.",
              retryAfter ? parseInt(retryAfter) : 60
            );
        }

        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            console.error(`MangaDex error ${res.status}: ${errorText}`);
            
            if (res.status >= 500) {
              throw new NetworkError(`MangaDex server error (${res.status}). The service may be temporarily down.`, res.status);
            } else if (res.status === 404) {
              throw new NetworkError(`Content not found on MangaDex. It may have been removed.`, res.status);
            } else {
              throw new NetworkError(`MangaDex request failed with status ${res.status}`, res.status);
            }
        }

        // success
        noteSuccess();
          const json = await res.json();
          return json;
      } catch (err) {
        const e: any = err;
        console.warn("Dispatcher attempt failed", e?.message || e);
        lastErr = err;
      }
    }

    // All fallbacks exhausted.
      throw lastErr ?? new NetworkError("All connection attempts to MangaDex failed. Please check your internet connection.");
    });
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
    const search = options?.query;

    // Resolve tag names to IDs if provided
    let tagIds: string[] = [];
    if (options?.tags && options.tags.length) {
      await this.ensureTagsLoaded();
      if (this.tagMap) {
        tagIds = options.tags
          .map((t) => this.tagMap!.get(t.toLowerCase()))
          .filter((v): v is string => !!v);
      }
    }

    const params = this.buildBaseParams(search, tagIds);

    let json = await this.fetchJson(`${API_BASE}/manga?${params.toString()}`);

    // Fallback: if no hits and we were searching for a specific title, try again
    // without the language restriction. Some 18+ titles are only available in
    // other languages and will otherwise be invisible.
    if (json.data?.length === 0 && search && search.trim().length > 0) {
      params.delete("availableTranslatedLanguage[]");
      json = await this.fetchJson(`${API_BASE}/manga?${params.toString()}`);
    }

      if (!json.data || !Array.isArray(json.data)) {
        throw new ParseError("Invalid response format from MangaDex");
      }

    const results = json.data.map((d: any) => ({
      id: d.id,
      title: this.pickBestTitle(d.attributes.title),
    }));
    
    // MangaDex API includes total count info
    const hasMore = json.limit && json.offset !== undefined ? 
      (json.offset + json.limit < json.total) : false;
    const total = json.total;
    
    return { results, hasMore, total };
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaDex getMangaList error:", error.message);
        throw error;
      }
      console.error("MangaDex getMangaList unexpected error:", error);
      throw new NetworkError("Failed to fetch manga list from MangaDex");
    }
  }

  async getChapterList(mangaId: string): Promise<ChapterMeta[]> {
    // Check cache first
    const cacheKey = `chapters_${mangaId}`;
    const cached = this.chapterCache.get(cacheKey);
    if (cached) {
      console.log("Returning cached chapters for", mangaId);
      return cached;
    }

    try {
    // Helper for a single fetch; languages undefined → all languages
      const requestFeed = async (langs?: string[], offset: number = 0): Promise<any> => {
        let url = `${API_BASE}/manga/${mangaId}/feed?limit=100&offset=${offset}&order[chapter]=asc&order[volume]=asc`;
      if (langs && langs.length) {
        langs.forEach((l) => {
          url += `&translatedLanguage[]=${l}`;
        });
      }
      return this.fetchJson(url);
    };

    const preferredLangs: string[] = settingsStore.get("preferredLanguages");
      const allChapters: any[] = [];
      let offset = 0;
      let hasMore = true;

    // First attempt: preferred languages (default EN)
      const langs = preferredLangs && preferredLangs.length ? preferredLangs : ["en"];
      
      while (hasMore && offset < 1000) { // Safety limit
        const json = await requestFeed(langs, offset);
        
        if (!json.data || !Array.isArray(json.data)) {
          throw new ParseError("Invalid chapter list format from MangaDex");
        }
        
        if (json.data.length > 0) {
          allChapters.push(...json.data);
          offset += json.data.length;
          hasMore = json.data.length === 100; // If we got a full page, there might be more
        } else {
          hasMore = false;
        }
      }

    // Fallback: if no chapters in preferred languages, fetch all languages
      if (allChapters.length === 0) {
        offset = 0;
        hasMore = true;
        
        while (hasMore && offset < 1000) {
          const json = await requestFeed(undefined, offset);
          
          if (json.data && json.data.length > 0) {
            allChapters.push(...json.data);
            offset += json.data.length;
            hasMore = json.data.length === 100;
          } else {
            hasMore = false;
          }
        }
    }

    // QoL: sort chapters by volume, then chapter number (both ascending)
    // MangaDex may return chapters in mixed order when multiple volumes are present.
    // Converting potential string values to floats; unparseable or missing values are pushed to the end.
      allChapters.sort((a: any, b: any) => {
      const toNum = (v: any) => {
        const n = parseFloat(v);
        return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
      };
      const volA = toNum(a.attributes.volume);
      const volB = toNum(b.attributes.volume);
      if (volA !== volB) return volA - volB;
      const chapA = toNum(a.attributes.chapter);
      const chapB = toNum(b.attributes.chapter);
      return chapA - chapB;
    });

      const chapters = allChapters.map((d: any) => {
      const num = d.attributes.chapter ?? "?";
      const vol = d.attributes.volume;
      const chapTitle = d.attributes.title;
      const lang = d.attributes.translatedLanguage;
        const langSuffix = lang && lang !== "en" ? ` [${lang.toUpperCase()}]` : "";
        const volPrefix = vol ? `Vol ${vol} ` : "";
      return {
        id: d.id,
          title: `${volPrefix}Ch ${num}${chapTitle ? ": " + chapTitle : ""}${langSuffix}`,
      };
    });

      // Cache the results
      this.chapterCache.set(cacheKey, chapters);
      
      return chapters;
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaDex getChapterList error:", error.message);
        throw error;
      }
      console.error("MangaDex getChapterList unexpected error:", error);
      throw new NetworkError(`Failed to fetch chapters for manga ${mangaId}`);
    }
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    try {
    const atHome = await this.fetchJson(`${API_BASE}/at-home/server/${chapterId}`);
      
      if (!atHome || !atHome.chapter) {
        throw new ParseError("Invalid page data format from MangaDex");
      }
      
    const chapter = atHome.chapter;
    const base = atHome.baseUrl;
    const hash = chapter.hash;
      const pages: string[] = chapter.data || []; // .jpg or .png filenames
      
      if (pages.length === 0 && chapter.dataSaver) {
        // Fallback to data saver images if high quality not available
        console.log("MangaDex: Using data saver images");
        return chapter.dataSaver.map((filename: string, idx: number) => ({ 
          index: idx, 
          url: `${base}/data-saver/${hash}/${filename}` 
        }));
      }
      
      if (pages.length === 0) {
        throw new ParseError("No pages found for this chapter. It may not be available yet.");
      }
      
      return pages.map((filename, idx) => ({ 
        index: idx, 
        url: `${base}/data/${hash}/${filename}` 
      }));
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaDex getPageList error:", error.message);
        throw error;
      }
      console.error("MangaDex getPageList unexpected error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter ${chapterId}`);
    }
  }

  /**
   * Build the common query parameters used for every Manga search.
   * Keeping this separate makes the adapter easier to extend if we ever add
   * pagination, tag filtering, etc.
   */
  private buildBaseParams(search?: string, tagIds: string[] = []): URLSearchParams {
    const preferred: string[] = settingsStore.get("preferredLanguages");

    const params = new URLSearchParams({
      limit: "20", // Reduced from 100 to be more conservative
    });

    (preferred && preferred.length ? preferred : ["en"]).forEach((lang: string) =>
      params.append("availableTranslatedLanguage[]", lang)
    );

    if (search && search.trim().length > 0) {
      params.append("title", search.trim());
    }

    // Explicitly request all available content ratings so 18+ titles appear in results
    ["safe", "suggestive", "erotica", "pornographic"].forEach((r) =>
      params.append("contentRating[]", r)
    );

    // Include chapter count to help identify manga with available chapters
    params.append("includes[]", "cover_art");

    // Add tag filters
    if (tagIds.length > 0) {
      tagIds.forEach((id) => params.append("includedTags[]", id));
      params.append("includedTagsMode", "AND");
    }

    return params;
  }

  /**
   * Given the multilingual title object returned by MangaDex, pick the most
   * appropriate one to display. Priority: English -> Romaji -> First available.
   */
  private pickBestTitle(titleObj: Record<string, string>): string {
    if (!titleObj) return "Untitled";
    if (titleObj.en) return titleObj.en;
    if (titleObj["en-us"]) return titleObj["en-us"];
    if (titleObj["ja-ro"]) return titleObj["ja-ro"]; // Romaji
    const first = Object.values(titleObj)[0];
    return first ?? "Untitled";
  }
}

export default new MangaDexAdapter(); 