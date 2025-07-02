import React from "react";
import { useLibraryStore } from "../store/libraryStore";

const SourceSelect: React.FC = () => {
  const sources = useLibraryStore((s) => s.sources);
  const selected = useLibraryStore((s) => s.selectedSource);
  const setSelected = useLibraryStore((s) => s.setSelectedSource);

  return (
    <select
      value={selected ?? ""}
      onChange={(e) => setSelected(e.target.value)}
      className="bg-black text-white px-2 py-1 rounded"
    >
      <option value="" disabled>
        Select source...
      </option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
};

export default SourceSelect; 