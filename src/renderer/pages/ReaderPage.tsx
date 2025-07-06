import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useLibraryStore } from "../store/libraryStore";
import { useFinishedStore } from "../store/finishedStore";
import { useReaderSettingsStore } from "../store/readerSettingsStore";
import ReaderSidebar from "../components/ReaderSidebar";
import ReaderToolbar from "../components/ReaderToolbar";
import ReaderProgress from "../components/ReaderProgress";
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
import { usePageProgress } from "../hooks/usePageProgress";
import { useReadingTracker } from "../hooks/useReadingTracker";
// @ts-ignore - PNG import handled by Vite's asset pipeline
import loadingMascot from "../../assets/icons/extras/loading.png";

const ReaderPage: React.FC = () => {
  const { chapterId: encodedChapterId, mangaId } = useParams();
  const chapterId = encodedChapterId ? decodeURIComponent(encodedChapterId) : undefined;
  const [searchParams] = useSearchParams();
  const initialPage = parseInt(searchParams.get("page") || "1", 10) - 1;
  const [currentIdx, setCurrentIdx] = useState(initialPage >= 0 ? initialPage : 0);
  const selectedSource = useLibraryStore((s) => s.selectedSource);
  const pages = useLibraryStore((s) => s.pages);
  const setPages = useLibraryStore((s) => s.setPages);
  const mangas = useLibraryStore((s) => s.mangas);
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const mangaMeta = useMemo(() => mangas.find((m: any) => m.id === selectedManga), [mangas, selectedManga]);
  const libApi = (window as any).library;
  const navigate = useNavigate();
  const { addFinished } = useFinishedStore();
  const chapters = useLibraryStore((s) => s.chapters);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const chapter = useMemo(() => chapters.find((c: any) => c.id === chapterId), [chapters, chapterId]);
  const effectiveMangaId = selectedManga ?? mangaId;
  const firstPageUrl = pages && pages.length > 0 ? pages[0].url : undefined;
  const { trackPageChange } = useReadingTracker({
    sourceId: selectedSource,
    mangaId: effectiveMangaId,
    chapterId,
    title: mangaMeta?.title,
    coverUrl: mangaMeta?.coverUrl ?? firstPageUrl,
  });

  // Add loading state and error handling
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isLoadingPages, setIsLoadingPages] = useState(true);

  // Reader settings
  const { getSettings, setMangaSetting } = useReaderSettingsStore();
  const settings = getSettings(selectedManga);
  
  // UI state
  const [mode, setMode] = useState<"scroll" | "paged">(settings.mode);
  const [spread, setSpread] = useState(settings.spread);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(settings.zoom);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Auto-scroll
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State to track if we've fetched manga metadata
  const [hasFetchedMeta, setHasFetchedMeta] = useState(false);

  // Update settings when they change
  const updateSetting = useCallback(<K extends keyof typeof settings>(
    key: K,
    value: typeof settings[K]
  ) => {
    if (selectedManga) {
      setMangaSetting(selectedManga, key, value);
    }
  }, [selectedManga, setMangaSetting]);

  // Sync local state with settings
  useEffect(() => {
    const newSettings = getSettings(selectedManga);
    setMode(newSettings.mode);
    setSpread(newSettings.spread);
    setZoom(newSettings.zoom);
  }, [selectedManga, getSettings]);

  // Persist progress whenever currentIdx changes
  useEffect(() => {
    if (!selectedSource || !effectiveMangaId || !chapterId) return;

    // Persist progress once we know the title (optional but nice-to-have)
    if (mangaMeta?.title) {
      const chapMeta = chapters.find((c: any) => c.id === chapterId);
      libApi.saveProgress({
        sourceId: selectedSource,
        mangaId: effectiveMangaId,
        chapterId,
        page: currentIdx,
        title: mangaMeta.title,
        chapterTitle: chapMeta?.title ?? "",
      });
    }

    // Always record reading progress to statistics
    trackPageChange(1);
  }, [currentIdx, selectedSource, effectiveMangaId, chapterId, mangaMeta?.title, chapters, trackPageChange]);

  // Fetch manga metadata if we don't have it
  useEffect(() => {
    if (!selectedSource || !selectedManga || hasFetchedMeta) return;
    if (mangaMeta?.title) {
      setHasFetchedMeta(true);
      return;
    }

    const fetchMeta = async () => {
      try {
        const mangaList = await window.repo.fetchMangaList(selectedSource);
        const manga = mangaList.find((m: any) => m.id === selectedManga);
        if (manga) {
          // Update the store with the fetched manga
          useLibraryStore.getState().setMangas(mangaList);
          setHasFetchedMeta(true);
        }
      } catch (error) {
        console.error("Failed to fetch manga metadata:", error);
      }
    };

    fetchMeta();
  }, [selectedSource, selectedManga, mangaMeta, hasFetchedMeta]);

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
    if (!chapterId) return;
    
    // Reset states when chapter changes
    setPages([]);
    setCurrentIdx(initialPage >= 0 ? initialPage : 0);
    setLoadingError(null);
    setIsLoadingPages(true);
    
    // Load pages with proper error handling
    const loadPages = async () => {
      try {
        // Local reading mode when mangaId param is present
        if (mangaId) {
          const filePaths: string[] = await (window as any).downloadedManga.getPages(mangaId, chapterId);
          if (!filePaths || filePaths.length === 0) {
            throw new Error("No pages found for this downloaded chapter.");
          }
          const pageObjs = filePaths.map((fp, idx) => {
            // For Electron apps, we need to use the file:// protocol correctly
            // On macOS/Linux, file paths start with /
            // On Windows, they start with C:\ or similar
            
            let fileUrl: string;
            
            // Check if it's a Windows path
            if (fp.match(/^[a-zA-Z]:\\/)) {
              // Windows path: C:\path\to\file
              // Convert to: file:///C:/path/to/file
              fileUrl = `file:///${fp.replace(/\\/g, '/')}`;
            } else {
              // Unix path: /path/to/file
              // Convert to: file:///path/to/file
              fileUrl = `file://${fp}`;
            }
            
            console.log(`Page ${idx + 1}: ${fileUrl}`); // Debug log
            return { index: idx, url: fileUrl };
          });
          setPages(pageObjs as any);
          setLoadingError(null);
          return;
        }

        // Online reading (default)
        // If source is not selected, try to get it from the URL or storage
        let source = selectedSource;
        if (!source) {
          // Try to get from recent progress
          const history = await libApi.listHistory();
          const recentItem = history.find((h: any) => h.chapterId === chapterId);
          if (recentItem) {
            source = recentItem.sourceId;
            useLibraryStore.getState().setSelectedSource(source);
            useLibraryStore.getState().setSelectedManga(recentItem.mangaId);
          }
        }
        
        if (!source) {
          throw new Error("Source not found. Please navigate from the browse page.");
        }
        
        const p = await window.repo.fetchPages(source, chapterId);
        if (!p || p.length === 0) {
          throw new Error("No pages found for this chapter.");
        }
        
        setPages(p as any[]);
        setLoadingError(null);
      } catch (error: any) {
        console.error("Failed to load pages:", error);
        setLoadingError(error.message || "Failed to load pages. Please try again.");
      } finally {
        setIsLoadingPages(false);
      }
    };
    
    loadPages();
  }, [chapterId, setPages, libApi, initialPage]);

  // Keyboard navigation in paged mode
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (mode !== "paged" || pages.length === 0) return;
      
      const step = spread ? 2 : 1;
      const isRTL = settings.readingDirection === "rtl";
      
      if (e.key === "ArrowRight" || e.key === "d") {
        if (isRTL) {
          setCurrentIdx((i) => Math.max(i - step, 0));
        } else {
          setCurrentIdx((i) => Math.min(i + step, pages.length - 1));
        }
      } else if (e.key === "ArrowLeft" || e.key === "a") {
        if (isRTL) {
          setCurrentIdx((i) => Math.min(i + step, pages.length - 1));
        } else {
          setCurrentIdx((i) => Math.max(i - step, 0));
        }
      } else if (e.key === "ArrowDown") {
        setCurrentIdx((i) => Math.min(i + step, pages.length - 1));
      } else if (e.key === "ArrowUp") {
        setCurrentIdx((i) => Math.max(i - step, 0));
      }
    },
    [mode, pages, spread, settings.readingDirection]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const isLoading = isLoadingPages || (pages.length === 0 && !loadingError);

  // fullscreen helper
  const toggleFull = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFull(false);
    } else {
      document.documentElement.requestFullscreen().then(() => setFull(true));
    }
  };

  // mark finished when reaching end
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!chapterId) return;
    // load finished store to see if already marked
    window.finishedChapters.isFinished(chapterId).then((done) => setMarked(done));
  }, [chapterId]);

  useEffect(() => {
    if (marked) return;
    if (pages.length === 0) return;

    const checkFinished = () => {
      if (mode === "scroll") {
        // check scroll bottom
        const el = document.documentElement;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
          markIt();
        }
      } else {
        // paged mode: check if currentIdx is last page
        const lastIdx = pages.length - 1;
        if (currentIdx >= lastIdx || (spread && currentIdx + 1 >= lastIdx)) {
          markIt();
        }
      }
    };

    const markIt = () => {
      if (!chapterId) return;
      setMarked(true);
      window.finishedChapters.mark(chapterId);
      addFinished(chapterId);
    };

    if (mode === "scroll") {
      window.addEventListener("scroll", checkFinished);
      return () => window.removeEventListener("scroll", checkFinished);
    } else {
      checkFinished();
    }
  }, [mode, currentIdx, pages, spread, marked, chapterId, addFinished]);

  const currentChapIndex = chapters.findIndex((c: any) => c.id === chapterId);
  const nextChap = currentChapIndex >= 0 ? chapters[currentChapIndex + 1] : undefined;

  // Auto-scroll effect
  useEffect(() => {
    if (settings.autoScroll && mode === "scroll") {
      autoScrollIntervalRef.current = setInterval(() => {
        window.scrollBy(0, settings.autoScrollSpeed / 10);
      }, 100);
    } else {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    }

    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [settings.autoScroll, settings.autoScrollSpeed, mode]);

  // Calculate image style with filters
  const getImageStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {};
    
    // Apply fit mode
    if (settings.fitMode === "width") {
      style.width = "100%";
      style.height = "auto";
    } else if (settings.fitMode === "height") {
      style.width = "auto";
      style.height = "calc(100vh - 100px)";
    } else {
      style.width = `${zoom * 100}%`;
    }
    
    // Apply filters
    style.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
    
    return style;
  };

  // Handle mode change
  const handleModeChange = (newMode: "scroll" | "paged") => {
    setMode(newMode);
    updateSetting("mode", newMode);
  };

  // Handle spread change
  const handleSpreadChange = (newSpread: boolean) => {
    setSpread(newSpread);
    updateSetting("spread", newSpread);
  };

  // Handle zoom change
  const handleZoomChange = (newZoom: number) => {
    const rounded = Number(newZoom.toFixed(2));
    setZoom(rounded);
    updateSetting("zoom", rounded);
  };

  // Keep currentIdx in sync while users scroll
  usePageProgress({
    mode,
    pages,
    onChange: setCurrentIdx,
    root: containerRef.current ?? undefined,
  });

  // Patch stored progress title when we finally know it
  useEffect(() => {
    if (!selectedSource || !selectedManga) return;
    const title = mangaMeta?.title;
    if (!title) return;
    libApi.updateProgressTitle(selectedSource, selectedManga, title);
  }, [selectedSource, selectedManga, mangaMeta?.title]);

  // Ensure the most recent progress is flushed once when the component unmounts
  useEffect(() => {
    return () => {
      if (!selectedSource || !selectedManga || !chapterId || !mangaMeta?.title) return;
      const chapMeta = chapters.find((c: any) => c.id === chapterId);
      libApi.saveProgress({
        sourceId: selectedSource,
        mangaId: selectedManga,
        chapterId,
        page: currentIdx,
        title: mangaMeta.title,
        chapterTitle: chapMeta?.title ?? "",
      });
    };
  }, [selectedSource, selectedManga, chapterId, currentIdx, mangaMeta, chapters]);

  const [bookmark, setBookmark] = useState<any | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Load bookmark for this manga
  useEffect(() => {
    if (!selectedSource || !selectedManga) return;
    window.bookmarks.get(selectedSource, selectedManga).then((bk: any) => {
      setBookmark(bk);
      setIsBookmarked(!!bk && bk.chapterId === chapterId);
    });
  }, [selectedSource, selectedManga, chapterId]);

  const toggleBookmark = async () => {
    if (!selectedSource || !selectedManga || !chapterId) return;

    if (isBookmarked) {
      await window.bookmarks.remove(selectedSource, selectedManga);
      setBookmark(null);
      setIsBookmarked(false);
    } else {
      const chapMeta = chapters.find((c: any) => c.id === chapterId);
      const entry = {
        sourceId: selectedSource,
        mangaId: selectedManga,
        chapterId,
        page: currentIdx,
        chapterTitle: chapMeta?.title ?? "",
      };
      await window.bookmarks.set(entry);
      setBookmark(entry);
      setIsBookmarked(true);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto">
      {/* Splash while loading */}
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="text-center flex flex-col items-center">
            <img src={loadingMascot} alt="Loading" className="w-24 h-24 mb-4 animate-bounce" />
            <p className="text-white text-lg animate-pulse mb-2">Loading pages…</p>
            <p className="text-gray-400 text-sm">Please wait...</p>
          </div>
        </div>
      )}
      
      {/* Error state */}
      {loadingError && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md text-center">
            <p className="text-red-400 mb-4">{loadingError}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Reload
              </button>
              <button
                onClick={() => navigate("/browse")}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                Back to Browse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Indicator */}
      {!isLoading && !loadingError && (
        <ReaderProgress
          mode={mode}
          currentPage={currentIdx}
          totalPages={pages.length}
          containerRef={containerRef}
        />
      )}

      {/* Chapter Sidebar */}
      {showSidebar && chapterId && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-35"
            onClick={() => setShowSidebar(false)}
          />
          <ReaderSidebar
            currentChapterId={chapterId}
            onClose={() => setShowSidebar(false)}
          />
        </>
      )}

      {/* Page content */}
      {mode === "scroll" ? (
        <div className="p-4 flex flex-col items-center gap-4">
          {settings.readingDirection === "rtl" && pages.slice().reverse().map((pg: any) => (
            <img
              key={pg.index}
              src={pg.url}
              alt={`Page ${pg.index + 1}`}
              className="max-w-none"
              style={getImageStyle()}
              id={`page-${pg.index}`}
              data-idx={pg.index}
              loading="lazy"
            />
          ))}
          {settings.readingDirection === "ltr" && pages.map((pg: any) => (
            <img
              key={pg.index}
              src={pg.url}
              alt={`Page ${pg.index + 1}`}
              className="max-w-none"
              style={getImageStyle()}
              id={`page-${pg.index}`}
              data-idx={pg.index}
              loading="lazy"
            />
          ))}
        </div>
      ) : (
        <div className={`flex ${settings.readingDirection === "rtl" ? "flex-row-reverse" : "flex-row"} justify-center items-center p-4 gap-4 min-h-screen`}>
          {pages[currentIdx] && (
            <img
              src={pages[currentIdx].url}
              alt={`Page ${currentIdx + 1}`}
              className="max-w-none"
              style={getImageStyle()}
            />
          )}
          {spread && pages[currentIdx + 1] && (
            <img
              src={pages[currentIdx + 1].url}
              alt={`Page ${currentIdx + 2}`}
              className="max-w-none"
              style={getImageStyle()}
            />
          )}
        </div>
      )}

      {/* New Enhanced Toolbar */}
      {!isLoading && !loadingError && (
        <ReaderToolbar
          mode={mode}
          spread={spread}
          zoom={zoom}
          currentPage={currentIdx}
          totalPages={pages.length}
          isFavorite={isFav}
          isFullscreen={full}
          nextChapter={nextChap}
          settings={settings}
          onModeChange={handleModeChange}
          onSpreadChange={handleSpreadChange}
          onZoomChange={handleZoomChange}
          onPageChange={setCurrentIdx}
          onToggleFavorite={toggleFav}
          onToggleFullscreen={toggleFull}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onToggleSettings={() => {}}
          onNavigateChapter={(id) => navigate(`/reader/${encodeURIComponent(id)}`)}
          onSettingChange={updateSetting}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
        />
      )}
    </div>
  );
};

export default ReaderPage;