import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownTrayIcon, FolderOpenIcon, TrashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import MangaCard from "../components/MangaCard";
import ChapterList from "../components/ChapterList";
import type { DownloadedManga, DownloadedChapter } from "../../services/downloadedManga";
import type { DownloadJob } from "../../services/downloadManager";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function DraggableJob({ job, index, onDragHandle, children, disabled }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: disabled ? undefined : "grab",
      }}
      {...attributes}
      {...listeners}
      className="bg-gray-800 rounded p-3 flex items-center gap-2"
    >
      {!disabled && (
        <span className="mr-2 cursor-grab text-gray-400" title="Drag to reorder">≡</span>
      )}
      {children}
    </div>
  );
}

const DownloadsPage: React.FC = () => {
  const [downloadedManga, setDownloadedManga] = useState<DownloadedManga[]>([]);
  const [activeJobs, setActiveJobs] = useState<DownloadJob[]>([]);
  const [selectedManga, setSelectedManga] = useState<DownloadedManga | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const navigate = useNavigate();
  const [queuedOrder, setQueuedOrder] = useState<string[]>([]);

  useEffect(() => {
    // On initial mount, run a rescan to sync with disk
    (async () => {
      setIsRescanning(true);
      try {
        // Sync downloaded manga with disk
        const list = await (window as any).downloadedManga.rescan();
        setDownloadedManga(list);
      } catch (error) {
        console.error("Failed to load downloaded manga:", error);
      } finally {
        setIsRescanning(false);
      }
    })();

    const handleUpdate = (job: DownloadJob) => {
      setActiveJobs((jobs) => {
        const index = jobs.findIndex((j) => j.id === job.id);
        if (index >= 0) {
          const newJobs = [...jobs];
          newJobs[index] = job;
          return newJobs;
        }
        return [...jobs, job];
      });
      // Don't update queue order here - it's managed by the drag and drop
      // The backend will maintain the correct order

      if (job.status === "completed" || job.status === "failed") {
        // Refresh manga list to include new chapters
        loadDownloadedManga();

        // Fade-out finished job then remove it
        setTimeout(() => {
          setActiveJobs((jobs) => jobs.filter((j) => j.id !== job.id));
        }, 600); // matches CSS transition duration
      }
    };

    (window as any).downloadManager.on("update", handleUpdate);

    return () => {
      (window as any).downloadManager.off("update", handleUpdate);
    };
  }, []);

  const loadDownloadedManga = async () => {
    const manga = await (window as any).downloadedManga.getAll();
    setDownloadedManga(manga);
  };

  const handleDeleteChapter = async (mangaId: string, chapterId: string) => {
    if (!confirm("Delete this downloaded chapter?")) return;
    
    await (window as any).downloadedManga.removeChapter(mangaId, chapterId);
    loadDownloadedManga();
    
    // Update selected manga if it's the one being modified
    if (selectedManga?.id === mangaId) {
      const updated = downloadedManga.find((m) => m.id === mangaId);
      if (updated && updated.chapters.length > 0) {
        setSelectedManga(updated);
      } else {
        setSelectedManga(null);
      }
    }
  };

  const handleViewChapter = (mangaId: string, chapterId: string) => {
    // Navigate to reader with local files
    navigate(`/reader/local/${mangaId}/${chapterId}`);
  };

  const openDownloadFolder = () => {
    (window as any).settings.openDownloadFolder();
  };

  const rescanDownloads = async () => {
    setIsRescanning(true);
    const list = await (window as any).downloadedManga.rescan();
    setDownloadedManga(list);
    setSelectedManga(null);
    setIsRescanning(false);
  };

  // Drag-and-drop handlers for queued jobs
  const queuedJobs = activeJobs.filter((j) => j.status === "queued");
  const runningJobs = activeJobs.filter((j) => j.status === "running");
  const onDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queuedOrder.indexOf(active.id);
    const newIndex = queuedOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(queuedOrder, oldIndex, newIndex);
    setQueuedOrder(newOrder);
    // Call backend to reorder
    (window as any).downloadManager.moveJob(active.id, newIndex);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Downloads</h2>
        <div className="flex gap-2">
          <button
            onClick={rescanDownloads}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isRescanning ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
          <button
            onClick={openDownloadFolder}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            <FolderOpenIcon className="w-4 h-4" />
            Open Folder
          </button>
        </div>
      </div>

      {/* Active Downloads */}
      {(runningJobs.length > 0 || queuedJobs.length > 0) && (
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-3">Active Downloads</h3>
          {/* Running job (not draggable) */}
          {runningJobs.map((job) => (
            <div key={job.id} className="bg-gray-800 rounded p-3 mb-2 opacity-90">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{job.mangaTitle}</span>
                <span className="text-xs text-gray-400">{job.chapter.title} ({job.downloadedCount}/{job.totalPages})</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      job.status === "failed" ? "bg-red-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${job.progress * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-12 text-right">
                  {Math.round(job.progress * 100)}%
                </span>
              </div>
              {job.error && (
                <p className="text-xs text-red-400 mt-1">{job.error}</p>
              )}
            </div>
          ))}
          {/* Draggable queued jobs */}
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={queuedOrder} strategy={verticalListSortingStrategy}>
              {queuedOrder.map((id, idx) => {
                const job = queuedJobs.find((j) => j.id === id);
                if (!job) return null;
                return (
                  <DraggableJob key={job.id} job={job} index={idx} disabled={false}>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{job.mangaTitle}</span>
                        <span className="text-xs text-gray-400">{job.chapter.title} ({job.downloadedCount}/{job.totalPages})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              job.status === "failed" ? "bg-red-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${job.progress * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-12 text-right">
                          {Math.round(job.progress * 100)}%
                        </span>
                      </div>
                      {job.error && (
                        <p className="text-xs text-red-400 mt-1">{job.error}</p>
                      )}
                    </div>
                  </DraggableJob>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Downloaded Manga */}
      <div className="flex gap-6">
        <div className="flex-1">
          <h3 className="text-lg font-medium mb-3">Downloaded Manga</h3>
          
          {downloadedManga.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ArrowDownTrayIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-lg">No downloaded manga yet</p>
              <p className="text-sm mt-1">Download manga from the browse page</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {downloadedManga.map((manga) => (
                <div 
                  key={manga.id} 
                  className={`cursor-pointer w-32 ${selectedManga?.id === manga.id ? 'ring-2 ring-blue-500 rounded ring-offset-2 ring-offset-gray-900' : ''}`}
                  onClick={() => setSelectedManga(manga)}
                >
                  <MangaCard
                    entry={{
                      sourceId: manga.sourceId,
                      mangaId: manga.mangaId,
                      title: manga.title,
                    }}
                  />
                  <p className="text-xs text-gray-400 text-center mt-1">
                    {manga.chapters.length} chapter{manga.chapters.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chapter List for Selected Manga */}
        {selectedManga && (
          <div className="w-96 bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-3">{selectedManga.title}</h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {selectedManga.chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="bg-gray-700 rounded p-3 flex items-center justify-between group hover:bg-gray-600 transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{chapter.title}</p>
                    <p className="text-xs text-gray-400">
                      {chapter.pageCount} pages • Downloaded {new Date(chapter.downloadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewChapter(selectedManga.id, chapter.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                    >
                      Read
                    </button>
                    <button
                      onClick={() => handleDeleteChapter(selectedManga.id, chapter.id)}
                      className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadsPage;