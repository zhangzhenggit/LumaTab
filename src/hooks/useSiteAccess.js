import { useCallback, useEffect, useRef, useState } from "react";
import { hasSiteAccess, requestSiteAccess, revokeSiteAccess } from "../lib/site-access";
import { refreshSiteIcons } from "../lib/site-icon-cache";

const DISMISSED_KEY = "lumatab.siteAccess.dismissed";

async function readDismissed() {
  try {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(DISMISSED_KEY);
      return Boolean(result[DISMISSED_KEY]);
    }
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

async function writeDismissed() {
  try {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [DISMISSED_KEY]: true });
      return;
    }
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch { /* a lost dismissal only means the prompt returns once more */ }
}

// Chrome will not grant an optional permission without a user gesture — there is no API to take
// it silently, by design. So the click cannot be removed; it can only be put somewhere the user
// already is. This drives a one-click prompt on the new tab itself, shown exactly when it means
// something (there are links, and their icons are stuck on Chrome's small stand-ins), instead of
// making the user go hunting through Settings for a switch they were never told about.
export function useSiteAccess(shortcuts, ready, notify) {
  const [granted, setGranted] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    let disposed = false;
    void Promise.all([hasSiteAccess(), readDismissed()]).then(([access, hidden]) => {
      if (disposed) return;
      setGranted(access);
      setDismissed(hidden);
    });
    return () => { disposed = true; };
  }, []);

  // Granting from Settings has to silence the banner too, and vice versa, so both paths read the
  // same permission rather than each keeping their own copy of the answer.
  const grant = useCallback(async () => {
    const ok = await requestSiteAccess();
    setGranted(ok);
    if (!ok) return false;
    notify?.("已允许读取网站，正在重新抓取图标");
    void refreshSiteIcons(shortcutsRef.current);
    return true;
  }, [notify]);

  const revoke = useCallback(async () => {
    await revokeSiteAccess();
    setGranted(false);
    notify?.("已收回网站访问权限，图标改用 Chrome 已有的记录");
  }, [notify]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    void writeDismissed();
  }, []);

  const hasLinks = shortcuts.some((item) => item.type === "folder"
    ? (item.children?.length ?? 0) > 0
    : true);

  return {
    granted,
    grant,
    revoke,
    dismiss,
    // `granted === null` means the answer is still loading; showing the banner then would make it
    // flash on every page load for users who already granted it.
    showPrompt: ready && granted === false && !dismissed && hasLinks,
  };
}
