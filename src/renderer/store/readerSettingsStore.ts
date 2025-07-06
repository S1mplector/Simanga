import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ReaderSettings {
  mode: "scroll" | "paged";
  zoom: number;
  spread: boolean;
  readingDirection: "ltr" | "rtl";
  brightness: number;
  contrast: number;
  fitMode: "none" | "width" | "height";
  autoScroll: boolean;
  autoScrollSpeed: number;
}

interface MangaSettings {
  [mangaId: string]: Partial<ReaderSettings>;
}

interface ReaderSettingsStore {
  globalSettings: ReaderSettings;
  mangaSettings: MangaSettings;
  setGlobalSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  setMangaSetting: <K extends keyof ReaderSettings>(
    mangaId: string,
    key: K,
    value: ReaderSettings[K]
  ) => void;
  getSettings: (mangaId?: string) => ReaderSettings;
  resetMangaSettings: (mangaId: string) => void;
}

export const useReaderSettingsStore = create<ReaderSettingsStore>()(
  persist(
    (set, get) => ({
      globalSettings: {
        mode: "scroll",
        zoom: 1,
        spread: false,
        readingDirection: "ltr",
        brightness: 100,
        contrast: 100,
        fitMode: "none",
        autoScroll: false,
        autoScrollSpeed: 50,
      },
      mangaSettings: {},
      
      setGlobalSetting: (key, value) =>
        set((state) => ({
          globalSettings: { ...state.globalSettings, [key]: value },
        })),
        
      setMangaSetting: (mangaId, key, value) =>
        set((state) => ({
          mangaSettings: {
            ...state.mangaSettings,
            [mangaId]: { ...state.mangaSettings[mangaId], [key]: value },
          },
        })),
        
      getSettings: (mangaId) => {
        const state = get();
        if (!mangaId) return state.globalSettings;
        
        return {
          ...state.globalSettings,
          ...state.mangaSettings[mangaId],
        };
      },
      
      resetMangaSettings: (mangaId) =>
        set((state) => {
          const { [mangaId]: _, ...rest } = state.mangaSettings;
          return { mangaSettings: rest };
        }),
    }),
    {
      name: "reader-settings",
    }
  )
); 