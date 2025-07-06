import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserLibrary } from "../store/userLibraryStore";
import { useLibraryStore } from "../store/libraryStore";
import { useReadingList } from "../store/readingListStore";
import MangaCard from "../components/MangaCard";
import StatisticsTab from "../components/StatisticsTab";
import { BookOpenIcon, EyeIcon, CheckCircleIcon, HeartIcon, ClockIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import { BookOpenIcon as BookOpenIconSolid, EyeIcon as EyeIconSolid, CheckCircleIcon as CheckCircleIconSolid, HeartIcon as HeartIconSolid, ClockIcon as ClockIconSolid, ChartBarIcon as ChartBarIconSolid } from "@heroicons/react/24/solid";

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

type TabType = "favorites" | "reading" | "plan" | "finished" | "history" | "statistics";

const LibraryPage: React.FC = () => {
  const favorites = useUserLibrary((s) => s.favorites);
  const history = useUserLibrary((s) => s.history);
  const setFavorites = useUserLibrary((s) => s.setFavorites);
  const setHistory = useUserLibrary((s) => s.setHistory);
  const { reading, plan, finished, setReading, setPlan, setFinished } = useReadingList();
  const navigate = useNavigate();
  const location = useLocation();
  const setSelectedSource = useLibraryStore((s) => s.setSelectedSource);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);
  
  // Check URL parameters for initial tab
  const getInitialTab = (): TabType => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as TabType;
    const validTabs: TabType[] = ["favorites", "reading", "plan", "finished", "history", "statistics"];
    return validTabs.includes(tabParam) ? tabParam : "favorites";
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab());
  const [loading, setLoading] = useState(true);

  // Update tab when URL changes
  useEffect(() => {
    const newTab = getInitialTab();
    setActiveTab(newTab);
  }, [location.search]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [favs, hist, r, p, f] = await Promise.all([
          (window as any).library.listFavorites(),
          (window as any).library.listHistory(),
          window.readingList.listByStatus("reading"),
          window.readingList.listByStatus("plan"),
          window.readingList.listByStatus("finished"),
        ]);
        setFavorites(favs);
        setHistory(hist);
        setReading(r as any);
        setPlan(p as any);
        setFinished(f as any);
      } finally {
        setLoading(false);
      }
    })();
  }, [setFavorites, setHistory, setReading, setPlan, setFinished]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode; iconActive: React.ReactNode; count: number }[] = [
    { 
      id: "favorites", 
      label: "Favorites", 
      icon: <HeartIcon className="w-5 h-5" />,
      iconActive: <HeartIconSolid className="w-5 h-5" />,
      count: favorites.length 
    },
    { 
      id: "reading", 
      label: "Currently Reading", 
      icon: <BookOpenIcon className="w-5 h-5" />,
      iconActive: <BookOpenIconSolid className="w-5 h-5" />,
      count: reading.length 
    },
    { 
      id: "plan", 
      label: "Plan to Read", 
      icon: <EyeIcon className="w-5 h-5" />,
      iconActive: <EyeIconSolid className="w-5 h-5" />,
      count: plan.length 
    },
    { 
      id: "finished", 
      label: "Finished", 
      icon: <CheckCircleIcon className="w-5 h-5" />,
      iconActive: <CheckCircleIconSolid className="w-5 h-5" />,
      count: finished.length 
    },
    { 
      id: "history", 
      label: "Recent History", 
      icon: <ClockIcon className="w-5 h-5" />,
      iconActive: <ClockIconSolid className="w-5 h-5" />,
      count: history.length 
    },
    { 
      id: "statistics", 
      label: "Statistics", 
      icon: <ChartBarIcon className="w-5 h-5" />,
      iconActive: <ChartBarIconSolid className="w-5 h-5" />,
      count: 0 
    },
  ];

  const handleRemoveFromList = async (entry: any, listType: "reading" | "plan" | "finished") => {
    await window.readingList.remove(entry.sourceId, entry.mangaId);
    // Refresh the lists
    const [r, p, f] = await Promise.all([
      window.readingList.listByStatus("reading"),
      window.readingList.listByStatus("plan"),
      window.readingList.listByStatus("finished"),
    ]);
    setReading(r as any);
    setPlan(p as any);
    setFinished(f as any);
  };

  const renderContent = () => {
    if (loading) {
      return <p className="text-gray-400">Loading...</p>;
    }

    switch (activeTab) {
      case "favorites":
        if (favorites.length === 0) {
          return <p className="text-gray-400">No favorites yet. Add manga to your favorites from the browse page.</p>;
        }
        return (
          <div className="flex flex-wrap gap-4">
            {favorites.map((f) => (
              <MangaCard
                key={`${f.sourceId}-${f.mangaId}`}
                entry={f as any}
                onClick={() => {
                  setSelectedSource(f.sourceId);
                  setSelectedManga(f.mangaId);
                  navigate("/browse");
                }}
                onRemove={async () => {
                  await (window as any).library.toggleFavorite(f);
                  const updated = await (window as any).library.listFavorites();
                  setFavorites(updated);
                }}
              />
            ))}
          </div>
        );

      case "reading":
        if (reading.length === 0) {
          return <p className="text-gray-400">No manga currently being read. Mark manga as "Currently Reading" from the browse page.</p>;
        }
        return (
          <div className="flex flex-wrap gap-4">
            {reading.map((r) => (
              <MangaCard
                key={`${r.sourceId}-${r.mangaId}`}
                entry={r}
                onClick={() => {
                  setSelectedSource(r.sourceId);
                  setSelectedManga(r.mangaId);
                  navigate("/browse");
                }}
                onRemove={() => handleRemoveFromList(r, "reading")}
              />
            ))}
          </div>
        );

      case "plan":
        if (plan.length === 0) {
          return <p className="text-gray-400">No manga in your plan to read list. Mark manga as "Plan to Read" from the browse page.</p>;
        }
        return (
          <div className="flex flex-wrap gap-4">
            {plan.map((p) => (
              <MangaCard
                key={`${p.sourceId}-${p.mangaId}`}
                entry={p}
                onClick={() => {
                  setSelectedSource(p.sourceId);
                  setSelectedManga(p.mangaId);
                  navigate("/browse");
                }}
                onRemove={() => handleRemoveFromList(p, "plan")}
              />
            ))}
          </div>
        );

      case "finished":
        if (finished.length === 0) {
          return <p className="text-gray-400">No finished manga. Mark completed manga as "Finished" from the browse page.</p>;
        }
        return (
          <div className="flex flex-wrap gap-4">
            {finished.map((f) => (
              <MangaCard
                key={`${f.sourceId}-${f.mangaId}`}
                entry={f}
                onClick={() => {
                  setSelectedSource(f.sourceId);
                  setSelectedManga(f.mangaId);
                  navigate("/browse");
                }}
                onRemove={() => handleRemoveFromList(f, "finished")}
              />
            ))}
          </div>
        );

      case "history":
        if (history.length === 0) {
          return <p className="text-gray-400">No reading history yet. Start reading manga to build your history.</p>;
        }
        return (
          <ul className="space-y-2">
            {history.map((h) => (
              <li
                key={`${h.chapterId}-${h.page}-${h.updated}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedSource(h.sourceId);
                  setSelectedManga(h.mangaId);
                  navigate(`/reader/${encodeURIComponent(h.chapterId)}?page=${h.page}`);
                }}
              >
                <div className="flex-1">
                  <p className="font-medium line-clamp-1">{h.title ?? h.mangaId}</p>
                  <p className="text-sm text-gray-400">Page {h.page + 1}</p>
                </div>
                <span className="text-sm text-gray-500">{timeAgo(h.updated)}</span>
              </li>
            ))}
          </ul>
        );

      case "statistics":
        return <StatisticsTab />;
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold mb-6">My Library</h2>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-700 mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-500"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {activeTab === tab.id ? tab.iconActive : tab.icon}
              <span className="font-medium">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  activeTab === tab.id ? "bg-blue-500/20" : "bg-gray-700"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {renderContent()}
      </div>
    </div>
  );
};

export default LibraryPage; 