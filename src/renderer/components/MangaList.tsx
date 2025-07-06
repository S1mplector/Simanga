import React from "react";
import { useLibraryStore } from "../store/libraryStore";
import MangaPreview from "./MangaPreview";
import Spinner from "./Spinner";
import { useReadingList } from "../store/readingListStore";
import MangaCard from "./MangaCard";
import { Squares2X2Icon, Bars3Icon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import MangaListRow from "./MangaListRow";

const MangaList: React.FC = () => {
  const mangas = useLibraryStore((s) => s.mangas);
  const loading = useLibraryStore((s) => s.loadingMangas);
  const search = useLibraryStore((s) => s.search).toLowerCase();
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);
  
  const currentPage = useLibraryStore((s) => s.currentPage);
  const itemsPerPage = useLibraryStore((s) => s.itemsPerPage);
  const setCurrentPage = useLibraryStore((s) => s.setCurrentPage);

  const selectedSource = useLibraryStore((s) => s.selectedSource);

  const { setReading, setPlan, setFinished } = useReadingList();

  const [preview, setPreview] = React.useState<{
    mangaId: string;
    title: string;
    pos: { x: number; y: number };
  } | null>(null);
  const hoverTimer = React.useRef<any>();

  const viewMode = useLibraryStore((s) => s.viewMode);
  const setViewMode = useLibraryStore((s) => s.setViewMode);
  const sortKey = useLibraryStore((s) => s.sortKey);
  const setSortKey = useLibraryStore((s) => s.setSortKey);

  const handleEnter = (e: React.MouseEvent, m: any) => {
    clearTimeout(hoverTimer.current);
    const { clientX: x, clientY: y } = e;
    hoverTimer.current = setTimeout(() => {
      setPreview({ mangaId: m.id, title: m.title, pos: { x, y } });
    }, 300);
  };

  const handleLeave = () => {
    clearTimeout(hoverTimer.current);
    setPreview(null);
  };

  let filtered = mangas.filter((m) => {
    const query = search.trim();
    return query.length === 0 || m.title.toLowerCase().includes(query);
  });

  if (sortKey === "title-asc") {
    filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortKey === "title-desc") {
    filtered = filtered.sort((a, b) => b.title.localeCompare(a.title));
  }

  // Calculate pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filtered.slice(startIndex, endIndex);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  React.useEffect(() => {
    (async () => {
      const [r, p, f] = await Promise.all([
        window.readingList.listByStatus("reading"),
        window.readingList.listByStatus("plan"),
        window.readingList.listByStatus("finished"),
      ]);
      setReading(r as any);
      setPlan(p as any);
      setFinished(f as any);
    })();
  }, [setReading, setPlan, setFinished]);

  if (!filtered.length && !loading) return <p className="text-gray-400">No results</p>;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">
          Manga List {totalItems > 0 && <span className="text-sm font-normal text-gray-400">({totalItems} total)</span>}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
            className="bg-gray-800 text-gray-100 text-xs rounded px-1 py-0.5"
          >
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
          </select>
          <button onClick={() => setViewMode("list")} className={`p-1 ${viewMode === "list" ? "bg-gray-700" : ""} rounded`}><Bars3Icon className="w-4 h-4" /></button>
          <button onClick={() => setViewMode("grid")} className={`p-1 ${viewMode === "grid" ? "bg-gray-700" : ""} rounded`}><Squares2X2Icon className="w-4 h-4" /></button>
        </div>
      </div>
      
      {loading && (
        <p className="flex items-center text-gray-400">
          <Spinner size={14} /> Loading...
        </p>
      )}
      
      {viewMode === "list" ? (
        <ul>
          {paginatedItems.map((m) => (
            <MangaListRow
              key={m.id}
              manga={m}
              sourceId={selectedSource!}
              selected={selectedManga === m.id}
              onClick={() => setSelectedManga(m.id)}
              onMouseEnter={(ev) => handleEnter(ev, m)}
              onMouseLeave={handleLeave}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-4">
          {paginatedItems.map((m) => (
            <MangaCard
              key={m.id}
              entry={{ sourceId: selectedSource!, mangaId: m.id, title: m.title }}
              onClick={() => setSelectedManga(m.id)}
            />
          ))}
        </div>
      )}
      
      {preview && selectedSource && (
        <MangaPreview
          key={preview.mangaId}
          sourceId={selectedSource}
          mangaId={preview.mangaId}
          title={preview.title}
          pos={preview.pos}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

export default MangaList; 