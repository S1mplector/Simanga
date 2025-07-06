#!/usr/bin/env node

// Quick proxy/Tor testing utility for SiManga
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function testConnection(url, agent, name) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      agent,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${name}: Working - IP: ${data.origin || data.IP}`);
      return true;
    } else {
      console.log(`❌ ${name}: Failed - Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: Error - ${error.message}`);
    return false;
  }
}

async function testTor() {
  console.log('Testing Tor connections...\n');
  
  // Test common Tor ports
  const torPorts = [9050, 9150, 9051];
  let torWorking = false;
  
  for (const port of torPorts) {
    const agent = new SocksProxyAgent(`socks5://127.0.0.1:${port}`);
    
    // Test with Tor check service
    const working = await testConnection('https://check.torproject.org/api/ip', agent, `Tor (port ${port})`);
    if (working) {
      torWorking = true;
      console.log(`   📍 Tor is running on port ${port}`);
      
      // Test nHentai specifically
      try {
        const nhentaiTest = await testConnection('https://httpbin.org/ip', agent, `Tor → httpbin test`);
        if (nhentaiTest) {
          console.log(`   🎯 Should work for nHentai`);
        }
      } catch (e) {
        console.log(`   ⚠️  May not work for nHentai`);
      }
      break;
    }
  }
  
  if (!torWorking) {
    console.log('❌ Tor not detected on any common port');
    console.log('');
    console.log('To start Tor:');
    console.log('  macOS: brew install tor && tor --SocksPort 9050 &');
    console.log('  Or: Download Tor Browser from torproject.org');
  }
  
  return torWorking;
}

async function testNHentaiDirect() {
  console.log('\nTesting direct nHentai access...\n');
  
  const testUrls = [
    'https://nhentai.net',
    'https://nhentai.net/api/galleries/all?page=1'
  ];
  
  for (const url of testUrls) {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log(`📡 ${url}`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.status === 200) {
        console.log(`   ✅ Accessible`);
      } else if (response.status === 403) {
        console.log(`   ❌ Blocked (403)`);
      } else {
        console.log(`   ⚠️  Unexpected status`);
      }
      
    } catch (error) {
      console.log(`📡 ${url}`);
      console.log(`   ❌ ${error.message}`);
      if (error.code === 'ETIMEDOUT') {
        console.log(`   🚫 Likely blocked by ISP`);
      }
    }
  }
}

async function testProxies() {
  console.log('\nTesting HTTP/SOCKS proxies...\n');
  
  // Example proxy list (user would replace with their own)
  const exampleProxies = [
    'http://proxy.example.com:8080',
    'socks5://proxy.example.com:1080'
  ];
  
  console.log('To test your proxies, add them to this list and run again:');
  for (const proxy of exampleProxies) {
    console.log(`   ${proxy} (example)`);
  }
  
  // Test with any real proxies if found in environment
  const userProxies = process.env.TEST_PROXIES ? process.env.TEST_PROXIES.split(',') : [];
  
  for (const proxyUrl of userProxies) {
    try {
      const agent = proxyUrl.startsWith('socks') 
        ? new SocksProxyAgent(proxyUrl)
        : new HttpsProxyAgent(proxyUrl);
      
      await testConnection('https://httpbin.org/ip', agent, `Proxy: ${proxyUrl}`);
    } catch (error) {
      console.log(`❌ Proxy ${proxyUrl}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('SiManga Proxy & Tor Connection Tester');
  console.log('=====================================\n');
  
  // Test Tor
  const torWorking = await testTor();
  
  // Test direct access
  await testNHentaiDirect();
  
  // Test proxy examples
  await testProxies();
  
  console.log('\n=====================================');
  console.log('Summary & Recommendations:');
  console.log('=====================================');
  
  if (torWorking) {
    console.log('✅ Tor is working - Enable it in SiManga settings');
    console.log('   1. SiManga Settings → Enable "Use Tor"');
    console.log('   2. Enable "nHentai Proxy"');
    console.log('   3. Test nHentai access');
  } else {
    console.log('❌ Tor not working - Install Tor first:');
    console.log('   macOS: brew install tor');
    console.log('   Or download Tor Browser: torproject.org');
  }
  
  console.log('\nFor custom proxies:');
  console.log('   TEST_PROXIES="http://proxy:8080,socks5://proxy:1080" node test-proxy.js');
}

if (require.main === module) {
  main().catch(console.error);
}
