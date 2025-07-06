import { useEffect, useRef } from "react";

interface PageInfo {
  index: number;
}

interface UsePageProgressProps {
  mode: "scroll" | "paged";
  pages: PageInfo[];
  /**
   * Called whenever the visible page index changes.
   */
  onChange: (index: number) => void;
  /**
   * Optional scroll container to observe. Defaults to the viewport.
   */
  root?: Element | null;
}

/**
 * A small, self-contained helper that uses an IntersectionObserver to detect
 * which page image is currently most visible while the reader is in scroll
 * mode.  It is intentionally framework-agnostic.
 */
export function usePageProgress({ mode, pages, onChange, root }: UsePageProgressProps) {
  const lastIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== "scroll") return;
    if (!pages || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the intersecting entry with the greatest visibility ratio.
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }

        if (best) {
          const idxString = (best.target as HTMLElement).dataset.idx;
          if (idxString) {
            const idx = parseInt(idxString, 10);
            if (!isNaN(idx) && idx !== lastIdxRef.current) {
              lastIdxRef.current = idx;
              onChange(idx);
            }
          }
        }
      },
      {
        root: root ?? null,
        // Once the top 40% of the element is scrolled past we consider
        // ourselves on the next page.  Adjust if you prefer a different feel.
        rootMargin: "0px 0px -60% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    );

    // Small delay to ensure DOM elements are ready
    const timeoutId = setTimeout(() => {
      // Attach the observer to every page image that is currently rendered.
      pages.forEach((p) => {
        const el = document.getElementById(`page-${p.index}`);
        if (el) {
          observer.observe(el);
        }
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [mode, pages, onChange, root]);
} 