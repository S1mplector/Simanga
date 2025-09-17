import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "path";
import { adapters } from "./adapters";
import type { MangaMeta, ChapterMeta, PageMeta, SearchOptions } from "./adapters/Adapter";
import { downloadManager } from "./services/downloadManager";
import { libraryService } from "./services/library";
import settingsStore from "./services/settings";
import { readingListService } from "./services/readingList";
import { finishedChaptersService } from "./services/finishedChapters";
import { thumbnailCacheService } from "./services/thumbnailCache";
import * as mangaCache from "./services/mangaCache";
import { sourceHealthService } from "./services/sourceHealth";
import { downloadedMangaService } from "./services/downloadedManga";
import { bookmarkService } from "./services/bookmark";

// TEMP: disable TLS certificate validation so self-signed proxies work during testing.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const isDev = !app.isPackaged;

// Disable GPU acceleration (helps on Wine/CrossOver environments)
app.disableHardwareAcceleration();

// Set the app icon globally before creating windows
if (process.platform === 'win32' || process.platform === 'linux') {
  const iconFile = process.platform === 'win32' ? 'simanga.ico' : 'simanga.png';
  const iconPath = path.join(app.getAppPath(), 'src', 'assets', 'icons', iconFile);
  if (require('fs').existsSync(iconPath)) {
    // This will be used for dialogs on Windows/Linux
    app.setAppUserModelId("com.simanga.app");
  }
}

function createWindow() {
  const iconFile = process.platform === 'darwin' ? 'simanga.icns' : 'simanga.ico';
  const iconPath = path.join(app.getAppPath(), 'src', 'assets', 'icons', iconFile);

  // macOS dock icon must be set via app.dock
  if (process.platform === 'darwin') {
    try {
      const { nativeImage } = require('electron');
      app.dock.setIcon(nativeImage.createFromPath(iconPath));
    } catch (err) {
      console.warn('Failed to set macOS dock icon', err);
    }
  }

  // Create the main window but keep it hidden for now
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      webSecurity: false,
    },
    icon: iconPath,
  });

  // When the main window is ready, simply show it
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  
  // Start source health monitoring
  sourceHealthService.startMonitoring(300000); // Check every 5 minutes

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Cleanup before quitting
app.on("before-quit", async () => {
  // Stop source health monitoring
  sourceHealthService.stopMonitoring();
  
  // Clean up any headless browsers
  const mangaFireAdapter = adapters.find(a => a.id === "mangafire");
  if (mangaFireAdapter && typeof (mangaFireAdapter as any).cleanup === 'function') {
    try {
      await (mangaFireAdapter as any).cleanup();
      console.log("MangaFire browser cleaned up");
    } catch (err) {
      console.error("Error cleaning up MangaFire browser:", err);
    }
  }
});

// IPC placeholders
ipcMain.handle("ping", () => {
  return "pong";
});

const nsfwIds = ["nhentai-vpn", "asmhentai-vpn", "hitomi"];

const getEnabledAdapters = () => {
  const disabled = settingsStore.get("disabledSources") || [];
  const nsfwEnabled = settingsStore.get("nsfwEnabled");
  return adapters.filter((a) => {
    if (disabled.includes(a.id)) return false;
    if (!nsfwEnabled && nsfwIds.includes(a.id)) return false;
    return true;
  });
};

ipcMain.handle("repo:listSources", () => {
  return getEnabledAdapters().map((a) => ({ id: a.id, label: a.label }));
});

// Expose all sources (used in settings page for toggles)
ipcMain.handle("repo:listAllSources", () => {
  return adapters.map((a) => ({ id: a.id, label: a.label }));
});

ipcMain.handle(
  "repo:fetchMangaList",
  async (_e, sourceId: string, search?: string, tags?: string[]): Promise<MangaMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) return [];

    // return from cache if fresh
    const cacheKey = `${search || ""}|${(tags ?? []).sort().join(",")}`;
    const cached = mangaCache.get(sourceId, cacheKey);
    if (cached) return cached;

    try {
      const options: SearchOptions | undefined = {
        ...(search ? { query: search } : {}),
        ...(tags && tags.length ? { tags } : {}),
      };
      const response = await adapter.getMangaList(options);
      
      // Extract just the results array for backward compatibility
      const list = response.results;
      mangaCache.set(sourceId, cacheKey, list);
      return list;
    } catch (err) {
      console.error("fetchMangaList error", err);
      return [];
    }
  }
);

ipcMain.handle(
  "repo:fetchChapterList",
  async (_e, sourceId: string, mangaId: string): Promise<ChapterMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) return [];
    try {
      return await adapter.getChapterList(mangaId);
    } catch (err) {
      console.error("fetchChapterList error", err);
      return [];
    }
  }
);

ipcMain.handle(
  "repo:fetchPages",
  async (_e, sourceId: string, chapterId: string): Promise<PageMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) return [];
    try {
      return await adapter.getPageList(chapterId);
    } catch (err) {
      console.error("fetchPages error", err);
      return [];
    }
  }
);

// download IPC
ipcMain.handle(
  "download:enqueue",
  async (_e, job: { id: string; sourceId: string; mangaId: string; mangaTitle: string; chapter: any; pages: any[] }) => {
    downloadManager.enqueue(job);
  }
);

ipcMain.handle("download:listJobs", () => downloadManager.listJobs());

// forward progress events to renderer(s)
downloadManager.on("update", (payload) => {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("download:update", payload));
});

// add library handlers before end
ipcMain.handle("library:listFavorites", () => libraryService.listFavorites());
ipcMain.handle("library:toggleFavorite", (_e, entry) => libraryService.toggleFavorite(entry));
ipcMain.handle("library:listHistory", () => libraryService.listHistory());
ipcMain.handle("library:saveProgress", (_e, progress) => libraryService.saveProgress(progress));
ipcMain.handle("library:updateProgressTitle", (_e, sourceId: string, mangaId: string, title: string) => libraryService.updateProgressTitle(sourceId, mangaId, title));
ipcMain.handle("library:lastProgress", () => libraryService.getLastProgress());
ipcMain.handle("library:getRecentUniqueProgress", (_e, limit?: number) => libraryService.getRecentUniqueProgress(limit));

// reading list handlers
ipcMain.handle("reading:listByStatus", (_e, status: "reading" | "plan" | "finished") =>
  readingListService.listByStatus(status)
);
ipcMain.handle(
  "reading:setStatus",
  (_e, entry: { sourceId: string; mangaId: string; title: string }, status: "reading" | "plan" | "finished") =>
    readingListService.setStatus(entry, status)
);
ipcMain.handle("reading:remove", (_e, sourceId: string, mangaId: string) => readingListService.remove(sourceId, mangaId));

// finished chapters handlers
ipcMain.handle("finished:list", () => finishedChaptersService.list());
ipcMain.handle("finished:isFinished", (_e, chapterId: string) => finishedChaptersService.isFinished(chapterId));
ipcMain.handle("finished:mark", (_e, chapterId: string) => finishedChaptersService.markFinished(chapterId));

// thumbnail cache handlers
ipcMain.handle("thumb:get", (_e, key: string) => thumbnailCacheService.get(key));
ipcMain.handle("thumb:set", (_e, key: string, url: string) => thumbnailCacheService.set(key, url));
ipcMain.handle("thumb:prefetchBatch", async (_e, items: Array<{ sourceId: string; mangaId: string }>) => {
  return thumbnailCacheService.prefetchBatch(items, async (item) => {
    const adapter = adapters.find((a) => a.id === item.sourceId);
    if (!adapter) return null;
    
    try {
      const chapters = await adapter.getChapterList(item.mangaId);
      if (chapters.length === 0) return null;
      
      const pages = await adapter.getPageList(chapters[0].id);
      if (pages.length === 0) return null;
      
      return pages[0].url;
    } catch (err) {
      console.error(`Failed to fetch thumbnail for ${item.sourceId}/${item.mangaId}:`, err);
      return null;
    }
  });
});

// settings handlers
ipcMain.handle("settings:getPreferredLanguages", () => settingsStore.get("preferredLanguages"));
ipcMain.handle("settings:setPreferredLanguages", (_e, langs: string[]) => {
  settingsStore.set("preferredLanguages", langs);
});
ipcMain.handle("settings:getProxies", () => settingsStore.get("proxies"));
ipcMain.handle("settings:setProxies", (_e, proxies: string[]) => {
  settingsStore.set("proxies", proxies);
});
ipcMain.handle("settings:getTorEnabled", () => settingsStore.get("torEnabled"));
ipcMain.handle("settings:setTorEnabled", (_e, enabled: boolean) => {
  settingsStore.set("torEnabled", enabled);
});
ipcMain.handle("settings:getNHentaiProxyEnabled", () => settingsStore.get("nhentaiProxyEnabled"));
ipcMain.handle("settings:setNHentaiProxyEnabled", (_e, enabled: boolean) => {
  settingsStore.set("nhentaiProxyEnabled", enabled);
});
ipcMain.handle("settings:getASMHentaiProxyEnabled", () => settingsStore.get("asmhentaiProxyEnabled"));
ipcMain.handle("settings:setASMHentaiProxyEnabled", (_e, enabled: boolean) => {
  settingsStore.set("asmhentaiProxyEnabled", enabled);
});
ipcMain.handle("settings:getHitomiProxyEnabled", () => settingsStore.get("hitomiProxyEnabled"));
ipcMain.handle("settings:setHitomiProxyEnabled", (_e, enabled: boolean) => {
  settingsStore.set("hitomiProxyEnabled", enabled);
});
ipcMain.handle("settings:getMangaFireProxyEnabled", () => settingsStore.get("mangafireProxyEnabled"));
ipcMain.handle("settings:setMangaFireProxyEnabled", (_e, enabled: boolean) => {
  settingsStore.set("mangafireProxyEnabled", enabled);
});

// NSFW toggle
ipcMain.handle("settings:getNSFWEnabled", () => settingsStore.get("nsfwEnabled"));
ipcMain.handle("settings:setNSFWEnabled", (_e, enabled: boolean) => {
  settingsStore.set("nsfwEnabled", enabled);
});

// Source health handlers
ipcMain.handle("health:checkSource", (_e, sourceId: string) => sourceHealthService.checkSourceHealth(sourceId));
ipcMain.handle("health:checkAll", () => sourceHealthService.checkAllSources());
ipcMain.handle("health:getAll", () => sourceHealthService.getAllSourceHealth());
ipcMain.handle("health:getStats", () => sourceHealthService.getStats()); 

// Downloaded manga handlers
ipcMain.handle("downloadedManga:getAll", () => {
  return downloadedMangaService.getDownloadedManga();
});

ipcMain.handle("downloadedManga:removeChapter", async (_e, mangaId: string, chapterId: string) => {
  return downloadedMangaService.removeDownloadedChapter(mangaId, chapterId);
});

ipcMain.handle("downloadedManga:getPages", async (_e, mangaId: string, chapterId: string) => {
  return downloadedMangaService.getDownloadedPages(mangaId, chapterId);
});

// Trigger a re-scan of the download directory and return the refreshed list
ipcMain.handle("downloadedManga:rescan", async () => {
  return downloadedMangaService.rescan();
});

ipcMain.handle("settings:openDownloadFolder", () => {
  const downloadDir = settingsStore.get("downloadDir");
  shell.openPath(downloadDir);
});

ipcMain.handle("settings:getDownloadDir", () => settingsStore.get("downloadDir"));
ipcMain.handle("settings:setDownloadDir", (_e, dir: string) => settingsStore.set("downloadDir", dir));

ipcMain.handle("settings:selectDownloadDir", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ 
    properties: ["openDirectory"],
    title: "Select Download Directory"
  });
  if (!canceled && filePaths.length > 0) {
    settingsStore.set("downloadDir", filePaths[0]);
    return filePaths[0];
  }
  return settingsStore.get("downloadDir");
});

ipcMain.handle("settings:getDisabledSources", () => settingsStore.get("disabledSources"));
ipcMain.handle("settings:setDisabledSources", (_e, ids: string[]) => settingsStore.set("disabledSources", ids));

// Bookmark handlers
ipcMain.handle("bookmark:get", (_e, sourceId: string, mangaId: string) => bookmarkService.get(sourceId, mangaId));
ipcMain.handle("bookmark:set", (_e, entry) => bookmarkService.set(entry));
ipcMain.handle("bookmark:remove", (_e, sourceId: string, mangaId: string) => bookmarkService.remove(sourceId, mangaId));

ipcMain.handle(
  "download:moveJob",
  async (_e, jobId: string, newIndex: number) => {
    downloadManager.moveJob(jobId, newIndex);
  }
);