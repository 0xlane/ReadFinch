import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { setLocale } from "../shared/i18n";
import "./styles.css";
import "./providers.css";
import "./library.css";
import "./toolbar.css";
const initialLocale = new URLSearchParams(location.search).get("uiLanguage");
if (initialLocale === "en" || initialLocale === "zh-CN") {
  setLocale(initialLocale);
  document.documentElement.lang = initialLocale;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
