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
    progresses = progresses.filter((pr) => !(pr.sourceId === p.sourceId && pr.mangaId === p.mangaId && pr.chapterId === p.chapterId));
    progresses.unshift({ ...p, updated: Date.now() });
    progresses = progresses.slice(0, 100); // cap
    store.set("progress", progresses);
  },
  listHistory(): ProgressEntry[] {
    return store.get("progress");
  },
  getLastProgress(): ProgressEntry | undefined {
    const list = store.get("progress");
    return list[0];
  },
}; 