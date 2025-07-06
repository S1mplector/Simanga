import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { 
  CircuitBreaker, 
  SimpleCache, 
  fetchWithTimeout,
  NetworkError,
  RateLimitError,
  ParseError,
  AdapterError
} from "./adapterUtils";
import settingsStore from "./settings";

// Configuration types
export interface AdapterConfig {
  baseUrl: string;
  userAgent?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  rateLimitConfig?: {
    maxRequests: number;
    windowMs: number;
    minInterval?: number;
  };
  cacheConfig?: {
    mangaListTTL?: number;
    chapterListTTL?: number;
    pageListTTL?: number;
  };
}

// HTTP client abstraction
export class AdapterHttpClient {
  private circuitBreaker: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  
  constructor(
    private config: AdapterConfig,
    private adapterName: string
  ) {
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    
    if (config.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(config.rateLimitConfig);
    }
  }
  
  async get<T = any>(path: string, options?: RequestInit): Promise<T> {
    const url = new URL(path, this.config.baseUrl).toString();
    return this.request<T>(url, { ...options, method: 'GET' });
  }
  
  async post<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
    const url = new URL(path, this.config.baseUrl).toString();
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }
  
  private async request<T>(url: string, options: RequestInit): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }
      
      const headers: Record<string, string> = {
        ...this.config.defaultHeaders,
        ...options.headers as Record<string, string>,
      };
      
      if (this.config.userAgent) {
        headers['User-Agent'] = this.config.userAgent;
      }
      
      const agent = this.getProxyAgent();
      const timeout = this.config.timeout || 30000;
      
      let lastError: Error | undefined;
      const maxRetries = this.config.maxRetries || 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const fetchOptions: any = {
            ...options,
            headers,
          };
          
          if (agent) {
            fetchOptions.agent = agent;
          }
          
          const response = await fetchWithTimeout(url, fetchOptions, timeout);
          
          if (this.rateLimiter) {
            this.rateLimiter.handleHeaders(response.headers);
          }
          
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            throw new RateLimitError(
              `${this.adapterName} rate limit exceeded`,
              retryAfter ? parseInt(retryAfter) : 60
            );
          }
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new NetworkError(
              `${this.adapterName} error ${response.status}: ${errorText}`,
              response.status
            );
          }
          
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return await response.json();
          } else {
            return await response.text() as any;
          }
        } catch (error) {
          lastError = error as Error;
          
          // Don't retry on non-retryable errors
          if (error instanceof AdapterError && !error.retryable) {
            throw error;
          }
          
          // Wait before retry
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }
      
      throw lastError || new NetworkError(`${this.adapterName} request failed after ${maxRetries} attempts`);
    });
  }
  
  private getProxyAgent(): any {
    const proxies: string[] = settingsStore.get("proxies") || [];
    if (proxies.length === 0) return undefined;
    
    const proxy = proxies[0]; // You could implement round-robin here
    try {
      return /^socks/i.test(proxy) 
        ? new SocksProxyAgent(proxy) 
        : new HttpsProxyAgent(proxy);
    } catch (err) {
      console.warn("Invalid proxy string:", proxy, err);
      return undefined;
    }
  }
}

// Rate limiter implementation
export class RateLimiter {
  private requestTimes: number[] = [];
  private minInterval: number;
  
  constructor(private config: {
    maxRequests: number;
    windowMs: number;
    minInterval?: number;
  }) {
    this.minInterval = config.minInterval || 100;
  }
  
  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.config.windowMs
    );
    
    // Check if we're at the limit
    if (this.requestTimes.length >= this.config.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.config.windowMs - (now - oldestRequest) + 100;
      
      if (waitTime > 0) {
        console.log(`Rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.acquire(); // Retry after waiting
      }
    }
    
    // Check minimum interval
    if (this.requestTimes.length > 0) {
      const lastRequest = this.requestTimes[this.requestTimes.length - 1];
      const timeSince = now - lastRequest;
      
      if (timeSince < this.minInterval) {
        await new Promise(resolve => 
          setTimeout(resolve, this.minInterval - timeSince)
        );
      }
    }
    
    this.requestTimes.push(Date.now());
  }
  
  handleHeaders(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    
    if (remaining && limit) {
      console.log(`Rate limit: ${remaining}/${limit} remaining`);
      
      // Dynamically adjust timing if we're running low
      const remainingNum = parseInt(remaining);
      if (remainingNum < 5) {
        this.minInterval = Math.max(this.minInterval * 2, 2000);
      }
    }
  }
}

// Response parser utilities
export class ResponseParser {
  static extractNumber(value: any): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  }
  
  static extractDate(value: any): Date | undefined {
    if (!value) return undefined;
    
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }
  
  static extractTitle(
    titleObj: Record<string, string> | string,
    preferredLanguages: string[] = ['en']
  ): string {
    if (typeof titleObj === 'string') return titleObj;
    if (!titleObj) return 'Untitled';
    
    // Try preferred languages in order
    for (const lang of preferredLanguages) {
      if (titleObj[lang]) return titleObj[lang];
    }
    
    // Try common language codes
    const fallbacks = ['en', 'en-us', 'en-gb', 'ja-ro'];
    for (const lang of fallbacks) {
      if (titleObj[lang]) return titleObj[lang];
    }
    
    // Return first available
    return Object.values(titleObj)[0] || 'Untitled';
  }
} 