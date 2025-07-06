import type { Adapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "../services/netLimiter";
import settingsStore from "../services/settings";
import { HttpsProxyAgent } from "https-proxy-agent";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "../services/adapterUtils";

/**
 * Adapter for https://mangakakalot.com
 *
 * MangaKakalot/MangaNelo expose their catalogue only via HTML.  There is no
 * documented JSON API, but the markup is consistent enough to scrape with a
 * couple of regular expressions.  We purposefully avoid adding heavy HTML
 * parsing dependencies – regex is sufficient for the small pieces of data we
 * need (title links, chapter links, and page image URLs).
 */
class MangaKakalotAdapter implements Adapter {
  id = "mangakakalot";
  label = "MangaKakalot";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };

  /** Rotate through user-defined proxy list (if any) to reduce correlation & bypass soft blocks */
  private proxyIndex = 0;
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private chapterCache = new SimpleCache<ChapterMeta[]>(300000); // 5 minute cache

  // 2025-06: MangaKakalot frequently shifts between TLDs.  In mid-2025 the
  // primary mirror moved to *.tv.  We add the new domain (plus the common
  // `ww6.` sub-domain) so the adapter can recover automatically.
  private static readonly DOMAINS = [
    "https://mangakakalot.to",
    "https://mangakakalot.com",
    "https://mangakakalot.tv",
    "https://ww6.mangakakalot.tv",
    "https://manganato.com",
    "https://readmanganato.com",
  ];

  /**
   * Attempt to fetch the given *path* (absolute or relative) from each known
   * MangaKakalot domain until one succeeds.  This makes the adapter resilient
   * to the service switching between the `.to` and `.com` domains.
   */
  private async fetchAny(path: string, signal?: AbortSignal): Promise<string> {
    const isAbsolute = /^https?:\/\//i.test(path);
    const errors: unknown[] = [];

    for (const base of MangaKakalotAdapter.DOMAINS) {
      const url = isAbsolute ? path : `${base}${path}`;
      try {
        return await this.fetchHtml(url, signal);
      } catch (err) {
        errors.push(err);
        // Don't try other domains if it's a circuit breaker error
        if (err instanceof AdapterError && err.code === "CIRCUIT_OPEN") {
          throw err;
        }
      }
    }

    throw new NetworkError(
      `All MangaKakalot domains failed. The service may be down or blocking access.`
    );
  }

  /**
   * Fetch an HTML document with a browser-like User-Agent so Cloudflare / other
   * light anti-bot heuristics don't instantly block us.
   */
  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
    await rlAcquire();
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

      // Optional proxy rotation using same logic as MangaSee/MangaDex
      const proxies: string[] = settingsStore.get("proxies");
      let dispatcher: any = undefined;
      if (proxies && proxies.length) {
        const proxy = proxies[this.proxyIndex % proxies.length];
        this.proxyIndex = (this.proxyIndex + 1) % proxies.length;
        if (proxy && proxy.trim().length) {
          try {
            dispatcher = new HttpsProxyAgent(proxy);
          } catch {
            /* ignore invalid proxy */
          }
        }
      }

      try {
        const res = await (fetchWithTimeout as any)(url, { 
          headers: { "User-Agent": ua }, 
          signal, 
          dispatcher 
        }, 30000);
        
    if (res.status === 429 || res.status === 403) {
      noteRateLimit();
          throw new RateLimitError(
            "MangaKakalot rate limit exceeded. Please wait before trying again.",
            60
          );
        }
        
        if (!res.ok) {
          if (res.status === 404) {
            throw new NetworkError("Page not found on MangaKakalot", res.status);
          } else if (res.status >= 500) {
            throw new NetworkError(`MangaKakalot server error (${res.status})`, res.status);
          } else {
            throw new NetworkError(`MangaKakalot request failed with status ${res.status}`, res.status);
    }
        }
        
    noteSuccess();
    return res.text();
      } catch (error) {
        if (error instanceof AdapterError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new NetworkError(`Failed to fetch from MangaKakalot: ${message}`);
      }
    });
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    try {
    const term = (options?.query ?? "").trim();

    // Build path (relative) to try on each domain.
    const path = term ? `/search?keyword=${encodeURIComponent(term)}` : "/";

    const html = await this.fetchAny(path, signal);

    const results: MangaMeta[] = this.extractMangaFromHtml(html);

    // Fallback for legacy "/search/story/<term>" on the .com domain
    if (results.length === 0 && term) {
        try {
      const legacyHtml = await this.fetchAny(`/search/story/${encodeURIComponent(term)}`, signal);
      const legacyResults = this.extractMangaFromHtml(legacyHtml);
      return { results: legacyResults, hasMore: false };
        } catch (e) {
          // Ignore legacy search errors
        }
    }

    // MangaKakalot doesn't provide clear pagination info, so we guess based on result count
    const hasMore = results.length >= 50;
    return { results, hasMore };
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaKakalot getMangaList error:", error.message);
        throw error;
      }
      console.error("MangaKakalot getMangaList unexpected error:", error);
      throw new NetworkError("Failed to search on MangaKakalot");
    }
  }

  /**
   * Extract manga ID + title pairs from an arbitrary MangaKakalot HTML page.
   */
  private extractMangaFromHtml(html: string): MangaMeta[] {
    // Recognise both classic `/manga/<slug>` and newer `/read-<slug>` URL patterns.
    const regex = /<a[^>]+href="(?:https?:\/\/(?:[^"'>]*\.)?(?:mangakakalot\.(?:com|to|tv)|manganato\.com|readmanganato\.com))?\/(manga\/[^"'>]+|manga-[^"'>]+|read-[^"'>]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const titleAttrRegex = /title="([^"]+)"/i;

    const seen = new Set<string>();
    const list: MangaMeta[] = [];

    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);

      let raw = m[2];
      // If inner HTML is just an <img> etc, fall back to the title attribute.
      if (!raw.trim() || /<img/i.test(raw)) {
        const tag = m[0];
        const attrMatch = titleAttrRegex.exec(tag);
        raw = attrMatch ? attrMatch[1] : slug;
      }

      const clean = raw.replace(/<[^>]*>/g, "").trim();
      list.push({ id: slug, title: clean || slug });
      if (list.length >= 100) break;
    }

    return list;
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
    const html = await this.fetchAny(`/${mangaId}`);

    // Chapter links appear like:
    // <a href="https://mangakakalot.to/chapter/slug/chapter_123">Chapter 123</a>
    const regex = /<a[^>]+href="https?:\/\/(?:[^"'>]*\.)?(?:mangakakalot\.(?:com|to|tv)|manganato\.com|readmanganato\.com)\/chapter\/([^"']+)"[^>]*>([^<]*?)<\/a>/gi;
    const chapters: { id: string; title: string }[] = [];
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = regex.exec(html)) !== null) {
      const [_, chapId, rawTitle] = m;
      if (seen.has(chapId)) continue;
      seen.add(chapId);
      chapters.push({ id: chapId, title: rawTitle.trim() });
    }

      if (chapters.length === 0) {
        throw new ParseError("No chapters found. This manga may not have any chapters available.");
      }

    // MangaKakalot lists chapters newest-first; we reverse for ascending order.
    chapters.reverse();

    // Normalise titles a little – ensure they start with "Chapter" for
    // consistency with other adapters.
      const result = chapters.map((c) => ({
      id: c.id,
      title: c.title.startsWith("Chapter") ? c.title : `Chapter ${c.title}`,
    }));

      // Cache the results
      this.chapterCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaKakalot getChapterList error:", error.message);
        throw error;
      }
      console.error("MangaKakalot getChapterList unexpected error:", error);
      throw new NetworkError(`Failed to fetch chapters for manga: ${mangaId}`);
    }
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    try {
    const html = await this.fetchAny(`/chapter/${chapterId}`);

    // Page images sit inside <img src="https://..." alt="..." class="...">
    //   (lazy-loaded variants sometimes use data-src instead of src – we grab
    //   both.)
    const imgRegex = /<img[^>]+(?:src|data-src)="(https?:[^"']+\.(?:jpg|jpeg|png|webp|gif))"[^>]*>/gi;
    const pages: PageMeta[] = [];
    const seen = new Set<string>();
    let idx = 0;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(html)) !== null) {
      const url = m[1];
      if (seen.has(url)) continue; // avoid dupes from multiple attributes
      seen.add(url);
      pages.push({ index: idx++, url });
    }

    if (pages.length === 0) {
        throw new ParseError("No pages found for this chapter. The site structure may have changed.");
    }

    return pages;
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaKakalot getPageList error:", error.message);
        throw error;
      }
      console.error("MangaKakalot getPageList unexpected error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter: ${chapterId}`);
    }
  }
}

export default new MangaKakalotAdapter(); 