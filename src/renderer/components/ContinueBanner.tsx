import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryStore } from "../store/libraryStore";
import { ChevronRightIcon, BookOpenIcon } from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import Spinner from "./Spinner";
import MangaCard from "./MangaCard";

interface ProgressWithPreview {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  page: number;
  updated: number;
  title?: string;
  chapterTitle?: string;
  previewUrl?: string;
  loading?: boolean;
}

const ContinueBanner: React.FC = () => {
  const [recentProgress, setRecentProgress] = useState<ProgressWithPreview[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const setSelectedSource = useLibraryStore((s) => s.setSelectedSource);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load recent progress and favorites
      const [progress, favs] = await Promise.all([
        (window as any).library.getRecentUniqueProgress() as Promise<ProgressWithPreview[]>,
        (window as any).library.listFavorites()
      ]);

      const recentItems = progress.map(p => ({ ...p, loading: true }));
      setRecentProgress(recentItems);
      setFavorites(favs.slice(0, 5)); // Show max 5 favorites

      // Fetch missing titles
      fetchMissingTitles(recentItems);
      // Load previews for recent items
      loadPreviews(recentItems);
    } finally {
      setLoading(false);
    }
  };

  const fetchMissingTitles = async (items: ProgressWithPreview[]) => {
    for (const item of items) {
      if (!item.title || item.title === "Unknown Manga") {
        try {
          // Fetch manga list to get title
          const mangaList = await window.repo.fetchMangaList(item.sourceId);
          const manga = mangaList.find((m: any) => m.id === item.mangaId);
          
          if (manga && manga.title) {
            // Update the title in our state
            setRecentProgress(prev => 
              prev.map(p => 
                p.mangaId === item.mangaId && p.sourceId === item.sourceId
                  ? { ...p, title: manga.title }
                  : p
              )
            );
            
            // Persist the title back to storage
            await (window as any).library.updateProgressTitle(item.sourceId, item.mangaId, manga.title);
          }
        } catch (error) {
          console.error("Failed to fetch title for", item.mangaId, error);
        }
      }

      // Fetch chapter title if missing
      if (!item.chapterTitle) {
        try {
          const chapters = await window.repo.fetchChapterList(item.sourceId, item.mangaId);
          const chap = chapters.find((c: any) => c.id === item.chapterId);
          if (chap) {
            setRecentProgress(prev =>
              prev.map(p =>
                p.chapterId === item.chapterId ? { ...p, chapterTitle: chap.title } : p
              )
            );
            // Persist chapter title
            await (window as any).library.saveProgress({
              sourceId: item.sourceId,
              mangaId: item.mangaId,
              chapterId: item.chapterId,
              page: item.page,
              title: item.title,
              chapterTitle: chap.title,
            });
          }
        } catch (err) {
          console.error("Failed to fetch chapter title", err);
        }
      }
    }
  };

  const loadPreviews = async (items: ProgressWithPreview[]) => {
    for (const item of items) {
      try {
        // Fetch the page URL for preview
        const pages = await window.repo.fetchPages(item.sourceId, item.chapterId);
        if (pages && pages[item.page]) {
          setRecentProgress(prev => 
            prev.map(p => 
              p.chapterId === item.chapterId 
                ? { ...p, previewUrl: pages[item.page].url, loading: false }
                : p
            )
          );
        } else {
          setRecentProgress(prev => 
            prev.map(p => 
              p.chapterId === item.chapterId 
                ? { ...p, loading: false }
                : p
            )
          );
        }
      } catch (error) {
        console.error("Failed to load preview for", item.title, error);
        setRecentProgress(prev => 
          prev.map(p => 
            p.chapterId === item.chapterId 
              ? { ...p, loading: false }
              : p
          )
        );
      }
    }
  };

  const handleContinueReading = (item: ProgressWithPreview) => {
    // Set the source and manga in store to ensure proper context
    setSelectedSource(item.sourceId);
    setSelectedManga(item.mangaId);
    
    // Small delay to ensure store updates are processed
    setTimeout(() => {
      navigate(`/reader/${encodeURIComponent(item.chapterId)}?page=${item.page + 1}`);
    }, 50);
  };

  const handleFavoriteClick = (fav: any) => {
    setSelectedSource(fav.sourceId);
    setSelectedManga(fav.mangaId);
    navigate("/browse");
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-gray-800 rounded-lg">
        <div className="flex items-center gap-2 text-gray-400">
          <Spinner size={16} />
          <span>Loading reading history...</span>
        </div>
      </div>
    );
  }

  if (recentProgress.length === 0 && favorites.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Continue Reading Section */}
      {recentProgress.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4" />
            Continue Reading
          </h3>
          <div className="space-y-3">
            {recentProgress.map((item, index) => (
              <div
                key={`${item.chapterId}-${item.page}`}
                className={`flex items-center gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 cursor-pointer transition-all group ${
                  index === 0 ? 'ring-2 ring-blue-500/50' : ''
                }`}
                onClick={() => handleContinueReading(item)}
              >
                {/* Preview Thumbnail */}
                <div className="w-16 h-20 bg-gray-600 rounded overflow-hidden flex-shrink-0">
                  {item.loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Spinner size={16} />
                    </div>
                  ) : item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={`Page ${item.page + 1}`}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <BookOpenIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">
                    {item.title || "Unknown Manga"}
                  </p>
                  <p className="text-sm text-gray-400">
                    {item.chapterTitle ? `${item.chapterTitle} • ` : ""}Page {item.page + 1} • {formatTimeAgo(item.updated)}
                  </p>
                </div>

                {/* Action */}
                <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <HeartIcon className="w-4 h-4 text-pink-400" />
            Favorites
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {favorites.map((fav) => (
              <div
                key={`${fav.sourceId}-${fav.mangaId}`}
                onClick={() => handleFavoriteClick(fav)}
                className="flex-shrink-0"
              >
                <MangaCard
                  entry={{
                    sourceId: fav.sourceId,
                    mangaId: fav.mangaId,
                    title: fav.title,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContinueBanner; 