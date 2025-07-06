
const path = require('path');
const { pathToFileURL } = require('url');

async function loadAdapter() {
  try {
    // Try to load the TypeScript file directly
    const adapterPath = path.resolve(__dirname, '../weebcentral-cheerio.ts');
    const { default: adapter } = await import(pathToFileURL(adapterPath).href);
    return adapter;
  } catch (error) {
    console.error('Error loading adapter:', error.message);
    console.log('Trying alternative import method...');
    
    // Alternative: try to require the compiled JS if available
    try {
      const WeebCentralAdapter = require('../weebcentral-cheerio').default;
      return WeebCentralAdapter;
    } catch (err) {
      console.error('Alternative import also failed:', err.message);
      throw new Error('Could not load WeebCentral adapter');
    }
  }
}

async function test() {
  try {
    console.log('Loading WeebCentral adapter...');
    const adapter = await loadAdapter();
    
    console.log('--- Testing getMangaList (no query) ---');
    const mangaList = await adapter.getMangaList();
    console.log(`Found ${mangaList.results.length} manga.`);
    
    if (mangaList.results.length === 0) {
      console.log('No manga found, cannot proceed with further tests.');
      return;
    }
    console.log('First 5 results:', mangaList.results.slice(0, 5));

    const firstManga = mangaList.results[0];
    console.log(`\n--- Testing getChapterList for "${firstManga.title}" (ID: ${firstManga.id}) ---`);
    const chapterList = await adapter.getChapterList(firstManga.id);
    console.log(`Found ${chapterList.length} chapters.`);
    
    if (chapterList.length === 0) {
      console.log('No chapters found, cannot proceed with page list test.');
      return;
    }
    console.log('First 5 chapters:', chapterList.slice(0, 5));

    const firstChapter = chapterList[0];
    console.log(`\n--- Testing getPageList for "${firstChapter.title}" (ID: ${firstChapter.id}) ---`);
    const pageList = await adapter.getPageList(firstChapter.id);
    console.log(`Found ${pageList.length} pages.`);
    console.log('First 5 pages:', pageList.slice(0, 5));

    console.log('\n--- Testing getMangaList (with query: "solo leveling") ---');
    const searchResults = await adapter.getMangaList({ query: 'solo leveling' });
    console.log(`Found ${searchResults.results.length} search results.`);
    console.log('First 5 search results:', searchResults.results.slice(0, 5));

    console.log('\n--- All tests completed successfully! ---');

  } catch (error) {
    console.error('--- A test failed ---');
    console.error(error);
  }
}

test();
