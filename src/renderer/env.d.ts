import type { SourceMeta } from "../services/IMangaRepository";

declare global {
  interface Window {
    repo: {
      listSources: () => Promise<SourceMeta[]>;
      listAllSources: () => Promise<SourceMeta[]>;
      fetchMangaList: (sourceId: string, search?: string, tags?: string[]) => Promise<any[]>;
      fetchChapterList: (sourceId: string, mangaId: string) => Promise<any[]>;
      fetchPages: (sourceId: string, chapterId: string) => Promise<any[]>;
    };
    download: {
      enqueue: (job: any) => Promise<void>;
      listJobs: () => Promise<any[]>;
      onUpdate: (handler: (ev: any, payload: any) => void) => void;
    };
    readingList: {
      listByStatus: (status: "reading" | "plan" | "finished") => Promise<any[]>;
      setStatus: (
        entry: { sourceId: string; mangaId: string; title: string },
        status: "reading" | "plan" | "finished"
      ) => Promise<void>;
      remove: (sourceId: string, mangaId: string) => Promise<void>;
    };
    finishedChapters: {
      list: () => Promise<string[]>;
      isFinished: (chapterId: string) => Promise<boolean>;
      mark: (chapterId: string) => Promise<void>;
    };
    thumbCache: {
      get: (key: string) => Promise<string | undefined>;
      set: (key: string, url: string) => Promise<void>;
    };
    settings: {
      getPreferredLanguages: () => Promise<string[]>;
      setPreferredLanguages: (langs: string[]) => Promise<void>;
      getProxies: () => Promise<string[]>;
      setProxies: (proxies: string[]) => Promise<void>;
      getTorEnabled: () => Promise<boolean>;
      setTorEnabled: (enabled: boolean) => Promise<void>;
      getDownloadDir: () => Promise<string>;
      setDownloadDir: (dir: string) => Promise<void>;
      selectDownloadDir: () => Promise<string>;
      getDisabledSources: () => Promise<string[]>;
      setDisabledSources: (ids: string[]) => Promise<void>;
      getHitomiProxyEnabled: () => Promise<boolean>;
      setHitomiProxyEnabled: (enabled: boolean) => Promise<void>;
      getMangaFireProxyEnabled: () => Promise<boolean>;
      setMangaFireProxyEnabled: (enabled: boolean) => Promise<void>;
      getNSFWEnabled: () => Promise<boolean>;
      setNSFWEnabled: (enabled: boolean) => Promise<void>;
    };
    downloadedManga: {
      getAll: () => Promise<any[]>;
      rescan: () => Promise<any[]>;
      removeChapter: (mangaId: string, chapterId: string) => Promise<void>;
      getPages: (mangaId: string, chapterId: string) => Promise<string[]>;
    };
    bookmarks: {
      get: (sourceId: string, mangaId: string) => Promise<any>;
      set: (entry: any) => Promise<void>;
      remove: (sourceId: string, mangaId: string) => Promise<void>;
    };
  }
}

export {};

declare module '*.png' {
  const value: string;
  export default value;
}
declare module '*.jpg' {
  const value: string;
  export default value;
}
declare module '*.jpeg' {
  const value: string;
  export default value;
}
declare module '*.gif' {
  const value: string;
  export default value;
}
declare module '*.svg' {
  const value: string;
  export default value;
} 