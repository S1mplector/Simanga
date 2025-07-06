import { useCallback } from 'react';
import { trackReadingProgress } from '../../services/statistics';

interface TrackerOptions {
  sourceId?: string;
  mangaId?: string;
  chapterId?: string;
  title?: string;
  coverUrl?: string;
}

export function useReadingTracker(opts: TrackerOptions) {
  const { sourceId, mangaId, chapterId, title, coverUrl } = opts;

  const trackPageChange = useCallback(
    (pagesRead: number) => {
      if (mangaId && chapterId) {
        trackReadingProgress(sourceId, mangaId, chapterId, pagesRead, title, coverUrl).catch(
          (error) => {
            console.error('Failed to track reading progress:', error);
          }
        );
      }
    },
    [sourceId, mangaId, chapterId, title, coverUrl]
  );

  return { trackPageChange };
}
