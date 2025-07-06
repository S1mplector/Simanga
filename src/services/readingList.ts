import Store from "electron-store";

export type ReadingStatus = "reading" | "plan" | "finished";

export interface TrackingEntry {
  sourceId: string;
  mangaId: string;
  title: string;
  status: ReadingStatus;
  updated: number; // epoch ts
}

interface TrackingSchema {
  entries: TrackingEntry[];
}

const store = new Store<TrackingSchema>({
  name: "readingList",
  defaults: {
    entries: [],
  },
});

export const readingListService = {
  /** List all entries for a given status, most recently updated first */
  listByStatus(status: ReadingStatus): TrackingEntry[] {
    const entries = store.get("entries");
    return entries.filter((e) => e.status === status).sort((a, b) => b.updated - a.updated);
  },

  /** Add or move a manga to the specified status. */
  setStatus(entry: { sourceId: string; mangaId: string; title: string }, status: ReadingStatus) {
    let entries = store.get("entries");
    // Remove any existing entry for the manga (regardless of status)
    entries = entries.filter((e) => !(e.sourceId === entry.sourceId && e.mangaId === entry.mangaId));
    // Add new one at the top
    entries.unshift({ ...entry, status, updated: Date.now() });
    store.set("entries", entries);
  },

  /** Remove a manga from the tracking list entirely */
  remove(sourceId: string, mangaId: string) {
    const entries = store.get("entries").filter((e) => !(e.sourceId === sourceId && e.mangaId === mangaId));
    store.set("entries", entries);
  },
}; 