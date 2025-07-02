import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useLibraryStore } from "../store/libraryStore";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  Squares2X2Icon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolid } from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";

const ReaderPage: React.FC = () => {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const initialPage = parseInt(searchParams.get("page") || "1", 10) - 1;
  const [currentIdx, setCurrentIdx] = useState(initialPage >= 0 ? initialPage : 0);
  const selectedSource = useLibraryStore((s) => s.selectedSource);
  const pages = useLibraryStore((s) => s.pages);
  const setPages = useLibraryStore((s) => s.setPages);
  const mangas = useLibraryStore((s) => s.mangas);
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const mangaMeta = mangas.find((m: any) => m.id === selectedManga);
  const libApi = (window as any).library;

  // UI mode state
  const [mode, setMode] = useState<"scroll" | "paged">("scroll");
  const [spread, setSpread] = useState(false);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = 100%

  // Persist progress whenever currentIdx changes
  useEffect(() => {
    if (!selectedSource || !selectedManga || !chapterId) return;
    libApi.saveProgress({
      sourceId: selectedSource,
      mangaId: selectedManga,
      chapterId,
      page: currentIdx,
      title: mangaMeta?.title ?? "",
    });
  }, [currentIdx, selectedSource, selectedManga, chapterId, mangaMeta]);

  const [isFav, setIsFav] = useState(false);

  // load fav state on mount or when ids change
  useEffect(() => {
    if (!selectedSource || !selectedManga) return;
    libApi.listFavorites().then((favs: any[]) => {
      setIsFav(favs.some((f) => f.sourceId === selectedSource && f.mangaId === selectedManga));
    });
  }, [selectedSource, selectedManga]);

  const toggleFav = () => {
    if (!selectedSource || !selectedManga) return;
    libApi.toggleFavorite({
      sourceId: selectedSource,
      mangaId: selectedManga,
      title: mangaMeta?.title ?? "",
    }).then((favs: any[]) => {
      setIsFav(favs.some((f: any) => f.sourceId === selectedSource && f.mangaId === selectedManga));
    });
  };

  useEffect(() => {
    if (!selectedSource || !chapterId) return;
    setPages([]);
    setCurrentIdx(0);
    window.repo.fetchPages(selectedSource, chapterId).then((p) => setPages(p as any[]));
  }, [selectedSource, chapterId, setPages]);

  // Keyboard navigation in paged mode
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (mode !== "paged" || pages.length === 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "d") {
        setCurrentIdx((i) => Math.min(i + (spread ? 2 : 1), pages.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "a") {
        setCurrentIdx((i) => Math.max(i - (spread ? 2 : 1), 0));
      }
    },
    [mode, pages, spread]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const isLoading = pages.length === 0;

  // fullscreen helper
  const toggleFull = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFull(false);
    } else {
      document.documentElement.requestFullscreen().then(() => setFull(true));
    }
  };

  return (
    <div className="relative w-full h-full overflow-auto">
      {/* Splash while loading */}
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-20">
          <p className="text-white text-lg animate-pulse">Loading pages…</p>
        </div>
      )}

      {/* Page content */}
      {mode === "scroll" ? (
        <div className="p-4 flex flex-col items-center gap-4">
          {pages.map((pg: any) => (
            <img
              key={pg.index}
              src={pg.url}
              alt={`Page ${pg.index + 1}`}
              className="max-w-none"
              style={{ width: `${zoom * 100}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center p-4 gap-4">
          {pages[currentIdx] && (
            <img
              src={pages[currentIdx].url}
              alt={`Page ${currentIdx + 1}`}
              className="max-w-none"
              style={{ width: `${zoom * 100}%` }}
            />
          )}
          {spread && pages[currentIdx + 1] && (
            <img
              src={pages[currentIdx + 1].url}
              alt={`Page ${currentIdx + 2}`}
              className="max-w-none"
              style={{ width: `${zoom * 100}%` }}
            />
          )}
        </div>
      )}

      {/* Bottom-center toolbar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-gray-800/40 hover:bg-gray-800/90 backdrop-blur-sm flex items-center gap-4 transition-colors">
        <label className="flex items-center gap-1 text-gray-200 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={mode === "scroll"}
            onChange={(e) => setMode(e.target.checked ? "scroll" : "paged")}
          />
          Scroll
        </label>

        {/* Spread toggle - only in paged mode */}
        {mode === "paged" && (
          <button
            className={`p-1 rounded hover:bg-gray-700 ${spread ? "bg-gray-700" : ""}`}
            onClick={() => setSpread((v) => !v)}
          >
            <Squares2X2Icon className="h-5 w-5 text-white" />
          </button>
        )}

        {/* Fullscreen toggle */}
        <button className="p-1 rounded hover:bg-gray-700" onClick={toggleFull}>
          {full ? (
            <ArrowsPointingInIcon className="h-5 w-5 text-white" />
          ) : (
            <ArrowsPointingOutIcon className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Favorite toggle */}
        <button className="p-1" onClick={toggleFav}>
          {isFav ? (
            <HeartSolid className="h-5 w-5 text-red-500" />
          ) : (
            <HeartOutline className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
            disabled={zoom <= 0.5}
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5 text-white" />
          </button>
          <span className="text-xs text-gray-200 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
            disabled={zoom >= 3}
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5 text-white" />
          </button>
        </div>

        {mode === "paged" && (
          <div className="flex items-center gap-2">
            <button
              className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
              onClick={() => setCurrentIdx((i) => Math.max(i - (spread ? 2 : 1), 0))}
              disabled={currentIdx === 0}
            >
              <ChevronLeftIcon className="h-5 w-5 text-white" />
            </button>
            <span className="text-gray-100 text-xs">
              {currentIdx + 1}/{pages.length || 0}
            </span>
            <button
              className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
              onClick={() => setCurrentIdx((i) => Math.min(i + (spread ? 2 : 1), pages.length - 1))}
              disabled={currentIdx >= pages.length - 1}
            >
              <ChevronRightIcon className="h-5 w-5 text-white" />
            </button>
            {/* Page slider */}
            <input
              type="range"
              min={1}
              max={pages.length || 1}
              step={spread ? 2 : 1}
              value={currentIdx + 1}
              onChange={(e) => setCurrentIdx(Math.min(parseInt(e.target.value, 10) - 1, pages.length - 1))}
              className="h-1 w-40 bg-gray-600 rounded-lg cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReaderPage; 