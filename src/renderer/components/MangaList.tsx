import React from "react";
import { useLibraryStore } from "../store/libraryStore";
import MangaPreview from "./MangaPreview";
import Spinner from "./Spinner";

const MangaList: React.FC = () => {
  const mangas = useLibraryStore((s) => s.mangas);
  const loading = useLibraryStore((s) => s.loadingMangas);
  const search = useLibraryStore((s) => s.search).toLowerCase();
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);

  const selectedSource = useLibraryStore((s) => s.selectedSource);

  const [preview, setPreview] = React.useState<{
    mangaId: string;
    title: string;
    pos: { x: number; y: number };
  } | null>(null);
  const hoverTimer = React.useRef<any>();

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

  const filtered = mangas.filter((m) => {
    const query = search.trim();
    return query.length === 0 || m.title.toLowerCase().includes(query);
  });

  if (!filtered.length && !loading) return <p className="text-gray-400">No results</p>;

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Manga List</h3>
      {loading && (
        <p className="flex items-center text-gray-400">
          <Spinner size={14} /> Loading...
        </p>
      )}
      <ul>
        {filtered.map((m) => (
          <li
            key={m.id}
            onClick={() => setSelectedManga(m.id)}
            onMouseEnter={(ev) => handleEnter(ev, m)}
            onMouseLeave={handleLeave}
            className={`cursor-pointer hover:text-sky-300 ${selectedManga === m.id ? "text-blue-400" : ""}`}
          >
            {m.title}
          </li>
        ))}
      </ul>
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