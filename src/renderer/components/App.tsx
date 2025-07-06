import React, { useEffect } from "react";
import SourceSelect from "./SourceSelect";
import MangaList from "./MangaList";
import SearchBar from "./SearchBar";
import LanguageSelect from "./LanguageSelect";
import ChapterList from "./ChapterList";
import { useLibraryStore } from "../store/libraryStore";
import type { Manga } from "../../models/manga";
import ContinueBanner from "./ContinueBanner";
import CompactStatsWidget from "./CompactStatsWidget";
import useDebounce from "../hooks/useDebounce";
import TagSelect from "./TagSelect";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type MangaWithId = Manga & { id: string };

const App: React.FC = () => {
  const setSources = useLibraryStore((s) => s.setSources);
  const selectedSource = useLibraryStore((s) => s.selectedSource);
  const selectedManga = useLibraryStore((s: any) => s.selectedManga);
  const setMangas = useLibraryStore((s) => s.setMangas);
  const setLoadingMangas = useLibraryStore((s) => s.setLoadingMangas);
  const setChapters = useLibraryStore((s) => s.setChapters);
  const setLoadingChapters = useLibraryStore((s) => s.setLoadingChapters);
  const search = useLibraryStore((s) => s.search);
  const selectedTags = useLibraryStore((s) => s.selectedTags);
  const debouncedSearch = useDebounce(search, 300);
  const debouncedTags = useDebounce(selectedTags, 300);

  // Track the last initiated request so we can ignore stale results.
  const lastRequestIdRef = React.useRef<number>(0);

  useEffect(() => {
    window.repo.listSources().then(setSources);
  }, [setSources]);

  const reloadMangaList = () => {
    if (!selectedSource) return;

    const term = debouncedSearch.trim();
    const requestId = Date.now();
    lastRequestIdRef.current = requestId;

    setLoadingMangas(true);

    window.repo
      .fetchMangaList(selectedSource, term, debouncedTags)
      .then((data) => {
        if (lastRequestIdRef.current === requestId) {
          setMangas(data as Manga[]);
        }
      })
      .finally(() => {
        if (lastRequestIdRef.current === requestId) {
          setLoadingMangas(false);
        }
      });
  };

  useEffect(() => {
    reloadMangaList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource, debouncedSearch, debouncedTags]);

  // when manga selected, load chapters
  useEffect(() => {
    if (!selectedSource || !selectedManga) return;
    setLoadingChapters(true);
    window.repo
      .fetchChapterList(selectedSource, selectedManga)
      .then((chs) => setChapters(chs as any[]))
      .finally(() => setLoadingChapters(false));
  }, [selectedSource, selectedManga, setChapters, setLoadingChapters]);

  return (
    <div className="p-4 space-y-4">
      {/* Top section with widgets */}
      <div className="w-full">
        <h2 className="text-xl font-semibold mb-2">Browse</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
          <ContinueBanner />
          <CompactStatsWidget />
        </div>
        <div className="mb-3"><SourceSelect /></div>
        <div className="flex gap-2 items-center">
          <SearchBar />
          <TagSelect />
          <LanguageSelect />
          <button
            className="p-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100"
            title="Refresh list"
            onClick={reloadMangaList}
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lists section: Manga list + Vol/Chapter list */}
      <div className="flex gap-4 items-start">
        <div className="w-2/5">
          <MangaList />
        </div>
        <div className="flex-1">
          <ChapterList />
        </div>
      </div>
    </div>
  );
};

export default App; 