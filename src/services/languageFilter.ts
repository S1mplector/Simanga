export interface Language {
  code: string;
  label: string;
  name: string;
  native: string;
}

// Complete list of languages commonly used in manga/content
export const LANGUAGES: Language[] = [
  { code: "en", label: "EN", name: "English", native: "English" },
  { code: "ja", label: "JA", name: "Japanese", native: "日本語" },
  { code: "es", label: "ES", name: "Spanish", native: "Español" },
  { code: "es-la", label: "ES-LA", name: "Spanish (LATAM)", native: "Español (LATAM)" },
  { code: "zh", label: "ZH", name: "Chinese (Simp)", native: "简体中文" },
  { code: "zh-hk", label: "ZH-HK", name: "Chinese (Trad)", native: "繁體中文" },
  { code: "fr", label: "FR", name: "French", native: "Français" },
  { code: "de", label: "DE", name: "German", native: "Deutsch" },
  { code: "it", label: "IT", name: "Italian", native: "Italiano" },
  { code: "ko", label: "KO", name: "Korean", native: "한국어" },
  { code: "pt", label: "PT", name: "Portuguese", native: "Português" },
  { code: "pt-br", label: "PT-BR", name: "Portuguese (BR)", native: "Português (BR)" },
  { code: "ru", label: "RU", name: "Russian", native: "Русский" },
  { code: "ar", label: "AR", name: "Arabic", native: "العربية" },
  { code: "pl", label: "PL", name: "Polish", native: "Polski" },
  { code: "tr", label: "TR", name: "Turkish", native: "Türkçe" },
  { code: "vi", label: "VI", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", label: "ID", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", label: "TH", name: "Thai", native: "ไทย" },
  { code: "ms", label: "MS", name: "Malay", native: "Bahasa Melayu" },
  { code: "nl", label: "NL", name: "Dutch", native: "Nederlands" },
  { code: "hu", label: "HU", name: "Hungarian", native: "Magyar" },
  { code: "no", label: "NO", name: "Norwegian", native: "Norsk" },
  { code: "sv", label: "SV", name: "Swedish", native: "Svenska" },
  { code: "cs", label: "CS", name: "Czech", native: "Čeština" },
  { code: "uk", label: "UK", name: "Ukrainian", native: "Українська" },
  { code: "ro", label: "RO", name: "Romanian", native: "Română" },
  { code: "bg", label: "BG", name: "Bulgarian", native: "Български" },
  { code: "fi", label: "FI", name: "Finnish", native: "Suomi" },
  { code: "da", label: "DA", name: "Danish", native: "Dansk" },
  { code: "el", label: "EL", name: "Greek", native: "Ελληνικά" },
  { code: "he", label: "HE", name: "Hebrew", native: "עברית" },
  { code: "hi", label: "HI", name: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "BN", name: "Bengali", native: "বাংলা" },
  { code: "fa", label: "FA", name: "Persian", native: "فارسی" },
  { code: "tl", label: "TL", name: "Filipino", native: "Filipino" },
  { code: "mn", label: "MN", name: "Mongolian", native: "Монгол" },
  { code: "my", label: "MY", name: "Burmese", native: "မြန်မာဘာသာ" },
  { code: "ca", label: "CA", name: "Catalan", native: "Català" },
  { code: "hr", label: "HR", name: "Croatian", native: "Hrvatski" },
  { code: "sr", label: "SR", name: "Serbian", native: "Српски" },
  { code: "lt", label: "LT", name: "Lithuanian", native: "Lietuvių" },
  { code: "sk", label: "SK", name: "Slovak", native: "Slovenčina" },
];

// Popular languages for quick selection
export const POPULAR_LANGUAGE_CODES = ["en", "ja", "es", "zh", "fr", "de", "it", "ko"];

// Language groups for easier selection
export const LANGUAGE_GROUPS = {
  "East Asian": ["ja", "ko", "zh", "zh-hk"],
  "European": ["en", "es", "fr", "de", "it", "pt", "ru", "pl", "nl"],
  "Southeast Asian": ["id", "th", "vi", "ms", "tl", "my"],
  "Middle Eastern": ["ar", "tr", "he", "fa"],
  "Nordic": ["no", "sv", "da", "fi"],
  "Slavic": ["ru", "pl", "cs", "uk", "bg", "hr", "sr", "sk"],
  "Romance": ["es", "fr", "it", "pt", "pt-br", "ro", "ca"],
};

export const languageFilterService = {
  /**
   * Get language object by code
   */
  getLanguageByCode(code: string): Language | undefined {
    return LANGUAGES.find(lang => lang.code === code);
  },

  /**
   * Get multiple languages by codes
   */
  getLanguagesByCodes(codes: string[]): Language[] {
    return codes
      .map(code => this.getLanguageByCode(code))
      .filter((lang): lang is Language => lang !== undefined);
  },

  /**
   * Get display name for a language code
   */
  getDisplayName(code: string): string {
    const lang = this.getLanguageByCode(code);
    return lang?.name || code.toUpperCase();
  },

  /**
   * Get native name for a language code
   */
  getNativeName(code: string): string {
    const lang = this.getLanguageByCode(code);
    return lang?.native || code;
  },

  /**
   * Check if a language code is valid
   */
  isValidLanguageCode(code: string): boolean {
    return LANGUAGES.some(lang => lang.code === code);
  },

  /**
   * Filter languages based on search query
   */
  searchLanguages(query: string): Language[] {
    const lowerQuery = query.toLowerCase();
    return LANGUAGES.filter(lang =>
      lang.code.toLowerCase().includes(lowerQuery) ||
      lang.label.toLowerCase().includes(lowerQuery) ||
      lang.name.toLowerCase().includes(lowerQuery) ||
      lang.native.toLowerCase().includes(lowerQuery)
    );
  },

  /**
   * Get languages by group
   */
  getLanguagesByGroup(groupName: keyof typeof LANGUAGE_GROUPS): Language[] {
    const codes = LANGUAGE_GROUPS[groupName] || [];
    return this.getLanguagesByCodes(codes);
  },

  /**
   * Sort languages by various criteria
   */
  sortLanguages(languages: Language[], criteria: "code" | "name" | "native" = "name"): Language[] {
    return [...languages].sort((a, b) => {
      switch (criteria) {
        case "code":
          return a.code.localeCompare(b.code);
        case "native":
          return a.native.localeCompare(b.native);
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  },

  /**
   * Get popular languages
   */
  getPopularLanguages(): Language[] {
    return this.getLanguagesByCodes(POPULAR_LANGUAGE_CODES);
  },

  /**
   * Format selected languages for display
   */
  formatSelectedLanguages(codes: string[]): string {
    if (codes.length === 0 || codes.length === LANGUAGES.length) {
      return "All languages";
    }
    
    if (codes.length <= 3) {
      return codes
        .map(code => this.getLanguageByCode(code)?.name || code)
        .join(", ");
    }
    
    return `${codes.length} languages selected`;
  },

  /**
   * Get language statistics from content
   */
  getLanguageStats(items: Array<{ language?: string }>): Record<string, number> {
    const stats: Record<string, number> = {};
    
    items.forEach(item => {
      const lang = item.language || "unknown";
      stats[lang] = (stats[lang] || 0) + 1;
    });
    
    return stats;
  },

  /**
   * Suggest languages based on user's browser/system
   */
  suggestLanguagesFromLocale(): string[] {
    const userLangs = navigator.languages || [navigator.language];
    const suggested: string[] = [];
    
    userLangs.forEach(locale => {
      // Extract language code from locale (e.g., "en-US" -> "en")
      const langCode = locale.split("-")[0].toLowerCase();
      
      // Find exact match or similar languages
      LANGUAGES.forEach(lang => {
        if (lang.code.startsWith(langCode) && !suggested.includes(lang.code)) {
          suggested.push(lang.code);
        }
      });
    });
    
    // Always include English as fallback
    if (!suggested.includes("en")) {
      suggested.push("en");
    }
    
    return suggested;
  }
}; 