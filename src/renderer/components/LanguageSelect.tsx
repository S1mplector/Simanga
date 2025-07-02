import React, { useEffect } from "react";
import { useSettingsStore } from "../store/settingsStore";

const LANG_OPTIONS: { code: string; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "JA" },
  { code: "es", label: "ES" },
  { code: "zh", label: "ZH" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "it", label: "IT" },
  { code: "ko", label: "KO" },
];

interface Props {
  className?: string;
}

const LanguageSelect: React.FC<Props> = ({ className = "" }) => {
  const preferred = useSettingsStore((s: any) => s.preferredLanguages);
  const setPreferred = useSettingsStore((s: any) => s.setPreferredLanguages);

  // load from main settings on mount
  useEffect(() => {
    (async () => {
      const saved = await (window as any).settings.getPreferredLanguages();
      if (saved && Array.isArray(saved)) {
        setPreferred(saved);
      }
    })();
  }, [setPreferred]);

  // save whenever preferred changes
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

  return (
    <div className={`flex gap-1 ${className}`}> 
      {LANG_OPTIONS.map((opt) => (
        <button
          key={opt.code}
          title={`Include ${opt.label}`}
          onClick={() => toggleLanguage(opt.code)}
          className={`px-2 py-1 text-xs rounded border border-gray-600 hover:bg-gray-700 ${
            preferred.includes(opt.code) ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSelect; 