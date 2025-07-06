import React from "react";
import { BookmarkIcon } from "@heroicons/react/24/solid";

interface Props {
  /** Optional label used only for the tooltip (not rendered visibly). */
  label?: string;
  onClick: () => void;
}

const BookmarkToolbar: React.FC<Props> = ({ label, onClick }) => {
  return (
    <button
      className="flex items-center bg-yellow-600/80 hover:bg-yellow-600 text-black p-1 rounded w-full justify-center transition-colors"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={label || "Go to bookmark"}
    >
      <BookmarkIcon className="w-4 h-4" />
    </button>
  );
};

export default BookmarkToolbar; 