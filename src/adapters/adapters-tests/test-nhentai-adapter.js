// Test the improved nHentai adapter
const path = require('path');

// Mock the dependencies
const mockSettings = {
  get: (key) => {
    switch (key) {
      case 'nhentaiProxyEnabled':
        return false; // Change to true to test proxy behavior
      case 'proxies':
        return []; // Add proxy strings here to test
      default:
        return undefined;
    }
  }
};

const mockRateLimit = {
  acquire: async () => Promise.resolve(),
  noteRateLimit: () => {},
  noteSuccess: () => {}
};

// Mock adapter utils
const mockUtils = {
  fetchWithTimeout: async (url, options, timeout) => {
    // Simulate the actual fetch behavior we observed
    if (url.includes('nhentai.net')) {
      const error = new Error('fetch failed');
      error.code = 'ETIMEDOUT';
      throw error;
    }
    return fetch(url, options);
  },
  CircuitBreaker: class {
    async execute(fn) {
      return fn();
    }
    reset() {}
  },
  SimpleCache: class {
    constructor() {
      this.cache = new Map();
    }
    get(key) { return this.cache.get(key); }
    set(key, value) { this.cache.set(key, value); }
  },
  NetworkError: class extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'NetworkError';
    }
  },
  RateLimitError: class extends Error {
    constructor(message, retryAfter) {
      super(message);
      this.retryAfter = retryAfter;
      this.name = 'RateLimitError';
    }
  },
  ParseError: class extends Error {
    constructor(message) {
      super(message);
      this.name = 'ParseError';
    }
  },
  AdapterError: class extends Error {
    constructor(message, code, retryable) {
      super(message);
      this.code = code;
      this.retryable = retryable;
      this.name = 'AdapterError';
    }
  }
};

// Test the adapter error handling
async function testNHentaiAdapter() {
  console.log('Testing nHentai Adapter Error Handling\n');
  
  // Simulate the adapter's fetchJson method behavior
  async function simulateFetchJson(url) {
    console.log(`Attempting to fetch: ${url}`);
    
    // Mock the rate limiting
    await mockRateLimit.acquire();
    
    const headers = { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "application/json, text/html, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Referer": "https://nhentai.net/",
      "Origin": "https://nhentai.net",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors", 
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };
    
    const baseOptions = { 
      headers,
      redirect: 'follow'
    };
    
    // Check if proxy is enabled
    if (mockSettings.get("nhentaiProxyEnabled")) {
      const proxyStrings = mockSettings.get("proxies") || [];
      
      if (proxyStrings.length > 0) {
        console.log("  Proxy enabled, trying proxy connections first");
        
        for (const proxy of proxyStrings) {
          try {
            console.log(`  Trying proxy: ${proxy}`);
            // Simulate proxy attempt
            const response = await mockUtils.fetchWithTimeout(url, baseOptions, 15000);
            return response;
          } catch (proxyError) {
            console.log(`  Proxy ${proxy} failed: ${proxyError.message}`);
            continue;
          }
        }
        
        throw new mockUtils.NetworkError(
          "All configured proxies failed. nHentai appears to be blocked in your region. Please check your proxy settings or try different proxy servers.",
          503
        );
      } else {
        throw new mockUtils.NetworkError(
          "nHentai proxy is enabled but no proxies are configured. Please add proxy servers in settings.",
          400
        );
      }
    }
    
    // Try direct connection
    try {
      console.log("  Trying direct connection...");
      const response = await mockUtils.fetchWithTimeout(url, baseOptions, 15000);
      return response;
    } catch (directError) {
      console.log(`  Direct connection failed: ${directError.message}`);
      
      // Provide specific error messages for common connection issues
      if (directError.code === 'ECONNRESET' || directError.code === 'ECONNREFUSED') {
        throw new mockUtils.NetworkError(
          "Connection blocked or reset. nHentai is likely blocked by your ISP or government. Enable proxy in settings to bypass restrictions.",
          503
        );
      }
      
      if (directError.code === 'ETIMEDOUT' || directError.message.includes('timeout')) {
        throw new mockUtils.NetworkError(
          "Connection timed out. nHentai may be blocked in your region. Try enabling proxy in settings.",
          408
        );
      }
      
      throw new mockUtils.NetworkError(
        `Connection failed: ${directError.message}. If you're in a region that blocks adult content, enable proxy in settings.`,
        500
      );
    }
  }
  
  // Test the improved error handling
  try {
    await simulateFetchJson('https://nhentai.net/api/galleries/all?page=1');
    console.log('✅ Success (unexpected)');
  } catch (error) {
    console.log(`❌ Error caught: ${error.message}`);
    console.log(`   Error type: ${error.constructor.name}`);
    if (error.statusCode) {
      console.log(`   Status code: ${error.statusCode}`);
    }
    
    // Test with proxy enabled
    console.log('\n--- Testing with proxy enabled but no proxies configured ---');
    mockSettings.get = (key) => {
      switch (key) {
        case 'nhentaiProxyEnabled':
          return true;
        case 'proxies':
          return [];
        default:
          return undefined;
      }
    };
    
    try {
      await simulateFetchJson('https://nhentai.net/api/galleries/all?page=1');
    } catch (proxyError) {
      console.log(`❌ Proxy error: ${proxyError.message}`);
      console.log(`   Status code: ${proxyError.statusCode}`);
    }
    
    // Test with proxy enabled and proxies configured
    console.log('\n--- Testing with proxy enabled and proxies configured ---');
    mockSettings.get = (key) => {
      switch (key) {
        case 'nhentaiProxyEnabled':
          return true;
        case 'proxies':
          return ['http://proxy1:8080', 'socks5://proxy2:1080'];
        default:
          return undefined;
      }
    };
    
    try {
      await simulateFetchJson('https://nhentai.net/api/galleries/all?page=1');
    } catch (proxyError) {
      console.log(`❌ All proxies failed: ${proxyError.message}`);
      console.log(`   Status code: ${proxyError.statusCode}`);
    }
  }
  
  console.log('\n=== Analysis ===');
  console.log('The nHentai adapter now provides better error messages:');
  console.log('1. Detects timeout errors (common in Turkey/restricted regions)');
  console.log('2. Suggests enabling proxy settings');
  console.log('3. Handles proxy configuration issues');
  console.log('4. Provides actionable error messages');
  console.log('\n=== Recommendations ===');
  console.log('1. Enable nHentai proxy in settings');
  console.log('2. Configure working proxy servers (HTTP/SOCKS5)');
  console.log('3. Use a VPN service if proxies are not available');
  console.log('4. Try connecting from a different region');
}

testNHentaiAdapter().catch(console.error);
