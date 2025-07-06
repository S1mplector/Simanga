import { adapters } from "../adapters";

export type SourceStatus = "online" | "slow" | "offline" | "checking";
export type ContentType = "sfw" | "nsfw" | "both";

export interface SourceHealth {
  id: string;
  status: SourceStatus;
  responseTime?: number;
  lastChecked?: number;
  contentType: ContentType;
  error?: string;
}

class SourceHealthService {
  private healthData: Map<string, SourceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private subscribers: Set<(health: SourceHealth[]) => void> = new Set();

  constructor() {
    // Initialize health data with source metadata
    this.initializeSourceMetadata();
  }

  private initializeSourceMetadata() {
    // Define content types for each source
    const sourceMetadata: Record<string, ContentType> = {
      mangadex: "both",
      mangasee: "sfw",
      mangafire: "sfw",
      mangakakalot: "sfw",
      mangahook: "sfw",
      weebcentral: "both",
      "nhentai-vpn": "nsfw",
      "asmhentai-vpn": "nsfw",
      hitomi: "nsfw",
    };

    adapters.forEach(adapter => {
      this.healthData.set(adapter.id, {
        id: adapter.id,
        status: "checking",
        contentType: sourceMetadata[adapter.id] || "sfw",
      });
    });
  }

  async checkSourceHealth(sourceId: string): Promise<SourceHealth> {
    const adapter = adapters.find(a => a.id === sourceId);
    if (!adapter) {
      return {
        id: sourceId,
        status: "offline",
        contentType: "sfw",
        error: "Source not found",
      };
    }

    const startTime = Date.now();
    try {
      // Try to fetch a small list to test the source. Some sites (e.g. nHentai, ASMHentai)
      // respond poorly to their front-page/"all" endpoints, so we ping them with a harmless
      // single-letter search instead.
      const pingQuery = sourceId === "nhentai-vpn" || sourceId === "asmhentai-vpn" ? "a" : 
                       sourceId === "weebcentral" ? "test" : "";
      const result = await Promise.race([
        adapter.getMangaList({ query: pingQuery }, undefined),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), 20000)
        ),
      ]);

      const responseTime = Date.now() - startTime;
      const status: SourceStatus = 
        responseTime > 10000 ? "slow" : "online";

      const health: SourceHealth = {
        id: sourceId,
        status,
        responseTime,
        lastChecked: Date.now(),
        contentType: this.healthData.get(sourceId)?.contentType || "sfw",
      };

      this.healthData.set(sourceId, health);
      this.notifySubscribers();
      return health;
    } catch (error: any) {
      const health: SourceHealth = {
        id: sourceId,
        status: "offline",
        lastChecked: Date.now(),
        contentType: this.healthData.get(sourceId)?.contentType || "sfw",
        error: error.message || "Unknown error",
      };

      this.healthData.set(sourceId, health);
      this.notifySubscribers();
      return health;
    }
  }

  async checkAllSources(): Promise<void> {
    const checks = adapters.map(adapter => 
      this.checkSourceHealth(adapter.id)
    );
    await Promise.allSettled(checks);
  }

  startMonitoring(intervalMs: number = 60000) {
    this.stopMonitoring();
    
    // Initial check
    this.checkAllSources();
    
    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllSources();
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getSourceHealth(sourceId: string): SourceHealth | undefined {
    return this.healthData.get(sourceId);
  }

  getAllSourceHealth(): SourceHealth[] {
    return Array.from(this.healthData.values());
  }

  subscribe(callback: (health: SourceHealth[]) => void) {
    this.subscribers.add(callback);
    // Immediately call with current data
    callback(this.getAllSourceHealth());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    const allHealth = this.getAllSourceHealth();
    this.subscribers.forEach(callback => callback(allHealth));
  }

  // Get source statistics
  getStats() {
    const all = this.getAllSourceHealth();
    return {
      total: all.length,
      online: all.filter(h => h.status === "online").length,
      slow: all.filter(h => h.status === "slow").length,
      offline: all.filter(h => h.status === "offline").length,
      sfw: all.filter(h => h.contentType === "sfw").length,
      nsfw: all.filter(h => h.contentType === "nsfw").length,
    };
  }
}

export const sourceHealthService = new SourceHealthService(); 