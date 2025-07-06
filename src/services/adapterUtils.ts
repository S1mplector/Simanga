import { acquire as rlAcquire, noteRateLimit, noteSuccess } from "./netLimiter";

// Custom error types for better error messages
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export class NetworkError extends AdapterError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, "NETWORK_ERROR", true);
  }
}

export class RateLimitError extends AdapterError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message, "RATE_LIMIT", true);
  }
}

export class ParseError extends AdapterError {
  constructor(message: string) {
    super(message, "PARSE_ERROR", false);
  }
}

// Circuit breaker implementation
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  
  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000, // 1 minute
    private readonly halfOpenRequests = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "half-open";
        this.failures = 0;
      } else {
        throw new AdapterError(
          "Service temporarily unavailable due to repeated failures",
          "CIRCUIT_OPEN",
          true
        );
      }
    }

    try {
      const result = await fn();
      if (this.state === "half-open") {
        this.failures = 0;
        this.state = "closed";
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = "open";
      console.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  reset() {
    this.failures = 0;
    this.state = "closed";
  }
}

// Fetch with timeout wrapper
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number; agent?: any } = {},
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Extract agent and other Node.js specific options
    const { agent, ...fetchOptions } = options;
    
    // For Node.js environments, we need to use a different approach for agents
    let response: Response;
    if (agent && typeof fetch !== 'undefined') {
      // Use node-fetch or similar that supports agents
      response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        // @ts-ignore - agent is a Node.js specific option
        agent
      });
    } else {
      response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
    }
    
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new NetworkError(`Request timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry a promise-returning function using exponential back-off.
 * Non-retryable AdapterErrors are propagated immediately.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  {
    attempts = 3,
    baseDelay = 500,
    factor = 2,
    maxDelay = 4000,
  }: {
    attempts?: number;
    baseDelay?: number;
    factor?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;

      // Do not retry non-retryable AdapterErrors
      if (err instanceof AdapterError && !err.retryable) {
        throw err;
      }

      if (i === attempts - 1) break;

      // Wait before next attempt using exponential back-off.
      const delay = Math.min(baseDelay * Math.pow(factor, i), maxDelay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr as any;
}

// Common fetch wrapper with rate limiting and error handling
export async function fetchWithRateLimit(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  adapterName: string
): Promise<Response> {
  await rlAcquire();

  try {
    // Use provided timeout or default to 10 seconds for better UX
    const timeout = options.timeout || 10000;
    // Wrap the actual fetch in a generic retry with exponential backoff.
    const attempt = () => fetchWithTimeout(url, options, timeout);
    const response = await retry(attempt, { attempts: 3, baseDelay: 500 });
    
    // Handle rate limits
    if (response.status === 429) {
      noteRateLimit();
      const retryAfter = response.headers.get("retry-after");
      throw new RateLimitError(
        `${adapterName} rate limit exceeded`,
        retryAfter ? parseInt(retryAfter) : undefined
      );
    }
    
    // Handle other errors
    if (response.status === 403) {
      noteRateLimit();
      throw new NetworkError(`${adapterName} access forbidden (possible rate limit)`, 403);
    }
    
    if (!response.ok) {
      throw new NetworkError(
        `${adapterName} request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    
    noteSuccess();
    return response;
  } catch (error: unknown) {
    if (error instanceof AdapterError) {
      throw error;
    }
    // Wrap unknown errors
    const message = error instanceof Error ? error.message : String(error);
    throw new NetworkError(`${adapterName} network error: ${message}`);
  }
}

// Cache implementation with TTL
export class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();

  constructor(private readonly ttl: number = 300000) {} // 5 minutes default

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }
} 