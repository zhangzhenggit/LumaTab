// Flat, fully saturated fills sampled from WeTab's own generated tiles. They are deliberately
// solid rather than gradients: at 60px a gradient reads as a smudge, while a single strong
// color plus white letters stays crisp and sits in the same visual family as real app icons.
export const ACCENTS = [
  "#4060f2",
  "#5278f9",
  "#51ba5b",
  "#2dc3a1",
  "#23cfa8",
  "#7c22eb",
  "#a855f7",
  "#fd5a5a",
  "#f5891f",
  "#29446c",
  "#8e8e94",
];

function stableHash(value) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash;
}

export function normalizeUrl(value) {
  const candidate = value.trim();
  const explicitScheme = candidate.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (explicitScheme && !["http", "https"].includes(explicitScheme)) {
    throw new Error("仅支持 HTTP 或 HTTPS 链接");
  }
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅支持 HTTP 或 HTTPS 链接");
  }
  return url.toString();
}

// Keyed on the host, not the display name, so every shortcut pointing at one site keeps the
// same fill even after a rename — and so a folder of links to the same host reads as a set.
export function accentFor(name, url = "", override = null) {
  // An explicit choice always wins; the hash is only the default when nothing was picked.
  if (override && ACCENTS.includes(override)) return override;
  let key = String(name ?? "");
  try {
    key = new URL(url).hostname.replace(/^www\./, "") || key;
  } catch {
    // A shortcut can be mid-edit with an unparsable URL; the name is a fine fallback key.
  }
  return ACCENTS[stableHash(key) % ACCENTS.length];
}

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;

// One or two glyphs, the way WeTab's generated tiles read: word-initials when the name has
// obvious parts ("AppNew" -> AN, "code-review" -> CR), otherwise the opening pair. CJK stops at
// a single character because two full-width glyphs overflow a 60px tile.
// `.letter-icon` steps its font size down per glyph, so up to four still fit inside a 60px tile.
// Past that the text is too small to read at tile size, which defeats the point of a label.
export const MAX_MONOGRAM_GLYPHS = 4;

export function trimMonogram(value) {
  return [...String(value ?? "").trim()].slice(0, MAX_MONOGRAM_GLYPHS).join("");
}

export function monogramFor(name = "", override = null) {
  // An explicit monogram always wins. Deriving it from the name is a good default, never a rule:
  // "翻译" wants 翻, but a site the user thinks of by an abbreviation the name does not contain
  // has no way to say so otherwise.
  const chosen = trimMonogram(override);
  if (chosen) return chosen;

  const trimmed = String(name).trim();
  if (!trimmed) return "?";
  if (CJK.test(trimmed[0])) return trimmed[0];

  const words = trimmed.split(/[\s._\-/|]+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();

  const [word] = words;
  const humps = word.match(/[A-Z][a-z\d]*/g);
  if (humps && humps.length > 1) return (humps[0][0] + humps[1][0]).toUpperCase();
  return word.slice(0, 2).toUpperCase();
}

export function createId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}
