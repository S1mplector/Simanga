import React from "react";
import { useLibraryStore } from "../store/libraryStore";
import { useNavigate } from "react-router-dom";
import Spinner from "./Spinner";

const ChapterList: React.FC = () => {
  const chapters = useLibraryStore((s) => s.chapters);
  const loading = useLibraryStore((s) => s.loadingChapters);
  const selectedManga = useLibraryStore((s) => s.selectedManga);
  const setSelectedChapter = useLibraryStore((s) => s.setSelectedChapter);
  const navigate = useNavigate();

  if (!selectedManga) return <p className="text-gray-400">Select a manga to see chapters</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Chapters</h3>
      {loading && (
        <p className="flex items-center text-gray-400 mb-2">
          <Spinner size={14} /> Loading...
        </p>
      )}
      <ul className="max-h-[70vh] overflow-auto pr-2">
        {chapters.map((ch: any) => (
          <li key={ch.id} className="py-1 border-b border-gray-700 cursor-pointer hover:text-blue-400" onClick={() => { setSelectedChapter(ch.id); navigate(`/reader/${ch.id}`);} }>
            {ch.title || ch.id}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChapterList; 