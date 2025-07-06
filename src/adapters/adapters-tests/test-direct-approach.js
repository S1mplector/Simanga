// Test the direct URL approach for nHentai
const { SocksProxyAgent } = require('socks-proxy-agent');

async function testDirectApproach() {
  console.log('Testing nHentai Direct URL Approach\n');
  console.log('=====================================\n');
  
  const torAgent = new SocksProxyAgent('socks5://127.0.0.1:9050');
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://nhentai.net/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'no-cache',
    'Upgrade-Insecure-Requests': '1'
  };

  const testUrls = [
    'https://nhentai.net/',
    'https://nhentai.net/g/582101/',
    'https://nhentai.net/g/582101/1/',
    'https://nhentai.net/search/?q=popular'
  ];

  for (const url of testUrls) {
    console.log(`Testing: ${url}`);
    
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url, {
        agent: torAgent,
        headers: headers,
        timeout: 15000,
        redirect: 'follow'
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);
      console.log(`  Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.ok) {
        const html = await response.text();
        console.log(`  Content length: ${html.length} chars`);
        
        // Check what we got
        if (html.includes('nhentai')) {
          console.log(`  ✅ SUCCESS - Got nHentai page`);
          
          if (url.includes('/g/')) {
            // Check if we can extract page info
            const pageMatches = html.match(/(\d+)\s+pages?/i);
            if (pageMatches) {
              console.log(`  📄 Found page count: ${pageMatches[1]} pages`);
            }
            
            // Check for gallery info
            if (html.includes('gallery')) {
              console.log(`  📚 Gallery page confirmed`);
            }
          } else if (url.includes('search')) {
            // Check for search results
            const galleryMatches = html.match(/class="gallery"/g);
            if (galleryMatches) {
              console.log(`  🔍 Found ${galleryMatches.length} search results`);
            }
          }
          
        } else if (html.includes('cloudflare')) {
          console.log(`  ⚠️  Cloudflare protection detected`);
        } else if (html.includes('blocked')) {
          console.log(`  ❌ Content blocked`);
        } else {
          console.log(`  ❓ Unknown content (${html.substring(0, 100)}...)`);
        }
        
      } else if (response.status === 403) {
        console.log(`  ❌ BLOCKED (403)`);
      } else if (response.status === 404) {
        console.log(`  ❌ NOT FOUND (404)`);
      } else {
        console.log(`  ❌ ERROR (${response.status})`);
      }
      
    } catch (error) {
      console.log(`  ❌ FAILED: ${error.message}`);
      if (error.code === 'ETIMEDOUT') {
        console.log(`     Likely blocked or filtered`);
      }
    }
    
    console.log('');
  }
}

async function testDirectVsApi() {
  console.log('Comparing Direct URLs vs API Endpoints\n');
  console.log('======================================\n');
  
  const torAgent = new SocksProxyAgent('socks5://127.0.0.1:9050');
  
  const tests = [
    {
      name: 'Direct Gallery Page',
      url: 'https://nhentai.net/g/582101/',
      expected: 'Should get HTML page'
    },
    {
      name: 'API Gallery Endpoint', 
      url: 'https://nhentai.net/api/gallery/582101',
      expected: 'Should get JSON (but might be blocked)'
    },
    {
      name: 'Direct Search Page',
      url: 'https://nhentai.net/search/?q=popular',
      expected: 'Should get HTML search results'
    },
    {
      name: 'API Search Endpoint',
      url: 'https://nhentai.net/api/galleries/search?query=popular',
      expected: 'Should get JSON (but might be blocked)'
    }
  ];

  for (const test of tests) {
    console.log(`${test.name}:`);
    console.log(`  URL: ${test.url}`);
    console.log(`  Expected: ${test.expected}`);
    
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(test.url, {
        agent: torAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': test.url.includes('/api/') ? 'application/json' : 'text/html,application/xhtml+xml',
          'Referer': 'https://nhentai.net/'
        },
        timeout: 10000
      });

      console.log(`  Result: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          console.log(`  ✅ Got JSON response (${JSON.stringify(json).length} chars)`);
        } else {
          const html = await response.text();
          console.log(`  ✅ Got HTML response (${html.length} chars)`);
        }
      } else {
        console.log(`  ❌ Failed with status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

async function main() {
  console.log('nHentai Direct URL Strategy Test');
  console.log('This tests whether direct page URLs work better than API calls\n');
  
  await testDirectApproach();
  await testDirectVsApi();
  
  console.log('========================================');
  console.log('Analysis:');
  console.log('========================================');
  console.log('Direct URLs (nhentai.net/g/123/) are often less blocked than');
  console.log('API endpoints (nhentai.net/api/gallery/123) because:');
  console.log('1. They look like normal browser requests');
  console.log('2. APIs are specifically targeted for blocking');
  console.log('3. We can extract data from HTML instead of JSON');
  console.log('4. The URL pattern you found is much simpler!');
}

main().catch(console.error);
