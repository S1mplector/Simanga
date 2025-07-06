const NHentaiVPN = require('../../../dist/adapters/nhentai-vpn.js').default;

async function testNHentaiVPN() {
  console.log('Testing nHentai VPN adapter...\n');
  
  try {
    // Test 1: Search
    console.log('1. Testing search...');
    const searchResults = await NHentaiVPN.getMangaList({ query: 'ai', page: 1 });
    console.log(`Found ${searchResults.results.length} results`);
    if (searchResults.results.length > 0) {
      const first = searchResults.results[0];
      console.log(`First result: ${first.title} (ID: ${first.id})`);
      console.log(`Cover URL: ${first.coverUrl}`);
      
      // Test 2: Get details
      console.log('\n2. Testing manga details...');
      const details = await NHentaiVPN.getMangaDetails(first.id);
      console.log(`Title: ${details.title}`);
      console.log(`Artist: ${details.artist || 'Unknown'}`);
      
      // Test 3: Get chapters
      console.log('\n3. Testing chapter list...');
      const chapters = await NHentaiVPN.getChapterList(first.id);
      console.log(`Found ${chapters.length} chapters`);
      if (chapters.length > 0) {
        console.log(`Chapter: ${chapters[0].title} (${chapters[0].pages} pages)`);
        
        // Test 4: Get pages
        console.log('\n4. Testing page list...');
        try {
          const pages = await NHentaiVPN.getPageList(chapters[0].id);
          console.log(`Found ${pages.length} pages`);
          if (pages.length > 0) {
            console.log(`First page URL: ${pages[0].url}`);
            console.log(`Last page URL: ${pages[pages.length - 1].url}`);
          }
        } catch (pageError) {
          console.error('Failed to get pages:', pageError.message);
        }
      }
    }
    
    // Test 5: Browse (no search term)
    console.log('\n5. Testing browse...');
    const browseResults = await NHentaiVPN.getMangaList({ page: 1 });
    console.log(`Found ${browseResults.results.length} browse results`);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testNHentaiVPN(); 