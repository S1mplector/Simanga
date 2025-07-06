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
  selectedTags: string[];
  chapters: any[];
  loadingMangas: boolean;
  loadingChapters: boolean;
  viewMode: "list" | "grid";
  sortKey: "title-asc" | "title-desc";
  selectedChapter?: string;
  pages: any[];
  // Pagination state
  currentPage: number;
  itemsPerPage: number;
  totalMangas: Manga[];
  setSources: (s: SourceMeta[]) => void;
  setSelectedSource: (id: string | undefined) => void;
  setMangas: (m: Manga[]) => void;
  setSearch: (q: string) => void;
  setSelectedManga: (id: string | undefined) => void;
  setSelectedTags: (tags: string[]) => void;
  setChapters: (c: any[]) => void;
  setLoadingMangas: (v: boolean) => void;
  setLoadingChapters: (v: boolean) => void;
  setSelectedChapter: (id: string | undefined) => void;
  setPages: (p: any[]) => void;
  setViewMode: (m: "list" | "grid") => void;
  setSortKey: (k: "title-asc" | "title-desc") => void;
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (items: number) => void;
  setTotalMangas: (m: Manga[]) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  sources: [],
  selectedSource: undefined,
  mangas: [],
  search: "",
  selectedManga: undefined,
  selectedTags: [],
  chapters: [],
  loadingMangas: false,
  loadingChapters: false,
  viewMode: "list",
  sortKey: "title-asc",
  selectedChapter: undefined,
  pages: [],
  // Pagination defaults
  currentPage: 1,
  itemsPerPage: 50,
  totalMangas: [],
  setSources: (sources) => set({ sources }),
  setSelectedSource: (selectedSource) => set({ selectedSource, selectedManga: undefined, selectedTags: [], chapters: [], currentPage: 1 }),
  setMangas: (mangas) => set({ mangas }),
  setSearch: (search) => set({ search, currentPage: 1 }),
  setSelectedManga: (selectedManga) => set({ selectedManga }),
  setSelectedTags: (selectedTags) => set({ selectedTags, currentPage: 1 }),
  setChapters: (chapters) => set({ chapters }),
  setLoadingMangas: (loadingMangas) => set({ loadingMangas }),
  setLoadingChapters: (loadingChapters) => set({ loadingChapters }),
  setSelectedChapter: (selectedChapter) => set({ selectedChapter }),
  setPages: (pages) => set({ pages }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSortKey: (sortKey) => set({ sortKey }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setItemsPerPage: (itemsPerPage) => set({ itemsPerPage, currentPage: 1 }),
  setTotalMangas: (totalMangas) => set({ totalMangas }),
})); 