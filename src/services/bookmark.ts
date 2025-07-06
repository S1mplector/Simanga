import Store from "electron-store";

export interface BookmarkEntry {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  page?: number;
  chapterTitle?: string;
  updated: number; // epoch ts
}

interface BookmarkSchema {
  entries: BookmarkEntry[];
}

const store = new Store<BookmarkSchema>({
  name: "bookmarks",
  defaults: {
    entries: [],
  },
});

export const bookmarkService = {
  /** Get bookmark for a manga (if any) */
  get(sourceId: string, mangaId: string): BookmarkEntry | undefined {
    return store.get("entries").find((e) => e.sourceId === sourceId && e.mangaId === mangaId);
  },

  /** Set or update bookmark for a manga */
  set(entry: Omit<BookmarkEntry, "updated">) {
    let entries = store.get("entries");
    // Remove existing bookmark for same manga
    entries = entries.filter((e) => !(e.sourceId === entry.sourceId && e.mangaId === entry.mangaId));
    const newEntry: BookmarkEntry = { ...entry, updated: Date.now() } as BookmarkEntry;
    entries.unshift(newEntry);
    store.set("entries", entries);
    return newEntry;
  },

  /** Remove bookmark for a manga */
  remove(sourceId: string, mangaId: string) {
    const entries = store.get("entries").filter((e) => !(e.sourceId === sourceId && e.mangaId === mangaId));
    store.set("entries", entries);
  },

  /** List all bookmarks */
  list(): BookmarkEntry[] {
    return store.get("entries");
  },
}; 