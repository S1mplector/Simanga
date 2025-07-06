import PQueue from "p-queue";
import EventEmitter from "events";
import path from "path";
import fs from "fs";
import { ensureDir, writeFileSafe, zeroPad, sanitize } from "../utils/file";
import settings from "./settings";
import type { PageMeta } from "../adapters/Adapter";
import { downloadedMangaService } from "./downloadedManga";
import sharp from "sharp";

export interface DownloadJob {
  id: string;
  sourceId: string;
  mangaId: string;
  mangaTitle: string;
  chapter: any;
  pages: PageMeta[];
  progress: number; // 0-1
  downloadedCount: number;
  totalPages: number;
  status: "queued" | "running" | "completed" | "failed";
  error?: string;
}

class DownloadManager extends EventEmitter {
  private queue: PQueue;
  private jobs = new Map<string, DownloadJob>();
  private queuedOrder: string[] = [];

  constructor() {
    super();
    this.queue = new PQueue({ concurrency: settings.get("concurrency") });
  }

  enqueue(job: Omit<DownloadJob, "progress" | "status">) {
    // Prevent duplicate enqueues for the same chapter while it is already queued or running.
    const existing = this.jobs.get(job.id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      // Just return the existing job instead of enqueueing a duplicate
      this.emit("update", existing); // notify renderer so UI can reflect the request
      return;
    }
    const full: DownloadJob = { ...job, progress: 0, status: "queued", downloadedCount: 0, totalPages: job.pages.length };
    this.jobs.set(full.id, full);
    this.queuedOrder.push(full.id);
    this.queue.add(() => this.processJob(full));
    this.emit("update", full);
  }

  /**
   * Move a queued job to a new index in the queue order.
   * Only jobs with status 'queued' can be reordered.
   */
  moveJob(jobId: string, newIndex: number) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "queued") return;
    const oldIndex = this.queuedOrder.indexOf(jobId);
    if (oldIndex === -1 || newIndex < 0 || newIndex >= this.queuedOrder.length) return;
    this.queuedOrder.splice(oldIndex, 1);
    this.queuedOrder.splice(newIndex, 0, jobId);
    this.emit("update", job);
  }

  private async processJob(job: DownloadJob) {
    job.status = "running";
    this.emit("update", job);

    const destDir = path.join(settings.get("downloadDir"), sanitize(job.mangaTitle), sanitize(job.chapter.title));
    ensureDir(destDir);

    let downloadedCount = 0;
    job.totalPages = job.pages.length;
    
    for (const page of job.pages) {
      try {
        const res = await fetch(page.url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = page.url.split('.').pop()?.split('?')[0] || 'jpg';
        
        console.log(`Page ${page.index + 1}: URL=${page.url}, extracted ext=${ext}`);
        
        // Convert webp to jpg for compatibility
        let finalExt = ext;
        let finalBuf: Buffer = buf;
        
        if (ext.toLowerCase() === 'webp') {
          console.log(`Detected webp for page ${page.index + 1}, attempting conversion...`);
          try {
            finalBuf = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
            finalExt = 'png';
            console.log(`Successfully converted webp to png for page ${page.index + 1}`);
          } catch (err) {
            console.error(`Failed to convert webp for page ${page.index + 1}:`, err);
            // Fall back to saving as webp if conversion fails
          }
        } else {
          console.log(`Page ${page.index + 1} is not webp (ext=${ext}), saving as-is`);
        }
        
        const fileName = `${zeroPad(page.index + 1, 3)}.${finalExt}`;
        console.log(`Saving page ${page.index + 1} as: ${fileName}`);
        writeFileSafe(path.join(destDir, fileName), finalBuf);
        
        // Clean up any existing webp file if we converted to png
        if (ext.toLowerCase() === 'webp' && finalExt === 'png') {
          const webpFileName = `${zeroPad(page.index + 1, 3)}.webp`;
          const webpFilePath = path.join(destDir, webpFileName);
          try {
            await fs.promises.unlink(webpFilePath);
            console.log(`Cleaned up existing webp file: ${webpFileName}`);
          } catch (err) {
            // File might not exist, ignore the error
          }
        }
        
        downloadedCount++;
        job.downloadedCount = downloadedCount;
      } catch (err: any) {
        console.error("Download failed for page", page.index, err);
        job.error = err.message || "Unknown error";
      }
      job.progress = downloadedCount / job.pages.length;
      this.emit("update", job);
    }

    // Persist the chapter even if some pages failed so the user can still see
    // the entry and re-download missing pages later.
    try {
      await downloadedMangaService.addDownloadedChapter(
        job.sourceId,
        job.mangaId,
        job.mangaTitle,
        job.chapter.id,
        job.chapter.title,
        destDir,
        downloadedCount // record actual downloaded pages
      );
    } catch (err) {
      console.error("Failed to register download:", err);
    }

    job.progress = 1;
    job.status = downloadedCount === job.pages.length ? "completed" : "failed";
    this.emit("update", job);
  }

  listJobs() {
    // Return jobs in the order: running, then queued (in queuedOrder), then completed/failed
    const running = Array.from(this.jobs.values()).filter(j => j.status === "running");
    const queued = this.queuedOrder.map(id => this.jobs.get(id)).filter(Boolean) as DownloadJob[];
    const finished = Array.from(this.jobs.values()).filter(j => j.status === "completed" || j.status === "failed");
    return [...running, ...queued, ...finished];
  }
}

export const downloadManager = new DownloadManager();