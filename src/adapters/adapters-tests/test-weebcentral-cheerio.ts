import adapter from '../weebcentral-cheerio';

async function test() {
    try {
        console.log('--- Testing WeebCentral Cheerio Adapter ---');
        
        console.log('1. Testing getMangaList (no query)...');
        const mangaList = await adapter.getMangaList();
        console.log(`   Found ${mangaList.results.length} manga.`);
        
        if (mangaList.results.length === 0) {
            console.log('   No manga found, cannot proceed with further tests.');
            return;
        }
        
        console.log('   First 3 results:');
        mangaList.results.slice(0, 3).forEach((manga, i) => {
            console.log(`   ${i + 1}. ${manga.title} (ID: ${manga.id})`);
        });

        const firstManga = mangaList.results[0];
        console.log(`\n2. Testing getChapterList for "${firstManga.title}"...`);
        const chapterList = await adapter.getChapterList(firstManga.id);
        console.log(`   Found ${chapterList.length} chapters.`);
        
        if (chapterList.length === 0) {
            console.log('   No chapters found, cannot proceed with page list test.');
            return;
        }
        
        console.log('   First 3 chapters:');
        chapterList.slice(0, 3).forEach((chapter, i) => {
            console.log(`   ${i + 1}. ${chapter.title} (ID: ${chapter.id})`);
        });

        const firstChapter = chapterList[0];
        console.log(`\n3. Testing getPageList for "${firstChapter.title}"...`);
        const pageList = await adapter.getPageList(firstChapter.id);
        console.log(`   Found ${pageList.length} pages.`);
        
        if (pageList.length > 0) {
            console.log('   First 3 pages:');
            pageList.slice(0, 3).forEach((page, i) => {
                console.log(`   ${i + 1}. ${page.url.substring(0, 80)}...`);
            });
        }

        console.log('\n4. Testing search functionality...');
        const searchResults = await adapter.getMangaList({ query: 'solo leveling' });
        console.log(`   Found ${searchResults.results.length} search results.`);
        
        if (searchResults.results.length > 0) {
            console.log('   First 3 search results:');
            searchResults.results.slice(0, 3).forEach((manga, i) => {
                console.log(`   ${i + 1}. ${manga.title} (ID: ${manga.id})`);
            });
        }

        console.log('\n--- All tests completed successfully! ---');

    } catch (error) {
        console.error('--- Test failed ---');
        console.error('Error:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
    }
}

test();
