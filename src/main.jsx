import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./style.css";
import { applyStoredUiTheme } from "./storage/uiTheme";
import { hydrateTradesStorageCache } from "./storage/storage";

applyStoredUiTheme();

const rootEl = document.getElementById("root");

hydrateTradesStorageCache()
  .catch((err) => {
    console.warn("tj: trade storage hydrate failed — reload may fix", err);
  })
  .finally(() => {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </React.StrictMode>,
    );
  });
