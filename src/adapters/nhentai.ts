import type { Adapter, MangaMeta, ChapterMeta, PageMeta } from "./Adapter";

const API_BASE = "https://nhentai.net/api";

/**
 * VERY lightweight adapter around nHentai's undocumented JSON API.
 * Notes:
 *  - nHentai calls every book a "gallery". There are no chapters, so we fake a
 *    single chapter entry with the same id as the gallery itself.
 *  - All endpoints are public; no auth, CORS-enabled. Perfect for an Electron
 *    app.
 */
class NHentaiAdapter implements Adapter {
  id = "nhentai";
  label = "nHentai";

  private async fetchJson(url: string): Promise<any> {
    // nHentai blocks "Electron/*" User-Agents; spoof a normal browser one.
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (!res.ok) throw new Error(`nHentai request failed: ${res.status}`);
    return res.json();
  }

  async getMangaList(search?: string): Promise<MangaMeta[]> {
    const term = (search ?? "").trim();

    const endpoint = term.length
      ? `${API_BASE}/galleries/search?query=${encodeURIComponent(term)}&page=1`
      : `${API_BASE}/galleries/all?page=1`;

    const json = await this.fetchJson(endpoint);

    return (json.result as any[]).map((g) => ({
      id: String(g.id),
      title: this.pickBestTitle(g.title),
    }));
  }

  async getChapterList(mangaId: string): Promise<ChapterMeta[]> {
    // nHentai books are single-chapter, but we fetch the gallery meta so we
    // can display a more helpful label (e.g., page count).
    const meta = await this.fetchJson(`${API_BASE}/gallery/${mangaId}`);
    const pages = meta.num_pages ?? meta.images?.pages?.length ?? 0;

    return [
      {
        id: mangaId,
        title: `Full Book • ${pages} pages`,
      },
    ];
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    const meta = await this.fetchJson(`${API_BASE}/gallery/${chapterId}`);
    const mediaId = meta.media_id;
    const pages: any[] = meta.images.pages; // array of { t: "j" | "p" | "g" }

    const extMap: Record<string, string> = { j: "jpg", p: "png", g: "gif", w: "webp" };

    return pages.map((p, idx) => {
      const ext = extMap[p.t] ?? "jpg";
      return {
        index: idx,
        url: `https://i.nhentai.net/galleries/${mediaId}/${idx + 1}.${ext}`,
      } as PageMeta;
    });
  }

  private pickBestTitle(titles: any): string {
    return titles?.english ?? titles?.pretty ?? "Untitled";
  }
}

export default new NHentaiAdapter(); 