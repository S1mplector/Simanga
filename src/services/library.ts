import Store from "electron-store";

export interface FavoriteEntry {
  sourceId: string;
  mangaId: string;
  title: string;
}

export interface ProgressEntry {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  page: number;
  updated: number; // epoch ts
  title?: string;
  chapterTitle?: string;
}

interface LibrarySchema {
  favorites: FavoriteEntry[];
  progress: ProgressEntry[]; // recent-first
}

const store = new Store<LibrarySchema>({
  name: "library",
  defaults: {
    favorites: [],
    progress: [],
  },
});

export const libraryService = {
  listFavorites(): FavoriteEntry[] {
    return store.get("favorites");
  },
  toggleFavorite(entry: FavoriteEntry): FavoriteEntry[] {
    const favs = store.get("favorites");
    const idx = favs.findIndex((f) => f.sourceId === entry.sourceId && f.mangaId === entry.mangaId);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push(entry);
    }
    store.set("favorites", favs);
    return favs;
  },
  saveProgress(p: ProgressEntry) {
    let progresses = store.get("progress");

    // If title is missing try to reuse any existing title we already stored for this manga.
    let title = p.title;
    if (!title) {
      const existing = progresses.find((pr) => pr.sourceId === p.sourceId && pr.mangaId === p.mangaId && pr.title);
      if (existing) {
        title = existing.title;
      }
    }

    progresses = progresses.filter((pr) => !(pr.sourceId === p.sourceId && pr.mangaId === p.mangaId && pr.chapterId === p.chapterId));
    progresses.unshift({ ...p, title, updated: Date.now(), chapterTitle: p.chapterTitle });
    progresses = progresses.slice(0, 100); // cap history
    store.set("progress", progresses);
  },
  listHistory(): ProgressEntry[] {
    return store.get("progress");
  },
  getLastProgress(): ProgressEntry | undefined {
    const list = store.get("progress");
    return list[0];
  },
  getRecentUniqueProgress(limit: number = 3): ProgressEntry[] {
    const progress = store.get("progress");
    const uniqueMap = new Map<string, ProgressEntry>();
    
    for (const entry of progress) {
      const key = `${entry.sourceId}-${entry.mangaId}`;
      if (!uniqueMap.has(key) && uniqueMap.size < limit) {
        uniqueMap.set(key, entry);
      }
    }
    
    return Array.from(uniqueMap.values());
  },
  /**
   * Patch all progress (and favorite) entries for a given manga with the new title.
   */
  updateProgressTitle(sourceId: string, mangaId: string, title: string) {
    if (!title) return;

    // Update progress list
    const progress = store.get("progress");
    let changed = false;
    for (const p of progress) {
      if (p.sourceId === sourceId && p.mangaId === mangaId && p.title !== title) {
        p.title = title;
        changed = true;
      }
    }
    if (changed) {
      store.set("progress", progress);
    }

    // Update favorites list as well so we stay in sync
    const favs = store.get("favorites");
    let favChanged = false;
    for (const f of favs) {
      if (f.sourceId === sourceId && f.mangaId === mangaId && f.title !== title) {
        f.title = title;
        favChanged = true;
      }
    }
    if (favChanged) {
      store.set("favorites", favs);
    }
  },
}; 