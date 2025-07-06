import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { 
  LanguageIcon, 
  CheckIcon, 
  XMarkIcon,
  GlobeAltIcon 
} from "@heroicons/react/24/outline";

// Expanded language options with full names and native names
const LANG_OPTIONS: { code: string; label: string; name: string; native: string }[] = [
  { code: "en", label: "EN", name: "English", native: "English" },
  { code: "ja", label: "JA", name: "Japanese", native: "日本語" },
  { code: "es", label: "ES", name: "Spanish", native: "Español" },
  { code: "zh", label: "ZH", name: "Chinese", native: "中文" },
  { code: "zh-hk", label: "ZH-HK", name: "Chinese (HK)", native: "繁體中文" },
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
];

// Popular languages to show by default
const POPULAR_LANGS = ["en", "ja", "es", "zh", "fr", "de", "it", "ko"];

interface Props {
  className?: string;
  variant?: "compact" | "expanded";
}

const LanguageSelect: React.FC<Props> = ({ className = "", variant = "compact" }) => {
  const preferred = useSettingsStore((s: any) => s.preferredLanguages);
  const setPreferred = useSettingsStore((s: any) => s.setPreferredLanguages);
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Load from main settings on mount
  useEffect(() => {
    (async () => {
      const saved = await (window as any).settings.getPreferredLanguages();
      if (saved && Array.isArray(saved)) {
        setPreferred(saved);
      }
    })();
  }, [setPreferred]);

  // Save whenever preferred changes
  useEffect(() => {
    (window as any).settings.setPreferredLanguages(preferred);
  }, [preferred]);

  const toggleLanguage = (code: string) => {
    if (preferred.includes(code)) {
      setPreferred(preferred.filter((c: string) => c !== code));
    } else {
      setPreferred([...preferred, code]);
    }
  };

  const selectAll = () => {
    setPreferred(LANG_OPTIONS.map(opt => opt.code));
  };

  const selectNone = () => {
    setPreferred([]);
  };

  const selectPopular = () => {
    setPreferred(POPULAR_LANGS);
  };

  // Filter languages based on search
  const filteredOptions = LANG_OPTIONS.filter(opt => 
    opt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.native.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Languages to display in compact mode
  const displayedOptions = showAll || variant === "expanded" 
    ? filteredOptions 
    : filteredOptions.filter(opt => POPULAR_LANGS.includes(opt.code));

  if (variant === "compact") {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
          title="Language Filter"
        >
          <LanguageIcon className="w-4 h-4" />
          <span className="font-medium">
            {preferred.length === 0 
              ? "All Languages" 
              : preferred.length === 1 
                ? LANG_OPTIONS.find(l => l.code === preferred[0])?.label || preferred[0].toUpperCase()
                : `${preferred.length} Languages`
            }
          </span>
        </button>

        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowDropdown(false)} 
            />
            <div className="absolute top-full right-0 mt-2 w-96 bg-gray-900 rounded-lg shadow-xl border border-gray-700 z-50">
              {/* Header */}
              <div className="p-3 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <LanguageIcon className="w-4 h-4" />
                    Language Filter
                  </h3>
                  <button
                    onClick={() => setShowDropdown(false)}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search languages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Quick Actions */}
              <div className="p-2 border-b border-gray-700 flex gap-2">
                <button
                  onClick={selectAll}
                  className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={selectNone}
                  className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                >
                  Select None
                </button>
                <button
                  onClick={selectPopular}
                  className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                >
                  Popular
                </button>
              </div>

              {/* Language List */}
              <div className="max-h-80 overflow-y-auto p-2">
                {filteredOptions.map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => toggleLanguage(opt.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-800 transition-colors ${
                      preferred.includes(opt.code) ? "bg-gray-800" : ""
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border ${
                      preferred.includes(opt.code) 
                        ? "bg-blue-500 border-blue-500" 
                        : "border-gray-600"
                    } flex items-center justify-center`}>
                      {preferred.includes(opt.code) && (
                        <CheckIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{opt.label}</span>
                        <span className="text-sm">{opt.name}</span>
                      </div>
                      <div className="text-xs text-gray-400">{opt.native}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Status */}
              <div className="p-2 border-t border-gray-700 text-xs text-gray-400 text-center">
                {preferred.length === 0 
                  ? "Showing content in all languages" 
                  : `Filtering to ${preferred.length} language${preferred.length === 1 ? "" : "s"}`
                }
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Expanded variant for settings page
  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <GlobeAltIcon className="w-5 h-5" />
          Preferred Languages
        </h3>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            All
          </button>
          <button
            onClick={selectNone}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            None
          </button>
          <button
            onClick={selectPopular}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Popular
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-3">
        Select languages to show content in. This affects search results and available chapters.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            title={opt.native}
            onClick={() => toggleLanguage(opt.code)}
            className={`px-3 py-2 rounded border transition-all ${
              preferred.includes(opt.code) 
                ? "bg-blue-600 border-blue-600 text-white" 
                : "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
            }`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className="text-xs opacity-75">{opt.name}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 bg-gray-800 rounded">
        <p className="text-sm text-gray-300">
          <strong>Currently selected:</strong> {
            preferred.length === 0 
              ? "All languages" 
              : preferred.length === LANG_OPTIONS.length
                ? "All languages"
                : preferred.map((code: string) => 
                    LANG_OPTIONS.find(opt => opt.code === code)?.name || code
                  ).join(", ")
          }
        </p>
      </div>
    </div>
  );
};

export default LanguageSelect; 