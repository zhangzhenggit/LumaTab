const DATA_KEY = "lumatab.shortcuts.v5";

function hasChromeStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function collectAutoIconIds(items, target = new Set()) {
  for (const item of items) {
    if (item.type === "folder") collectAutoIconIds(item.children ?? [], target);
    else if (item.iconMode === "auto") target.add(item.id);
  }
  return target;
}

function migrateImportedIconModes(items, fallback) {
  const autoIconIds = collectAutoIconIds(fallback);
  return items.map((item) => {
    if (item.type === "folder") {
      return { ...item, children: migrateImportedIconModes(item.children ?? [], fallback) };
    }
    const { icon: _legacyPresetIcon, ...link } = item;
    if (autoIconIds.has(item.id) && link.iconMode === "generated") {
      return { ...link, iconMode: "auto" };
    }
    return link;
  });
}

export async function loadShortcuts(fallback) {
  try {
    if (hasChromeStorage()) {
      const result = await chrome.storage.local.get(DATA_KEY);
      if (Array.isArray(result[DATA_KEY])) return migrateImportedIconModes(result[DATA_KEY], fallback);
      return fallback;
    }

    const stored = localStorage.getItem(DATA_KEY);
    if (stored) return migrateImportedIconModes(JSON.parse(stored), fallback);
    return fallback;
  } catch (error) {
    console.warn("LumaTab: failed to load shortcuts", error);
    return fallback;
  }
}

function stripTransientFields(value) {
  if (Array.isArray(value)) return value.map(stripTransientFields);
  if (!value || typeof value !== "object") return value;
  const clean = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith("_") || key === "icon") continue;
    clean[key] = stripTransientFields(entry);
  }
  return clean;
}

export async function saveShortcuts(shortcuts) {
  const persisted = stripTransientFields(shortcuts);
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [DATA_KEY]: persisted });
    return;
  }
  localStorage.setItem(DATA_KEY, JSON.stringify(persisted));
}
