#!/usr/bin/env node

// Direct test of the nHentai-direct adapter with SiManga's proxy configuration
const { SocksProxyAgent } = require('socks-proxy-agent');
const { fetch } = require('undici');

// Simulate SiManga's adapter loading
async function testNHentaiDirectAdapter() {
  console.log('🧪 Testing nHentai Direct Adapter with Tor');
  console.log('============================================');
  
  // Mock settings store
  const mockSettingsStore = {
    settings: {
      torEnabled: true,
      torSocksPort: 9050,
      nhentaiProxyEnabled: true,
      proxies: ['socks5://127.0.0.1:9050']
    },
    get(key) {
      return this.settings[key];
    }
  };
  
  // Mock adapter utils
  const mockUtils = {
    async fetchWithTimeout(url, options, timeout) {
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
  };
  
  // Simplified proxy manager
  const mockProxyManager = {
    async getBestProxy(adapterId) {
      if (adapterId === 'nhentai' && mockSettingsStore.get('nhentaiProxyEnabled')) {
        const torAgent = new SocksProxyAgent('socks5://127.0.0.1:9050');
        console.log('🧅 ProxyManager: Providing Tor proxy for nHentai');
        return torAgent;
      }
      return null;
    }
  };
  
  // Simplified adapter implementation for testing
  class NHentaiTestAdapter {
    async fetchHtml(url) {
      console.log(`📡 Fetching: ${url}`);
      
      const headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        "Referer": "https://nhentai.net/",
        "Cache-Control": "no-cache"
      };
      
      const proxyAgent = await mockProxyManager.getBestProxy('nhentai');
      
      const options = {
        headers,
        redirect: 'follow'
      };
      
      if (proxyAgent) {
        options.agent = proxyAgent;
        console.log('🔗 Using Tor proxy for request');
      }
      
      const response = await mockUtils.fetchWithTimeout(url, options, 15000);
      
      console.log(`📊 Response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`📄 Content length: ${html.length} chars`);
      
      // Check for blocking
      const blockingTerms = ['cloudflare', 'cf-ray', 'blocked', 'forbidden'];
      const hasBlocking = blockingTerms.some(term => html.toLowerCase().includes(term));
      
      if (hasBlocking) {
        console.log('🛡️  Blocking detected');
        throw new Error('Content appears to be blocked');
      }
      
      return html;
    }
    
    parseSearchResults(html) {
      const results = [];
      
      try {
        // Look for gallery containers
        const galleryRegex = /<div class="gallery"[^>]*>[\s\S]*?<\/div>/g;
        const matches = [...html.matchAll(galleryRegex)];
        
        console.log(`🔍 Found ${matches.length} gallery containers`);
        
        for (const match of matches.slice(0, 5)) { // Test first 5
          const galleryHtml = match[0];
          
          // Extract ID
          const idMatch = galleryHtml.match(/href="\/g\/(\d+)\//);
          if (!idMatch) continue;
          
          const id = idMatch[1];
          
          // Extract title
          const titleMatch = galleryHtml.match(/<div class="caption">([^<]+)/);
          const title = titleMatch ? titleMatch[1].trim() : `Gallery ${id}`;
          
          results.push({ id, title });
        }
        
        console.log(`📚 Parsed ${results.length} galleries`);
        results.forEach((r, i) => {
          console.log(`   ${i + 1}. [${r.id}] ${r.title}`);
        });
        
      } catch (error) {
        console.log(`❌ Parse error: ${error.message}`);
      }
      
      return results;
    }
    
    async testConnectivity() {
      try {
        console.log('\\n🌐 Testing main page...');
        const html = await this.fetchHtml('https://nhentai.net/');
        
        if (html.includes('nhentai') || html.includes('gallery')) {
          console.log('✅ Main page accessible');
          return true;
        } else {
          console.log('❓ Unexpected content');
          return false;
        }
      } catch (error) {
        console.log(`❌ Connection test failed: ${error.message}`);
        return false;
      }
    }
    
    async testSearch() {
      try {
        console.log('\\n🔍 Testing search...');
        const html = await this.fetchHtml('https://nhentai.net/search/?q=yuri');
        
        const results = this.parseSearchResults(html);
        
        if (results.length > 0) {
          console.log('✅ Search working');
          return true;
        } else {
          console.log('❌ No search results found');
          return false;
        }
      } catch (error) {
        console.log(`❌ Search test failed: ${error.message}`);
        return false;
      }
    }
  }
  
  const adapter = new NHentaiTestAdapter();
  
  // Run tests
  console.log('Starting adapter tests...');
  
  const connectivityResult = await adapter.testConnectivity();
  const searchResult = await adapter.testSearch();
  
  console.log('\\n📋 TEST SUMMARY');
  console.log('================');
  console.log(`🌐 Connectivity: ${connectivityResult ? 'PASS' : 'FAIL'}`);
  console.log(`🔍 Search: ${searchResult ? 'PASS' : 'FAIL'}`);
  
  if (connectivityResult && searchResult) {
    console.log('\\n🎉 nHentai direct adapter is working with Tor!');
    console.log('✅ Ready for use in SiManga');
  } else {
    console.log('\\n❌ Some tests failed. Check Tor connection and network settings.');
  }
}

testNHentaiDirectAdapter().catch(console.error);
