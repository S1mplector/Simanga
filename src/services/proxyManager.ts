import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import settingsStore from "./settings";
import { fetchWithTimeout } from "./adapterUtils";

export interface ProxyConfig {
  type: 'http' | 'https' | 'socks4' | 'socks5' | 'tor';
  host: string;
  port: number;
  username?: string;
  password?: string;
  enabled: boolean;
}

export interface TorConfig {
  enabled: boolean;
  socksPort: number;
  controlPort?: number;
  password?: string;
  autoStart: boolean;
  bridges?: string[];
}

class ProxyManager {
  private torProxy: SocksProxyAgent | null = null;
  private workingProxies: Map<string, any> = new Map();
  private failedProxies: Set<string> = new Set();
  private proxyTestResults: Map<string, { success: boolean; latency: number; lastTested: Date }> = new Map();

  constructor() {
    // Clear failed proxies every 5 minutes
    setInterval(() => {
      this.failedProxies.clear();
      this.proxyTestResults.clear();
    }, 5 * 60 * 1000);
  }

  /**
   * Get the best available proxy for a specific adapter
   */
  async getBestProxy(adapterId: string): Promise<any> {
    const proxyEnabled = settingsStore.get(`${adapterId}ProxyEnabled`);
    if (!proxyEnabled) {
      return null;
    }

    // 1. Try Tor (explicit settings)
    if (adapterId === "nhentai") {
      const torProxy = await this.getTorProxy();
      if (torProxy) {
        console.log("ProxyManager: Using Tor (settings) for nHentai");
        return torProxy;
      }
      // 1.b Auto-detect Tor Browser / stand-alone Tor even if not configured
      const autoTor = await this.autodetectTorProxy();
      if (autoTor) {
        return autoTor;
      }
    }

    // Check if Tor is enabled and working for other adapters
    if (settingsStore.get("torEnabled")) {
      const torProxy = await this.getTorProxy();
      if (torProxy) {
        return torProxy;
      }
    }

    // Get configured proxies
    const proxies: string[] = settingsStore.get("proxies") || [];
    if (proxies.length === 0) {
      return null;
    }

    // Test and return the best proxy
    return await this.findWorkingProxy(proxies);
  }

  /**
   * Create Tor SOCKS proxy connection
   */
  private async getTorProxy(): Promise<SocksProxyAgent | null> {
    try {
      const torConfig = this.getTorConfig();
      if (!torConfig.enabled) {
        return null;
      }

      // Test if Tor is running
      if (!(await this.isTorRunning(torConfig.socksPort))) {
        if (torConfig.autoStart) {
          console.log("Tor not running, attempting to start...");
          await this.startTor();
          // Wait a bit for Tor to initialize
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          console.warn("Tor is not running and autoStart is disabled");
          return null;
        }
      }

      const proxyUrl = `socks5://127.0.0.1:${torConfig.socksPort}`;
      const agent = new SocksProxyAgent(proxyUrl);
      
      // Test the connection
      if (await this.testProxy(agent, "tor")) {
        this.torProxy = agent;
        return agent;
      }

      return null;
    } catch (error) {
      console.error("Failed to setup Tor proxy:", error);
      return null;
    }
  }

  /**
   * Try to detect a running Tor SOCKS proxy on common ports (9050 or 9150)
   * regardless of settings. Returns a ready SocksProxyAgent if working, else null.
   */
  private async autodetectTorProxy(): Promise<SocksProxyAgent | null> {
    const commonPorts = [9050, 9150];
    for (const port of commonPorts) {
      try {
        if (await this.isTorRunning(port)) {
          const proxyUrl = `socks5://127.0.0.1:${port}`;
          const agent = new SocksProxyAgent(proxyUrl);
          if (await this.testProxy(agent, `tor-${port}`)) {
            console.log(`ProxyManager: Auto-detected Tor proxy on port ${port}`);
            return agent;
          }
        }
      } catch {
        /* silently ignore and try next port */
      }
    }
    return null;
  }

  /**
   * Find a working proxy from the configured list
   */
  private async findWorkingProxy(proxies: string[]): Promise<any> {
    // Sort proxies by last known performance
    const sortedProxies = proxies.sort((a, b) => {
      const resultA = this.proxyTestResults.get(a);
      const resultB = this.proxyTestResults.get(b);
      
      if (!resultA && !resultB) return 0;
      if (!resultA) return 1;
      if (!resultB) return -1;
      
      if (resultA.success && !resultB.success) return -1;
      if (!resultA.success && resultB.success) return 1;
      
      return resultA.latency - resultB.latency;
    });

    for (const proxyString of sortedProxies) {
      if (this.failedProxies.has(proxyString)) {
        continue;
      }

      const cached = this.workingProxies.get(proxyString);
      if (cached) {
        return cached;
      }

      try {
        const agent = this.createProxyAgent(proxyString);
        if (await this.testProxy(agent, proxyString)) {
          this.workingProxies.set(proxyString, agent);
          return agent;
        } else {
          this.failedProxies.add(proxyString);
        }
      } catch (error: any) {
        console.warn(`Proxy ${proxyString} failed:`, error?.message || error);
        this.failedProxies.add(proxyString);
      }
    }

    return null;
  }

  /**
   * Create appropriate proxy agent based on URL
   */
  private createProxyAgent(proxyUrl: string): any {
    if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  }

  /**
   * Test if a proxy is working
   */
  private async testProxy(agent: any, identifier: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const response = await fetchWithTimeout('https://httpbin.org/ip', {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, 10000);

      if (response.ok) {
        const data = await response.json();
        const latency = Date.now() - startTime;
        
        this.proxyTestResults.set(identifier, {
          success: true,
          latency,
          lastTested: new Date()
        });
        
        console.log(`Proxy ${identifier} working, IP: ${data.origin}, latency: ${latency}ms`);
        return true;
      }
    } catch (error: any) {
      this.proxyTestResults.set(identifier, {
        success: false,
        latency: 99999,
        lastTested: new Date()
      });
      console.warn(`Proxy ${identifier} test failed:`, error?.message || error);
    }
    
    return false;
  }

  /**
   * Check if Tor is running on specified port
   */
  private async isTorRunning(port: number): Promise<boolean> {
    try {
      const agent = new SocksProxyAgent(`socks5://127.0.0.1:${port}`);
      const response = await fetchWithTimeout('https://check.torproject.org/api/ip', {
        agent,
        headers: { 'User-Agent': 'curl/7.68.0' }
      }, 5000);
      
      if (response.ok) {
        const data = await response.json();
        return data.IsTor === true;
      }
    } catch (error) {
      // Ignore errors, just means Tor isn't running
    }
    
    return false;
  }

  /**
   * Attempt to start Tor (platform-specific)
   */
  private async startTor(): Promise<void> {
    const { spawn } = require('child_process');
    const os = require('os');
    const platform = os.platform();
    
    try {
      let torCommand: string;
      
      if (platform === 'darwin') {
        // macOS - try common Tor installation paths
        const possiblePaths = [
          '/usr/local/bin/tor',
          '/opt/homebrew/bin/tor',
          '/Applications/Tor Browser.app/Contents/MacOS/Tor/tor'
        ];
        
        torCommand = possiblePaths.find(path => {
          try {
            require('fs').accessSync(path);
            return true;
          } catch {
            return false;
          }
        }) || 'tor';
        
      } else if (platform === 'win32') {
        torCommand = 'tor.exe';
      } else {
        torCommand = 'tor';
      }

      const torConfig = this.getTorConfig();
      const args = [
        '--SocksPort', `127.0.0.1:${torConfig.socksPort}`,
        '--ControlPort', `127.0.0.1:${torConfig.controlPort || 9051}`,
        '--DataDirectory', require('path').join(require('os').tmpdir(), 'simanga-tor'),
      ];

      if (torConfig.bridges && torConfig.bridges.length > 0) {
        args.push('--UseBridges', '1');
        torConfig.bridges.forEach(bridge => {
          args.push('--Bridge', bridge);
        });
      }

      console.log(`Starting Tor: ${torCommand} ${args.join(' ')}`);
      
      const torProcess = spawn(torCommand, args, {
        detached: true,
        stdio: 'ignore'
      });

      torProcess.unref();
      
      // Store process ID for later cleanup
      settingsStore.set('torProcessId', torProcess.pid);
      
    } catch (error) {
      console.error('Failed to start Tor:', error);
      throw new Error('Could not start Tor automatically. Please ensure Tor is installed and accessible.');
    }
  }

  /**
   * Get Tor configuration from settings
   */
  private getTorConfig(): TorConfig {
    return {
      enabled: settingsStore.get('torEnabled') || false,
      socksPort: settingsStore.get('torSocksPort') || 9050,
      controlPort: settingsStore.get('torControlPort') || 9051,
      password: settingsStore.get('torPassword'),
      autoStart: settingsStore.get('torAutoStart') || false,
      bridges: settingsStore.get('torBridges') || []
    };
  }

  /**
   * Get proxy statistics for UI
   */
  getProxyStats(): { total: number; working: number; failed: number; torStatus: string } {
    const proxies: string[] = settingsStore.get("proxies") || [];
    const torEnabled = settingsStore.get("torEnabled");
    
    let torStatus = "disabled";
    if (torEnabled) {
      torStatus = this.torProxy ? "connected" : "disconnected";
    }
    
    return {
      total: proxies.length,
      working: this.workingProxies.size,
      failed: this.failedProxies.size,
      torStatus
    };
  }

  /**
   * Test all configured proxies
   */
  async testAllProxies(): Promise<Array<{ proxy: string; working: boolean; latency?: number }>> {
    const proxies: string[] = settingsStore.get("proxies") || [];
    const results = [];
    
    // Test Tor if enabled
    if (settingsStore.get("torEnabled")) {
      const torProxy = await this.getTorProxy();
      results.push({
        proxy: "tor",
        working: !!torProxy,
        latency: this.proxyTestResults.get("tor")?.latency
      });
    }
    
    // Test all configured proxies
    for (const proxyString of proxies) {
      try {
        const agent = this.createProxyAgent(proxyString);
        const working = await this.testProxy(agent, proxyString);
        results.push({
          proxy: proxyString,
          working,
          latency: this.proxyTestResults.get(proxyString)?.latency
        });
      } catch (error) {
        results.push({
          proxy: proxyString,
          working: false
        });
      }
    }
    
    return results;
  }

  /**
   * Clear all cached proxy connections
   */
  reset(): void {
    this.workingProxies.clear();
    this.failedProxies.clear();
    this.proxyTestResults.clear();
    this.torProxy = null;
  }
}

export default new ProxyManager();
