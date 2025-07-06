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

class SourceHealthClient {
  private subscribers: Set<(health: SourceHealth[]) => void> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private cachedHealth: SourceHealth[] = [];

  async checkSourceHealth(sourceId: string): Promise<SourceHealth> {
    return window.sourceHealth.checkSource(sourceId);
  }

  async checkAllSources(): Promise<void> {
    await window.sourceHealth.checkAll();
    // Update cached data after check
    this.cachedHealth = await window.sourceHealth.getAll();
    this.notifySubscribers();
  }

  async getAllSourceHealth(): Promise<SourceHealth[]> {
    this.cachedHealth = await window.sourceHealth.getAll();
    return this.cachedHealth;
  }

  async getStats() {
    return window.sourceHealth.getStats();
  }

  subscribe(callback: (health: SourceHealth[]) => void) {
    this.subscribers.add(callback);
    // Immediately call with cached data
    callback(this.cachedHealth);
    
    // Fetch fresh data
    this.getAllSourceHealth().then(health => callback(health));
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  startMonitoring(intervalMs: number = 60000) {
    this.stopMonitoring();
    
    // Initial fetch
    this.getAllSourceHealth();
    
    // Set up polling
    this.pollingInterval = setInterval(async () => {
      const health = await this.getAllSourceHealth();
      this.notifySubscribers();
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback(this.cachedHealth));
  }
}

export const sourceHealthService = new SourceHealthClient(); 