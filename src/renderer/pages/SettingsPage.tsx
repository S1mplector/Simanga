import React, { useEffect, useState } from "react";
import LanguageSelect from "../components/LanguageSelect";
import ConfirmationModal from "../components/ConfirmationModal";
import { proxyPresets, ProxyPreset } from "../constants/proxyPresets";
// @ts-ignore - image asset
import flushMascot from "../../assets/icons/extras/flush.png";
import { useToast } from "../components/ToastProvider";

const SettingsPage: React.FC = () => {
  const toast = useToast();
  const [proxyText, setProxyText] = useState("");
  const [torEnabled, setTorEnabled] = useState(false);
  const [nhentaiProxyEnabled, setNHentaiProxyEnabled] = useState(false);
  const [asmhentaiProxyEnabled, setASMHentaiProxyEnabled] = useState(false);
  const [hitomiProxyEnabled, setHitomiProxyEnabled] = useState(false);
  const [mangafireProxyEnabled, setMangaFireProxyEnabled] = useState(false);

  // New settings state
  const [downloadDir, setDownloadDir] = useState<string>("");
  const [sources, setSources] = useState<{ id: string; label: string }[]>([]);
  const [disabledSources, setDisabledSources] = useState<string[]>([]);
  const [nsfwEnabled, setNsfwEnabled] = useState(false);

  const [showAdvancedProxy, setShowAdvancedProxy] = useState(false);

  const addProxy = (val: string) => {
    const lines = proxyText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length);
    if (!lines.includes(val)) {
      setProxyText((prev) => (prev.trim().length ? `${prev.trim()}\n${val}` : val));
    }
  };

  useEffect(() => {
    (async () => {
      const list = await window.settings.getProxies();
      setProxyText(list.join("\n"));

      // Load download directory
      const dir = await (window as any).settings.getDownloadDir();
      setDownloadDir(dir);

      // Load sources and disabled list
      const allSources = await window.repo.listAllSources();
      setSources(allSources);
      const disabled = await (window as any).settings.getDisabledSources();
      setDisabledSources(disabled || []);

      const tor = await window.settings.getTorEnabled();
      setTorEnabled(!!tor);
      const nhentai = await (window as any).settings.getNHentaiProxyEnabled();
      setNHentaiProxyEnabled(!!nhentai);
      const asmhentai = await (window as any).settings.getASMHentaiProxyEnabled();
      setASMHentaiProxyEnabled(!!asmhentai);
      const hitomi = await (window as any).settings.getHitomiProxyEnabled();
      setHitomiProxyEnabled(!!hitomi);
      const mangfire = await (window as any).settings.getMangaFireProxyEnabled();
      setMangaFireProxyEnabled(!!mangfire);

      const nsfw = await (window as any).settings.getNSFWEnabled();
      setNsfwEnabled(!!nsfw);
    })();
  }, []);

  const save = async () => {
    const arr = proxyText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length);
    await window.settings.setProxies(arr);
    await window.settings.setTorEnabled(torEnabled);
    await (window as any).settings.setNHentaiProxyEnabled(nhentaiProxyEnabled);
    await (window as any).settings.setASMHentaiProxyEnabled(asmhentaiProxyEnabled);
    await (window as any).settings.setHitomiProxyEnabled(hitomiProxyEnabled);
    await (window as any).settings.setMangaFireProxyEnabled(mangafireProxyEnabled);

    // Save disabled sources
    await (window as any).settings.setDisabledSources(disabledSources);
    await (window as any).settings.setNSFWEnabled(nsfwEnabled);
    toast("Settings saved – changes take effect immediately");
  };

  const changeDownloadDir = async () => {
    const dir = await (window as any).settings.selectDownloadDir();
    setDownloadDir(dir);
  };

  const toggleSource = (id: string) => {
    if (disabledSources.includes(id)) {
      setDisabledSources(disabledSources.filter((s) => s !== id));
    } else {
      setDisabledSources([...disabledSources, id]);
    }
  };

  // Confirm dialog for enabling NSFW
  const [showNsfwConfirm, setShowNsfwConfirm] = useState(false);
  const enableNsfw = () => {
    if (!nsfwEnabled) {
      setShowNsfwConfirm(true);
    } else {
      setNsfwEnabled(false);
    }
  };

  const confirmEnable = (confirmed: boolean) => {
    if (confirmed) setNsfwEnabled(true);
    setShowNsfwConfirm(false);
  };

  // Filter sources if NSFW disabled
  const nsfwIds = ["nhentai-vpn", "asmhentai-vpn", "hitomi"];
  const visibleSources = nsfwEnabled ? sources : sources.filter((s) => !nsfwIds.includes(s.id));

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-semibold">Settings</h2>
      
      {/* Download Settings */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-lg mb-2">Download Folder</h3>
        <div className="flex items-center gap-2 text-sm break-all">
          <span className="flex-1">{downloadDir}</span>
          <button onClick={changeDownloadDir} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Change</button>
          <button onClick={() => (window as any).settings.openDownloadFolder()} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Open</button>
        </div>
      </div>

      {/* Language Preferences Section */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <LanguageSelect variant="expanded" />
      </div>

      {/* NSFW Toggle Section */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-lg">NSFW Content</label>
          <button
            onClick={enableNsfw}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${nsfwEnabled ? "bg-green-600 hover:bg-green-500" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {nsfwEnabled ? "Enabled" : "Enable"}
          </button>
        </div>
        {!nsfwEnabled && (
          <p className="text-xs text-gray-400">Disabled by default to keep things safe for all ages.</p>
        )}
      </div>

      {/* Source Toggles Section */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-lg mb-2">Sources</h3>
        <div className="space-y-1">
          {visibleSources.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!disabledSources.includes(s.id)}
                onChange={() => toggleSource(s.id)}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Proxy Settings Section */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-lg mb-2">Proxy / Tor</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          SiManga will now auto-detect a running Tor proxy on&nbsp;
          <code className="mx-1">9050</code> or&nbsp;
          <code className="mx-1">9150</code>.  In most cases you only need to
          tick the sources you want to route through it.
        </p>

        {/* Simple toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={nhentaiProxyEnabled} onChange={(e) => setNHentaiProxyEnabled(e.target.checked)} />
            <span>Route nHentai through Tor / proxy</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={asmhentaiProxyEnabled} onChange={(e) => setASMHentaiProxyEnabled(e.target.checked)} />
            <span>Route ASM Hentai through Tor / proxy</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hitomiProxyEnabled} onChange={(e) => setHitomiProxyEnabled(e.target.checked)} />
            <span>Route Hitomi through Tor / proxy</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mangafireProxyEnabled} onChange={(e) => setMangaFireProxyEnabled(e.target.checked)} />
            <span>Route MangaFire through Tor / proxy</span>
          </label>
        </div>

        {/* Advanced section toggle */}
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => setShowAdvancedProxy(!showAdvancedProxy)}
        >
          {showAdvancedProxy ? "Hide" : "Show"} advanced proxy list
        </button>

        {showAdvancedProxy && (
          <div className="space-y-2 mt-2">
            <p className="text-sm text-gray-400">
              Add custom proxies below (one per line).  These will be tried if Tor is
              unavailable or disabled.
            </p>
            {/* Quick-add preset proxies */}
            <div className="flex flex-wrap gap-2 mb-2">
              {proxyPresets.map((p: ProxyPreset) => (
                <button
                  key={p.value}
                  onClick={() => addProxy(p.value)}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full h-40 bg-gray-800 text-gray-100 p-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              value={proxyText}
              onChange={(e) => setProxyText(e.target.value)}
              placeholder="http://user:pass@host:port\nsocks5://host:port"
            />
          </div>
        )}
      </div>

      {/* NSFW confirmation modal */}
      <ConfirmationModal
        isOpen={showNsfwConfirm}
        onClose={() => setShowNsfwConfirm(false)}
        onConfirm={confirmEnable}
        title="Enable NSFW content?"
        message="Are you sure you want to view adult sources?"
        confirmText="Yes"
        cancelText="No"
        mascotImage={flushMascot}
        variant="warning"
      />

      {/* Save Settings button at bottom */}
      <div className="flex justify-end mt-6">
        <button
          onClick={save}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage; 