import React, { useEffect, useState } from "react";
import DownloadButton from "./DownloadButton";
import ReadingStatusButtons from "./ReadingStatusButtons";
import type { DownloadJob } from "../../services/downloadManager";
import ConfirmationModal from "./ConfirmationModal";
// @ts-ignore - image asset
import downloadMascot from "../../assets/icons/extras/teehee.png";

interface Props {
  manga: { id: string; title: string };
  sourceId: string;
  selected: boolean;
  onClick: () => void;
  onMouseEnter?: (ev: React.MouseEvent<HTMLLIElement, MouseEvent>) => void;
  onMouseLeave?: () => void;
}

const MangaListRow: React.FC<Props> = ({
  manga,
  sourceId,
  selected,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [chaptersToDownload, setChaptersToDownload] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const refresh = async () => {
      const all = await (window as any).downloadedManga.getAll();
      if (!isMounted) return;
      const found = all.some(
        (m: any) => m.mangaId === manga.id && m.sourceId === sourceId
      );
      setIsDownloaded(found);
    };

    refresh();

    // Check active jobs
    (window as any).downloadManager
      .listJobs()
      .then((jobs: DownloadJob[]) => {
        if (!isMounted) return;
        const job = jobs.find(
          (j) => j.mangaId === manga.id && j.sourceId === sourceId
        );
        if (job) {
          setIsDownloading(job.status !== "completed" && job.status !== "failed");
          setProgress(job.progress);
        }
      });

    const handleUpdate = (job: DownloadJob) => {
      if (job.mangaId !== manga.id || job.sourceId !== sourceId) return;
      if (!isMounted) return;
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
    return () => {
      isMounted = false;
      (window as any).downloadManager.off("update", handleUpdate);
    };
  }, [manga.id, sourceId]);

  const handleDownload = async () => {
    try {
      const chapters = await window.repo.fetchChapterList(sourceId, manga.id);
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
      const pages = await window.repo.fetchPages(sourceId, chapter.id);
          if (!pages || pages.length === 0) continue;

      const job: Omit<DownloadJob, "progress" | "status"> = {
        id: `${chapter.id}`,
        sourceId,
        mangaId: manga.id,
        mangaTitle: manga.title,
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

  return (
    <li
      className={`group flex items-center justify-between cursor-pointer hover:text-sky-300 ${
        selected ? "text-blue-400" : ""
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="flex-1">{manga.title}</span>
      <div className="flex items-center gap-1 hidden group-hover:flex">
        {/* Download button visible on hover just like reading status buttons */}
        <DownloadButton
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          progress={progress}
          onClick={handleDownload}
          size="md"
        />
        <ReadingStatusButtons manga={manga} />
      </div>
      
      {/* Download confirmation modal */}
      <ConfirmationModal
        isOpen={showDownloadConfirm}
        onClose={() => setShowDownloadConfirm(false)}
        onConfirm={confirmDownload}
        title="Download All Chapters?"
        message={`Download all ${chaptersToDownload.length} chapters of "${manga.title}"?`}
        confirmText="Download"
        cancelText="Cancel"
        mascotImage={downloadMascot}
        variant="default"
      />
    </li>
  );
};

export default MangaListRow; 