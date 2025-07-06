import React from "react";
import { ArrowDownTrayIcon, CheckIcon } from "@heroicons/react/24/outline";

interface DownloadButtonProps {
  isDownloaded: boolean;
  isDownloading?: boolean;
  progress?: number;
  onClick: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  isDownloaded,
  isDownloading = false,
  progress = 0,
  onClick,
  size = "md",
  className = "",
}) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const buttonSizes = {
    sm: "p-1",
    md: "p-1.5",
    lg: "p-2",
  };

  if (isDownloaded) {
    return (
      <button
        className={`${buttonSizes[size]} rounded-full bg-green-600 hover:bg-green-700 transition-colors ${className}`}
        title="Downloaded"
        disabled
      >
        <CheckIcon className={`${sizes[size]} text-white`} />
      </button>
    );
  }

  if (isDownloading) {
    return (
      <button
        className={`${buttonSizes[size]} rounded-full bg-blue-600 relative overflow-hidden ${className}`}
        title={`Downloading... ${Math.round(progress * 100)}%`}
        disabled
      >
        <div
          className="absolute inset-0 bg-blue-400 transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
        <ArrowDownTrayIcon className={`${sizes[size]} text-white relative z-10`} />
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${buttonSizes[size]} rounded-full bg-gray-700 hover:bg-gray-600 transition-colors ${className}`}
      title="Download"
    >
      <ArrowDownTrayIcon className={`${sizes[size]} text-gray-300`} />
    </button>
  );
};

export default DownloadButton; 