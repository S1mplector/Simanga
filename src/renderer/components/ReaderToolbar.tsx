import React, { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  Squares2X2Icon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  Bars3Icon,
  Cog6ToothIcon,
  BookOpenIcon,
  ArrowPathIcon,
  SunIcon,
  ArrowsRightLeftIcon,
  BookmarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolid } from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";
import { ReaderSettings } from "../store/readerSettingsStore";

interface ReaderToolbarProps {
  mode: "scroll" | "paged";
  spread: boolean;
  zoom: number;
  currentPage: number;
  totalPages: number;
  isFavorite: boolean;
  isFullscreen: boolean;
  nextChapter?: any;
  settings: ReaderSettings;
  onModeChange: (mode: "scroll" | "paged") => void;
  onSpreadChange: (spread: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onPageChange: (page: number) => void;
  onToggleFavorite: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onNavigateChapter: (chapterId: string) => void;
  onSettingChange: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

const ReaderToolbar: React.FC<ReaderToolbarProps> = ({
  mode,
  spread,
  zoom,
  currentPage,
  totalPages,
  isFavorite,
  isFullscreen,
  nextChapter,
  settings,
  onModeChange,
  onSpreadChange,
  onZoomChange,
  onPageChange,
  onToggleFavorite,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleSettings,
  onNavigateChapter,
  onSettingChange,
  isBookmarked,
  onToggleBookmark,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
      {/* Main Toolbar */}
      <div className="px-4 py-2 rounded-lg bg-gray-800/90 backdrop-blur-sm flex items-center gap-3 transition-all shadow-lg">
        {/* Sidebar Toggle */}
        <button
          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
          onClick={onToggleSidebar}
          title="Toggle Chapter List"
        >
          <Bars3Icon className="h-5 w-5 text-white" />
        </button>

        <div className="w-px h-6 bg-gray-600" />

        {/* Reading Mode */}
        <div className="flex items-center gap-2">
          <button
            className={`px-2 py-1 text-sm rounded transition-colors ${
              mode === "scroll" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => onModeChange("scroll")}
          >
            Scroll
          </button>
          <button
            className={`px-2 py-1 text-sm rounded transition-colors ${
              mode === "paged" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => onModeChange("paged")}
          >
            Paged
          </button>
        </div>

        {/* Spread toggle - only in paged mode */}
        {mode === "paged" && (
          <>
            <button
              className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${
                spread ? "bg-gray-700 text-blue-400" : ""
              }`}
              onClick={() => onSpreadChange(!spread)}
              title="Toggle Double Page"
            >
              <Squares2X2Icon className="h-5 w-5 text-white" />
            </button>

            {/* Reading Direction */}
            <button
              className={`p-1.5 rounded hover:bg-gray-700 transition-colors`}
              onClick={() =>
                onSettingChange("readingDirection", settings.readingDirection === "ltr" ? "rtl" : "ltr")
              }
              title={`Reading Direction: ${settings.readingDirection === "ltr" ? "Left to Right" : "Right to Left"}`}
            >
              <ArrowsRightLeftIcon className={`h-5 w-5 text-white ${
                settings.readingDirection === "rtl" ? "rotate-180" : ""
              }`} />
            </button>
          </>
        )}

        <div className="w-px h-6 bg-gray-600" />

        {/* Fit Mode */}
        <select
          value={settings.fitMode}
          onChange={(e) => onSettingChange("fitMode", e.target.value as any)}
          className="bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none"
          title="Fit Mode"
        >
          <option value="none">Original</option>
          <option value="width">Fit Width</option>
          <option value="height">Fit Height</option>
        </select>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
            onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}
            disabled={zoom <= 0.5}
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5 text-white" />
          </button>
          <span className="text-xs text-gray-200 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
            onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
            disabled={zoom >= 3}
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-600" />

        {/* Page Navigation - Paged Mode */}
        {mode === "paged" && (
          <>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
                onClick={() => onPageChange(Math.max(0, currentPage - (spread ? 2 : 1)))}
                disabled={currentPage === 0}
              >
                <ChevronLeftIcon className="h-5 w-5 text-white" />
              </button>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage + 1}
                onChange={(e) => onPageChange(parseInt(e.target.value, 10) - 1)}
                className="w-12 px-1 py-0.5 text-center text-sm bg-gray-700 text-white rounded outline-none"
              />
              <span className="text-gray-300 text-sm">/ {totalPages}</span>
              <button
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
                onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + (spread ? 2 : 1)))}
                disabled={currentPage >= totalPages - 1}
              >
                <ChevronRightIcon className="h-5 w-5 text-white" />
              </button>
            </div>
            <div className="w-px h-6 bg-gray-600" />
          </>
        )}

        {/* Bookmark */}
        <button
          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
          onClick={onToggleBookmark}
          title="Bookmark"
        >
          {isBookmarked ? (
            <BookmarkSolid className="h-5 w-5 text-yellow-400" />
          ) : (
            <BookmarkIcon className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Actions */}
        <button className="p-1.5 rounded hover:bg-gray-700 transition-colors" onClick={onToggleFavorite}>
          {isFavorite ? (
            <HeartSolid className="h-5 w-5 text-red-500" />
          ) : (
            <HeartOutline className="h-5 w-5 text-white" />
          )}
        </button>

        <button
          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
          onClick={onToggleFullscreen}
          title="Toggle Fullscreen"
        >
          {isFullscreen ? (
            <ArrowsPointingInIcon className="h-5 w-5 text-white" />
          ) : (
            <ArrowsPointingOutIcon className="h-5 w-5 text-white" />
          )}
        </button>

        <button
          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
          title="Advanced Settings"
        >
          <Cog6ToothIcon className="h-5 w-5 text-white" />
        </button>

        {nextChapter && (
          <>
            <div className="w-px h-6 bg-gray-600" />
            <button
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 flex items-center gap-1 text-sm transition-colors"
              onClick={() => onNavigateChapter(nextChapter.id)}
            >
              Next Chapter <ChevronRightIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Advanced Controls */}
      {showAdvanced && (
        <div className="mt-2 px-4 py-3 rounded-lg bg-gray-800/90 backdrop-blur-sm shadow-lg">
          <div className="grid grid-cols-2 gap-4">
            {/* Brightness */}
            <div>
              <label className="text-xs text-gray-400 flex items-center gap-1">
                <SunIcon className="w-4 h-4" />
                Brightness: {settings.brightness}%
              </label>
              <input
                type="range"
                min="20"
                max="150"
                value={settings.brightness}
                onChange={(e) => onSettingChange("brightness", parseInt(e.target.value))}
                className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer mt-1"
              />
            </div>

            {/* Contrast */}
            <div>
              <label className="text-xs text-gray-400">Contrast: {settings.contrast}%</label>
              <input
                type="range"
                min="50"
                max="150"
                value={settings.contrast}
                onChange={(e) => onSettingChange("contrast", parseInt(e.target.value))}
                className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer mt-1"
              />
            </div>

            {/* Auto Scroll - Only in scroll mode */}
            {mode === "scroll" && (
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={settings.autoScroll}
                    onChange={(e) => onSettingChange("autoScroll", e.target.checked)}
                    className="rounded"
                  />
                  Auto Scroll
                </label>
                {settings.autoScroll && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-400">Speed: {settings.autoScrollSpeed}</label>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      value={settings.autoScrollSpeed}
                      onChange={(e) => onSettingChange("autoScrollSpeed", parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReaderToolbar; 