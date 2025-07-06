#!/usr/bin/env node

// Comprehensive test for the nhentai-direct adapter with Tor
const { SocksProxyAgent } = require('socks-proxy-agent');

const SOCKS_PROXY = 'socks5://127.0.0.1:9050';
const BASE_URL = "https://nhentai.net";

// Test scenarios
const tests = [
  {
    name: "Main page accessibility",
    url: `${BASE_URL}/`,
    expectedContent: ["nhentai", "gallery", "doujinshi"]
  },
  {
    name: "Search page",
    url: `${BASE_URL}/search/?q=yuri`,
    expectedContent: ["gallery", "search"]
  },
  {
    name: "Gallery page (example)",
    url: `${BASE_URL}/g/177013/`,
    expectedContent: ["gallery", "pages", "tag"]
  },
  {
    name: "Gallery viewer page",
    url: `${BASE_URL}/g/177013/1/`,
    expectedContent: ["gallery", "page"]
  }
];

async function fetchWithTimeout(url, options, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function testConnection(test, useTor = false) {
  console.log(`\n🔍 Testing: ${test.name}`);
  console.log(`📍 URL: ${test.url}`);
  console.log(`🔒 Using Tor: ${useTor ? 'Yes' : 'No'}`);
  
  try {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Referer": "https://nhentai.net/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate", 
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1"
      },
      redirect: 'follow'
    };
    
    if (useTor) {
      options.agent = new SocksProxyAgent(SOCKS_PROXY);
    }
    
    const startTime = Date.now();
    const response = await fetchWithTimeout(test.url, options, 15000);
    const loadTime = Date.now() - startTime;
    
    console.log(`⏱️  Response time: ${loadTime}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log(`❌ Failed: HTTP ${response.status}`);
      return false;
    }
    
    const html = await response.text();
    console.log(`📄 Content length: ${html.length} chars`);
    
    // Check for blocking indicators
    const blockingIndicators = [
      "cloudflare",
      "cf-ray", 
      "blocked",
      "access denied",
      "forbidden",
      "captcha",
      "bot detection"
    ];
    
    const foundBlocking = blockingIndicators.some(indicator => 
      html.toLowerCase().includes(indicator)
    );
    
    if (foundBlocking) {
      console.log(`🛡️  Blocking detected in content`);
      return false;
    }
    
    // Check for expected content
    const foundExpected = test.expectedContent.some(content => 
      html.toLowerCase().includes(content.toLowerCase())
    );
    
    if (!foundExpected) {
      console.log(`❓ Expected content not found`);
      console.log(`🔍 Looking for: ${test.expectedContent.join(', ')}`);
      // Show a snippet of what we got
      console.log(`📝 Content snippet: ${html.substring(0, 200)}...`);
      return false;
    }
    
    console.log(`✅ Success! Found expected content`);
    return true;
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.name === 'AbortError') {
      console.log(`⏰ Request timed out`);
    } else if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      console.log(`🔒 Connection blocked or refused`);
    }
    return false;
  }
}

async function parseGalleryFromHtml(html) {
  console.log(`\n🔍 Parsing gallery details from HTML...`);
  
  try {
    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)</);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown';
    console.log(`📖 Title: ${title}`);
    
    // Extract page count
    const pageCountMatches = [
      html.match(/(\d+)\s+pages?/i),
      html.match(/class="gallerythumb"/g)
    ];
    
    let pageCount = 0;
    for (const match of pageCountMatches) {
      if (match) {
        if (Array.isArray(match)) {
          pageCount = match.length;
        } else if (match[1]) {
          pageCount = parseInt(match[1]);
        }
        if (pageCount > 0) break;
      }
    }
    
    console.log(`📄 Pages: ${pageCount}`);
    
    // Extract tags
    const tags = [];
    const tagMatches = html.matchAll(/class="tag"[^>]*>([^<]+)</g);
    for (const tagMatch of tagMatches) {
      tags.push(tagMatch[1].trim());
    }
    
    console.log(`🏷️  Tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
    
    return {
      title,
      pageCount,
      tags: tags.slice(0, 10) // Limit for display
    };
    
  } catch (error) {
    console.log(`❌ Parsing error: ${error.message}`);
    return null;
  }
}

async function runComprehensiveTest() {
  console.log('🚀 Starting comprehensive nHentai direct adapter test');
  console.log('==================================================');
  
  const results = {
    direct: { passed: 0, failed: 0 },
    tor: { passed: 0, failed: 0 }
  };
  
  // Test with direct connection first
  console.log('\n🔗 Testing DIRECT connections...');
  for (const test of tests) {
    const success = await testConnection(test, false);
    if (success) {
      results.direct.passed++;
    } else {
      results.direct.failed++;
    }
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Test with Tor
  console.log('\n🧅 Testing TOR connections...');
  for (const test of tests) {
    const success = await testConnection(test, true);
    if (success) {
      results.tor.passed++;
    } else {
      results.tor.failed++;
    }
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Test specific gallery parsing with Tor
  console.log('\n📖 Testing gallery parsing with Tor...');
  try {
    const galleryUrl = `${BASE_URL}/g/177013/`;
    const options = {
      agent: new SocksProxyAgent(SOCKS_PROXY),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://nhentai.net/"
      }
    };
    
    const response = await fetchWithTimeout(galleryUrl, options);
    if (response.ok) {
      const html = await response.text();
      await parseGalleryFromHtml(html);
    }
  } catch (error) {
    console.log(`❌ Gallery parsing test failed: ${error.message}`);
  }
  
  // Results summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('========================');
  console.log(`🔗 Direct connections: ${results.direct.passed}/${tests.length} passed`);
  console.log(`🧅 Tor connections: ${results.tor.passed}/${tests.length} passed`);
  
  if (results.tor.passed > results.direct.passed) {
    console.log('\n✅ Tor is working better than direct connections!');
    console.log('📋 Recommendation: Enable Tor/proxy for nHentai in SiManga');
  } else if (results.direct.passed > 0) {
    console.log('\n✅ Direct connections are working');
    console.log('📋 Recommendation: Direct access is sufficient');
  } else {
    console.log('\n❌ Both direct and Tor connections failed');
    console.log('📋 Recommendation: Try different VPN/proxy or check network');
  }
  
  return results;
}

// Run the test
runComprehensiveTest().catch(console.error);
