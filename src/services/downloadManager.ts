import PQueue from "p-queue";
import EventEmitter from "events";
import path from "path";
import { ensureDir, writeFileSafe, zeroPad, sanitize } from "../utils/file";
import settings from "./settings";
import type { PageMeta } from "../adapters/Adapter";

export interface DownloadJob {
  id: string;
  sourceId: string;
  mangaTitle: string;
  chapter: any;
  pages: PageMeta[];
  progress: number; // 0-1
  status: "queued" | "running" | "completed" | "failed";
}

class DownloadManager extends EventEmitter {
  private queue: PQueue;
  private jobs = new Map<string, DownloadJob>();

  constructor() {
    super();
    this.queue = new PQueue({ concurrency: settings.get("concurrency") });
  }

  enqueue(job: Omit<DownloadJob, "progress" | "status">) {
    const full: DownloadJob = { ...job, progress: 0, status: "queued" };
    this.jobs.set(full.id, full);
    this.queue.add(() => this.processJob(full));
    this.emit("update", full);
  }

  private async processJob(job: DownloadJob) {
    job.status = "running";
    this.emit("update", job);

    const destDir = path.join(settings.get("downloadDir"), sanitize(job.mangaTitle), sanitize(job.chapter.title));
    ensureDir(destDir);

    for (const page of job.pages) {
      try {
        const res = await fetch(page.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const fileName = `${zeroPad(page.index, 3)}.jpg`;
        writeFileSafe(path.join(destDir, fileName), buf);
      } catch (err) {
        console.error("Download failed", err);
        job.status = "failed";
        this.emit("update", job);
        return;
      }
      job.progress += 1 / job.pages.length;
      this.emit("update", job);
    }

    job.progress = 1;
    job.status = "completed";
    this.emit("update", job);
  }

  listJobs() {
    return Array.from(this.jobs.values());
  }
}

export const downloadManager = new DownloadManager(); 