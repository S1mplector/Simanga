import { contextBridge, ipcRenderer } from "electron";
import type { SourceMeta } from "./services/IMangaRepository";

contextBridge.exposeInMainWorld("api", {
  ping: async () => ipcRenderer.invoke("ping"),
});

contextBridge.exposeInMainWorld("repo", {
  listSources: () => ipcRenderer.invoke("repo:listSources") as Promise<SourceMeta[]>,
  listAllSources: () => ipcRenderer.invoke("repo:listAllSources") as Promise<SourceMeta[]>,
  fetchMangaList: (sourceId: string, search?: string, tags?: string[]) =>
    ipcRenderer.invoke("repo:fetchMangaList", sourceId, search, tags ?? []),
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
  updateProgressTitle: (sourceId: string, mangaId: string, title: string) =>
    ipcRenderer.invoke("library:updateProgressTitle", sourceId, mangaId, title),
  lastProgress: () => ipcRenderer.invoke("library:lastProgress"),
  getRecentUniqueProgress: (limit?: number) => ipcRenderer.invoke("library:getRecentUniqueProgress", limit),
});

contextBridge.exposeInMainWorld("settings", {
  getPreferredLanguages: () => ipcRenderer.invoke("settings:getPreferredLanguages") as Promise<string[]>,
  setPreferredLanguages: (langs: string[]) => ipcRenderer.invoke("settings:setPreferredLanguages", langs),
  getProxies: () => ipcRenderer.invoke("settings:getProxies") as Promise<string[]>,
  setProxies: (proxies: string[]) => ipcRenderer.invoke("settings:setProxies", proxies),
  getTorEnabled: () => ipcRenderer.invoke("settings:getTorEnabled") as Promise<boolean>,
  setTorEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setTorEnabled", enabled),
  getNHentaiProxyEnabled: () => ipcRenderer.invoke("settings:getNHentaiProxyEnabled") as Promise<boolean>,
  setNHentaiProxyEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setNHentaiProxyEnabled", enabled),
  getASMHentaiProxyEnabled: () => ipcRenderer.invoke("settings:getASMHentaiProxyEnabled") as Promise<boolean>,
  setASMHentaiProxyEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setASMHentaiProxyEnabled", enabled),
  getHitomiProxyEnabled: () => ipcRenderer.invoke("settings:getHitomiProxyEnabled"),
  setHitomiProxyEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setHitomiProxyEnabled", enabled),
  getMangaFireProxyEnabled: () => ipcRenderer.invoke("settings:getMangaFireProxyEnabled"),
  setMangaFireProxyEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setMangaFireProxyEnabled", enabled),
  getDownloadDir: () => ipcRenderer.invoke("settings:getDownloadDir") as Promise<string>,
  setDownloadDir: (dir: string) => ipcRenderer.invoke("settings:setDownloadDir", dir),
  selectDownloadDir: () => ipcRenderer.invoke("settings:selectDownloadDir") as Promise<string>,
  getDisabledSources: () => ipcRenderer.invoke("settings:getDisabledSources") as Promise<string[]>,
  setDisabledSources: (ids: string[]) => ipcRenderer.invoke("settings:setDisabledSources", ids),
  openDownloadFolder: () => ipcRenderer.invoke("settings:openDownloadFolder"),
  getNSFWEnabled: () => ipcRenderer.invoke("settings:getNSFWEnabled") as Promise<boolean>,
  setNSFWEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:setNSFWEnabled", enabled),
});

contextBridge.exposeInMainWorld("readingList", {
  listByStatus: (status: "reading" | "plan" | "finished") =>
    ipcRenderer.invoke("reading:listByStatus", status) as Promise<any[]>,
  setStatus: (
    entry: { sourceId: string; mangaId: string; title: string },
    status: "reading" | "plan" | "finished"
  ) => ipcRenderer.invoke("reading:setStatus", entry, status),
  remove: (sourceId: string, mangaId: string) => ipcRenderer.invoke("reading:remove", sourceId, mangaId),
});

contextBridge.exposeInMainWorld("finishedChapters", {
  list: () => ipcRenderer.invoke("finished:list") as Promise<string[]>,
  isFinished: (chapterId: string) => ipcRenderer.invoke("finished:isFinished", chapterId) as Promise<boolean>,
  mark: (chapterId: string) => ipcRenderer.invoke("finished:mark", chapterId),
});

contextBridge.exposeInMainWorld("thumbCache", {
  get: (key: string) => ipcRenderer.invoke("thumb:get", key) as Promise<string | undefined>,
  set: (key: string, url: string) => ipcRenderer.invoke("thumb:set", key, url),
  prefetchBatch: (items: Array<{ sourceId: string; mangaId: string }>) => 
    ipcRenderer.invoke("thumb:prefetchBatch", items),
});

contextBridge.exposeInMainWorld("sourceHealth", {
  checkSource: (sourceId: string) => ipcRenderer.invoke("health:checkSource", sourceId),
  checkAll: () => ipcRenderer.invoke("health:checkAll"),
  getAll: () => ipcRenderer.invoke("health:getAll"),
  getStats: () => ipcRenderer.invoke("health:getStats"),
});

contextBridge.exposeInMainWorld("downloadManager", {
  enqueue: (job: any) => ipcRenderer.invoke("download:enqueue", job),
  listJobs: () => ipcRenderer.invoke("download:listJobs"),
  moveJob: (jobId: string, newIndex: number) => ipcRenderer.invoke("download:moveJob", jobId, newIndex),
  on: (event: string, handler: any) => {
    ipcRenderer.on(`download:${event}`, (_event, ...args) => handler(...args));
  },
  off: (event: string, handler: any) => {
    ipcRenderer.removeAllListeners(`download:${event}`);
  },
});

contextBridge.exposeInMainWorld("downloadedManga", {
  getAll: () => ipcRenderer.invoke("downloadedManga:getAll"),
  rescan: () => ipcRenderer.invoke("downloadedManga:rescan"),
  removeChapter: (mangaId: string, chapterId: string) => 
    ipcRenderer.invoke("downloadedManga:removeChapter", mangaId, chapterId),
  getPages: (mangaId: string, chapterId: string) => 
    ipcRenderer.invoke("downloadedManga:getPages", mangaId, chapterId),
  getDiskUsage: () => ipcRenderer.invoke("downloadedManga:getDiskUsage"),
});

contextBridge.exposeInMainWorld("bookmarks", {
  get: (sourceId: string, mangaId: string) => ipcRenderer.invoke("bookmark:get", sourceId, mangaId),
  set: (entry: any) => ipcRenderer.invoke("bookmark:set", entry),
  remove: (sourceId: string, mangaId: string) => ipcRenderer.invoke("bookmark:remove", sourceId, mangaId),
});

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;
    };
    repo: {
      listSources: () => Promise<SourceMeta[]>;
      listAllSources: () => Promise<SourceMeta[]>;
      fetchMangaList: (sourceId: string, search?: string, tags?: string[]) => Promise<any[]>;
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
      updateProgressTitle: (sourceId: string, mangaId: string, title: string) => Promise<void>;
      lastProgress: () => Promise<any>;
      getRecentUniqueProgress: (limit?: number) => Promise<any[]>;
    };
    settings: {
      getPreferredLanguages: () => Promise<string[]>;
      setPreferredLanguages: (langs: string[]) => Promise<void>;
      getProxies: () => Promise<string[]>;
      setProxies: (proxies: string[]) => Promise<void>;
      getTorEnabled: () => Promise<boolean>;
      setTorEnabled: (enabled: boolean) => Promise<void>;
      getNHentaiProxyEnabled: () => Promise<boolean>;
      setNHentaiProxyEnabled: (enabled: boolean) => Promise<void>;
      getASMHentaiProxyEnabled: () => Promise<boolean>;
      setASMHentaiProxyEnabled: (enabled: boolean) => Promise<void>;
      getHitomiProxyEnabled: () => Promise<boolean>;
      setHitomiProxyEnabled: (enabled: boolean) => Promise<void>;
      getMangaFireProxyEnabled: () => Promise<boolean>;
      setMangaFireProxyEnabled: (enabled: boolean) => Promise<void>;
      getDownloadDir: () => Promise<string>;
      setDownloadDir: (dir: string) => Promise<void>;
      selectDownloadDir: () => Promise<string>;
      getDisabledSources: () => Promise<string[]>;
      setDisabledSources: (ids: string[]) => Promise<void>;
      openDownloadFolder: () => Promise<void>;
      getNSFWEnabled: () => Promise<boolean>;
      setNSFWEnabled: (enabled: boolean) => Promise<void>;
    };
    readingList: {
      listByStatus: (status: "reading" | "plan" | "finished") => Promise<any[]>;
      setStatus: (
        entry: { sourceId: string; mangaId: string; title: string },
        status: "reading" | "plan" | "finished"
      ) => Promise<void>;
      remove: (sourceId: string, mangaId: string) => Promise<void>;
    };
    finishedChapters: {
      list: () => Promise<string[]>;
      isFinished: (chapterId: string) => Promise<boolean>;
      mark: (chapterId: string) => Promise<void>;
    };
    thumbCache: {
      get: (key: string) => Promise<string | undefined>;
      set: (key: string, url: string) => Promise<void>;
      prefetchBatch: (items: Array<{ sourceId: string; mangaId: string }>) => Promise<void>;
    };
    sourceHealth: {
      checkSource: (sourceId: string) => Promise<any>;
      checkAll: () => Promise<void>;
      getAll: () => Promise<any[]>;
      getStats: () => Promise<any>;
    };
    downloadedManga: {
      getAll: () => Promise<any[]>;
      rescan: () => Promise<any[]>;
      removeChapter: (mangaId: string, chapterId: string) => Promise<void>;
      getPages: (mangaId: string, chapterId: string) => Promise<string[]>;
      getDiskUsage: () => Promise<number>;
    };
    bookmarks: {
      get: (sourceId: string, mangaId: string) => Promise<any>;
      set: (entry: any) => Promise<void>;
      remove: (sourceId: string, mangaId: string) => Promise<void>;
    };
  }
} 