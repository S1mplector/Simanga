import React, { useState, useEffect } from "react";
import { useLibraryStore } from "../store/libraryStore";
import { sourceHealthService, SourceHealth, SourceStatus, ContentType } from "../services/sourceHealthClient";
import { 
  ServerIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  ClockIcon,
  GlobeAltIcon
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleIconSolid } from "@heroicons/react/24/solid";
import teeheMascot from "../../assets/icons/extras/teehee.png";

const SourceSelect: React.FC = () => {
  const sources = useLibraryStore((s) => s.sources);
  const selectedSource = useLibraryStore((s) => s.selectedSource);
  const setSelectedSource = useLibraryStore((s) => s.setSelectedSource);
  const setMangas = useLibraryStore((s) => s.setMangas);
  const setSelectedManga = useLibraryStore((s) => s.setSelectedManga);
  
  const [isOpen, setIsOpen] = useState(false);
  const [healthData, setHealthData] = useState<SourceHealth[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState({ online: 0, slow: 0, offline: 0, total: 0 });

  // Ref for the scrollable list
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // When dropdown opens, scroll to the bottom smoothly so last sources are visible
  useEffect(() => {
    if (isOpen && listRef.current) {
      setTimeout(() => {
        const el = listRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          // Fallback: ensure last item is fully visible
          const last = el.lastElementChild as HTMLElement | null;
          if (last) {
            last.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    // Subscribe to health updates
    const unsubscribe = sourceHealthService.subscribe(setHealthData);
    
    // Start monitoring
    sourceHealthService.startMonitoring(120000); // Check every 2 minutes
    
    // Get initial stats
    sourceHealthService.getStats().then(setStats);
    
    return () => {
      unsubscribe();
      sourceHealthService.stopMonitoring();
    };
  }, []);

  useEffect(() => {
    // Update stats when health data changes
    sourceHealthService.getStats().then(setStats);
  }, [healthData]);

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSource(sourceId);
    setMangas([]);
    setSelectedManga(undefined);
    setIsOpen(false);
  };

  const handleRefreshHealth = async () => {
    setIsRefreshing(true);
    await sourceHealthService.checkAllSources();
    setIsRefreshing(false);
  };

  const getStatusIcon = (status: SourceStatus) => {
    switch (status) {
      case "online":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "slow":
        return <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />;
      case "offline":
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case "checking":
        return <ArrowPathIcon className="w-5 h-5 text-gray-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: SourceStatus) => {
    switch (status) {
      case "online": return "text-green-500";
      case "slow": return "text-yellow-500";
      case "offline": return "text-red-500";
      case "checking": return "text-gray-400";
    }
  };

  const getContentTypeIcon = (type: ContentType) => {
    switch (type) {
      case "sfw":
        return <ShieldCheckIcon className="w-4 h-4 text-green-600" title="Safe for Work" />;
      case "nsfw":
        return <ShieldExclamationIcon className="w-4 h-4 text-red-600" title="Not Safe for Work" />;
      case "both":
        return (
          <div className="flex gap-0.5">
            <ShieldCheckIcon className="w-4 h-4 text-green-600" />
            <ShieldExclamationIcon className="w-4 h-4 text-red-600" />
          </div>
        );
    }
  };

  const formatResponseTime = (ms?: number) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const selectedSourceData = sources.find(s => s.id === selectedSource);
  const selectedHealthData = healthData.find(h => h.id === selectedSource);

  // Sources that require a VPN/Tor to access reliably
  const vpnRequiredSources = ["nhentai-vpn", "asmhentai-vpn"];
  const isVpnRequired = (sourceId: string) => vpnRequiredSources.includes(sourceId);

  return (
    <div className="relative">
      {/* Custom Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <ServerIcon className="w-5 h-5 text-gray-400" />
          <div className="text-left">
            <div className="font-medium">
              {selectedSourceData?.label || "Select Source"}
            </div>
            {selectedHealthData && (
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <span className={getStatusColor(selectedHealthData.status)}>
                  {selectedHealthData.status}
                </span>
                {selectedHealthData.responseTime && (
                  <span>• {formatResponseTime(selectedHealthData.responseTime)}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Custom Dropdown Menu */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 rounded-lg shadow-2xl border border-gray-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Select Source</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {stats.online} online • {stats.slow} slow • {stats.offline} offline
                  </p>
                </div>
                <button
                  onClick={handleRefreshHealth}
                  className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                  title="Refresh source status"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Source List */}
            <div ref={listRef} className="max-h-96 overflow-y-auto source-list-scroll">
              {sources.map((source) => {
                const health = healthData.find(h => h.id === source.id);
                const isSelected = source.id === selectedSource;
                
                return (
                  <button
                    key={source.id}
                    onClick={() => handleSourceSelect(source.id)}
                    disabled={health?.status === "offline"}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800 transition-all duration-150 ${
                      isSelected ? "bg-gray-800" : ""
                    } ${
                      health?.status === "offline" ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="flex-shrink-0">
                      {health ? getStatusIcon(health.status) : <ArrowPathIcon className="w-5 h-5 animate-spin" />}
                    </div>

                    {/* Source Info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isSelected ? "text-blue-400" : ""}`}>
                          {source.label}
                        </span>
                        {health && getContentTypeIcon(health.contentType)}
                        {isVpnRequired(source.id) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded-full">
                            <GlobeAltIcon className="w-3 h-3" />
                            VPN Required
                          </span>
                        )}
                      </div>
                      
                      {health && (
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          <span className={getStatusColor(health.status)}>
                            {health.status === "offline" && health.error 
                              ? health.error 
                              : health.status
                            }
                          </span>
                          {health.responseTime && health.status !== "offline" && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <ClockIcon className="w-3 h-3" />
                                {formatResponseTime(health.responseTime)}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <CheckCircleIconSolid className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mascot footer */}
            <div className="flex items-center gap-3 p-4 border-t border-gray-700 text-gray-300">
              <img src={teeheMascot} alt="Mascot" className="w-20 h-20 flex-shrink-0" />
              <span className="text-lg font-medium">More coming soon!</span>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <ShieldCheckIcon className="w-4 h-4 text-green-600" />
                  <span>SFW</span>
                </div>
                <div className="flex items-center gap-1">
                  <ShieldExclamationIcon className="w-4 h-4 text-red-600" />
                  <span>NSFW</span>
                </div>
                <div className="ml-auto text-gray-500">
                  Last check: {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SourceSelect;