import React, { useEffect, useState, useRef } from "react";
import Spinner from "./Spinner";
import { XMarkIcon, BookOpenIcon, EyeIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { useReadingList } from "../store/readingListStore";
import DownloadButton from "./DownloadButton";
import type { DownloadJob } from "../../services/downloadManager";
import BookmarkToolbar from "./BookmarkToolbar";
import { useNavigate } from "react-router-dom";
import { useLibraryStore as useLibStore } from "../store/libraryStore";
import ConfirmationModal from "./ConfirmationModal";
// @ts-ignore - image asset
import downloadMascot from "../../assets/icons/extras/download.png";

interface Props {
  entry: {
    sourceId: string;
    mangaId: string;
    title: string;
  };
  onClick?: () => void;
  onRemove?: () => void;
}

// In-memory cache for instant access
const memCache = new Map<string, string>();

const MangaCard: React.FC<Props> = ({ entry, onClick, onRemove }) => {
  const cacheKey = `${entry.sourceId}-${entry.mangaId}`;
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bookmark, setBookmark] = useState<any | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [chaptersToDownload, setChaptersToDownload] = useState<any[]>([]);
  
  const { getStatus, setReading, setPlan, setFinished } = useReadingList();
  const currentStatus = getStatus(entry.sourceId, entry.mangaId);
  const navigate = useNavigate();

  useEffect(() => {
    // Check memory cache first
    const cached = memCache.get(cacheKey);
    if (cached) {
      setThumb(cached);
      return;
    }

    // Check persistent cache
    window.thumbCache.get(cacheKey).then((url) => {
      if (url) {
        memCache.set(cacheKey, url);
        setThumb(url);
      }
    });
  }, [cacheKey]);

  useEffect(() => {
    if (thumb || loadingRef.current || error) return;

    const io = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first.isIntersecting && !loadingRef.current) {
        io.disconnect();
        loadingRef.current = true;
        setLoading(true);

        // Fetch thumbnail
        (async () => {
          try {
            // Check cache again in case it was loaded while waiting
            const cached = await window.thumbCache.get(cacheKey);
            if (cached) {
              memCache.set(cacheKey, cached);
              setThumb(cached);
              return;
            }

            // Fetch chapters
            const chaps: any[] = await window.repo.fetchChapterList(entry.sourceId, entry.mangaId);
            if (chaps.length === 0) {
              setError(true);
              return;
            }

            // Fetch first page of first chapter
            const pages: any[] = await window.repo.fetchPages(entry.sourceId, chaps[0].id);
            if (pages.length === 0) {
              setError(true);
              return;
            }

            // Cache and display
            const url = pages[0].url;
            memCache.set(cacheKey, url);
            await window.thumbCache.set(cacheKey, url);
            setThumb(url);
          } catch (err) {
            console.error(`Failed to load thumbnail for ${entry.title}:`, err);
            setError(true);
          } finally {
            setLoading(false);
            loadingRef.current = false;
          }
        })();
      }
    }, { 
      threshold: 0.01,
      rootMargin: '100px' // Start loading 100px before visible
    });

    if (ref.current) {
      io.observe(ref.current);
    }

    return () => io.disconnect();
  }, [thumb, cacheKey, entry, error]);

  // Effect: track downloaded status and active jobs
  useEffect(() => {
    const refresh = async () => {
      const all = await (window as any).downloadedManga.getAll();
      const found = all.some((m: any) => m.mangaId === entry.mangaId && m.sourceId === entry.sourceId);
      setIsDownloaded(found);
    };

    refresh();

    // Check active jobs
    (window as any).downloadManager.listJobs().then((jobs: DownloadJob[]) => {
      const job = jobs.find((j) => j.mangaId === entry.mangaId && j.sourceId === entry.sourceId);
      if (job) {
        setIsDownloading(job.status !== "completed" && job.status !== "failed");
        setProgress(job.progress);
      }
    });

    const handleUpdate = (job: DownloadJob) => {
      if (job.mangaId !== entry.mangaId || job.sourceId !== entry.sourceId) return;
      if (job.status === "completed") {
        setIsDownloading(false);
        setIsDownloaded(true);
        setProgress(1);
      } else if (job.status === "running" || job.status === "queued") {
        setIsDownloading(true);
        setProgress(job.progress);
      } else if (job.status === "failed") {
        setIsDownloading(false);
        setProgress(0);
      }
    };

    (window as any).downloadManager.on("update", handleUpdate);
    return () => (window as any).downloadManager.off("update", handleUpdate);
  }, [entry.mangaId, entry.sourceId]);

  // Load bookmark for this manga
  useEffect(() => {
    window.bookmarks.get(entry.sourceId, entry.mangaId).then((bk: any) => setBookmark(bk));
  }, [entry.sourceId, entry.mangaId]);

  // Handle download click: ask user and enqueue all chapters sequentially
  const handleDownload = async () => {
    try {
      const chapters = await window.repo.fetchChapterList(entry.sourceId, entry.mangaId);
      if (!chapters || chapters.length === 0) return;

      setChaptersToDownload(chapters);
      setShowDownloadConfirm(true);
    } catch (err) {
      console.error("Failed to fetch chapters for download", err);
    }
  };

  const confirmDownload = async (confirmed: boolean) => {
    if (!confirmed) {
      setChaptersToDownload([]);
      return;
    }

    try {
      for (const chapter of chaptersToDownload) {
        try {
      const pages = await window.repo.fetchPages(entry.sourceId, chapter.id);
          if (!pages || pages.length === 0) continue;

      const job: Omit<DownloadJob, "progress" | "status"> = {
        id: `${chapter.id}`,
        sourceId: entry.sourceId,
        mangaId: entry.mangaId,
        mangaTitle: entry.title,
        chapter,
        pages,
      } as any;

      (window as any).downloadManager.enqueue(job);
        } catch (err) {
          console.error("Failed to enqueue chapter", chapter.id, err);
        }
      }
    } catch (err) {
      console.error("Failed to enqueue manga download", err);
    } finally {
      setChaptersToDownload([]);
    }
  };

  const handleStatusClick = async (
    status: "reading" | "plan" | "finished",
    ev: React.MouseEvent
  ) => {
    ev.stopPropagation();
    await window.readingList.setStatus(entry, status);

    // Refresh lists so UI updates
    const [r, p, f] = await Promise.all([
      window.readingList.listByStatus("reading"),
      window.readingList.listByStatus("plan"),
      window.readingList.listByStatus("finished"),
    ]);
    setReading(r as any);
    setPlan(p as any);
    setFinished(f as any);
  };

  return (
    <div
      ref={ref}
      className="relative w-32 cursor-pointer group"
      onClick={onClick}
      title={entry.title}
    >
      <div className="aspect-[3/4] bg-gray-700 rounded overflow-hidden flex items-center justify-center relative">
        {thumb ? (
          <img 
            src={thumb} 
            alt={entry.title} 
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : loading ? (
          <Spinner size={16} />
        ) : error ? (
          <span className="text-xs text-gray-400 p-1 text-center">No preview</span>
        ) : (
          <div className="w-full h-full bg-gray-700" />
        )}

        {/* Download button overlay */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <DownloadButton
            isDownloaded={isDownloaded}
            isDownloading={isDownloading}
            progress={progress}
            size="sm"
            onClick={handleDownload}
          />
        </div>

        {/* Status badges */}
        {currentStatus && (
          <div className="absolute top-1 left-1">
            <div className={`text-xs px-1.5 py-0.5 rounded ${
              currentStatus === "reading" ? "bg-blue-600" : 
              currentStatus === "plan" ? "bg-yellow-600" : 
              "bg-green-600"
            }`}>
              {currentStatus === "reading" ? "Reading" : 
               currentStatus === "plan" ? "Plan" : 
               "Finished"}
            </div>
          </div>
        )}
        
        {/* Reading status buttons - moved up from bottom */}
        <div className="absolute bottom-8 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex justify-center gap-1 bg-gray-900/90 rounded mx-2 p-1">
            <button
              title="Currently Reading"
              className={`p-1 rounded hover:bg-gray-700 ${currentStatus === "reading" ? "text-blue-400" : "text-gray-400"}`}
              onClick={(ev) => handleStatusClick("reading", ev)}
            >
              <BookOpenIcon className="w-4 h-4" />
            </button>
            <button
              title="Plan to Read"
              className={`p-1 rounded hover:bg-gray-700 ${currentStatus === "plan" ? "text-yellow-400" : "text-gray-400"}`}
              onClick={(ev) => handleStatusClick("plan", ev)}
            >
              <EyeIcon className="w-4 h-4" />
            </button>
            <button
              title="Finished"
              className={`p-1 rounded hover:bg-gray-700 ${currentStatus === "finished" ? "text-green-400" : "text-gray-400"}`}
              onClick={(ev) => handleStatusClick("finished", ev)}
            >
              <CheckCircleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Bookmark toolbar - right below status buttons */}
        {bookmark && (
          <div className="absolute bottom-1 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity px-2">
            <BookmarkToolbar
              label={`${bookmark.chapterTitle || bookmark.chapterId}${bookmark.page !== undefined ? ` • Pg ${bookmark.page + 1}` : ""}`}
              onClick={() => {
                // Ensure selected source/manga in store, then navigate
                useLibStore.getState().setSelectedSource(bookmark.sourceId);
                useLibStore.getState().setSelectedManga(bookmark.mangaId);
                navigate(`/reader/${encodeURIComponent(bookmark.chapterId)}${bookmark.page !== undefined ? `?page=${bookmark.page + 1}` : ""}`);
              }}
            />
          </div>
        )}
      </div>
      
      <p className="mt-1 text-xs line-clamp-2 text-center">{entry.title}</p>
      {onRemove && (
        <button
          className="absolute top-8 right-1 bg-gray-800/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100"
          title="Remove"
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
        >
          <XMarkIcon className="w-4 h-4 text-red-400" />
        </button>
      )}
      
      {/* Download confirmation modal */}
      <ConfirmationModal
        isOpen={showDownloadConfirm}
        onClose={() => setShowDownloadConfirm(false)}
        onConfirm={confirmDownload}
        title="Download All Chapters?"
        message={`Download all ${chaptersToDownload.length} chapters of "${entry.title}"?`}
        confirmText="Download"
        cancelText="Cancel"
        mascotImage={downloadMascot}
        variant="default"
      />
    </div>
  );
};

export default MangaCard;