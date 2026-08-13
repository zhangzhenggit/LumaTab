export function safeWebUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function decodeHtmlAttribute(value) {
  return String(value ?? "").replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    const radix = normalized.startsWith("#x") ? 16 : 10;
    const number = Number.parseInt(normalized.replace(/^#x?/, ""), radix);
    return Number.isFinite(number) ? String.fromCodePoint(number) : match;
  });
}

function tagAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function scoreIconLink(link) {
  const rel = String(link.rel ?? "").toLowerCase();
  const type = String(link.type ?? "").toLowerCase();
  const sizes = String(link.sizes ?? "").split(/\s+/).map((size) => Number(size.split("x")[0]) || 0);
  const largest = Math.max(0, ...sizes);
  return (type.includes("svg") ? 500 : 0) + Math.min(largest, 256) + (rel.includes("apple-touch") ? 40 : 0);
}

export function pageDeclaredCandidates(html, responseUrl) {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0] ?? "";
  const baseHref = tagAttributes(baseTag).href;
  const base = safeWebUrl(baseHref, responseUrl)?.toString() ?? responseUrl;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => tagAttributes(match[0]));
  const icons = links
    .filter((link) => link.href && /(^|\s)(icon|shortcut\s+icon|apple-touch-icon|mask-icon)(\s|$)/i.test(link.rel ?? ""))
    .map((link) => ({ url: safeWebUrl(link.href, base)?.toString(), score: scoreIconLink(link) }))
    .filter((item) => item.url)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((item) => item.url);
  const manifest = links.find((link) => String(link.rel ?? "").toLowerCase().split(/\s+/).includes("manifest"));
  return { icons, manifestUrl: safeWebUrl(manifest?.href, base)?.toString() ?? null };
}

export function sanitizeSvg(source) {
  const withoutPrefix = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml[\s\S]*?\?>/i, "")
    .replace(/^\s*<!--([\s\S]*?)-->/, "")
    .trim();
  if (!withoutPrefix.startsWith("<svg") || !/<\/svg>\s*$/i.test(withoutPrefix)) return null;
  if (!/<(?:path|circle|ellipse|rect|polygon|polyline|line|text)\b/i.test(withoutPrefix)) return null;
  const clean = withoutPrefix
    .replace(/<(?:script|style|foreignObject|iframe|object|embed|image)\b[\s\S]*?<\/(?:script|style|foreignObject|iframe|object|embed|image)>/gi, "")
    .replace(/<(?:script|style|foreignObject|iframe|object|embed|image)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s(?:on[a-z]+|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  return new Blob([clean], { type: "image/svg+xml" });
}
