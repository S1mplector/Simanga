import React, { useEffect, useState } from "react";
import { useLibraryStore } from "../store/libraryStore";

interface TagOption {
  id: string;
  name: string;
}

const TagSelect: React.FC = () => {
  const selectedSource = useLibraryStore((s) => s.selectedSource);
  const selectedTags = useLibraryStore((s) => s.selectedTags);
  const setSelectedTags = useLibraryStore((s) => s.setSelectedTags);

  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Only fetch tags when MangaDex selected
  useEffect(() => {
    if (selectedSource !== "mangadex") return;
    if (tags.length > 0 || loading) return;

    const fetchTags = async () => {
      try {
        setLoading(true);
        const res = await fetch("https://api.mangadex.org/manga/tag");
        if (!res.ok) throw new Error("Failed to fetch tags");
        const json = await res.json();
        if (Array.isArray(json.data)) {
          const options: TagOption[] = json.data.map((d: any) => {
            const nameObj = d.attributes?.name || {};
            const name = nameObj.en || Object.values(nameObj)[0] || d.id;
            return { id: d.id, name };
          }).sort((a: TagOption, b: TagOption) => a.name.localeCompare(b.name));
          setTags(options);
        }
      } catch (err) {
        console.error("Failed to load MangaDex tags", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, [selectedSource, tags.length, loading]);

  if (selectedSource !== "mangadex") return null;

  return (
    <select
      value={selectedTags[0] ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        setSelectedTags(val ? [val] : []);
      }}
      className="px-2 py-1 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none text-sm"
      disabled={loading || tags.length === 0}
    >
      <option value="">All tags</option>
      {tags.map((t) => (
        <option key={t.id} value={t.name}>
          {t.name}
        </option>
      ))}
    </select>
  );
};

export default TagSelect; 