// Test script for improved nHentai adapter
const path = require('path');

// Mock the TypeScript imports
const mockAdapterUtils = {
  CircuitBreaker: class {
    constructor() {}
    async execute(fn) { return fn(); }
  },
  fetchWithTimeout: async (url, options, timeout) => {
    const fetch = require('node-fetch');
    return fetch(url, options);
  },
  NetworkError: class extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  ParseError: class extends Error {},
  AdapterError: class extends Error {}
};

const mockNetLimiter = {
  acquire: async () => {}
};

// Mock modules
require.cache[require.resolve('../../services/adapterUtils')] = {
  exports: mockAdapterUtils
};
require.cache[require.resolve('../../services/netLimiter')] = {
  exports: mockNetLimiter
};

// Load the adapter
delete require.cache[require.resolve('../nhentai-vpn.ts')];
const adapterModule = require('../nhentai-vpn.ts');
const adapter = adapterModule.default || adapterModule;

async function test() {
  try {
    console.log('Testing improved nHentai VPN adapter...');
    
    // Test browse
    console.log('\n1. Testing browse (no search)...');
    const browseResult = await adapter.getMangaList({ page: 1 });
    console.log('Found', browseResult.results.length, 'results');
    console.log('Has more pages:', browseResult.hasMore);
    console.log('First 3 results:');
    browseResult.results.slice(0, 3).forEach(r => {
      console.log('  - ID:', r.id);
      console.log('    Title:', r.title.substring(0, 60) + '...');
      console.log('    Cover:', r.coverUrl ? r.coverUrl : 'NO COVER');
      console.log('    Has cover image:', !!r.coverUrl);
    });
    
    // Count how many have covers
    const withCovers = browseResult.results.filter(r => r.coverUrl).length;
    console.log(`\nCover statistics: ${withCovers}/${browseResult.results.length} have covers`);
    
    // Test search
    console.log('\n2. Testing search...');
    const searchResult = await adapter.getMangaList({ query: 'english', page: 1 });
    console.log('Found', searchResult.results.length, 'results for "english"');
    const searchWithCovers = searchResult.results.filter(r => r.coverUrl).length;
    console.log(`Cover statistics: ${searchWithCovers}/${searchResult.results.length} have covers`);
    
    // Test gallery details
    if (browseResult.results.length > 0) {
      const testId = browseResult.results[0].id;
      console.log('\n3. Testing gallery details for', testId, '...');
      const details = await adapter.getMangaDetails(testId);
      console.log('Title:', details.title);
      console.log('Cover:', details.coverUrl);
      console.log('Artist:', details.artist);
      console.log('Tags:', details.tags?.slice(0, 5).join(', '));
      
      // Test chapters
      console.log('\n4. Testing chapter list...');
      const chapters = await adapter.getChapterList(testId);
      console.log('Chapters:', chapters.length);
      console.log('First chapter:', chapters[0]);
      
      // Test page list
      console.log('\n5. Testing page list...');
      const pages = await adapter.getPageList(testId);
      console.log('Found', pages.length, 'pages');
      console.log('First page:', pages[0]);
      console.log('Last page:', pages[pages.length - 1]);
      
      // Test image URL
      if (pages.length > 0) {
        console.log('\n6. Testing image URL accessibility...');
        const testUrl = pages[0].url;
        console.log('Testing URL:', testUrl);
        
        try {
          const fetch = require('node-fetch');
          const response = await fetch(testUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          console.log('Image URL status:', response.status);
          console.log('Image URL accessible:', response.ok);
        } catch (error) {
          console.log('Image URL test failed:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

test(); 