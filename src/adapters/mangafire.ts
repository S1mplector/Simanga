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
import * as puppeteer from "puppeteer";

/**
 * Very-lightweight adapter for https://mangafire.to
 *
 * MangaFire does not expose a public API.  We therefore scrape the HTML that
 * NextJS sends to browsers.  All of the information we need lives either in
 * the rendered markup (search results & reader images) or in the large
 * `__NEXT_DATA__` JSON blob.  To avoid depending on brittle internal property
 * names we prefer simple RegExp extraction over deep-parsing that blob.
 *
 * Limitations:
 *   • Search only – no default catalogue when the user hasn't typed anything.
 *   • Requires a normal desktop UA and obeys a 1 rps limiter; otherwise CF will
 *     occasionally respond with 403/429.
 *   • Uses Puppeteer for dynamic content loading
 */
class MangaFireAdapter implements Adapter {
  id = "mangafire";
  label = "MangaFire";
  
  capabilities: AdapterCapabilities = {
    search: true,
    searchByTag: false,
    multiLanguage: false,
    authentication: 'none',
  };

  private proxyIndex = 0;
  private baseUrl = "https://mangafire.to";
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private chapterCache = new SimpleCache<ChapterMeta[]>(300000); // 5 minute cache
  private browser: puppeteer.Browser | null = null;

  // Reset circuit breaker and clear cache - useful when errors occur
  public reset(): void {
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    this.chapterCache = new SimpleCache<ChapterMeta[]>(300000);
    console.log("MangaFire adapter reset - circuit breaker and cache cleared");
  }

  // Initialize browser instance
  private async initBrowser(): Promise<puppeteer.Browser> {
    if (this.browser) {
      return this.browser;
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ];

    // Add proxy if enabled
    const mangafireProxyEnabled = settingsStore.get("mangafireProxyEnabled");
    if (mangafireProxyEnabled) {
      const proxies: string[] = settingsStore.get("proxies");
      if (proxies && proxies.length) {
        const proxy = proxies[this.proxyIndex % proxies.length];
        this.proxyIndex = (this.proxyIndex + 1) % proxies.length;
        if (proxy && proxy.trim().length) {
          args.push(`--proxy-server=${proxy}`);
          console.log("Using proxy for Puppeteer:", proxy);
        }
      }
    }

    this.browser = await puppeteer.launch({
      headless: true,
      args,
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });

    return this.browser;
  }

  // Clean up browser
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      await rlAcquire();

      // More browser-like headers
      const headers: any = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Referer": this.baseUrl + "/",
      };

      let dispatcher: any = undefined;
      
      // Check if MangaFire proxy is enabled
      const mangafireProxyEnabled = settingsStore.get("mangafireProxyEnabled");
      
      if (mangafireProxyEnabled) {
        const proxies: string[] = settingsStore.get("proxies");
        if (proxies && proxies.length) {
          const proxy = proxies[this.proxyIndex % proxies.length];
          this.proxyIndex = (this.proxyIndex + 1) % proxies.length;
          if (proxy && proxy.trim().length) {
            try {
              dispatcher = new HttpsProxyAgent(proxy);
              console.log("Using proxy for MangaFire:", proxy);
            } catch (e) {
              console.warn("Invalid proxy:", proxy, e);
            }
          }
        }
      }

      try {
        const init: any = {
          headers,
          signal,
          redirect: 'follow',
          compress: true,
        };
        if (dispatcher) init.agent = dispatcher;

        const res = await (fetchWithTimeout as any)(url, init, 30000);

        if (res.status === 429 || res.status === 403) {
          noteRateLimit();
          throw new RateLimitError(
            "MangaFire rate limit exceeded. Please wait before trying again.",
            60
          );
        }
        
        if (!res.ok) {
          if (res.status === 404) {
            throw new NetworkError("Page not found on MangaFire", res.status);
          } else if (res.status >= 500) {
            throw new NetworkError(`MangaFire server error (${res.status})`, res.status);
          } else {
            throw new NetworkError(`MangaFire request failed with status ${res.status}`, res.status);
          }
        }
        
        noteSuccess();
        const text = await res.text();
        
        // Check if we got a Cloudflare challenge page
        if (text.includes('cf-browser-verification') || text.includes('cf_clearance')) {
          throw new NetworkError("MangaFire is protected by Cloudflare. Please enable proxy in settings.", 403);
        }
        
        return text;
      } catch (error) {
        if (error instanceof AdapterError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new NetworkError(`Failed to fetch from MangaFire: ${message}`);
      }
    });
  }

  async getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; total?: number }> {
    const search = options?.query;
    if (!search || search.trim() === "") {
      return { results: [], hasMore: false };
    }

    try {
      // Use /filter endpoint instead of /search
      const url = `${this.baseUrl}/filter?keyword=${encodeURIComponent(search)}`;
      const html = await this.fetchHtml(url);

      // Extract manga links and titles from the filter results
      const linkPattern = /<a href="\/manga\/([^"]+)">([^<]+)<\/a>/g;
      const results: MangaMeta[] = [];
      const seen = new Set<string>();
      let match;

      while ((match = linkPattern.exec(html)) !== null) {
        const slug = match[1];
        const title = match[2].trim();
        
        // Filter out navigation links and duplicates
        if (title && !title.includes('Chap') && !title.includes('Vol') && !seen.has(slug)) {
          seen.add(slug);
          results.push({
            id: slug,
            title: this.decodeHtmlEntities(title)
          });
        }
      }

      if (results.length === 0) {
        console.log("No results found for search:", search);
      }

      // MangaFire doesn't provide clear pagination info, assume no more results
      return { results, hasMore: false };
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaFire getMangaList error:", error.message);
        throw error;
      }
      console.error("MangaFire getMangaList unexpected error:", error);
      throw new NetworkError("Failed to search on MangaFire");
    }
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    // Check cache first
    const cacheKey = `chapters_${mangaId}`;
    const cached = this.chapterCache.get(cacheKey);
    if (cached) {
      console.log("Returning cached chapters for", mangaId);
      return cached;
    }

    try {
      const url = `${this.baseUrl}/manga/${mangaId}`;
      console.log("MangaFire getChapterList fetching:", url);
      const html = await this.fetchHtml(url);

      const chapters: ChapterMeta[] = [];
      const seenIds = new Set<string>();
      
      // MangaFire uses /read/ links for chapters
      // Extract all links that contain /read/
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const linkContent = match[2];
        
        // Only process /read/ links
        if (!href.includes('/read/')) continue;
        
        // Extract the path after /read/
        const readMatch = href.match(/\/read\/(.+?)(?:\?|#|$)/);
        if (!readMatch) continue;
        
        const fullPath = readMatch[1];
        
        // Skip if this is just the manga link without a chapter
        // (e.g., "Start Reading" button)
        if (fullPath === mangaId || !fullPath.includes('/')) {
          console.log("Skipping non-chapter link:", fullPath);
          continue;
        }
        
        // Extract title from link content
        let title = linkContent
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (!title || title.length < 2) continue;
        
        // Skip generic navigation links
        if (title.toLowerCase().includes('start reading') || 
            title.toLowerCase().includes('read now') ||
            title.toLowerCase().includes('continue reading')) {
          console.log("Skipping navigation link:", title);
          continue;
        }
        
        // For MangaFire, we'll store the full path after /read/ as the chapter ID
        // This preserves whatever format they use (with or without language codes)
        const chapterId = fullPath;
        
        if (!seenIds.has(chapterId)) {
          seenIds.add(chapterId);
          chapters.push({
            id: chapterId,
            title: this.decodeHtmlEntities(title)
          });
          console.log("Found chapter:", chapterId, "title:", title);
        }
      }

      console.log("Total chapters found:", chapters.length);

      if (chapters.length === 0) {
        // Try alternative pattern - look for any chapter-like links
        const altRegex = /<a[^>]+href="[^"]*chapter[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let altMatch;
        
        while ((altMatch = altRegex.exec(html)) !== null) {
          const href = altMatch[0].match(/href="([^"]+)"/);
          if (href) {
            const path = href[1];
            const title = altMatch[1].replace(/<[^>]+>/g, '').trim();
            
            if (path && title && path.includes('/read/')) {
              // Extract the part after /read/
              const readPart = path.split('/read/')[1];
              if (readPart && readPart.includes('/')) {
                const chapterId = readPart;
                
                if (!seenIds.has(chapterId)) {
                  seenIds.add(chapterId);
                  chapters.push({
                    id: chapterId,
                    title: this.decodeHtmlEntities(title)
                  });
                  console.log("Found chapter (alt):", chapterId, "title:", title);
                }
              }
            }
          }
        }
      }

      if (chapters.length === 0) {
        console.log("No chapters found. First 2000 chars of HTML:", html.substring(0, 2000));
        throw new ParseError("No chapters found. This manga may not have any chapters available.");
      }

      // Sort chapters - they're usually in reverse order on the page
      // Try to sort by chapter number if possible
      chapters.sort((a, b) => {
        // Extract numbers from chapter IDs
        const aNum = this.extractChapterNumber(a.id);
        const bNum = this.extractChapterNumber(b.id);
        
        if (aNum !== null && bNum !== null) {
          return aNum - bNum;
        }
        
        // Fallback to string comparison
        return a.id.localeCompare(b.id);
      });
      
      // Cache the results
      this.chapterCache.set(cacheKey, chapters);
      
      return chapters;
    } catch (error) {
      if (error instanceof AdapterError) {
        console.error("MangaFire getChapterList error:", error.message);
        throw error;
      }
      console.error("MangaFire getChapterList unexpected error:", error);
      throw new NetworkError(`Failed to fetch chapters for manga: ${mangaId}`);
    }
  }

  private extractChapterNumber(chapterId: string): number | null {
    // Try to extract chapter number from various formats
    const patterns = [
      /chapter-(\d+(?:\.\d+)?)/i,
      /ch-(\d+(?:\.\d+)?)/i,
      /c(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)/
    ];
    
    for (const pattern of patterns) {
      const match = chapterId.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }
    
    return null;
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    try {
      console.log("MangaFire getPageList called with chapterId:", chapterId);
      
      // The chapterId is now the full path after /read/
      const readerUrl = `${this.baseUrl}/read/${chapterId}`;
      console.log("Fetching reader page:", readerUrl);
      
      // First, try to fetch with regular HTTP to inspect the page structure
      let html: string | undefined;
      try {
        html = await this.fetchHtml(readerUrl);
        console.log("Successfully fetched reader page HTML, length:", html.length);
        
        // Strategy 1: Look for images in __NEXT_DATA__ or similar JSON structures
        const scriptPatterns = [
          /<script[^>]*>[\s\S]*?images["\s]*:["\s]*\[([\s\S]*?)\]/gi,
          /<script[^>]*>[\s\S]*?pages["\s]*:["\s]*\[([\s\S]*?)\]/gi,
          /<script[^>]*>[\s\S]*?chapter["\s]*:["\s]*{[\s\S]*?images["\s]*:["\s]*\[([\s\S]*?)\]/gi,
          /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/gi
        ];
        
        for (const pattern of scriptPatterns) {
          const matches = [...html.matchAll(pattern)];
          for (const match of matches) {
            try {
              let data = match[1];
              
              // For __NEXT_DATA__, parse the entire JSON
              if (pattern.source.includes('__NEXT_DATA__')) {
                const jsonData = JSON.parse(data);
                console.log("Found __NEXT_DATA__, searching for images...");
                
                // Search for image arrays in the JSON structure
                const imageArrays = this.findImageArrays(jsonData);
                if (imageArrays.length > 0) {
                  console.log(`Found ${imageArrays.length} potential image arrays in __NEXT_DATA__`);
                  const pages = this.processImageArray(imageArrays[0]);
                  if (pages.length > 0) {
                    console.log(`Extracted ${pages.length} pages from __NEXT_DATA__`);
                    return pages;
                  }
                }
              } else {
                // Try to extract URLs from the matched content
                const urls = this.extractUrlsFromString(data);
                if (urls.length > 0) {
                  console.log(`Found ${urls.length} image URLs in script`);
                  return urls.map((url, idx) => ({ index: idx, url }));
                }
              }
            } catch (e) {
              console.log("Failed to parse script content:", e);
            }
          }
        }
        
        // Strategy 2: Look for image URLs directly in HTML attributes
        const imgPatterns = [
          /<img[^>]+(?:src|data-src|data-lazy|data-original)="([^"]+(?:\.jpg|\.png|\.webp|\.jpeg)[^"]*)"[^>]*>/gi,
          /data-url="([^"]+(?:\.jpg|\.png|\.webp|\.jpeg)[^"]*)"[^>]*/gi,
          /background-image:\s*url\(['"]?([^'"]+(?:\.jpg|\.png|\.webp|\.jpeg)[^'"]*)['"]?\)/gi
        ];
        
        const foundUrls = new Set<string>();
        for (const pattern of imgPatterns) {
          const matches = [...html.matchAll(pattern)];
          for (const match of matches) {
            const url = match[1];
            if (url && !url.includes('thumb') && !url.includes('cover') && !url.includes('banner')) {
              foundUrls.add(url);
            }
          }
        }
        
        if (foundUrls.size > 0) {
          console.log(`Found ${foundUrls.size} image URLs in HTML`);
          const pages = Array.from(foundUrls).map((url, idx) => ({
            index: idx,
            url: url.startsWith('http') ? url : `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`
          }));
          return this.sortPages(pages);
        }
        
        // Strategy 3: Look for canvas or other dynamic rendering markers
        if (html.includes('canvas') || html.includes('webgl')) {
          console.log("Page appears to use canvas rendering, falling back to Puppeteer");
        }
        
      } catch (e) {
        console.log("Failed to fetch with regular HTTP, will use Puppeteer:", e);
      }
      
      // --- New: use MangaFire AJAX API to fetch images directly ---
      if (html) {
        // Try to find numeric chapter id first
        let numericId: string | undefined;
        const escapedChapterPath = chapterId.replace(/[-/\\.^$*+?()[\]{}|]/g, "\\$&");
        const idHrefRegex = new RegExp(`data-id=\"(\\d+)\"[^>]*href=\"/read/${escapedChapterPath}\"`);
        const idMatch = html.match(idHrefRegex);
        if (idMatch) {
          numericId = idMatch[1];
        } else {
          // Fallback: call chapter list AJAX and locate ID there
          const slugLangMatch = chapterId.match(/^([^/]+)\/([^/]+)\//);
          if (slugLangMatch) {
            const slug = slugLangMatch[1];
            const lang = slugLangMatch[2];
            const slugShort = slug.includes('.') ? slug.split('.').pop() : slug;
            try {
              const listJsonText = await this.fetchHtml(`${this.baseUrl}/ajax/read/${slugShort}/chapter/${lang}`);
              const listData = JSON.parse(listJsonText);
              if (listData.result?.html) {
                const listHtml: string = listData.result.html;
                const m = listHtml.match(idHrefRegex);
                if (m) numericId = m[1];
              }
            } catch (e) {
              console.log("Failed to fetch chapter list AJAX:", e);
            }
          }
        }

        if (numericId) {
          try {
            const chapterJsonText = await this.fetchHtml(`${this.baseUrl}/ajax/read/chapter/${numericId}`);
            const chapterData = JSON.parse(chapterJsonText);
            const imagesArr: any[] = chapterData.result?.images ?? [];
            if (Array.isArray(imagesArr) && imagesArr.length) {
              const pagesFromApi: PageMeta[] = imagesArr.map((itm: any, idx: number) => {
                // Each item can be [url, pageNum, rotate]
                const apiUrl: string = Array.isArray(itm) ? itm[0] : itm;
                return {
                  index: idx,
                  url: this.normalizeImageUrl(apiUrl)
                };
              }).filter(p => this.isValidMangaImage(p.url));
              if (pagesFromApi.length) {
                console.log(`Fetched ${pagesFromApi.length} pages from AJAX API`);
                return this.sortPages(pagesFromApi);
              }
            }
          } catch (e) {
            console.log("Failed to fetch images via AJAX API:", e);
          }
        }
      }
      // --- End new AJAX logic ---
      
      // Fallback: Use Puppeteer for dynamic content
      console.log("Using Puppeteer to load dynamic content...");
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      try {
        // Enhanced Puppeteer configuration
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Capture console logs for debugging
        page.on('console', msg => {
          if (msg.type() === 'error') {
            console.log('Page console error:', msg.text());
          }
        });
        
        // Set up request interception
        await page.setRequestInterception(true);
        const capturedImages = new Set<string>();
        
        page.on('request', (request) => {
          const url = request.url();
          const resourceType = request.resourceType();
          
          // Capture image requests
          if (resourceType === 'image' || resourceType === 'media') {
            if (this.isValidMangaImage(url)) {
              capturedImages.add(url);
              console.log("Captured image request:", url);
            }
          }
          
          // Log XHR/Fetch requests that might load images
          if (resourceType === 'xhr' || resourceType === 'fetch') {
            console.log("XHR/Fetch request:", url);
          }
          
          request.continue();
        });
        
        // Navigate with extended timeout
        console.log("Navigating to:", readerUrl);
        await page.goto(readerUrl, { 
          waitUntil: 'networkidle2',
          timeout: 60000 
        });
        
        // Wait for reader to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check for Cloudflare
        const isCloudflare = await page.evaluate(() => {
          return document.body.textContent?.includes('Cloudflare') || 
                 document.querySelector('.cf-browser-verification') !== null ||
                 document.querySelector('[class*="cloudflare"]') !== null;
        });
        
        if (isCloudflare) {
          throw new NetworkError("MangaFire is protected by Cloudflare. Please enable proxy in settings.");
        }
        
        // Wait for specific reader elements
        try {
          await page.waitForSelector('img[class*="page"], img[class*="reader"], .reader-image, .manga-page, [class*="chapter-image"]', {
            timeout: 10000
          });
          console.log("Reader elements found");
        } catch (e) {
          console.log("No standard reader elements found, continuing...");
        }
        
        // Execute comprehensive image extraction
        const extractedData = await page.evaluate(() => {
          const result = {
            images: [] as string[],
            scripts: [] as string[],
            debug: {
              hasCanvas: false,
              imgCount: 0,
              scriptCount: 0
            }
          };
          
          // Check all img elements
          const imgs = document.querySelectorAll('img');
          result.debug.imgCount = imgs.length;
          
          imgs.forEach(img => {
            const sources = [
              img.src,
              img.getAttribute('data-src'),
              img.getAttribute('data-lazy'),
              img.getAttribute('data-original'),
              img.getAttribute('data-url'),
              img.getAttribute('lazy-src')
            ].filter(Boolean) as string[];
            
            sources.forEach(src => {
              if (src && (src.includes('.jpg') || src.includes('.png') || src.includes('.webp') || src.includes('.jpeg'))) {
                if (!src.includes('thumb') && !src.includes('cover') && !src.includes('avatar') && !src.includes('logo')) {
                  result.images.push(src);
                }
              }
            });
          });
          
          // Check for background images
          document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;
            if (bg && bg !== 'none') {
              const match = bg.match(/url\(['"]?([^'"]+)['"]?\)/);
              if (match?.[1]?.match(/\.(jpg|png|webp|jpeg)/i)) {
                result.images.push(match[1]);
              }
            }
          });
          
          // Check for canvas
          result.debug.hasCanvas = document.querySelector('canvas') !== null;
          
          // Extract all script contents that might contain image data
          const scripts = document.querySelectorAll('script');
          result.debug.scriptCount = scripts.length;
          
          scripts.forEach(script => {
            const content = script.textContent || '';
            if (content.includes('images') || content.includes('pages') || content.includes('.jpg') || content.includes('.png')) {
              result.scripts.push(content);
            }
          });
          
          // Also check for React/Next.js props
          const nextData = (window as any).__NEXT_DATA__;
          if (nextData) {
            result.scripts.push(JSON.stringify(nextData));
          }
          
          return result;
        });
        
        console.log("Extraction debug info:", extractedData.debug);
        console.log(`Found ${extractedData.images.length} images in DOM`);
        console.log(`Found ${extractedData.scripts.length} relevant scripts`);
        
        // Process extracted scripts
        const scriptImages = new Set<string>();
        for (const script of extractedData.scripts) {
          const urls = this.extractUrlsFromString(script);
          urls.forEach(url => scriptImages.add(url));
        }
        
        console.log(`Found ${scriptImages.size} images in scripts`);
        
        // Combine all found images
        const allImages = new Set<string>([
          ...capturedImages,
          ...extractedData.images,
          ...scriptImages
        ]);
        
        // If still no images, try scrolling to trigger lazy loading
        if (allImages.size === 0) {
          console.log("No images found yet, trying to scroll...");
          
          await page.evaluate(() => {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Try clicking on any reader container
          const clickSelectors = ['.reader-main', '.chapter-reader', '.manga-container', 'img'];
          for (const selector of clickSelectors) {
            try {
              await page.click(selector);
              console.log(`Clicked ${selector}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
            } catch (e) {
              // Continue
            }
          }
          
          // Re-extract after interactions
          const moreImages = await page.evaluate(() => {
            const imgs: string[] = [];
            document.querySelectorAll('img').forEach(img => {
              if (img.src && (img.src.includes('.jpg') || img.src.includes('.png') || img.src.includes('.webp'))) {
                imgs.push(img.src);
              }
            });
            return imgs;
          });
          
          moreImages.forEach(img => allImages.add(img));
        }
        
        // Process and validate URLs
        const pages: PageMeta[] = Array.from(allImages)
          .filter(url => this.isValidMangaImage(url))
          .map((url, index) => ({
            index,
            url: this.normalizeImageUrl(url)
          }));
        
        if (pages.length === 0) {
          // Save debug information
          const pageContent = await page.content();
          console.log("Page title:", await page.title());
          console.log("Page URL:", page.url());
          console.log("First 1000 chars of page:", pageContent.substring(0, 1000));
          
          throw new ParseError(
            "No manga pages found. The chapter might not be available or MangaFire may have changed their reader structure."
          );
        }
        
        // Sort pages
        const sortedPages = this.sortPages(pages);
        console.log(`Returning ${sortedPages.length} pages`);
        
        return sortedPages;
        
      } finally {
        await page.close();
      }
      
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      console.error("MangaFire getPageList error:", error);
      throw new NetworkError(`Failed to fetch pages for chapter: ${chapterId}`);
    }
  }
  
  private isValidMangaImage(url: string): boolean {
    if (!url) return false;
    
    // Must be an image
    if (!url.match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i)) return false;
    
    // Exclude common non-manga images
    const excludePatterns = [
      'thumb', 'thumbnail', 'cover', 'banner', 'avatar', 'logo', 
      'icon', 'button', 'background', 'bg-', 'advertisement', 'ads'
    ];
    
    const lowerUrl = url.toLowerCase();
    return !excludePatterns.some(pattern => lowerUrl.includes(pattern));
  }
  
  private normalizeImageUrl(url: string): string {
    if (!url) return '';
    
    // Already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Protocol-relative URL
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    // Relative URL
    if (url.startsWith('/')) {
      return this.baseUrl + url;
    }
    
    // Relative without leading slash
    return this.baseUrl + '/' + url;
  }
  
  private extractUrlsFromString(str: string): string[] {
    const urls: string[] = [];
    
    // Pattern to match URLs in various formats
    const patterns = [
      /"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi,
      /'(https?:\/\/[^']+\.(jpg|jpeg|png|webp)[^']*)'/gi,
      /\\"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)\\"/gi,
      /"(\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi,
      /'(\/[^']+\.(jpg|jpeg|png|webp)[^']*)'/gi,
    ];
    
    for (const pattern of patterns) {
      const matches = [...str.matchAll(pattern)];
      for (const match of matches) {
        const url = match[1];
        if (url && this.isValidMangaImage(url)) {
          urls.push(url);
        }
      }
    }
    
    // Also try to find arrays of URLs
    const arrayPattern = /\[([\s\S]*?)\]/g;
    const arrayMatches = [...str.matchAll(arrayPattern)];
    for (const match of arrayMatches) {
      const arrayContent = match[1];
      // Extract quoted strings from array
      const stringPattern = /["']([^"']+)["']/g;
      const stringMatches = [...arrayContent.matchAll(stringPattern)];
      for (const stringMatch of stringMatches) {
        const url = stringMatch[1];
        if (url && url.match(/\.(jpg|jpeg|png|webp)/i) && this.isValidMangaImage(url)) {
          urls.push(url);
        }
      }
    }
    
    return [...new Set(urls)]; // Remove duplicates
  }
  
  private findImageArrays(obj: any, arrays: string[][] = []): string[][] {
    if (!obj || typeof obj !== 'object') return arrays;
    
    if (Array.isArray(obj)) {
      // Collect any image URLs (either direct strings or inside simple object items)
      const imageUrls: string[] = [];
      for (const item of obj) {
        if (typeof item === 'string') {
          if (this.isValidMangaImage(item)) imageUrls.push(item);
        } else if (item && typeof item === 'object') {
          // Common keys that may hold the url value
          const candidateKeys = ['url', 'src', 'image', 'imageUrl', 'link', 'u'];
          for (const key of candidateKeys) {
            const val = (item as any)[key];
            if (typeof val === 'string' && this.isValidMangaImage(val)) {
              imageUrls.push(val);
              break; // one URL is enough for this object
            }
          }
        }
      }
      if (imageUrls.length > 0) {
        arrays.push(imageUrls);
      }
    } else {
      // Recursively inspect object properties
      for (const key of Object.keys(obj)) {
        //@ts-ignore
        this.findImageArrays(obj[key], arrays);
      }
    }
    return arrays;
  }
  
  private processImageArray(images: string[]): PageMeta[] {
    return images
      .filter(url => this.isValidMangaImage(url))
      .map((url, idx) => ({
        index: idx,
        url: this.normalizeImageUrl(url)
      }));
  }
  
  private sortPages(pages: PageMeta[]): PageMeta[] {
    // Sort by extracting numbers from URLs
    const sorted = [...pages].sort((a, b) => {
      const aMatch = a.url.match(/(?:page|p|img)?[-_]?(\d+)\.(jpg|jpeg|png|webp)/i);
      const bMatch = b.url.match(/(?:page|p|img)?[-_]?(\d+)\.(jpg|jpeg|png|webp)/i);
      
      if (aMatch && bMatch) {
        return parseInt(aMatch[1]) - parseInt(bMatch[1]);
      }
      
      return a.url.localeCompare(b.url);
    });
    
    // Re-index after sorting
    sorted.forEach((page, idx) => page.index = idx);
    
    return sorted;
  }

  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };
    
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  // ‑- helpers ------------------------------------------------------------

  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"");
  }

  private cleanChapterTitle(raw: string): string {
    return raw.replace(/\s+/g, " ").trim();
  }

  private extractChapNum(title: string): number {
    const m = title.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : Number.MAX_SAFE_INTEGER;
  }

  private extractNextData(html: string): any {
    const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (!m) throw new ParseError("__NEXT_DATA__ not found in page");
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      throw new ParseError("Failed to parse __NEXT_DATA__ JSON");
    }
  }

  /** Walk the object graph breadth-first and return the first array that
   * satisfies the predicate.  */
  private deepFindArray(root: any, predicate: (arr: any[]) => boolean): any[] | undefined {
    const queue: any[] = [root];
    while (queue.length) {
      const cur = queue.shift();
      if (Array.isArray(cur) && predicate(cur)) return cur;
      if (cur && typeof cur === "object") {
        for (const v of Object.values(cur)) queue.push(v);
      }
    }
    return undefined;
  }
}

export default new MangaFireAdapter(); 