import React from "react";
import { XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useLibraryStore } from "../store/libraryStore";
import { useFinishedStore } from "../store/finishedStore";
import { useNavigate } from "react-router-dom";

interface ReaderSidebarProps {
  currentChapterId: string;
  onClose: () => void;
}

const ReaderSidebar: React.FC<ReaderSidebarProps> = ({ currentChapterId, onClose }) => {
  const chapters = useLibraryStore((s) => s.chapters);
  const navigate = useNavigate();
  const { finishedIds } = useFinishedStore();
  
  const currentIndex = chapters.findIndex((ch: any) => ch.id === currentChapterId);

  const handleChapterClick = (chapterId: string) => {
    navigate(`/reader/${encodeURIComponent(chapterId)}`);
    onClose();
  };

  return (
    <div className="fixed left-0 top-0 h-full w-80 bg-gray-900 z-40 overflow-hidden flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-lg">Chapters</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700 transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto">
        {chapters.map((chapter: any, index: number) => {
          const isFinished = finishedIds.includes(chapter.id);
          const isCurrent = chapter.id === currentChapterId;
          
          return (
            <button
              key={chapter.id}
              onClick={() => handleChapterClick(chapter.id)}
              className={`w-full text-left p-3 hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                isCurrent ? "bg-blue-900/30 border-l-4 border-blue-500" : ""
              }`}
            >
              <div className="flex-1">
                <p className={`${isCurrent ? "font-semibold text-blue-400" : ""}`}>
                  {chapter.title}
                </p>
                <p className="text-xs text-gray-500">
                  Chapter {index + 1} of {chapters.length}
                </p>
              </div>
              {isFinished && (
                <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
        {currentIndex >= 0 && (
          <p>Reading chapter {currentIndex + 1} of {chapters.length}</p>
        )}
      </div>
    </div>
  );
};

export default ReaderSidebar; 