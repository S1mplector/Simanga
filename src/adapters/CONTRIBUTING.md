# Contributing a New Adapter

Thank you for your interest in contributing a new adapter to SiManga! This guide provides a technical deep-dive into the adapter architecture and the best practices for creating a robust, efficient, and maintainable adapter.

## Core Concepts

An adapter is a self-contained module that implements the `Adapter` interface from `src/adapters/Adapter.ts`. Its sole responsibility is to communicate with an external manga source and translate its data into the standardized data structures (`MangaMeta`, `ChapterMeta`, `PageMeta`) that SiManga understands.

Adapters are consumed by the `AdapterManager` service, which handles the lifecycle, caching, and error handling for all registered adapters.

## The `Adapter` Interface

Every adapter must implement the `Adapter` interface. While the `BaseAdapter` abstract class is provided and recommended, understanding the full interface is crucial.

### Properties

-   `id: string`: A programmatic, unique, `kebab-case` identifier. This is used for internal mapping and storage (e.g., `"mangadex"`, `"asmhentai-vpn"`).
-   `label: string`: The user-facing name of the source (e.g., `"Mangadex"`).
-   `icon?: string`: A URL to a 64x64 or 128x128 icon for the source.
-   `capabilities: AdapterCapabilities`: An object that declares the supported features of the adapter. This is critical for the UI to enable/disable functionality accordingly.

### `AdapterCapabilities`

This is not just metadata; it directly controls the user experience.

```typescript
export interface AdapterCapabilities {
  search: boolean; // True if `getMangaList` can handle a search query.
  searchByTag: boolean; // True if `getMangaList` can filter by tags in `SearchOptions`.
  multiLanguage: boolean; // True if the source provides multiple languages.
  rateLimit?: { requests: number; period: number; }; // (Optional) Inform the app of a known rate limit (in milliseconds).
  authentication?: 'none' | 'api_key' | 'oauth' | 'cookie'; // The type of auth supported.
  supportedLanguages?: string[]; // A list of ISO 639-1 language codes.
}
```

### Core Methods

1.  **`getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{ results: MangaMeta[]; hasMore?: boolean; }>`**
    -   **Responsibility**: Fetch a paginated and/or filtered list of manga.
    -   **`SearchOptions`**: This object contains all filtering parameters from the UI, including `query`, `page`, `limit`, `tags`, and more. Your implementation must respect these options to the best of the source's ability.
    -   **`AbortSignal`**: Long-running network requests should be cancellable. You must pass the `signal` to your `fetch` call. If the user navigates away, this signal will be aborted, preventing orphaned requests.
    -   **Return Value**: `results` is the array of `MangaMeta`. `hasMore` tells the UI whether to show a "Load More" button.

2.  **`getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]>`**
    -   **Responsibility**: Fetch *all* chapters for a single manga. The result is cached by the `AdapterManager`.

3.  **`getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]>`**
    -   **Responsibility**: Fetch the image URLs for each page in a chapter. This is a hot path, so it must be as efficient as possible.

### Optional & Advanced Methods

4.  **`getMangaDetails?(mangaId: string, signal?: AbortSignal): Promise<MangaMeta>`**
    -   **Use Case**: Implement this if your `getMangaList` returns only partial `MangaMeta`. When the user views a manga's details, this method is called to fetch the full data (e.g., description, full tag list, author).

5.  **`initialize?(): Promise<void>`**
    -   **Use Case**: Called once when the adapter is first used. Ideal for performing initial setup, like fetching authentication tokens, setting up a `puppeteer` instance, or populating an in-memory cache of genre lists.

6.  **`testConnectivity?(): Promise<{ success: boolean; message: string; }>`**
    -   **Use Case**: Provides a way for users to diagnose issues. This method should perform a simple check (like hitting the source's homepage) to verify that the source is reachable and not blocked by network configuration (e.g., VPN, proxy, DNS).

## Network Requests & Scraping

The core of any adapter is fetching and parsing data.

-   **`node-fetch`**: For simple JSON APIs or basic HTML pages. It's lightweight and fast. Always pass the `AbortSignal`.
-   **`cheerio`**: When you need to parse HTML. It provides a fast, jQuery-like API for traversing the DOM on the server side. Load the response body from `node-fetch` into `cheerio`.
-   **`puppeteer`**: The most powerful, but also the heaviest, tool. Use this *only as a last resort* when the content is rendered dynamically by JavaScript and cannot be reverse-engineered from the site's internal API calls. Use the `initialize` method to manage the browser instance lifecycle.

### Proxy & `https-proxy-agent`

The application's proxy settings are automatically applied to all `node-fetch` requests made through the `adapterCore` service. For complex scenarios, you may need to use the `https-proxy-agent` directly.

## Error Handling

Robust error handling is non-negotiable.

-   **Network Errors**: Wrap `fetch` calls in `try...catch` blocks. If a request fails due to a network issue (or a non-2xx status code), throw a descriptive error.
-   **Parsing Errors**: If the HTML structure of a site changes, your `cheerio` selectors might fail. Your code must be resilient to this. Return empty arrays or throw a specific `ParsingError` if critical data cannot be extracted.
-   **`testConnectivity`**: Use this to provide clear, actionable feedback to the user (e.g., "Could not connect to MyNewSource. This may be due to a firewall or a required VPN.").

## Implementation Guide

1.  **File Naming**: Create your file in `src/adapters/` with a `kebab-case` name (e.g., `my-new-source.ts`).

2.  **Extend `BaseAdapter`**: This is highly recommended.

    ```typescript
    import { BaseAdapter, MangaMeta, ChapterMeta, PageMeta, SearchOptions, AdapterCapabilities } from "./Adapter";
    import { fetch, AbortSignal } from "undici"; // Use undici for fetch
    import * as cheerio from "cheerio";

    export class MyNewSourceAdapter extends BaseAdapter {
      id = "my-new-source";
      label = "My New Source";

      capabilities: AdapterCapabilities = {
        search: true,
        searchByTag: true,
        multiLanguage: false,
        authentication: 'none',
        supportedLanguages: ['en'],
      };

      async getMangaList(options: SearchOptions, signal: AbortSignal): Promise<{ results: MangaMeta[]; hasMore: boolean; }> {
        const url = new URL("https://my-new-source.com/search");
        url.searchParams.set("q", options.query ?? "");
        url.searchParams.set("page", (options.page ?? 1).toString());
        
        try {
          const response = await fetch(url.toString(), { signal });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const html = await response.text();
          const $ = cheerio.load(html);
          
          const results: MangaMeta[] = [];
          // ... your cheerio parsing logic ...

          return { results, hasMore: true /* Logic to determine if there are more pages */ };
        } catch (error) {
          if (error.name === 'AbortError') {
            console.log('Manga list fetch aborted');
          } else {
            console.error("Failed to fetch manga list:", error);
          }
          return { results: [], hasMore: false };
        }
      }

      // ... implement other required methods
    }
    ```

3.  **Register in `src/adapters/index.ts`**: Import and instantiate your adapter in the `adapters` array.

## Testing Your Adapter

Untested adapters will not be accepted. Create a corresponding test file in `src/adapters/adapters-tests/`.

1.  **Create `my-new-source.test.ts`**.
2.  Write tests to cover the core functionality:
    -   `getMangaList` returns a valid list.
    -   `getMangaList` with a query returns filtered results.
    -   `getChapterList` returns chapters for a known manga.
    -   `getPageList` returns page URLs for a known chapter.

## Pull Request Checklist

Before you submit your PR:

-   [ ] My adapter is fully implemented and tested.
-   [ ] I have created a test file in `src/adapters/adapters-tests/`.
-   [ ] My code follows the project's style guidelines.
-   [ ] I have updated `src/adapters/index.ts` to include my new adapter.
-   [ ] The adapter ID is unique and in `kebab-case`.
-   [ ] I have handled potential errors gracefully.
-   [ ] I have used `AbortSignal` for all network requests.

Thank you for helping to make SiManga better!
