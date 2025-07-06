const { SocksProxyAgent } = require("socks-proxy-agent");
const https = require("https");

// Test 1: Direct TOR connection
async function testTorConnection() {
  console.log("1. Testing TOR connection...");
  
  const torAgent = new SocksProxyAgent("socks5://127.0.0.1:9050");
  
  const options = {
    hostname: 'check.torproject.org',
    path: '/api/ip',
    agent: torAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  
  return new Promise((resolve) => {
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log("✅ TOR is working:", json);
          resolve(true);
        } catch (e) {
          console.log("❌ TOR response error:", e.message);
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log("❌ TOR connection error:", e.message);
      resolve(false);
    });
  });
}

// Test 2: nHentai through TOR
async function testNHentaiTor() {
  console.log("\n2. Testing nHentai through TOR...");
  
  const torAgent = new SocksProxyAgent("socks5://127.0.0.1:9050");
  
  const options = {
    hostname: 'nhentai.net',
    path: '/',
    agent: torAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  };
  
  return new Promise((resolve) => {
    const req = https.get(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      if (res.statusCode === 403) {
        console.log("❌ Access forbidden - nHentai is blocking TOR exit node");
      } else if (res.statusCode === 200) {
        console.log("✅ Successfully connected to nHentai through TOR!");
      } else {
        console.log(`⚠️ Unexpected status code: ${res.statusCode}`);
      }
      
      // Consume response
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode));
    });
    
    req.on('error', (e) => {
      console.log("❌ Connection error:", e.message);
      resolve(null);
    });
    
    req.setTimeout(15000, () => {
      console.log("❌ Request timed out");
      req.destroy();
      resolve(null);
    });
  });
}

// Test 3: Check proxy settings
async function checkProxySettings() {
  console.log("\n3. Checking SiManga proxy settings...");
  
  try {
    const Store = require('electron-store');
    const store = new Store({ name: 'settings' });
    
    console.log("torEnabled:", store.get('torEnabled', false));
    console.log("torSocksPort:", store.get('torSocksPort', 9050));
    console.log("nhentaiProxyEnabled:", store.get('nhentaiProxyEnabled', false));
    console.log("proxies:", store.get('proxies', []));
  } catch (e) {
    console.log("Note: Run this inside the Electron app to check actual settings");
    console.log("For now, assuming default settings");
  }
}

// Test 4: Test the adapter directly
async function testAdapter() {
  console.log("\n4. Testing nhentai-direct adapter...");
  
  try {
    // We'll need to mock some dependencies
    global.window = { settings: {} };
    
    const adapter = require('./src/adapters/nhentai-direct.ts');
    
    const result = await adapter.default.testConnectivity();
    console.log("Adapter test result:", result);
  } catch (e) {
    console.log("Note: Adapter test requires full app context");
    console.log("Error:", e.message);
  }
}

// Run all tests
async function runTests() {
  console.log("=== nHentai TOR Connectivity Diagnostics ===\n");
  
  const torWorking = await testTorConnection();
  
  if (torWorking) {
    await testNHentaiTor();
  }
  
  await checkProxySettings();
  
  console.log("\n=== Diagnosis Complete ===");
  console.log("\nTo fix the issue:");
  console.log("1. Make sure torEnabled is set to true in settings");
  console.log("2. Make sure nhentaiProxyEnabled is set to true");
  console.log("3. If nHentai blocks TOR, try using bridges or a different exit node");
}

runTests(); 