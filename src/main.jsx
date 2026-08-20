import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { readCachedWallpaper } from "./lib/background.js";
import "./styles.css";

// Resolving the wallpaper BEFORE the first render is what removes the startup flash: React's
// first paint already carries the real image, so the bundled fallback is never shown to someone
// who has a cached wallpaper. The read is local (chrome.storage + Cache Storage) and normally
// takes a few milliseconds; the budget only exists so a pathological stall can't hold the whole
// page hostage — in that case we render with the fallback and the hook catches up as usual.
const WALLPAPER_READ_BUDGET_MS = 250;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function start() {
  const initialWallpaper = await withTimeout(readCachedWallpaper(), WALLPAPER_READ_BUDGET_MS);
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App initialWallpaper={initialWallpaper} />
    </React.StrictMode>,
  );
}

void start();
