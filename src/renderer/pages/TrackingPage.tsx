import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReadingList } from "../store/readingListStore";
import { useLibraryStore } from "../store/libraryStore";
import MangaCard from "../components/MangaCard";

const TrackingPage: React.FC = () => {
  const { reading, plan, finished, setReading, setPlan, setFinished } = useReadingList();
  const setSelectedSource = useLibraryStore((s) => s.setSelectedSource);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);
  const navigate = useNavigate();

  useEffect(() => {
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

  const Section: React.FC<{ title: string; items: any[] }> = ({ title, items }) => (
    <section>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      {items.length === 0 && <p className="text-gray-400 mb-4">No entries.</p>}
      <div className="flex flex-wrap gap-4">
        {items.map((e) => (
          <MangaCard
            key={`${e.sourceId}-${e.mangaId}`}
            entry={e}
            onClick={() => {
              setSelectedSource(e.sourceId);
              setSelectedManga(e.mangaId);
              navigate("/browse");
            }}
            onRemove={async () => {
              await window.readingList.remove(e.sourceId, e.mangaId);
              const updated = await window.readingList.listByStatus(e.status);
              if (e.status === "reading") setReading(updated as any);
              else if (e.status === "plan") setPlan(updated as any);
              else setFinished(updated as any);
            }}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="p-4 space-y-8">
      <Section title="Currently Reading" items={reading} />
      <Section title="Plan to Read" items={plan} />
      <Section title="Finished" items={finished} />
    </div>
  );
};

export default TrackingPage; 