import React, { useEffect, useState } from "react";

interface ReaderProgressProps {
  mode: "scroll" | "paged";
  currentPage?: number;
  totalPages?: number;
  containerRef?: React.RefObject<HTMLElement>;
}

const ReaderProgress: React.FC<ReaderProgressProps> = ({ mode, currentPage = 0, totalPages = 0, containerRef }) => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (mode !== "scroll") return;

    const handleScroll = () => {
      // Use the provided container ref or find the reader container
      const container = containerRef?.current || document.querySelector('.overflow-auto');
      
      if (!container) {
        // Fallback to document if no reader container found
        const el = document.documentElement;
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight - el.clientHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        setScrollProgress(Math.round(progress));
        return;
      }
      
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      setScrollProgress(Math.round(progress));
    };

    // Use provided ref or try to find the reader container
    const container = containerRef?.current || document.querySelector('.overflow-auto');
    const targetElement = container || window;
    
    targetElement.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial calculation

    return () => targetElement.removeEventListener("scroll", handleScroll);
  }, [mode, containerRef]);

  const progress = mode === "scroll" ? scrollProgress : totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

  return (
    <>
      {/* Top Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-800 z-40">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress Indicator */}
      <div className="fixed top-4 right-4 bg-gray-800/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white z-30">
        {mode === "scroll" ? (
          <span>{scrollProgress}%</span>
        ) : (
          <span>
            {currentPage + 1} / {totalPages}
          </span>
        )}
      </div>
    </>
  );
};

export default ReaderProgress; 