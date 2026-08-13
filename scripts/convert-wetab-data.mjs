import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , sourceArg, outputArg = "public/data/imported-shortcuts.json"] = process.argv;
if (!sourceArg) {
  throw new Error("Usage: node scripts/convert-wetab-data.mjs <wetab.data> [output.json]");
}

function stableId(prefix, value, usedIds) {
  const base = String(value || prefix).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 72) || prefix;
  let id = base;
  let counter = 2;
  while (usedIds.has(id)) id = `${base}-${counter++}`;
  usedIds.add(id);
  return id;
}

function normalizeSite(item, usedIds) {
  if (item?.type !== "site" || typeof item.target !== "string") return null;
  let url;
  try {
    url = new URL(item.target.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const name = String(item.name || "").trim() || url.hostname.replace(/^www\./, "");
  return {
    id: stableId("link", item.id || `${name}-${url}`, usedIds),
    type: "link",
    name,
    url: url.toString(),
    iconMode: "auto",
  };
}

function convert(items) {
  const usedIds = new Set();
  const output = [];

  for (const item of items) {
    if (item?.type === "folder-icon") {
      const children = (item.children ?? [])
        .map((child) => normalizeSite(child, usedIds))
        .filter(Boolean);
      if (!children.length) continue;
      output.push({
        id: stableId("folder", item.id || item.name, usedIds),
        type: "folder",
        name: String(item.name || "").trim() || "未命名分组",
        children,
      });
      continue;
    }

    const site = normalizeSite(item, usedIds);
    if (site) output.push(site);
  }

  return output;
}

const sourcePath = resolve(sourceArg);
const outputPath = resolve(outputArg);
const parsed = JSON.parse(await readFile(sourcePath, "utf8"));
const categories = parsed?.data?.["store-icon"]?.icons ?? [];
const sourceItems = categories.flatMap((category) => category?.children ?? []);
const converted = convert(sourceItems);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(converted, null, 2)}\n`, "utf8");

const folderCount = converted.filter((item) => item.type === "folder").length;
const topLevelLinks = converted.filter((item) => item.type === "link").length;
const folderLinks = converted
  .filter((item) => item.type === "folder")
  .reduce((count, folder) => count + folder.children.length, 0);
console.log(JSON.stringify({ outputPath, topLevelLinks, folderCount, folderLinks, totalLinks: topLevelLinks + folderLinks }, null, 2));
