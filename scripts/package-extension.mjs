// Produces the zip uploaded to the Chrome Web Store.
//
// The critical job is what it LEAVES OUT. `public/data/imported-shortcuts.json` is the developer's
// own bookmarks — dozens of internal hostnames — and it is copied into dist by the normal build
// because that is how local development seeds the grid. Shipping it would publish someone's
// private intranet map to the world, so this script refuses to run if that file is still present
// after pruning rather than trusting itself to have removed it.
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";

const SOURCE = resolve("dist/client");
const STAGING = resolve("dist/store");
const EXCLUDED = ["data"];

async function walk(dir, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(resolve(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

// Minimal zip writer: the store only needs a plain deflate archive, and pulling a dependency in
// for that would be more moving parts than the format itself.
function zipEntry(name, data) {
  const nameBytes = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = (() => {
    let c = ~0;
    for (const byte of data) {
      c ^= byte;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  })();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8);      // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  return { nameBytes, compressed, crc, size: data.length, local };
}

async function main() {
  if (!(await stat(SOURCE).catch(() => null))) {
    throw new Error("dist/client is missing — run `npm run build:extension` first");
  }
  await rm(STAGING, { recursive: true, force: true });
  await mkdir(STAGING, { recursive: true });
  await cp(SOURCE, STAGING, { recursive: true });
  for (const name of EXCLUDED) await rm(resolve(STAGING, name), { recursive: true, force: true });

  const files = (await walk(STAGING)).sort();
  // Belt and braces: verify, do not assume. A rename of the data directory must fail loudly here
  // rather than quietly shipping personal bookmarks.
  const leaked = files.filter((file) => /(^|\/)data\//.test(file) || /imported-shortcuts/.test(file));
  if (leaked.length) throw new Error(`refusing to package personal data: ${leaked.join(", ")}`);
  if (!files.includes("manifest.json")) throw new Error("manifest.json missing from the package");

  const manifest = JSON.parse(await readFile(resolve(STAGING, "manifest.json"), "utf8"));
  const outPath = resolve(`dist/lumatab-${manifest.version}.zip`);

  const entries = [];
  const chunks = [];
  let offset = 0;
  for (const file of files) {
    const data = await readFile(resolve(STAGING, file));
    const entry = zipEntry(file, data);
    entry.offset = offset;
    entries.push(entry);
    chunks.push(entry.local, entry.nameBytes, entry.compressed);
    offset += entry.local.length + entry.nameBytes.length + entry.compressed.length;
  }
  const centralStart = offset;
  for (const entry of entries) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressed.length, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.nameBytes.length, 28);
    header.writeUInt32LE(entry.offset, 42);
    chunks.push(header, entry.nameBytes);
    offset += header.length + entry.nameBytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  chunks.push(end);

  await writeFile(outPath, Buffer.concat(chunks));
  await rm(STAGING, { recursive: true, force: true });
  const { size } = await stat(outPath);
  console.log(`${outPath}\n  ${files.length} files, ${(size / 1024).toFixed(1)} KB`);
  console.log(`  excluded: ${EXCLUDED.join(", ")}`);
}

await main();
