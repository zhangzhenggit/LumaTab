import {
  Airplane, Barbell, BookOpen, Briefcase, Bug, Camera, ChartLine, ChatCircle, Code, FilmSlate,
  ForkKnife, GameController, GraduationCap, Heart, House, MusicNotes, Newspaper, Package,
  PaintBrush, Palette, Robot, ShoppingCart, Terminal, Wrench,
} from "@phosphor-icons/react";

// Named rather than dynamically imported: the whole point of the closed set is that the bundle
// knows exactly which two dozen glyphs can ever appear, and a dynamic path would drag the entire
// icon library in behind it.
const GLYPHS = {
  Airplane, Barbell, BookOpen, Briefcase, Bug, Camera, ChartLine, ChatCircle, Code, FilmSlate,
  ForkKnife, GameController, GraduationCap, Heart, House, MusicNotes, Newspaper, Package,
  PaintBrush, Palette, Robot, ShoppingCart, Terminal, Wrench,
};

// Filled, not outlined. At 17px over a photograph a line glyph loses its interior to whatever is
// behind it and reads as texture; a solid shape keeps its silhouette, which is the only thing
// carrying it at this size.
export function SectionIcon({ name, size = 17 }) {
  const Glyph = GLYPHS[name];
  if (!Glyph) return null;
  return <Glyph size={size} weight="fill" aria-hidden="true" />;
}
