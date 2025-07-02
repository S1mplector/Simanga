import type { Adapter, MangaMeta, ChapterMeta, PageMeta } from "./Adapter";

/**
 * Adapter for https://asmhentai.com
 *
 * The site does not expose a public JSON API but its HTML is fairly easy to
 * scrape and – most importantly – the image URLs follow a predictable schema
 * (https://images.asmhentai.com/<dir>/<galleryId>/<page>.<ext>).  Every gallery
 * lives in a single chapter, so we mirror the pattern used in the nHentai
 * adapter and emit a single "Full Book" chapter.
 */
class ASMHentaiAdapter implements Adapter {
  id = "asmhentai";
  label = "ASM Hentai";

  private async fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    // Cloudflare / anti-bot rules are light – spoofing a normal UA is enough.
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const res = await fetch(url, { headers: { "User-Agent": ua }, signal });
    if (!res.ok) throw new Error(`ASMHentai request failed: ${res.status}`);
    return res.text();
  }

  async getMangaList(search?: string, signal?: AbortSignal): Promise<MangaMeta[]> {
    const term = (search ?? "").trim();

    // If the user hasn't typed a query yet, just show the latest galleries from
    // the front-page so the list isn't empty by default.
    const url = term
      ? `https://asmhentai.com/search/?q=${encodeURIComponent(term)}&page=1`
      : "https://asmhentai.com/";
    const html = await this.fetchHtml(url, signal);

    const results: MangaMeta[] = [];
    const regex = /<a href="\/g\/(\d+)\/">[\s\S]*?alt="([^"]+)"/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      const [_, id, rawTitle] = m;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({ id, title: this.decodeEntities(rawTitle) });
    }

    return results;
  }

  async getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]> {
    const html = await this.fetchHtml(`https://asmhentai.com/g/${mangaId}/`, signal);
    const pageCount = this.extractPageCount(html);
    return [
      {
        id: mangaId, // single-chapter model
        title: pageCount ? `Full Book • ${pageCount} pages` : "Full Book",
      },
    ];
  }

  async getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]> {
    const html = await this.fetchHtml(`https://asmhentai.com/g/${chapterId}/`, signal);

    const dirMatch = html.match(/id="load_dir" value="(\d+)"/);
    if (!dirMatch) throw new Error("Failed to locate gallery directory");
    const dir = dirMatch[1];

    const pageCount = this.extractPageCount(html);
    if (!pageCount) throw new Error("Unable to determine page count");

    // Determine the file extension from the first thumbnail (e.g., 1t.jpg → jpg)
    const extMatch = html.match(
      new RegExp(`https?://images\\.asmhentai\\.com/${dir}/${chapterId}/1t\\.(jpg|jpeg|png|webp|gif)`, "i")
    );
    const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase();

    // Build the full-size page URLs.  Thumbnails use the same path but append a
    // trailing "t" before the extension.
    const pages: PageMeta[] = [];
    for (let i = 1; i <= pageCount; i++) {
      pages.push({
        index: i - 1,
        url: `https://images.asmhentai.com/${dir}/${chapterId}/${i}.${ext}`,
      });
    }

    return pages;
  }

  /**
   * Extract the total page count from a gallery HTML document.
   */
  private extractPageCount(html: string): number {
    const m = html.match(/id="t_pages" value="(\d+)"/);
    if (m) return parseInt(m[1], 10);
    const alt = html.match(/Pages:\s*(\d+)/);
    if (alt) return parseInt(alt[1], 10);
    return 0;
  }

  /**
   * Very small HTML-entity decoder for titles (e.g., &#x27; → ').  We skip a full
   * dependency on an entity library – this covers the common cases we see in
   * titles and is enough for display purposes.
   */
  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"");
  }
}

export default new ASMHentaiAdapter(); 