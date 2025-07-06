import React, { useEffect, useState } from "react";
import {
  ChartBarIcon,
  BookOpenIcon,
  ClockIcon,
  FireIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import { getAllReadingRecords, ReadingRecord } from "../../services/statistics";

interface StatsData {
  totalRead: number;
  currentStreak: number;
  thisWeekRead: number;
  totalPages: number;
  averageDaily: number;
  isLoading: boolean;
}

interface TodayReadEntry {
  mangaId: string;
  title: string;
  coverUrl?: string;
  sourceId?: string;
}

const CompactStatsWidget: React.FC = () => {
  const [stats, setStats] = useState<StatsData>({
    totalRead: 0,
    currentStreak: 0,
    thisWeekRead: 0,
    totalPages: 0,
    averageDaily: 0,
    isLoading: true,
  });

  const [todayReads, setTodayReads] = useState<TodayReadEntry[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const records = await getAllReadingRecords();
      calculateStats(records);
      calculateTodayReads(records);
    } catch (err) {
      console.error("Failed to load reading records", err);
      setStats((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const calculateStats = (records: ReadingRecord[]) => {
    if (!records || records.length === 0) {
      setStats({
        totalRead: 0,
        currentStreak: 0,
        thisWeekRead: 0,
        totalPages: 0,
        averageDaily: 0,
        isLoading: false,
      });
      return;
    }

    // Group pages by date
    const activityMap = new Map<string, number>();
    records.forEach((rec) => {
      const dateStr = new Date(rec.timestamp).toISOString().split("T")[0];
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + rec.pagesRead);
    });

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Current streak
    let currentStreak = 0;
    for (let i = 0; ; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (activityMap.has(ds)) currentStreak++;
      else break;
    }

    // This week read (pages)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    let thisWeekRead = 0;
    activityMap.forEach((pages, dateStr) => {
      if (new Date(dateStr) >= weekAgo) thisWeekRead += pages;
    });

    // Total pages
    const totalPages = records.reduce((sum, r) => sum + r.pagesRead, 0);

    // Average daily (last 30 days)
    const thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    let pages30 = 0;
    let daysWithData = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const pages = activityMap.get(ds) || 0;
      pages30 += pages;
      if (pages > 0) daysWithData++;
    }
    const averageDaily = Math.round((pages30 / 30) * 10) / 10;

    const totalReadManga = new Set(records.map((r) => r.mangaId)).size;

    setStats({
      totalRead: totalReadManga,
      currentStreak,
      thisWeekRead,
      totalPages,
      averageDaily,
      isLoading: false,
    });
  };

  const calculateTodayReads = (records: ReadingRecord[]) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todaysMangaIds = Array.from(
      new Set(records.filter((r) => {
        const dateStr = new Date(r.timestamp).toISOString().split("T")[0];
        return dateStr === todayStr;
      }).map((r) => r.mangaId))
    );

    const entries: TodayReadEntry[] = todaysMangaIds.map((id) => {
      const rec = records.find((r) => r.mangaId === id);
      let cover = rec?.coverUrl;
      // fallback from thumbCache if missing
      if (!cover && rec?.sourceId) {
        const cached = (window as any).thumbCache.get(`${rec.sourceId}-${id}`);
        if (cached) cover = cached;
      }
      return {
        mangaId: id,
        title: rec?.title ?? id,
        coverUrl: cover,
        sourceId: rec?.sourceId,
      } as TodayReadEntry;
    });

    setTodayReads(entries);
  };

  if (stats.isLoading) {
    return (
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-lg p-4 h-full flex flex-col space-y-4">
        <div className="animate-pulse flex-1 flex flex-col space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="bg-gray-800/30 rounded-lg p-4 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="h-8 bg-gray-700 rounded"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
            </div>
          </div>
          <div className="bg-gray-800/30 rounded-lg p-3">
            <div className="h-3 bg-gray-700 rounded w-1/4 mb-2"></div>
            <div className="space-y-2">
              <div className="h-2 bg-gray-700 rounded"></div>
              <div className="h-2 bg-gray-700 rounded"></div>
              <div className="h-2 bg-gray-700 rounded w-3/4"></div>
            </div>
          </div>
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (stats.totalRead === 0) {
    return (
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-lg p-4 h-full flex flex-col space-y-4">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-medium text-purple-300">Reading Stats</h3>
        </div>
        <div className="bg-gray-800/30 rounded-lg p-4 flex-1 flex items-center justify-center">
          <div className="text-center">
            <BookOpenIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-sm text-gray-400 mb-2">Start your reading journey!</p>
            <p className="text-xs text-gray-500">Complete chapters to see your stats here</p>
          </div>
        </div>
        <div className="bg-gray-800/30 rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-gray-400">🎯 Ready to track your progress</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-lg p-4 h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-medium text-purple-300">Reading Stats</h3>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>
      
      {/* Main Stats Grid */}
      <div className="bg-gray-800/30 rounded-lg p-4 flex-1">
        <div className="grid grid-cols-2 gap-3 text-sm h-full">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-white font-medium text-lg">{stats.totalRead}</div>
              <div className="text-gray-400 text-xs">Total Read</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <FireIcon className="w-4 h-4 text-orange-400" />
            <div>
              <div className="text-white font-medium text-lg">{stats.currentStreak}</div>
              <div className="text-gray-400 text-xs">Day Streak</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-green-400" />
            <div>
              <div className="text-white font-medium text-lg">{stats.thisWeekRead}</div>
              <div className="text-gray-400 text-xs">This Week</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-yellow-400" />
            <div>
              <div className="text-white font-medium text-lg">{stats.averageDaily}</div>
              <div className="text-gray-400 text-xs">Daily Avg</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Quick Insights */}
      <div className="bg-gray-800/30 rounded-lg p-3">
        <h4 className="text-xs font-medium text-purple-300 mb-2">Quick Insights</h4>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Total Pages</span>
            <span className="text-white font-medium">~{stats.totalPages.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Reading Status</span>
            <span className="text-green-400 font-medium">
              {stats.currentStreak > 0 ? '🔥 On Fire!' : '📚 Getting Started'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Weekly Goal</span>
            <span className="text-blue-400 font-medium">
              {stats.thisWeekRead >= 7 ? '✅ Achieved!' : `${7 - stats.thisWeekRead} to go`}
            </span>
          </div>
        </div>
      </div>
      
      {/* Read Today Section */}
      <div className="bg-gray-800/30 rounded-lg p-3">
        <h4 className="text-xs font-medium text-purple-300 mb-2">Read Today</h4>
        {todayReads.length === 0 ? (
          <p className="text-xs text-gray-500">No reading activity yet today.</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="grid auto-rows-max grid-flow-col gap-2" style={{gridAutoRows:'minmax(0,1fr)'}}>
              {todayReads.map((m) => (
                <div key={m.mangaId} className="flex flex-col items-center text-center">
                  {m.coverUrl ? (
                    <img
                      src={m.coverUrl}
                      alt={m.title}
                      className="w-12 h-16 object-cover rounded border border-gray-700"
                    />
                  ) : (
                    <div className="w-12 h-16 flex items-center justify-center bg-gray-700 rounded border border-gray-700 text-xs text-gray-400">
                      No Cover
                    </div>
                  )}
                  <span className="text-[10px] text-gray-400 truncate w-full mt-1">
                    {m.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="pt-2 border-t border-purple-500/20">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Keep up the momentum! 📈</span>
          <span className="text-purple-400">📚</span>
        </div>
      </div>
    </div>
  );
};

export default CompactStatsWidget;
