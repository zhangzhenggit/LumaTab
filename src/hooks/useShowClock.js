import { useCallback, useEffect, useState } from "react";

// Whether the clock is drawn. Deliberately NOT part of the wallpaper's `tuning`: that object is
// the photograph's own treatment, it round-trips through the worker with the wallpaper state, and
// hanging a layout preference off it would mean changing wallpapers could carry a layout decision
// with it. This is a page preference and lives on its own key, the way the site-access dismissal
// does.
//
// It defaults to on, and the default is the point. A new tab page with no large element on it
// reads as a sheet of stickers — that is what the first screenshots of this grid looked like, and
// no amount of work on the tiles fixed it. The switch exists because a clock is genuinely
// redundant next to the system tray for some people, not because the page is unsure.
const CLOCK_KEY = "lumatab.showClock";

async function read() {
  try {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(CLOCK_KEY);
      // Absent means never set, which means on. Only an explicit false turns it off.
      return result[CLOCK_KEY] !== false;
    }
    return localStorage.getItem(CLOCK_KEY) !== "0";
  } catch {
    return true;
  }
}

async function write(value) {
  try {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [CLOCK_KEY]: value });
      return;
    }
    localStorage.setItem(CLOCK_KEY, value ? "1" : "0");
  } catch { /* a lost preference costs one clock, not any data */ }
}

export function useShowClock() {
  // Starts true so the clock is in the first paint rather than popping in a frame later. The read
  // below can only ever turn it off, and only for someone who asked for that.
  const [showClock, setShowClock] = useState(true);

  useEffect(() => {
    let live = true;
    void read().then((value) => { if (live) setShowClock(value); });
    return () => { live = false; };
  }, []);

  const toggleClock = useCallback(() => {
    setShowClock((current) => {
      void write(!current);
      return !current;
    });
  }, []);

  return { showClock, toggleClock };
}
