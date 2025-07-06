const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Test basic connectivity to nHentai
async function testNHentaiAccess() {
  console.log('Testing nHentai access...\n');
  
  const testUrls = [
    'https://nhentai.net',
    'https://nhentai.net/api',
    'https://nhentai.net/api/galleries/all?page=1',
    'https://nhentai.net/api/gallery/1'
  ];
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://nhentai.net/',
    'Origin': 'https://nhentai.net',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };
  
  for (const url of testUrls) {
    console.log(`Testing: ${url}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
      });
      
      console.log(`  Status: ${response.status} ${response.statusText}`);
      console.log(`  Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.status === 403) {
        console.log(`  ❌ Blocked (403) - likely geo-restricted or Cloudflare protection`);
      } else if (response.status === 429) {
        console.log(`  ⚠️  Rate limited (429)`);
      } else if (response.status === 200) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const json = await response.json();
            console.log(`  ✅ Success - JSON response received`);
            console.log(`  Data: ${JSON.stringify(json).substring(0, 100)}...`);
          } catch (e) {
            console.log(`  ❌ Failed to parse JSON`);
          }
        } else if (contentType.includes('text/html')) {
          const text = await response.text();
          if (text.includes('cloudflare') || text.includes('cf-browser-verification')) {
            console.log(`  ❌ Cloudflare protection detected`);
          } else {
            console.log(`  ✅ HTML response received (${text.length} chars)`);
          }
        } else {
          console.log(`  ✅ Other content received: ${contentType}`);
        }
      } else {
        console.log(`  ❌ Unexpected status code`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    console.log('');
  }
}

// Test with different user agents
async function testUserAgents() {
  console.log('Testing different User-Agents...\n');
  
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'curl/7.68.0'
  ];
  
  const testUrl = 'https://nhentai.net/api/galleries/all?page=1';
  
  for (const ua of userAgents) {
    console.log(`Testing UA: ${ua.substring(0, 50)}...`);
    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json',
          'Referer': 'https://nhentai.net/'
        }
      });
      
      console.log(`  Status: ${response.status}`);
      if (response.status === 200) {
        console.log(`  ✅ Success with this UA`);
      } else if (response.status === 403) {
        console.log(`  ❌ Blocked with this UA`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    console.log('');
  }
}

// Test DNS resolution
async function testDNS() {
  console.log('Testing DNS resolution...\n');
  
  const domains = [
    'nhentai.net',
    't.nhentai.net',
    'i.nhentai.net',
    'i2.nhentai.net',
    'i3.nhentai.net'
  ];
  
  for (const domain of domains) {
    try {
      const { lookup } = require('dns').promises;
      const result = await lookup(domain);
      console.log(`${domain}: ${result.address} (${result.family})`);
    } catch (error) {
      console.log(`${domain}: ❌ ${error.message}`);
    }
  }
  console.log('');
}

async function main() {
  console.log('nHentai Adapter Diagnostic Tool\n');
  console.log('='.repeat(50));
  
  await testDNS();
  await testNHentaiAccess();
  await testUserAgents();
  
  console.log('='.repeat(50));
  console.log('Diagnostic complete!');
  
  console.log('\nCommon issues and solutions:');
  console.log('1. 403 Forbidden: Usually geo-blocking or Cloudflare protection');
  console.log('2. DNS resolution failures: ISP blocking or DNS filtering');
  console.log('3. Connection timeouts: Network restrictions or firewall');
  console.log('4. HTML instead of JSON: Site changes or bot detection');
  console.log('\nTry using a VPN/proxy in a different region if blocked.');
}

main().catch(console.error);
