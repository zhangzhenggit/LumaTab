// A closed set, not a free-form field. Three earlier attempts at improving the tiles all failed
// because they varied per item and turned a grid nobody vetted into a patchwork (see the bevel
// note in AGENTS.md), and a section heading is the same trap one level up: an emoji picker would
// put a different typeface, a different colour and a different optical weight on every heading.
// One icon family, one weight, one colour — the difference between headings is the word.
//
// Ordered so the picker reads as three rows of eight: work, then making and learning, then life.
// Twenty-three, not twenty-four, because the "no icon" cell is the twenty-fourth and shares the
// grid with them — at twenty-four the panel ended on a row holding a single orphaned glyph.
export const SECTION_ICONS = [
  "Briefcase", "Code", "Terminal", "Bug", "Robot", "Wrench", "ChartLine", "Package",
  "PaintBrush", "Palette", "Camera", "FilmSlate", "MusicNotes", "BookOpen", "GraduationCap", "Newspaper",
  "House", "ShoppingCart", "ForkKnife", "Airplane", "GameController", "ChatCircle", "Heart",
];

export const SECTION_ICON_COLUMNS = 8;

export function isSectionIcon(key) {
  return typeof key === "string" && SECTION_ICONS.includes(key);
}

// Anything unrecognised becomes no icon rather than an error. A file written by a later version
// of this extension can name an icon that does not exist here yet, and losing the glyph is a far
// better outcome than refusing to import the links underneath it.
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
