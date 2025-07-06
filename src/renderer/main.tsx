import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import "../renderer/index.css";
import { ToastProvider } from "./components/ToastProvider";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  </React.StrictMode>
); 