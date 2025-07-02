import React, { useEffect, useState } from "react";
import Spinner from "./Spinner";

interface Props {
  sourceId: string;
  mangaId: string;
  title: string;
  pos: { x: number; y: number };
  onClose: () => void;
}

const MangaPreview: React.FC<Props> = ({ sourceId, mangaId, title, pos, onClose }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const chaps: any[] = await window.repo.fetchChapterList(sourceId, mangaId);
        if (cancel || chaps.length === 0) return;
        const pages: any[] = await window.repo.fetchPages(sourceId, chaps[0].id);
        if (cancel || pages.length === 0) return;
        setThumb(pages[0].url);
        setLoading(false);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [sourceId, mangaId]);

  // auto dismiss after 5s in case of stuck
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  const style = {
    top: pos.y + 10,
    left: pos.x + 10,
  } as React.CSSProperties;

  return (
    <div
      style={style}
      className="fixed z-50 bg-gray-800 text-gray-100 p-2 rounded shadow-xl w-48 pointer-events-none"
    >
      <p className="text-sm font-semibold mb-2 line-clamp-2">{title}</p>
      {thumb ? (
        <img src={thumb} alt="preview" className="w-full h-auto rounded" />
      ) : (
        loading && (
          <p className="text-xs text-gray-400 flex items-center">
            <Spinner size={12} /> Loading...
          </p>
        )
      )}
    </div>
  );
};

export default MangaPreview; 