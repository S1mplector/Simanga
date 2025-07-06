// Advanced nHentai access test with rotating Tor circuits and browser emulation
const { SocksProxyAgent } = require('socks-proxy-agent');

async function testNHentaiWithAdvancedTechniques() {
  console.log('Advanced nHentai Access Test');
  console.log('============================\n');
  
  // Different User-Agent strings to try
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  ];
  
  // Test different approaches
  const testApproaches = [
    {
      name: 'Direct homepage',
      url: 'https://nhentai.net',
      timeout: 15000
    },
    {
      name: 'API endpoint',
      url: 'https://nhentai.net/api/galleries/all?page=1',
      timeout: 20000
    },
    {
      name: 'Search endpoint',
      url: 'https://nhentai.net/api/galleries/search?query=test&page=1',
      timeout: 20000
    }
  ];
  
  for (const approach of testApproaches) {
    console.log(`\nTesting: ${approach.name}`);
    console.log('-'.repeat(40));
    
    for (let i = 0; i < userAgents.length; i++) {
      const userAgent = userAgents[i];
      console.log(`\nAttempt ${i + 1}: ${userAgent.split(') ')[0]})...`);
      
      try {
        const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
        const fetch = (await import('node-fetch')).default;
        
        const headers = {
          'User-Agent': userAgent,
          'Accept': approach.url.includes('/api/') ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': approach.url.includes('/api/') ? 'empty' : 'document',
          'Sec-Fetch-Mode': approach.url.includes('/api/') ? 'cors' : 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Cache-Control': 'max-age=0'
        };
        
        if (approach.url.includes('/api/')) {
          headers['Referer'] = 'https://nhentai.net/';
          headers['Origin'] = 'https://nhentai.net';
        }
        
        const response = await fetch(approach.url, {
          agent,
          headers,
          timeout: approach.timeout,
          redirect: 'follow'
        });
        
        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('application/json')) {
            const json = await response.json();
            console.log(`   ✅ SUCCESS - Got JSON response`);
            console.log(`   📊 Data: ${JSON.stringify(json).substring(0, 100)}...`);
            return { success: true, data: json, approach: approach.name };
          } else if (contentType.includes('text/html')) {
            const html = await response.text();
            console.log(`   ✅ SUCCESS - Got HTML (${html.length} chars)`);
            
            if (html.includes('<title>')) {
              const titleMatch = html.match(/<title>(.*?)<\/title>/i);
              console.log(`   📄 Title: ${titleMatch?.[1] || 'Unknown'}`);
            }
            
            // Check for blocking indicators
            if (html.includes('cloudflare') || html.includes('cf-browser-verification')) {
              console.log(`   ⚠️  Cloudflare protection detected`);
            } else if (html.includes('blocked') || html.includes('restricted')) {
              console.log(`   ⚠️  Site blocking detected`);
            } else if (html.includes('nhentai')) {
              console.log(`   🎯 Appears to be genuine nHentai content`);
              return { success: true, data: html.substring(0, 500), approach: approach.name };
            }
          }
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
          
          if (response.status === 403) {
            console.log(`   🚫 Access forbidden - likely blocked`);
          } else if (response.status === 503) {
            console.log(`   ⚠️  Service unavailable`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        
        if (error.message.includes('timeout')) {
          console.log(`   ⏱️  Connection timed out`);
        } else if (error.message.includes('ECONNRESET')) {
          console.log(`   🔌 Connection reset`);
        }
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('❌ All attempts failed');
  console.log('\nPossible reasons:');
  console.log('1. nHentai has sophisticated DDoS protection');
  console.log('2. Site requires JavaScript/browser environment');
  console.log('3. Specific Tor exit nodes may be blocked');
  console.log('4. Site is experiencing downtime');
  console.log('5. Additional authentication/cookies required');
  
  console.log('\nRecommendations:');
  console.log('1. Try browser-based access through Tor Browser');
  console.log('2. Use Puppeteer with Tor for full browser emulation');
  console.log('3. Try during different times of day');
  console.log('4. Consider alternative nHentai mirrors');
  
  return { success: false };
}

testNHentaiWithAdvancedTechniques().catch(console.error);
