import type { Adapter, SearchOptions } from "../Adapter";

export type AdapterSmokePlan = {
  name: string;
  adapter: Adapter;
  query: string; // search term to find at least one result
  page?: number;
};

function timeoutAbort(ms: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller;
}

export async function smokeTestAdapter(plan: AdapterSmokePlan): Promise<void> {
  const { name, adapter, query, page = 1 } = plan;
  const controller = timeoutAbort(30000); // 30s per adapter test
  const signal = controller.signal;

  const log = (...args: any[]) => console.log(`[${name}]`, ...args);
  const err = (...args: any[]) => console.error(`[${name}]`, ...args);

  try {
    if (adapter.initialize) {
      await adapter.initialize();
    }

    const searchOpts: SearchOptions = { query, page };
    log("Searching:", searchOpts);
    const listRes = await adapter.getMangaList(searchOpts, signal);
    if (!listRes.results?.length) {
      throw new Error("No search results returned");
    }
    const first = listRes.results[0];
    log(`Found ${listRes.results.length} results. First:`, {
      id: first.id,
      title: first.title?.slice(0, 60),
      cover: Boolean(first.coverUrl),
    });

    if (adapter.getMangaDetails) {
      const details = await adapter.getMangaDetails(first.id, signal);
      log("Details:", {
        id: details.id,
        title: details.title?.slice(0, 60),
        artist: details.artist,
        tags: details.tags?.slice(0, 5),
      });
    } else {
      log("getMangaDetails not implemented, skipping.");
    }

    const chapters = await adapter.getChapterList(first.id, signal);
    if (!chapters?.length) {
      throw new Error("No chapters returned");
    }
    const chap = chapters[0];
    log(`Chapters: ${chapters.length}. First:`, {
      id: chap.id,
      title: chap.title,
      pages: chap.pages,
    });

    const pages = await adapter.getPageList(chap.id, signal);
    if (!pages?.length) {
      throw new Error("No pages returned");
    }
    const p0 = pages[0];
    log(`Pages: ${pages.length}. First:`, {
      index: p0.index,
      url: p0.url?.slice(0, 100),
      alts: p0.alternativeUrls?.length || 0,
    });

    if (adapter.cleanup) {
      await adapter.cleanup();
    }

    log("SMOKE TEST PASSED");
  } catch (e: any) {
    err("SMOKE TEST FAILED:", e?.message || e);
    throw e;
  }
}
