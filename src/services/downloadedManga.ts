import Store from "electron-store";
import path from "path";
import fs from "fs/promises";
import settings from "./settings";

export interface DownloadedManga {
  id: string;
  sourceId: string;
  mangaId: string;
  title: string;
  downloadedAt: number;
  chapters: DownloadedChapter[];
  coverPath?: string;
}

export interface DownloadedChapter {
  id: string;
  title: string;
  downloadedAt: number;
  pageCount: number;
  path: string;
}

interface DownloadedMangaStore {
  downloadedManga: DownloadedManga[];
}

class DownloadedMangaService {
  private store: Store<DownloadedMangaStore>;

  constructor() {
    this.store = new Store<DownloadedMangaStore>({
      name: "downloaded-manga",
      defaults: {
        downloadedManga: [],
      },
    });
  }

  async addDownloadedChapter(
    sourceId: string,
    mangaId: string,
    mangaTitle: string,
    chapterId: string,
    chapterTitle: string,
    chapterPath: string,
    pageCount: number
  ): Promise<void> {
    const downloadedManga = this.store.get("downloadedManga");
    const mangaKey = `${sourceId}:${mangaId}`;
    
    let manga = downloadedManga.find((m) => m.id === mangaKey);
    
    if (!manga) {
      manga = {
        id: mangaKey,
        sourceId,
        mangaId,
        title: mangaTitle,
        downloadedAt: Date.now(),
        chapters: [],
      };
      downloadedManga.push(manga);
    }
    
    // Check if chapter already exists
    const existingChapterIndex = manga.chapters.findIndex((c) => c.id === chapterId);
    
    const newChapter: DownloadedChapter = {
      id: chapterId,
      title: chapterTitle,
      downloadedAt: Date.now(),
      pageCount,
      path: chapterPath,
    };
    
    if (existingChapterIndex >= 0) {
      manga.chapters[existingChapterIndex] = newChapter;
    } else {
      manga.chapters.push(newChapter);
    }
    
    // Sort chapters by title
    manga.chapters.sort((a, b) => a.title.localeCompare(b.title));
    
    this.store.set("downloadedManga", downloadedManga);
  }

  async removeDownloadedChapter(mangaId: string, chapterId: string): Promise<void> {
    const downloadedManga = this.store.get("downloadedManga");
    const manga = downloadedManga.find((m) => m.id === mangaId);
    
    if (manga) {
      manga.chapters = manga.chapters.filter((c) => c.id !== chapterId);
      
      // If no chapters left, remove the manga entry
      if (manga.chapters.length === 0) {
        const index = downloadedManga.indexOf(manga);
        downloadedManga.splice(index, 1);
      }
      
      this.store.set("downloadedManga", downloadedManga);
      
      // Also try to delete the actual files
      try {
        const chapterDir = path.join(settings.get("downloadDir"), manga.title, chapterId);
        await fs.rmdir(chapterDir, { recursive: true });
      } catch (err) {
        console.error("Failed to delete chapter files:", err);
      }
    }
  }

  getDownloadedManga(): DownloadedManga[] {
    return this.store.get("downloadedManga");
  }

  getDownloadedChapters(mangaId: string): DownloadedChapter[] {
    const manga = this.store.get("downloadedManga").find((m) => m.id === mangaId);
    return manga?.chapters || [];
  }

  isChapterDownloaded(mangaId: string, chapterId: string): boolean {
    const manga = this.store.get("downloadedManga").find((m) => m.id === mangaId);
    return manga?.chapters.some((c) => c.id === chapterId) || false;
  }

  async getDownloadedPages(mangaId: string, chapterId: string): Promise<string[]> {
    const manga = this.store.get("downloadedManga").find((m) => m.id === mangaId);
    const chapter = manga?.chapters.find((c) => c.id === chapterId);
    
    if (!chapter) {
      return [];
    }
    
    try {
      const files = await fs.readdir(chapter.path);
      const imageFiles = files
        .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      
      return imageFiles.map((f) => path.join(chapter.path, f));
    } catch (err) {
      console.error("Failed to read downloaded pages:", err);
      return [];
    }
  }

  /**
   * Re-scan the stored downloads and remove any entries whose directories were
   * deleted from disk.  Returns the updated list.
   */
  async rescan(): Promise<DownloadedManga[]> {
    const downloadedManga = this.store.get("downloadedManga");
    let modified = false;

    // Iterate backwards so we can safely splice
    for (let i = downloadedManga.length - 1; i >= 0; i--) {
      const manga = downloadedManga[i];

      for (let j = manga.chapters.length - 1; j >= 0; j--) {
        const chapter = manga.chapters[j];
        try {
          await fs.access(chapter.path);
        } catch {
          // Directory no longer exists – drop the chapter
          manga.chapters.splice(j, 1);
          modified = true;
        }
      }

      // Remove manga entry entirely if it has no chapters left
      if (manga.chapters.length === 0) {
        downloadedManga.splice(i, 1);
        modified = true;
      }
    }

    if (modified) {
      this.store.set("downloadedManga", downloadedManga);
    }

    return downloadedManga;
  }

  async getDiskUsage(): Promise<number> {
    //return total bytes used inside the configured download directory
    const downloadDir = settings.get("downloadDir");
    try {
      return await this.calculateDirectorySize(downloadDir);
    } catch (err) {
      console.error("Failed to calculate download directory size:", err);
      return 0;
    }
  }

  private async calculateDirectorySize(dir: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            total += stat.size;
          } catch {
            //Ignore permission errors etc.
          }
        }
      }
    } catch {
      //If dir aint there treat as zero bytes
    }
    return total;
  }
}

export const downloadedMangaService = new DownloadedMangaService(); 