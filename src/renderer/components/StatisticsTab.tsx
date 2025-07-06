import React, { useEffect, useState } from "react";
import { BookOpenIcon, ChartBarIcon, FireIcon, TrophyIcon, CalendarIcon, ClockIcon } from "@heroicons/react/24/outline";
import { getAllReadingRecords, ReadingRecord } from "../../services/statistics";

interface ReadingStats {
  totalMangaRead: number;
  totalPagesRead: number;
  totalChaptersRead: number;
  currentStreak: number;
  longestStreak: number;
  averagePagesPerDay: number;
  thisWeekPages: number;
  readingActivity: { date: string; pages: number; intensity: number }[];
  topManga: { title: string; pagesRead: number; progress: number }[];
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, title, value, subtitle, color = "blue" }) => {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    gray: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gray-700/50">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

const ReadingHeatmap: React.FC<{ activity: ReadingStats['readingActivity'] }> = ({ activity }) => {
  // Generate last 12 months of data
  const generateHeatmapData = () => {
    const data = [];
    const today = new Date();
    
    // Generate last 365 days
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Find activity for this date
      const dayActivity = activity.find(a => a.date === dateStr);
      const intensity = dayActivity ? Math.min(4, Math.floor(dayActivity.pages / 10)) : 0;
      
      data.push({
        date: dateStr,
        pages: dayActivity?.pages || 0,
        intensity,
        day: date.getDay(),
        week: Math.floor(i / 7)
      });
    }
    
    return data;
  };

  const heatmapData = generateHeatmapData();
  const weeks = Math.ceil(heatmapData.length / 7);

  const getIntensityColor = (intensity: number) => {
    const colors = [
      "bg-gray-800", // 0 pages
      "bg-green-900/50", // 1-10 pages
      "bg-green-700/70", // 11-20 pages
      "bg-green-500/80", // 21-30 pages
      "bg-green-400", // 31+ pages
    ];
    return colors[intensity] || colors[0];
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CalendarIcon className="w-5 h-5" />
        Reading Activity (Past 12 months)
      </h3>
      
      <div className="overflow-x-auto">
        <div className="grid grid-cols-53 gap-1 min-w-max">
          {Array.from({ length: weeks }, (_, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const dataIndex = weekIndex * 7 + dayIndex;
                const dayData = heatmapData[dataIndex];
                
                if (!dayData) return <div key={dayIndex} className="w-3 h-3" />;
                
                return (
                  <div
                    key={dayIndex}
                    className={`w-3 h-3 rounded-sm ${getIntensityColor(dayData.intensity)} hover:ring-1 hover:ring-gray-400 cursor-pointer`}
                    title={`${dayData.date}: ${dayData.pages} pages`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
        <span>Less</span>
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((intensity) => (
            <div
              key={intensity}
              className={`w-3 h-3 rounded-sm ${getIntensityColor(intensity)}`}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
};

const ProgressChart: React.FC<{ activity: ReadingStats['readingActivity'] }> = ({ activity }) => {
  // Get last 30 days for the chart
  const last30Days = activity.slice(-30);
  const maxPages = Math.max(...last30Days.map(d => d.pages), 10);

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ChartBarIcon className="w-5 h-5" />
        Progress Chart
      </h3>
      
      <div className="h-32 flex items-end gap-1">
        {last30Days.map((day, index) => {
          const height = Math.max((day.pages / maxPages) * 100, 2);
          return (
            <div
              key={index}
              className="flex-1 bg-blue-500/60 hover:bg-blue-500 transition-colors rounded-t cursor-pointer"
              style={{ height: `${height}%` }}
              title={`${day.date}: ${day.pages} pages`}
            />
          );
        })}
      </div>
      
      <div className="text-xs text-gray-400 mt-2 text-center">
        Last 30 days
      </div>
    </div>
  );
};

const TopMangaList: React.FC<{ topManga: ReadingStats['topManga'] }> = ({ topManga }) => {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrophyIcon className="w-5 h-5" />
        Top Manga
      </h3>
      
      <div className="space-y-3">
        {topManga.slice(0, 5).map((manga, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{manga.title}</p>
              <p className="text-xs text-gray-400">{manga.pagesRead} pages</p>
            </div>
            <div className="flex-shrink-0">
              <div className="w-16 bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${manga.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatisticsTab: React.FC = () => {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      const records = await getAllReadingRecords();

      // Calculate statistics from records
      const stats = calculateStatisticsFromRecords(records);

      setStats(stats);
    } catch (error) {
      console.error("Failed to load statistics:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStatisticsFromRecords = (records: ReadingRecord[]): ReadingStats => {
    const readingActivity = generateReadingActivity(records);
    const { currentStreak, longestStreak } = calculateStreaks(readingActivity);
    const thisWeekPages = calculateThisWeekPages(readingActivity);
    const averagePagesPerDay = calculateAveragePages(readingActivity);
    const topManga = generateTopManga(records);

    const totalPagesRead = records.reduce((sum, r) => sum + r.pagesRead, 0);
    const totalChaptersRead = new Set(records.map(r => r.chapterId)).size;
    const totalMangaRead = new Set(records.map(r => r.mangaId)).size;

    return {
      totalMangaRead,
      totalPagesRead,
      totalChaptersRead,
      currentStreak,
      longestStreak,
      averagePagesPerDay,
      thisWeekPages,
      readingActivity,
      topManga,
    };
  }

  const generateReadingActivity = (records: ReadingRecord[]) => {
    const activityMap = new Map<string, number>();
    
    records.forEach((record) => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      activityMap.set(date, (activityMap.get(date) || 0) + record.pagesRead);
    });

    const activity = Array.from(activityMap.entries()).map(([date, pages]) => ({
      date,
      pages,
      intensity: Math.min(4, Math.floor(pages / 10))
    }));

    return activity.sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateStreaks = (activity: { date: string; pages: number }[]) => {
    if (activity.length === 0) return { currentStreak: 0, longestStreak: 0 };

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const today = new Date();
    const activityDates = new Set(activity.map(a => a.date));

    // Calculate current streak
    for (let i = 0; ; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activityDates.has(dateStr)) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate longest streak
    if (activity.length > 0) {
      const sortedDates = [...activityDates].sort();
      let streak = 1;
      longestStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const currentDate = new Date(sortedDates[i]);
        const prevDate = new Date(sortedDates[i-1]);
        
        const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          streak++;
        } else {
          streak = 1;
        }
        longestStreak = Math.max(longestStreak, streak);
      }
    }

    return { currentStreak, longestStreak };
  };

  const calculateThisWeekPages = (activity: { date: string; pages: number }[]) => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    return activity
      .filter(a => new Date(a.date) >= weekAgo)
      .reduce((sum, a) => sum + a.pages, 0);
  };

  const calculateAveragePages = (activity: { date: string; pages: number }[]) => {
    const last30Days = activity.slice(-30);
    if (last30Days.length === 0) return 0;
    
    const totalPages = last30Days.reduce((sum, a) => sum + a.pages, 0);
    return Math.round((totalPages / 30) * 10) / 10; // Round to 1 decimal
  };

  const generateTopManga = (records: ReadingRecord[]) => {
    const mangaMap = new Map<string, { title: string; pagesRead: number }>();

    records.forEach((record) => {
      // We may not have immediate access to the full manga metadata here (depends on preload APIs).
      // Fallback to the mangaId as the title if we cannot resolve it.
      let title = record.mangaId;
      try {
        const lib = (window as any).library;
        if (lib && typeof lib.getManga === 'function') {
          const manga = lib.getManga(record.mangaId);
          if (manga && manga.title) title = manga.title;
        }
      } catch {
        // ignore – we'll just use the id
      }

      const existing = mangaMap.get(record.mangaId);
      if (existing) {
        existing.pagesRead += record.pagesRead;
      } else {
        mangaMap.set(record.mangaId, {
          title,
          pagesRead: record.pagesRead,
        });
      }
    });

    return Array.from(mangaMap.values())
      .sort((a, b) => b.pagesRead - a.pagesRead)
      .slice(0, 5)
      .map((manga, index) => ({
        ...manga,
        progress: Math.max(10, 100 - (index * 15)) // Mock progress
      }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading statistics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-400">
        <ChartBarIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
        <p className="text-lg">No statistics available</p>
        <p className="text-sm mt-1">Start reading manga to build your statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon={<BookOpenIcon className="w-5 h-5" />}
          title="Total Read"
          value={`${stats.totalMangaRead} manga`}
          color="blue"
        />
        <StatCard
          icon={<FireIcon className="w-5 h-5" />}
          title="Current Streak"
          value={`${stats.currentStreak} days`}
          color="red"
        />
        <StatCard
          icon={<ClockIcon className="w-5 h-5" />}
          title="This Week"
          value={`${stats.thisWeekPages} pages`}
          color="green"
        />
        <StatCard
          icon={<ChartBarIcon className="w-5 h-5" />}
          title="Total Pages"
          value={stats.totalPagesRead.toLocaleString()}
          color="purple"
        />
        <StatCard
          icon={<TrophyIcon className="w-5 h-5" />}
          title="Longest Streak"
          value={`${stats.longestStreak} days`}
          color="yellow"
        />
        <StatCard
          icon={<CalendarIcon className="w-5 h-5" />}
          title="Avg/Day"
          value={`${stats.averagePagesPerDay} pages`}
          color="gray"
        />
      </div>

      {/* Reading Activity Heatmap */}
      <ReadingHeatmap activity={stats.readingActivity} />

      {/* Progress Chart and Top Manga */}
      <div className="grid md:grid-cols-2 gap-6">
        <ProgressChart activity={stats.readingActivity} />
        <TopMangaList topManga={stats.topManga} />
      </div>
    </div>
  );
};

export default StatisticsTab;
