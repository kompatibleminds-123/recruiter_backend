import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

try {
  const path = String(window.location.pathname || "").trim().toLowerCase();
  const hash = String(window.location.hash || "").trim().toLowerCase();
  const needsMarketingHash = path === "/marketing" || path === "/marketing/" || path === "/marketing-module" || path === "/marketing-module/";
  if (needsMarketingHash && hash !== "#/marketing/prospects") {
    window.location.replace(`${window.location.origin}${window.location.pathname}${window.location.search}#/marketing/prospects`);
  }
} catch (_) {}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
