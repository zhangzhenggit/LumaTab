// Renders docs/PRIVACY.md into docs/index.html, the page GitHub Pages serves.
//
//   node scripts/build-privacy-page.mjs
//
// Why generate instead of just letting Pages serve the markdown: Jekyll only processes .md files
// that carry YAML front matter, so a bare PRIVACY.md is copied through verbatim and the browser
// shows raw markdown — not something to hand a store reviewer. Adding front matter would work but
// puts a stray metadata block at the top of the file on GitHub itself.
//
// The markdown here is ours and deliberately small (headings, paragraphs, bold, inline code,
// bullet lists, one table), so a targeted converter beats a dependency. Anything outside that
// subset is escaped and passed through as a paragraph rather than silently mangled.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, "docs/PRIVACY.md");
const TARGET = resolve(ROOT, "docs/index.html");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Inline: `code`, **bold**, [text](url). Escaping happens first so markup in the source cannot
// inject tags, and the replacements below only ever introduce tags we wrote ourselves.
function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function convert(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) { out.push("<hr>"); i += 1; continue; }

    // Table: a header row, a separator row of dashes, then body rows.
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { body.push(cells(lines[i])); i += 1; }
      out.push(
        "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>"
        + body.map((row) => "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("")
        + "</tbody></table>",
      );
      continue;
    }

    // Lists, ordered or not. A wrapped item continues on an indented line, which is how the
    // source wraps its longer bullets — without this they collapsed into the paragraph branch
    // and the whole list rendered as one run-on block.
    const bullet = /^([-*]|\d+\.)\s+/;
    if (bullet.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const items = [];
      while (i < lines.length && (bullet.test(lines[i]) || (/^\s+\S/.test(lines[i]) && items.length))) {
        if (bullet.test(lines[i])) items.push(lines[i].replace(bullet, ""));
        else items[items.length - 1] += lines[i].trim();
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
      continue;
    }

    // A paragraph runs until a blank line; source line breaks inside it are soft.
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|([-*]|\d+\.)\s|\||---+$)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(""))}</p>`);
    else i += 1;
  }
  return out.join("\n");
}

const markdown = await readFile(SOURCE, "utf8");
const title = /^#\s+(.*)$/m.exec(markdown)?.[1] ?? "隐私政策";
const body = convert(markdown);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --ink:#1c1c1e; --muted:#6b6b70; --line:#e3e3e8; --bg:#fff; --soft:#f7f7f9; --link:#2f6bf3; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#e9e9ec; --muted:#a0a0a8; --line:#33333a; --bg:#17171a; --soft:#1f1f24; --link:#7aa2ff; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:48px 20px 96px; color:var(--ink); background:var(--bg);
    font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { margin:0 0 8px; font-size:30px; line-height:1.3; }
  h2 { margin:44px 0 12px; font-size:20px; }
  h3 { margin:32px 0 8px; font-size:17px; }
  p { margin:12px 0; }
  ul, ol { margin:12px 0; padding-left:24px; }
  li { margin:6px 0; }
  a { color:var(--link); }
  code { padding:2px 6px; border-radius:5px; background:var(--soft); font-size:.9em;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  hr { margin:40px 0; border:0; border-top:1px solid var(--line); }
  .table-wrap { overflow-x:auto; margin:18px 0; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { padding:10px 12px; border:1px solid var(--line); text-align:left; vertical-align:top; }
  th { background:var(--soft); font-weight:600; }
  footer { margin-top:56px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<main>
${body.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>")}
<footer>本页由 <code>docs/PRIVACY.md</code> 生成，请勿直接编辑；改动源文件后重新运行 <code>npm run privacy:page</code>。</footer>
</main>
</body>
</html>
`;

await writeFile(TARGET, html);
console.log("已生成:", TARGET);
console.log("标题:", title);
