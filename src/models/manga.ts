export interface Manga {
  id: string;
  title: string;
  coverUrl?: string;
}

export interface Chapter {
  id: string;
  title: string;
  mangaId: string;
  chapterNumber?: number;
}

export interface Page {
  index: number;
  imageUrl: string;
} 