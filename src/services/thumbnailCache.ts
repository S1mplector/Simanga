import Store from "electron-store";
import PQueue from "p-queue";

interface ThumbSchema {
  entries: Record<string, string>; // key -> url
}

const store = new Store<ThumbSchema>({
  name: "thumbCache",
  defaults: {
    entries: {},
  },
});

// Memory cache for faster access
const memCache = new Map<string, string>();

// Initialize memory cache from persistent store
const initMemCache = () => {
  const entries = store.get("entries");
  Object.entries(entries).forEach(([key, url]) => {
    memCache.set(key, url);
  });
};
initMemCache();

// Queue for thumbnail fetching with higher concurrency
const fetchQueue = new PQueue({ concurrency: 6 });

export const thumbnailCacheService = {
  get(key: string): string | undefined {
    // Check memory cache first
    return memCache.get(key);
  },
  
  set(key: string, url: string) {
    // Update both caches
    memCache.set(key, url);
    const map = store.get("entries");
    map[key] = url;
    store.set("entries", map);
  },
  
  delete(key: string) {
    memCache.delete(key);
    const map = store.get("entries");
    delete map[key];
    store.set("entries", map);
  },
  
  clear() {
    memCache.clear();
    store.set("entries", {});
  },
  
  // Batch prefetch thumbnails for visible items
  async prefetchBatch(items: Array<{ sourceId: string; mangaId: string }>, fetchFn: (item: any) => Promise<string | null>) {
    const promises = items.map(item => {
      const key = `${item.sourceId}-${item.mangaId}`;
      
      // Skip if already cached
      if (memCache.has(key)) {
        return Promise.resolve();
      }
      
      // Add to queue
      return fetchQueue.add(async () => {
        try {
          const url = await fetchFn(item);
          if (url) {
            this.set(key, url);
          }
        } catch (err) {
          console.error(`Failed to fetch thumbnail for ${key}:`, err);
        }
      });
    });
    
    return Promise.allSettled(promises);
  },
  
  // Get queue size for monitoring
  getQueueSize() {
    return fetchQueue.size + fetchQueue.pending;
  }
}; 