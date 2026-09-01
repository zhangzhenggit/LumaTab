// A closed set, not a free-form field. Closed on purpose, and for the same reason the tile bevel
// is a constant: an emoji picker would put a different typeface, a different colour and a
// different optical weight on every heading, and a column of headings nobody vetted becomes a
// patchwork. One family, one weight, one colour — the difference between headings is the word.
//
// Grouped because forty-eight unlabelled glyphs in a grid is a search, not a choice. Each group
// is exactly one row wide, so the panel reads as six labelled shelves rather than a wall.
//
// Every key is also a storage value. Removing one does not just take it out of the picker: any
// section already using it silently loses its glyph on the next load. A test pins the keys that
// have shipped.
export const SECTION_ICON_COLUMNS = 8;

// The same eleven fills the generated letter tiles use, so a coloured heading is drawn from the
// exact palette as the grid under it rather than introducing a second one. A section with no
// colour keeps the plain white glyph, which is what every heading looked like before this
// existed — colour is opt-in, and the default page does not change.
import { ACCENTS } from "./icons.js";
export { ACCENTS as SECTION_ACCENTS } from "./icons.js";

export const SECTION_ICON_GROUPS = [
  {
    label: "工作",
    icons: [
      ["Briefcase", "公文包"], ["Buildings", "办公"], ["Calendar", "日程"], ["ChartLine", "数据"],
      ["ChartPieSlice", "报表"], ["Clipboard", "清单"], ["Package", "项目"], ["Presentation", "演示"],
    ],
  },
  {
    label: "开发",
    icons: [
      ["Code", "代码"], ["Terminal", "终端"], ["Bug", "缺陷"], ["GitBranch", "分支"],
      ["Database", "数据库"], ["Cloud", "云服务"], ["Wrench", "工具"], ["Robot", "AI"],
    ],
  },
  {
    label: "设计",
    icons: [
      ["PaintBrush", "画笔"], ["Palette", "调色"], ["PenNib", "钢笔"], ["Camera", "摄影"],
      ["Image", "图片"], ["Crop", "裁剪"], ["Sparkle", "灵感"], ["MagicWand", "效果"],
    ],
  },
  {
    label: "学习",
    icons: [
      ["BookOpen", "阅读"], ["GraduationCap", "学习"], ["Notebook", "笔记"], ["Newspaper", "资讯"],
      ["Translate", "翻译"], ["Lightbulb", "想法"], ["Compass", "探索"], ["Flask", "实验"],
    ],
  },
  {
    label: "生活",
    icons: [
      ["House", "生活"], ["ShoppingCart", "购物"], ["ForkKnife", "美食"], ["Airplane", "旅行"],
      ["MapPin", "地点"], ["Wallet", "钱包"], ["Heart", "收藏"], ["Barbell", "运动"],
    ],
  },
  {
    label: "娱乐",
    icons: [
      ["GameController", "游戏"], ["MusicNotes", "音乐"], ["FilmSlate", "影视"], ["TelevisionSimple", "电视"],
      ["ChatCircle", "社交"], ["Confetti", "活动"], ["Star", "常用"], ["Basketball", "体育"],
    ],
  },
];

export const SECTION_ICONS = SECTION_ICON_GROUPS.flatMap((group) => group.icons.map(([key]) => key));

const LABELS = new Map(SECTION_ICON_GROUPS.flatMap((group) => group.icons));

export function sectionIconLabel(key) {
  return LABELS.get(key) ?? "";
}

export function isSectionIcon(key) {
  return typeof key === "string" && LABELS.has(key);
}

// Anything unrecognised becomes no icon rather than an error. A file written by a later version
// of this extension can name a glyph that does not exist here yet, and losing the picture is a
// far better outcome than refusing to import the links underneath it.
export function normalizeSectionIcon(key) {
  return isSectionIcon(key) ? key : null;
}

// Stored as `glyph`, not `icon`. `icon` is a reserved word in this data: storage.js strips every
// field called that, because links used to carry a preset-icon field under that name and a stale
// one would resurrect artwork the user had replaced. A section icon written as `icon` renders
// perfectly and then vanishes on the next reload, which is exactly how this was found.
export function setSectionIcon(items = [], id, key) {
  const glyph = normalizeSectionIcon(key);
  const current = items.find((item) => item.type === "section" && item.id === id);
  if (!current || (current.glyph ?? null) === glyph) return items;
  return items.map((item) => (item === current ? { ...item, glyph } : item));
}

export function isSectionAccent(color) {
  return typeof color === "string" && ACCENTS.includes(color);
}

export function normalizeSectionAccent(color) {
  return isSectionAccent(color) ? color : null;
}

// Same field name links use, and deliberately: it is the same idea — this thing's colour — and
// reusing it means one shape of data and one thing to remember about what survives storage.
export function setSectionAccent(items = [], id, color) {
  const accentColor = normalizeSectionAccent(color);
  const current = items.find((item) => item.type === "section" && item.id === id);
  if (!current || (current.accentColor ?? null) === accentColor) return items;
  return items.map((item) => (item === current ? { ...item, accentColor } : item));
}
