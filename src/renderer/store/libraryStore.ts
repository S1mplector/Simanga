import { create } from "zustand";
import type { Manga } from "@/models";

export interface SourceMeta {
  id: string;
  label: string;
}

interface LibraryState {
  sources: SourceMeta[];
  selectedSource?: string;
  mangas: Manga[];
  search: string;
  selectedManga?: string;
  chapters: any[];
  loadingMangas: boolean;
  loadingChapters: boolean;
  selectedChapter?: string;
  pages: any[];
  setSources: (s: SourceMeta[]) => void;
  setSelectedSource: (id: string | undefined) => void;
  setMangas: (m: Manga[]) => void;
  setSearch: (q: string) => void;
  setSelectedManga: (id: string | undefined) => void;
  setChapters: (c: any[]) => void;
  setLoadingMangas: (v: boolean) => void;
  setLoadingChapters: (v: boolean) => void;
  setSelectedChapter: (id: string | undefined) => void;
  setPages: (p: any[]) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  sources: [],
  selectedSource: undefined,
  mangas: [],
  search: "",
  selectedManga: undefined,
  chapters: [],
  loadingMangas: false,
  loadingChapters: false,
  selectedChapter: undefined,
  pages: [],
  setSources: (sources) => set({ sources }),
  setSelectedSource: (selectedSource) => set({ selectedSource, selectedManga: undefined, chapters: [] }),
  setMangas: (mangas) => set({ mangas }),
  setSearch: (search) => set({ search }),
  setSelectedManga: (selectedManga) => set({ selectedManga }),
  setChapters: (chapters) => set({ chapters }),
  setLoadingMangas: (loadingMangas) => set({ loadingMangas }),
  setLoadingChapters: (loadingChapters) => set({ loadingChapters }),
  setSelectedChapter: (selectedChapter) => set({ selectedChapter }),
  setPages: (pages) => set({ pages }),
})); 