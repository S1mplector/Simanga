import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import BrowsePage from "./pages/BrowsePage";
import DownloadsPage from "./pages/DownloadsPage";
import SettingsPage from "./pages/SettingsPage";
import ReaderPage from "./pages/ReaderPage";
import LibraryPage from "./pages/LibraryPage";
import TrackingPage from "./pages/TrackingPage";

const AppRouter: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="browse" replace />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="reader/:chapterId" element={<ReaderPage />} />
          <Route path="reader/local/:mangaId/:chapterId" element={<ReaderPage />} />
          <Route path="tracking" element={<TrackingPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default AppRouter; 