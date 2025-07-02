import type { Adapter, MangaMeta, ChapterMeta, PageMeta } from "./Adapter";
import settingsStore from "../services/settings";

const API_BASE = "https://api.mangadex.org";

class MangaDexAdapter implements Adapter {
  id = "mangadex";
  label = "MangaDex";

  async getMangaList(search?: string): Promise<MangaMeta[]> {
    // First attempt: restrict to English translations so results are relevant.
    const params = this.buildBaseParams(search);

    let res = await fetch(`${API_BASE}/manga?${params.toString()}`);
    let json = await res.json();

    // Fallback: if no hits and we were searching for a specific title, try again
    // without the language restriction. Some 18+ titles are only available in
    // other languages and will otherwise be invisible.
    if (json.data?.length === 0 && search && search.trim().length > 0) {
      params.delete("availableTranslatedLanguage[]");
      res = await fetch(`${API_BASE}/manga?${params.toString()}`);
      json = await res.json();
    }

    return json.data.map((d: any) => ({
      id: d.id,
      title: this.pickBestTitle(d.attributes.title),
    }));
  }

  async getChapterList(mangaId: string): Promise<ChapterMeta[]> {
    // Helper for a single fetch; languages undefined → all languages
    const requestFeed = async (langs?: string[]) => {
      let url = `${API_BASE}/manga/${mangaId}/feed?limit=500&order[chapter]=asc`;
      if (langs && langs.length) {
        langs.forEach((l) => {
          url += `&translatedLanguage[]=${l}`;
        });
      }
      const res = await fetch(url);
      return res.json();
    };

    const preferredLangs: string[] = settingsStore.get("preferredLanguages");

    // First attempt: preferred languages (default EN)
    let json = await requestFeed(preferredLangs && preferredLangs.length ? preferredLangs : ["en"]);

    // Fallback: if no chapters in preferred languages, fetch all languages
    if (json.data?.length === 0) {
      json = await requestFeed();
    }

    return json.data.map((d: any) => {
      const num = d.attributes.chapter ?? "?";
      const vol = d.attributes.volume;
      const chapTitle = d.attributes.title;
      const lang = d.attributes.translatedLanguage;
      const langSuffix = lang && lang !== "en" ? ` [${lang}]` : "";
      return {
        id: d.id,
        title: `Vol ${vol ?? "-"} Ch ${num}${chapTitle ? ": " + chapTitle : ""}${langSuffix}`,
      };
    });
  }

  async getPageList(chapterId: string): Promise<PageMeta[]> {
    const atHome = await fetch(`${API_BASE}/at-home/server/${chapterId}`).then((r) => r.json());
    const chapter = atHome.chapter;
    const base = atHome.baseUrl;
    const hash = chapter.hash;
    const pages: string[] = chapter.data; // .jpg or .png filenames
    return pages.map((filename, idx) => ({ index: idx, url: `${base}/data/${hash}/${filename}` }));
  }

  /**
   * Build the common query parameters used for every Manga search.
   * Keeping this separate makes the adapter easier to extend if we ever add
   * pagination, tag filtering, etc.
   */
  private buildBaseParams(search?: string): URLSearchParams {
    const preferred: string[] = settingsStore.get("preferredLanguages");

    const params = new URLSearchParams({
      limit: "100",
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

    return params;
  }

  /**
   * Given the multilingual title object returned by MangaDex, pick the most
   * appropriate one to display. Priority: English -> First available.
   */
  private pickBestTitle(titleObj: Record<string, string>): string {
    if (!titleObj) return "Untitled";
    if (titleObj.en) return titleObj.en;
    const first = Object.values(titleObj)[0];
    return first ?? "Untitled";
  }
}

export default new MangaDexAdapter(); 