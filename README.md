<div align="left">
  <img src="src/assets/icons/simanga.ico" alt="SiManga Logo" width="128"/>
  <h1>SiManga</h1>
  <p>
    <strong>A modern, feature-rich desktop manga reader for Windows, macOS, and Linux.</strong>
  </p>
  <p>
    Built with Electron and React, inspired by HakuNeko and Tachiyomi.
  </p>
</div>

---

SiManga allows you to browse, read, and download manga from various online sources in a clean, customizable, and user-friendly interface.

## ✨ Features

- **Multiple Sources**: Access manga from a variety of online sources.
- **Customizable Reader**:
    - Paged or long-strip reading modes.
    - Double-page spread (spread) view.
    - Left-to-Right (LTR) and Right-to-Left (RTL) reading directions.
    - Adjustable zoom, brightness, and contrast.
    - Fit to width/height options.
- **Library Management**: Keep your favorite manga organized in your library.
- **Offline Reading**: Download chapters to read them anytime, anywhere.
- **Reading Tracking**: Automatically track your reading progress.
- **Bookmarks**: Bookmark specific chapters to easily return to them later.
- **Proxy Support**: Built-in support for proxies, including presets for Tor.
- **And much more!**

## 🚀 Getting Started

### For Users

You can download the latest release for your operating system from https://github.com/your-S1mplector/simanga/releases.

### For Developers

To get a local copy up and running, follow these simple steps.

**Prerequisites:**
- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)

**Installation & Running:**

```bash
# 1. Clone the repository
git clone https://github.com/your-username/simanga.git
cd simanga

# 2. Install dependencies
npm install

# 3. Run the app in development mode
# This starts the Vite dev server and Electron concurrently
npm run electron:dev
```

## 📦 Building Distributables

To create a packaged application for your OS:

```bash
# 1. Build the frontend and compile the main process
npm run build

# 2. Package the application using electron-builder
npm run dist
```

The distributable files will be located in the `release/` directory.

## 🛠️ Tech Stack

- [Electron](https://www.electronjs.org/) - Desktop application framework
- [React](https://reactjs.org/) - Frontend library
- [Vite](https://vitejs.dev/) - Frontend tooling and dev server
- [TypeScript](https://www.typescriptlang.org/) - Language for type-safe code
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Electron Builder](https://www.electron.build/) - Packaging and distribution

## 📂 Project Structure

The project is organized as follows:

```
.
├── release/              # Packaged application output
├── src/
│   ├── main.ts           # Electron main process entry point
│   ├── preload.ts        # Electron context-isolated preload script
│   ├── adapters/         # Connectors for different manga sources
│   ├── models/           # Data models (Manga, Chapter, etc.)
│   ├── services/         # Core application logic (library, downloads, settings)
│   ├── utils/            # Helper modules (file operations, queues)
│   └── renderer/         # Frontend React application (UI)
│       ├── components/   # Reusable React components
│       ├── pages/        # Top-level page components
│       ├── store/        # Zustand state management stores
│       └── services/     # Frontend-specific services
├── electron-builder.json # Configuration for electron-builder
├── package.json          # Project dependencies and scripts
└── vite.config.ts        # Configuration for Vite
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
