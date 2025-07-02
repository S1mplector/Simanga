import type { SourceMeta } from "../services/IMangaRepository";

declare global {
  interface Window {
    repo: {
      listSources: () => Promise<SourceMeta[]>;
      fetchMangaList: (sourceId: string, search?: string) => Promise<any[]>;
      fetchChapterList: (sourceId: string, mangaId: string) => Promise<any[]>;
      fetchPages: (sourceId: string, chapterId: string) => Promise<any[]>;
    };
    download: {
      enqueue: (job: any) => Promise<void>;
      listJobs: () => Promise<any[]>;
      onUpdate: (handler: (ev: any, payload: any) => void) => void;
    };
  }
}

export {}; 