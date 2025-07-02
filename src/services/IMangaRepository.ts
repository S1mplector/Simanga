import type { Manga, Chapter, Page } from "@/models";

export interface SourceMeta {
  id: string;
  label: string;
}

export interface IMangaRepository {
  listSources(): Promise<SourceMeta[]>;
  fetchMangaList(sourceId: string): Promise<Manga[]>;
  fetchChapterList(sourceId: string, mangaId: string): Promise<Chapter[]>;
  fetchPages(sourceId: string, chapterId: string): Promise<Page[]>;
} 