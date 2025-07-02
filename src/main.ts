import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { adapters } from "./adapters";
import type { MangaMeta, ChapterMeta, PageMeta } from "./adapters/Adapter";
import { downloadManager } from "./services/downloadManager";
import { libraryService } from "./services/library";
import settingsStore from "./services/settings";

const isDev = !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC placeholders
ipcMain.handle("ping", () => {
  return "pong";
});

ipcMain.handle("repo:listSources", () => {
  return adapters.map((a) => ({ id: a.id, label: a.label }));
});

ipcMain.handle(
  "repo:fetchMangaList",
  async (_e, sourceId: string, search?: string): Promise<MangaMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) throw new Error("Unknown source");
    return adapter.getMangaList(search);
  }
);

ipcMain.handle(
  "repo:fetchChapterList",
  async (_e, sourceId: string, mangaId: string): Promise<ChapterMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) throw new Error("Unknown source");
    return adapter.getChapterList(mangaId);
  }
);

ipcMain.handle(
  "repo:fetchPages",
  async (_e, sourceId: string, chapterId: string): Promise<PageMeta[]> => {
    const adapter = adapters.find((a) => a.id === sourceId);
    if (!adapter) throw new Error("Unknown source");
    return adapter.getPageList(chapterId);
  }
);

// download IPC
ipcMain.handle(
  "download:enqueue",
  async (_e, job: { id: string; sourceId: string; mangaTitle: string; chapter: any; pages: any[] }) => {
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
ipcMain.handle("library:lastProgress", () => libraryService.getLastProgress());

// settings handlers
ipcMain.handle("settings:getPreferredLanguages", () => settingsStore.get("preferredLanguages"));
ipcMain.handle("settings:setPreferredLanguages", (_e, langs: string[]) => {
  settingsStore.set("preferredLanguages", langs);
}); 