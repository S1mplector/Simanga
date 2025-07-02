# SiManga

SiManga is an Electron-based manga reader / downloader inspired by HakuNeko. The codebase is intentionally small right now, for just personal use.

## Getting started

```bash
# install deps
npm install

# Run both Vite dev-server & Electron in one go
npm run electron:dev
```

## Building distributables

```bash
npm run build   # bundle renderer + compile main
npm run dist    # package with electron-builder
```

## Project layout

```
src/
  main.ts          –Electron main process
  preload.ts       –Context isolated bridge
  renderer/        –HTML/TS frontend, served by Vite
  adapters/        –Connector layer (site scrapers)
  utils/           -Helper modules (file ops, queues)
```

---
