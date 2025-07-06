import { app } from "electron";
import Store from "electron-store";
import path from "path";

export interface Settings {
  downloadDir: string;
  concurrency: number;
  preferredLanguages: string[];
  proxies: string[];
  torEnabled: boolean;
  torSocksPort: number;
  torControlPort: number;
  torPassword?: string;
  torAutoStart: boolean;
  torBridges: string[];
  nhentaiProxyEnabled: boolean;
  asmhentaiProxyEnabled: boolean;
  hitomiProxyEnabled: boolean;
  disabledSources: string[];
  mangahookApiUrl?: string;
  nsfwEnabled: boolean;
}

const store = new Store<Settings>({
  name: "settings",
  defaults: {
    downloadDir: path.join(app.getPath("downloads"), "SiManga"),
    concurrency: 3,
    preferredLanguages: ["en"],
    proxies: [],
    torEnabled: false,
    torSocksPort: 9050,
    torControlPort: 9051,
    torPassword: undefined,
    torAutoStart: false,
    torBridges: [],
    nhentaiProxyEnabled: false,
    asmhentaiProxyEnabled: false,
    hitomiProxyEnabled: false,
    disabledSources: [],
    mangahookApiUrl: undefined,
    nsfwEnabled: false,
  },
});

export default store; 