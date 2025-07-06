import React, { useEffect, useState } from "react";
import { useLibraryStore } from "../store/libraryStore";
import { useNavigate } from "react-router-dom";
import Spinner from "./Spinner";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { useFinishedStore } from "../store/finishedStore";
import DownloadButton from "./DownloadButton";
import type { DownloadJob } from "../../services/downloadManager";
import { BookmarkIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";

const ChapterList: React.FC = () => {
  const chapters = useLibraryStore((s) => s.chapters);
  const loading = useLibraryStore((s) => s.loadingChapters);
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const setSelectedChapter = useLibraryStore((s) => s.setSelectedChapter);
  const navigate = useNavigate();
  const finishedIds = useFinishedStore((s) => s.finishedIds);
  const setFinishedIds = useFinishedStore((s) => s.setFinishedIds);
  const [bookmark, setBookmark] = useState<any | null>(null);

  // Track finished chapters for progress checkmarks
  useEffect(() => {
    (async () => {
      const ids = await window.finishedChapters.list();
      setFinishedIds(ids as any);
    })();
  }, [chapters]);

  // Track downloaded chapters
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);

  // Track active download jobs keyed by chapterId
  const [activeJobs, setActiveJobs] = useState<Record<string, DownloadJob>>({});

  // Load bookmark for selected manga
  useEffect(() => {
    if (!selectedManga) return;
    const sourceId = useLibraryStore.getState().selectedSource;
    if (!sourceId) return;
    window.bookmarks.get(sourceId, selectedManga).then((bk: any) => setBookmark(bk));
  }, [selectedManga]);

  // Helper to refresh downloaded chapter IDs
  const refreshDownloaded = async () => {
    const all = await (window as any).downloadedManga.getAll();
    const ids: string[] = [];
    all.forEach((m: any) => {
      m.chapters.forEach((c: any) => ids.push(c.id));
    });
    setDownloadedIds(ids);
  };

  // On mount, load downloaded list and wire up download manager events
  useEffect(() => {
    refreshDownloaded();

    // Initial load of current jobs
    (window as any).downloadManager.listJobs().then((jobs: DownloadJob[]) => {
      setActiveJobs(
        jobs.reduce((acc, j) => {
          acc[j.chapter.id] = j;
          return acc;
        }, {} as Record<string, DownloadJob>)
      );
    });

    // Listen for job updates
    const handleUpdate = (job: DownloadJob) => {
      setActiveJobs((prev) => ({ ...prev, [job.chapter.id]: job }));

      // Refresh downloaded list when a job completes
      if (job.status === "completed") {
        refreshDownloaded();
      }
    };

    (window as any).downloadManager.on("update", handleUpdate);

    return () => {
      (window as any).downloadManager.off("update", handleUpdate);
    };
  }, []);

  if (!selectedManga) return <p className="text-gray-400">Select a manga to see chapters</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Vol / Chapter</h3>
      {loading && (
        <p className="flex items-center text-gray-400 mb-2">
          <Spinner size={14} /> Loading...
        </p>
      )}
      <ul className="max-h-[70vh] overflow-auto pr-2">
        {chapters.map((ch: any) => {
          const isDownloaded = downloadedIds.includes(ch.id);
          const job = activeJobs[ch.id];
          const isDownloading = job && job.status !== "completed" && job.status !== "failed";
          const progress = job ? job.progress : 0;
          const isBookmarked = bookmark && bookmark.chapterId === ch.id;

          const handleDownload = async () => {
            const sourceId = useLibraryStore.getState().selectedSource;
            const mangaId = useLibraryStore.getState().selectedManga;
            if (!sourceId || !mangaId) return;

            try {
              const pages = await window.repo.fetchPages(sourceId, ch.id);
              const mangas = useLibraryStore.getState().mangas;
              const mangaTitle = mangas.find((m) => m.id === mangaId)?.title || "Unknown";

              const jobId = `${ch.id}`;
              const newJob: Omit<DownloadJob, "progress" | "status"> = {
                id: jobId,
                sourceId,
                mangaId,
                mangaTitle,
                chapter: ch,
                pages,
              } as any;

              (window as any).downloadManager.enqueue(newJob);
            } catch (err) {
              console.error("Failed to enqueue download", err);
            }
          };

          return (
            <li
              key={ch.id}
              className="group flex items-center justify-between py-1 border-b border-gray-700"
            >
              <div
                className="flex-1 cursor-pointer hover:text-blue-400"
                onClick={() => {
                  setSelectedChapter(ch.id);
                  navigate(`/reader/${encodeURIComponent(ch.id)}`);
                }}
              >
                {ch.title || ch.id}
              </div>

              {/* Download button */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DownloadButton
                  isDownloaded={isDownloaded}
                  isDownloading={!!isDownloading}
                  progress={progress}
                  size="sm"
                  onClick={handleDownload}
                />
              </div>

              {/* Finished checkmark */}
              {finishedIds.includes(ch.id) && (
                <CheckCircleIcon className="w-4 h-4 text-green-400 ml-2" />
              )}

              {/* Bookmark icon */}
              <button
                className="ml-2 p-0.5 rounded hover:bg-gray-700"
                onClick={async (ev) => {
                  ev.stopPropagation();
                  const sourceId = useLibraryStore.getState().selectedSource;
                  if (!sourceId) return;
                  if (isBookmarked) {
                    await window.bookmarks.remove(sourceId, selectedManga!);
                    setBookmark(null);
                  } else {
                    await window.bookmarks.set({
                      sourceId,
                      mangaId: selectedManga!,
                      chapterId: ch.id,
                      page: 0,
                      chapterTitle: ch.title ?? "",
                    });
                    setBookmark({ sourceId, mangaId: selectedManga!, chapterId: ch.id, page: 0 });
                  }
                }}
                title={isBookmarked ? "Remove bookmark" : "Bookmark chapter"}
              >
                {isBookmarked ? (
                  <BookmarkSolid className="w-4 h-4 text-yellow-400" />
                ) : (
                  <BookmarkIcon className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ChapterList; 