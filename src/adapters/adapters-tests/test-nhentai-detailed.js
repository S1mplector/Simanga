const https = require('https');
const http = require('http');

// More detailed connection testing
async function detailedConnectionTest() {
  console.log('Detailed nHentai Connection Test\n');
  
  // Test 1: Basic HTTPS connection
  console.log('1. Testing raw HTTPS connection...');
  try {
    await new Promise((resolve, reject) => {
      const req = https.request('https://nhentai.net', {
        method: 'GET',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Headers: ${JSON.stringify(res.headers, null, 2)}`);
        resolve(res);
      });
      
      req.on('error', (err) => {
        console.log(`   Error: ${err.message}`);
        console.log(`   Code: ${err.code}`);
        reject(err);
      });
      
      req.on('timeout', () => {
        console.log(`   Timeout reached`);
        req.destroy();
        reject(new Error('Timeout'));
      });
      
      req.end();
    });
  } catch (error) {
    console.log(`   Failed: ${error.message}`);
  }
  
  console.log('\n2. Testing alternative domains...');
  
  const altDomains = [
    'https://nhentai.to',
    'https://nhentai.xxx', 
    'https://nhentai.com',
    'https://nhentai.org'
  ];
  
  for (const domain of altDomains) {
    console.log(`   Testing: ${domain}`);
    try {
      const response = await fetch(domain, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log(`     Status: ${response.status}`);
    } catch (error) {
      console.log(`     Failed: ${error.message}`);
    }
  }
  
  console.log('\n3. Testing connectivity to other sites...');
  
  const testSites = [
    'https://httpbin.org/get',
    'https://jsonplaceholder.typicode.com/posts/1',
    'https://api.github.com/repos/electron/electron'
  ];
  
  for (const site of testSites) {
    console.log(`   Testing: ${site}`);
    try {
      const response = await fetch(site);
      console.log(`     ✅ Status: ${response.status}`);
    } catch (error) {
      console.log(`     ❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n4. Checking regional issues...');
  
  // Check if we can determine current location
  try {
    const response = await fetch('https://httpbin.org/ip');
    const data = await response.json();
    console.log(`   Your IP: ${data.origin}`);
    
    // Check geolocation
    const geoResponse = await fetch(`https://ipapi.co/${data.origin}/json/`);
    const geoData = await geoResponse.json();
    console.log(`   Location: ${geoData.city}, ${geoData.region}, ${geoData.country_name}`);
    
    // Check if in a country that commonly blocks adult content
    const restrictedCountries = ['CN', 'IN', 'ID', 'MY', 'SG', 'TH', 'VN', 'KR', 'AU'];
    if (restrictedCountries.includes(geoData.country_code)) {
      console.log(`   ⚠️  Your country (${geoData.country_code}) may have restrictions on adult content sites`);
    }
    
  } catch (error) {
    console.log(`   Could not determine location: ${error.message}`);
  }
}

detailedConnectionTest().catch(console.error);
