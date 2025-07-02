import { contextBridge, ipcRenderer } from "electron";
import type { SourceMeta } from "./services/IMangaRepository";

contextBridge.exposeInMainWorld("api", {
  ping: async () => ipcRenderer.invoke("ping"),
});

contextBridge.exposeInMainWorld("repo", {
  listSources: () => ipcRenderer.invoke("repo:listSources") as Promise<SourceMeta[]>,
  fetchMangaList: (sourceId: string, search?: string) =>
    ipcRenderer.invoke("repo:fetchMangaList", sourceId, search),
  fetchChapterList: (sourceId: string, mangaId: string) =>
    ipcRenderer.invoke("repo:fetchChapterList", sourceId, mangaId),
  fetchPages: (sourceId: string, chapterId: string) =>
    ipcRenderer.invoke("repo:fetchPages", sourceId, chapterId),
});

contextBridge.exposeInMainWorld("download", {
  enqueue: (job: any) => ipcRenderer.invoke("download:enqueue", job),
  listJobs: () => ipcRenderer.invoke("download:listJobs"),
  onUpdate: (handler: (ev: Electron.IpcRendererEvent, payload: any) => void) =>
    ipcRenderer.on("download:update", handler),
});

contextBridge.exposeInMainWorld("library", {
  listFavorites: () => ipcRenderer.invoke("library:listFavorites"),
  toggleFavorite: (entry: any) => ipcRenderer.invoke("library:toggleFavorite", entry),
  listHistory: () => ipcRenderer.invoke("library:listHistory"),
  saveProgress: (progress: any) => ipcRenderer.invoke("library:saveProgress", progress),
  lastProgress: () => ipcRenderer.invoke("library:lastProgress"),
});

contextBridge.exposeInMainWorld("settings", {
  getPreferredLanguages: () => ipcRenderer.invoke("settings:getPreferredLanguages") as Promise<string[]>,
  setPreferredLanguages: (langs: string[]) => ipcRenderer.invoke("settings:setPreferredLanguages", langs),
});

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;
    };
    repo: {
      listSources: () => Promise<SourceMeta[]>;
      fetchMangaList: (sourceId: string, search?: string) => Promise<any[]>;
      fetchChapterList: (sourceId: string, mangaId: string) => Promise<any[]>;
      fetchPages: (sourceId: string, chapterId: string) => Promise<any[]>;
    };
    download: {
      enqueue: (job: any) => Promise<void>;
      listJobs: () => Promise<any[]>;
      onUpdate: (handler: (ev: any, payload: any) => void) => void;
    };
    library: {
      listFavorites: () => Promise<any[]>;
      toggleFavorite: (entry: any) => Promise<void>;
      listHistory: () => Promise<any[]>;
      saveProgress: (progress: any) => Promise<void>;
      lastProgress: () => Promise<any>;
    };
    settings: {
      getPreferredLanguages: () => Promise<string[]>;
      setPreferredLanguages: (langs: string[]) => Promise<void>;
    };
  }
} 