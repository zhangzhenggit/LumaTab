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
  const type = String(link.type ?? "").toLowerCase();
  const sizes = String(link.sizes ?? "").split(/\s+/).map((size) => Number(size.split("x")[0]) || 0);
  const largest = Math.max(0, ...sizes);
  return (type.includes("svg") ? 500 : 0) + Math.min(largest, 256);
}

// The site's own declared favicon (rel="icon"/"shortcut icon") is usually the mark people
// actually recognize; apple-touch-icon is a separate, sometimes different, home-screen asset.
// Candidates are kept in two tiers so callers can prefer the real favicon and only fall back
// to apple-touch/manifest art when the favicon tier turns out too small or missing.
export function pageDeclaredCandidates(html, responseUrl) {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0] ?? "";
  const baseHref = tagAttributes(baseTag).href;
  const base = safeWebUrl(baseHref, responseUrl)?.toString() ?? responseUrl;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => tagAttributes(match[0]));
  const iconLinks = links
    .filter((link) => link.href && /(^|\s)(icon|shortcut\s+icon|apple-touch-icon|mask-icon)(\s|$)/i.test(link.rel ?? ""))
    .map((link) => ({
      url: safeWebUrl(link.href, base)?.toString(),
      score: scoreIconLink(link),
      appleTouch: /apple-touch/i.test(link.rel ?? ""),
    }))
    .filter((item) => item.url);
  const toUrls = (items) => [...items].sort((left, right) => right.score - left.score).slice(0, 6).map((item) => item.url);
  const faviconIcons = toUrls(iconLinks.filter((item) => !item.appleTouch));
  const appleTouchIcons = toUrls(iconLinks.filter((item) => item.appleTouch));
  const manifest = links.find((link) => String(link.rel ?? "").toLowerCase().split(/\s+/).includes("manifest"));
  return { faviconIcons, appleTouchIcons, manifestUrl: safeWebUrl(manifest?.href, base)?.toString() ?? null };
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
    .replace(/<(?:script|foreignObject|iframe|object|embed|image)\b[\s\S]*?<\/(?:script|foreignObject|iframe|object|embed|image)>/gi, "")
    .replace(/<(?:script|foreignObject|iframe|object|embed|image)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    // <style> is kept, not dropped: plenty of favicons declare `fill:none` on the shapes and
    // supply the real colours from a stylesheet, so removing it left a perfectly valid SVG that
    // painted absolutely nothing — an invisible icon on an empty tile. It cannot execute script;
    // the only real risk is pulling in remote resources, so those constructs are neutralised
    // while the declarations themselves survive.
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "invalid(");
  return new Blob([withIntrinsicSize(clean)], { type: "image/svg+xml" });
}

// An SVG carrying only a viewBox has no intrinsic size, and an image with no intrinsic size
// cannot be decoded by createImageBitmap — it throws, the candidate is discarded, and the site
// silently falls back to a letter tile. That shape (`<svg viewBox="0 0 96 96">` with no width or
// height) is extremely common among favicons, so the size is derived from the viewBox instead of
// the icon being thrown away.
function withIntrinsicSize(svg) {
  const openTag = svg.match(/<svg[\s>][^>]*>/i)?.[0];
  if (!openTag) return svg;
  if (/\swidth\s*=/i.test(openTag) && /\sheight\s*=/i.test(openTag)) return svg;

  const viewBox = openTag.match(/\sviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const parts = viewBox ? viewBox.trim().split(/[\s,]+/).map(Number) : null;
  const [width, height] = parts?.length === 4 && parts.every(Number.isFinite)
    ? [parts[2], parts[3]]
    : [SVG_FALLBACK_SIZE, SVG_FALLBACK_SIZE];
  if (!(width > 0) || !(height > 0)) return svg;

  const sized = openTag.replace(/^<svg/i, `<svg width="${width}" height="${height}"`);
  return svg.replace(openTag, sized);
}

// Square default for an SVG with neither dimensions nor a usable viewBox; it still scales
// cleanly, this only gives the decoder something to work from.
const SVG_FALLBACK_SIZE = 64;
