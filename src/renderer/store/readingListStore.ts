import { create } from "zustand";

export type ReadingStatus = "reading" | "plan" | "finished";

export interface TrackingEntry {
  sourceId: string;
  mangaId: string;
  title: string;
  status: ReadingStatus;
  updated: number;
}

interface ReadingListState {
  reading: TrackingEntry[];
  plan: TrackingEntry[];
  finished: TrackingEntry[];
  setReading: (e: TrackingEntry[]) => void;
  setPlan: (e: TrackingEntry[]) => void;
  setFinished: (e: TrackingEntry[]) => void;
  getStatus: (sourceId: string, mangaId: string) => ReadingStatus | undefined;
}

export const useReadingList = create<ReadingListState>((set, get) => ({
  reading: [],
  plan: [],
  finished: [],
  setReading: (reading) => set({ reading }),
  setPlan: (plan) => set({ plan }),
  setFinished: (finished) => set({ finished }),
  getStatus: (sourceId, mangaId) => {
    const { reading, plan, finished } = get();
    if (reading.some((e) => e.sourceId === sourceId && e.mangaId === mangaId)) return "reading";
    if (plan.some((e) => e.sourceId === sourceId && e.mangaId === mangaId)) return "plan";
    if (finished.some((e) => e.sourceId === sourceId && e.mangaId === mangaId)) return "finished";
    return undefined;
  },
})); 