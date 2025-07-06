import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import settingsStore from "./settings";
import { fetchWithTimeout } from "./adapterUtils";

interface ProxyOption {
  agent: any;
  type: string;
  url: string;
  working: boolean;
  lastTested: Date;
  latency: number;
}

/**
 * Specialized proxy manager for nHentai and other blocked sites
 * Focuses on finding working proxies specifically for adult content sites
 */
class NHentaiProxyManager {
  private workingProxies: Map<string, ProxyOption> = new Map();
  private failedProxies: Set<string> = new Set();
  
  // Free proxy sources that often work for adult sites
  private readonly FREE_PROXY_SOURCES = [
    // SOCKS5 proxies that often work
    "socks5://127.0.0.1:9050", // Local Tor
    "socks5://127.0.0.1:9150", // Tor Browser
    
    // You can add more here as needed
  ];

  constructor() {
    // Clear failed proxies every 10 minutes
    setInterval(() => {
      this.failedProxies.clear();
      // Also retest working proxies periodically
      this.retestProxies();
    }, 10 * 60 * 1000);
  }

  /**
   * Get the best working proxy for nHentai specifically
   */
  async getBestNHentaiProxy(): Promise<any> {
    // First try user-configured proxies
    const userProxies: string[] = settingsStore.get("proxies") || [];
    
    // Then try our free sources
    const allProxies = [...userProxies, ...this.FREE_PROXY_SOURCES];
    
    // Filter out failed proxies
    const candidateProxies = allProxies.filter(p => !this.failedProxies.has(p));
    
    if (candidateProxies.length === 0) {
      console.warn("No available proxies for nHentai");
      return null;
    }

    // Test proxies in parallel for speed
    const testPromises = candidateProxies.map(proxy => this.testProxyForNHentai(proxy));
    const results = await Promise.allSettled(testPromises);
    
    // Find the best working proxy
    let bestProxy: ProxyOption | null = null;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        const proxy = result.value;
        if (!bestProxy || proxy.latency < bestProxy.latency) {
          bestProxy = proxy;
        }
      }
    }
    
    if (bestProxy) {
      this.workingProxies.set(bestProxy.url, bestProxy);
      console.log(`Using best nHentai proxy: ${bestProxy.type} (${bestProxy.latency}ms)`);
      return bestProxy.agent;
    }
    
    console.warn("No working proxies found for nHentai");
    return null;
  }

  /**
   * Test a specific proxy with nHentai-like requests
   */
  private async testProxyForNHentai(proxyUrl: string): Promise<ProxyOption | null> {
    const startTime = Date.now();
    
    try {
      const agent = this.createProxyAgent(proxyUrl);
      
      // Test with multiple endpoints to ensure reliability
      const testUrls = [
        "https://httpbin.org/ip", // Basic connectivity
        "https://httpbin.org/headers", // Header test
        "https://www.google.com", // Popular site
      ];
      
      let successCount = 0;
      
      for (const testUrl of testUrls) {
        try {
          const response = await fetchWithTimeout(testUrl, {
            agent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'DNT': '1',
              'Connection': 'keep-alive',
            }
          }, 8000);
          
          if (response.ok) {
            successCount++;
          }
        } catch (error) {
          // Individual test failure is OK, we just want some to succeed
          console.debug(`Proxy test failed for ${testUrl}:`, error);
        }
      }
      
      const latency = Date.now() - startTime;
      
      // Consider proxy working if at least 2/3 tests passed
      if (successCount >= 2) {
        const proxyType = proxyUrl.startsWith('socks') ? 'SOCKS' : 'HTTP';
        
        return {
          agent,
          type: proxyType,
          url: proxyUrl,
          working: true,
          lastTested: new Date(),
          latency
        };
      }
      
    } catch (error) {
      console.debug(`Proxy ${proxyUrl} failed connectivity test:`, error);
    }
    
    // Mark as failed
    this.failedProxies.add(proxyUrl);
    return null;
  }

  /**
   * Create appropriate proxy agent
   */
  private createProxyAgent(proxyUrl: string): any {
    if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  }

  /**
   * Periodically retest working proxies to ensure they're still good
   */
  private async retestProxies(): Promise<void> {
    const proxyUrls = Array.from(this.workingProxies.keys());
    
    for (const proxyUrl of proxyUrls) {
      const proxy = this.workingProxies.get(proxyUrl);
      if (!proxy) continue;
      
      // Only retest if it's been more than 5 minutes
      const timeSinceTest = Date.now() - proxy.lastTested.getTime();
      if (timeSinceTest < 5 * 60 * 1000) continue;
      
      try {
        const updatedProxy = await this.testProxyForNHentai(proxyUrl);
        if (updatedProxy) {
          this.workingProxies.set(proxyUrl, updatedProxy);
        } else {
          this.workingProxies.delete(proxyUrl);
          this.failedProxies.add(proxyUrl);
        }
      } catch (error) {
        console.warn(`Retesting proxy ${proxyUrl} failed:`, error);
        this.workingProxies.delete(proxyUrl);
        this.failedProxies.add(proxyUrl);
      }
    }
  }

  /**
   * Check if Tor is available and working
   */
  async checkTorAvailability(): Promise<{ available: boolean; ports: number[]; message: string }> {
    const torPorts = [9050, 9150]; // Standard Tor ports
    const workingPorts: number[] = [];
    
    for (const port of torPorts) {
      try {
        const proxyUrl = `socks5://127.0.0.1:${port}`;
        const testResult = await this.testProxyForNHentai(proxyUrl);
        
        if (testResult) {
          workingPorts.push(port);
        }
      } catch (error) {
        console.debug(`Tor port ${port} not available:`, error);
      }
    }
    
    if (workingPorts.length > 0) {
      return {
        available: true,
        ports: workingPorts,
        message: `Tor is available on ports: ${workingPorts.join(', ')}`
      };
    }
    
    return {
      available: false,
      ports: [],
      message: "Tor is not running or not accessible. Please start Tor Browser or install Tor."
    };
  }

  /**
   * Get proxy setup recommendations for the user's region
   */
  getProxyRecommendations(): { type: string; instructions: string; priority: number }[] {
    return [
      {
        type: "Tor Browser",
        instructions: "Download and run Tor Browser. It automatically provides SOCKS proxy on port 9150.",
        priority: 1
      },
      {
        type: "Standalone Tor",
        instructions: "Install Tor separately and run: tor --SocksPort 9050",
        priority: 2
      },
      {
        type: "VPN + Tor",
        instructions: "Use a VPN first, then connect through Tor for maximum anonymity.",
        priority: 3
      },
      {
        type: "Residential Proxy",
        instructions: "Purchase a residential proxy service that rotates IPs.",
        priority: 4
      },
      {
        type: "Free Proxy Lists",
        instructions: "Use free proxy lists (less reliable, check proxy-list.download or similar).",
        priority: 5
      }
    ];
  }

  /**
   * Clear all caches and force fresh proxy discovery
   */
  reset(): void {
    this.workingProxies.clear();
    this.failedProxies.clear();
    console.log("nHentai proxy manager reset");
  }
}

export default new NHentaiProxyManager();
