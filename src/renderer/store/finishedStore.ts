import { create } from "zustand";

interface FinishedState {
  finishedIds: string[];
  setFinishedIds: (ids: string[]) => void;
  addFinished: (id: string) => void;
}

export const useFinishedStore = create<FinishedState>((set) => ({
  finishedIds: [],
  setFinishedIds: (ids) => set({ finishedIds: ids }),
  addFinished: (id) => set((s) => ({ finishedIds: [...new Set([...s.finishedIds, id])] })),
})); 