import { create } from "zustand";

interface FavoriteEntry {
  sourceId: string;
  mangaId: string;
  title: string;
}

interface ProgressEntry {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  page: number;
  updated: number;
  title?: string;
}

interface UserLibraryState {
  favorites: FavoriteEntry[];
  history: ProgressEntry[];
  setFavorites: (f: FavoriteEntry[]) => void;
  setHistory: (h: ProgressEntry[]) => void;
}

export const useUserLibrary = create<UserLibraryState>((set) => ({
  favorites: [],
  history: [],
  setFavorites: (favorites) => set({ favorites }),
  setHistory: (history) => set({ history }),
})); 