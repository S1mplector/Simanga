import React, { useEffect, useState } from "react";
import mascot from "../../assets/icons/mascot.png";

const Header: React.FC = () => {
  const version = "Prototype"; // static until automated
  const [activeJobs, setActiveJobs] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchJobs = async () => {
      if ((window as any).downloadManager?.listJobs) {
        const jobs = await (window as any).downloadManager.listJobs();
        if (mounted) setActiveJobs(jobs.filter((j: any) => j.status !== "completed" && j.status !== "failed"));
      }
    };
    fetchJobs();
    const handleUpdate = () => fetchJobs();
    (window as any).downloadManager?.on?.("update", handleUpdate);
    // Add polling as a fallback to catch missed events or enqueues
    const interval = setInterval(fetchJobs, 1000);
    return () => {
      mounted = false;
      (window as any).downloadManager?.off?.("update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const downloadingCount = activeJobs.length;
  const currentIndex = activeJobs.findIndex(j => j.status === "running") + 1;

  return (
    <header className="flex items-center gap-4 bg-gray-800 px-4 py-2 border-b border-gray-700 select-none relative">
      <img src={mascot} alt="Mascot" className="h-20 w-20 object-contain" />
      <div className="leading-tight">
        <div className="text-lg font-semibold">SiManga</div>
        <div className="text-xs text-gray-400">Version: {version} • Developer: Ilgaz Mehmetoğlu</div>
      </div>
      {/* Downloading X of Y indicator */}
      {downloadingCount > 0 && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-blue-700 text-white px-4 py-1 rounded-full shadow text-sm font-medium">
          Downloading {currentIndex > 0 ? currentIndex : 1} of {downloadingCount}
        </div>
      )}
    </header>
  );
};

export default Header; 