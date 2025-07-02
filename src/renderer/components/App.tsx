import React, { useEffect } from "react";
import SourceSelect from "./SourceSelect";
import MangaList from "./MangaList";
import SearchBar from "./SearchBar";
import LanguageSelect from "./LanguageSelect";
import ChapterList from "./ChapterList";
import { useLibraryStore } from "../store/libraryStore";
import type { Manga } from "@/models";
import ContinueBanner from "./ContinueBanner";

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

  // Track the last initiated request so we can ignore stale results.
  const lastRequestIdRef = React.useRef<number>(0);

  useEffect(() => {
    window.repo.listSources().then(setSources);
  }, [setSources]);

  // when source changes, load manga list
  useEffect(() => {
    if (!selectedSource) return;

    const term = search.trim();
    const requestId = Date.now();
    lastRequestIdRef.current = requestId;

    setLoadingMangas(true);

    window.repo
      .fetchMangaList(selectedSource, term)
      .then((data) => {
        // Only apply the result if it's from the latest request
        if (lastRequestIdRef.current === requestId) {
          setMangas(data as Manga[]);
        }
      })
      .finally(() => {
        if (lastRequestIdRef.current === requestId) {
          setLoadingMangas(false);
        }
      });
  }, [selectedSource, search, setMangas, setLoadingMangas]);

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
    <div className="p-4 flex gap-4">
      <div className="w-2/5">
        <h2 className="text-xl font-semibold mb-2">Browse</h2>
        <ContinueBanner />
        <SourceSelect />
        <div className="flex gap-2 items-center">
          <SearchBar />
          <LanguageSelect />
        </div>
        <MangaList />
      </div>
      <div className="flex-1">
        <ChapterList />
      </div>
    </div>
  );
};

export default App; 