import Store from "electron-store";

interface FinishedSchema {
  chapterIds: string[]; // list of chapter IDs marked as finished
}

const store = new Store<FinishedSchema>({
  name: "finishedChapters",
  defaults: {
    chapterIds: [],
  },
});

export const finishedChaptersService = {
  list(): string[] {
    return store.get("chapterIds");
  },
  isFinished(chapterId: string): boolean {
    return store.get("chapterIds").includes(chapterId);
  },
  markFinished(chapterId: string) {
    const ids = new Set(store.get("chapterIds"));
    ids.add(chapterId);
    store.set("chapterIds", Array.from(ids));
  },
  unmark(chapterId: string) {
    const ids = store.get("chapterIds").filter((id) => id !== chapterId);
    store.set("chapterIds", ids);
  },
}; 