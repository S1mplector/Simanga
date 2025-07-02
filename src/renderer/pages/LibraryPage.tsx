import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserLibrary } from "../store/userLibraryStore";
import { useLibraryStore } from "../store/libraryStore";

function timeAgo(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.MAX_SAFE_INTEGER, "year"],
  ];
  let count = delta;
  let unit = "second";
  for (const [step, name] of units) {
    if (count < step) break;
    count = Math.floor(count / step);
    unit = name;
  }
  return `${count} ${unit}${count !== 1 ? "s" : ""} ago`;
}

const LibraryPage: React.FC = () => {
  const favorites = useUserLibrary((s) => s.favorites);
  const history = useUserLibrary((s) => s.history);
  const setFavorites = useUserLibrary((s) => s.setFavorites);
  const setHistory = useUserLibrary((s) => s.setHistory);
  const navigate = useNavigate();
  const setSelectedSource = useLibraryStore((s) => s.setSelectedSource);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);

  useEffect(() => {
    (async () => {
      const favs = await (window as any).library.listFavorites();
      const hist = await (window as any).library.listHistory();
      setFavorites(favs);
      setHistory(hist);
    })();
  }, [setFavorites, setHistory]);

  return (
    <div className="p-4 space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-2">Favorites</h2>
        {favorites.length === 0 && <p className="text-gray-400">No favorites yet.</p>}
        <ul className="ml-1 space-y-1">
          {favorites.map((f) => (
            <li
              key={`${f.sourceId}-${f.mangaId}`}
              className="flex items-center gap-2 hover:text-blue-400"
            >
              <span className="flex-1 cursor-default">{f.title}</span>
              <button
                title="Remove from favorites"
                className="text-red-400 hover:text-red-600"
                onClick={async () => {
                  await (window as any).library.toggleFavorite(f);
                  const updated = await (window as any).library.listFavorites();
                  setFavorites(updated);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Recently Read</h2>
        {history.length === 0 && <p className="text-gray-400">Nothing read yet.</p>}
        <ul className="ml-1 space-y-1">
          {history.map((h) => (
            <li
              key={`${h.chapterId}-${h.page}`}
              className="flex items-center gap-2 hover:text-blue-400 cursor-pointer"
              onClick={() => {
                setSelectedSource(h.sourceId);
                setSelectedManga(h.mangaId);
                navigate(`/reader/${h.chapterId}?page=${h.page}`);
              }}
            >
              <span className="flex-1 line-clamp-1">{h.title ?? h.mangaId}</span>
              <span className="text-xs text-gray-400">{timeAgo(h.updated)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default LibraryPage; 