export interface MangaMeta {
  id: string;
  title: string;
  coverUrl?: string;
  author?: string;
  artist?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  description?: string;
  tags?: string[];
  alternativeTitles?: string[];
  lastUpdated?: Date;
  rating?: number;
  mature?: boolean;
}

export interface ChapterMeta {
  id: string;
  title: string;
  number?: string; // Chapter number (e.g., "1", "1.5")
  volume?: string;
  publishedAt?: Date;
  language?: string;
  pages?: number;
  scanlationGroup?: string;
}

export interface PageMeta {
  index: number;
  url: string;
  width?: number;
  height?: number;
  alternativeUrls?: string[]; // For fallback/quality options
}

export interface SearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  tags?: string[];
  excludeTags?: string[];
  sortBy?: 'relevance' | 'latest' | 'popular' | 'title';
  languages?: string[];
  status?: 'ongoing' | 'completed' | 'any';
  contentRating?: ('safe' | 'suggestive' | 'erotica' | 'pornographic')[];
}

export interface AdapterCapabilities {
  search: boolean;
  searchByTag: boolean;
  multiLanguage: boolean;
  rateLimit?: {
    requests: number;
    period: number; // in ms
  };
  authentication?: 'none' | 'api_key' | 'oauth' | 'cookie';
  supportedLanguages?: string[];
}

export interface Adapter {
  id: string;
  label: string;
  icon?: string;
  capabilities: AdapterCapabilities;
  
  // Core methods
  getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{
    results: MangaMeta[];
    hasMore?: boolean;
    total?: number;
  }>;
  
  getMangaDetails?(mangaId: string, signal?: AbortSignal): Promise<MangaMeta>;
  
  getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]>;
  
  getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]>;
  
  // Optional lifecycle methods
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
  
  // Optional auth methods
  authenticate?(credentials: any): Promise<void>;
  isAuthenticated?(): Promise<boolean>;
  
  // Optional connectivity test method
  testConnectivity?(): Promise<{
    success: boolean;
    message: string;
    suggestions: string[];
  }>;
}

// Base adapter class for common functionality
export abstract class BaseAdapter implements Adapter {
  abstract id: string;
  abstract label: string;
  abstract capabilities: AdapterCapabilities;
  
  abstract getMangaList(options?: SearchOptions, signal?: AbortSignal): Promise<{
    results: MangaMeta[];
    hasMore?: boolean;
    total?: number;
  }>;
  
  abstract getChapterList(mangaId: string, signal?: AbortSignal): Promise<ChapterMeta[]>;
  abstract getPageList(chapterId: string, signal?: AbortSignal): Promise<PageMeta[]>;
  
  // Default implementations
  async initialize(): Promise<void> {
    // Override if needed
  }
  
  async cleanup(): Promise<void> {
    // Override if needed
  }
} 