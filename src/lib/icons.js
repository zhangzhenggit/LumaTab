const COLORS = [
  ["#3978f6", "#79a8ff"],
  ["#f04467", "#ff806c"],
  ["#00a9b7", "#42d4c7"],
  ["#08ae7a", "#62dc9f"],
  ["#8b46df", "#c37aff"],
  ["#f4770b", "#ffb13b"],
];

const GLASS_TINTS = [
  "rgba(214, 230, 255, .86)",
  "rgba(255, 222, 231, .86)",
  "rgba(211, 244, 235, .86)",
  "rgba(230, 220, 255, .86)",
  "rgba(255, 232, 203, .86)",
  "rgba(207, 240, 244, .86)",
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

export function patternFor(name, url = "") {
  const hash = stableHash(`${name}|${url}`);
  const searchable = `${name} ${url}`.toLowerCase();
  const semanticRules = [
    [/(git|code|dev|jira|rom|project|研发|代码)/, 0],
    [/(cloud|drive|网盘|云)/, 1],
    [/(terminal|shell|ssh|server|host|运维)/, 2],
    [/(data|database|sql|db|数据)/, 3],
    [/(tool|admin|console|工具|管理)/, 4],
    [/(doc|wiki|book|note|文档|知识)/, 5],
    [/(chat|ai|bot|消息|聊天)/, 6],
  ];
  const matched = semanticRules.find(([pattern]) => pattern.test(searchable));
  return {
    colors: COLORS[hash % COLORS.length],
    variant: matched?.[1] ?? 7 + (hash % 3),
  };
}

export function glassTintFor(url = "") {
  return GLASS_TINTS[stableHash(url) % GLASS_TINTS.length];
}

export function createId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}
