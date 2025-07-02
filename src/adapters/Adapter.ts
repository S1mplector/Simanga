export interface MangaMeta {
  id: string;
  title: string;
}

export interface ChapterMeta {
  id: string;
  title: string;
}

export interface PageMeta {
  index: number;
  url: string;
}

export interface Adapter {
  id: string;
  label: string;
  getMangaList(search?: string, signal?: AbortSignal): Promise<MangaMeta[]>;
  getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]>;
  getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]>;
} 