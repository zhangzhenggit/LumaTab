const DATA_KEY = "lumatab.shortcuts.v5";

function hasChromeStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

export async function loadShortcuts() {
  try {
    if (hasChromeStorage()) {
      const result = await chrome.storage.local.get(DATA_KEY);
      return Array.isArray(result[DATA_KEY]) ? result[DATA_KEY] : [];
    }
    const stored = localStorage.getItem(DATA_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn("LumaTab: failed to load shortcuts", error);
    return [];
  }
}

// `icon` is dropped alongside the underscore-prefixed runtime fields, and that is deliberate:
// links used to carry a preset-icon field under that name, and a stale one would resurrect
// artwork the user had since replaced. It also means **`icon` is a reserved word in this data** —
// a section's glyph is stored as `glyph` for exactly this reason. Written as `icon` it renders
// perfectly and then vanishes on the next reload, which is how that was found.
export function stripTransientFields(value) {
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
