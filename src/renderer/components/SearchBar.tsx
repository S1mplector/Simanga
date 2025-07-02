import React from "react";
import { useLibraryStore } from "../store/libraryStore";

const SearchBar: React.FC = () => {
  const search = useLibraryStore((s) => s.search);
  const setSearch = useLibraryStore((s) => s.setSearch);

  return (
    <input
      type="text"
      placeholder="Search manga..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="w-full px-2 py-1 mb-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none"
    />
  );
};

export default SearchBar; 