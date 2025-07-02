import { app } from "electron";
import Store from "electron-store";
import path from "path";

export interface Settings {
  downloadDir: string;
  concurrency: number;
  preferredLanguages: string[];
}

const store = new Store<Settings>({
  name: "settings",
  defaults: {
    downloadDir: path.join(app.getPath("downloads"), "SiManga"),
    concurrency: 3,
    preferredLanguages: ["en"],
  },
});

export default store; 