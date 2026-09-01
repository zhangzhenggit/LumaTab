import {
  Airplane, Barbell, Basketball, BookOpen, Briefcase, Buildings, Bug, Calendar, Camera,
  ChartLine, ChartPieSlice, ChatCircle, Clipboard, Cloud, Code, Compass, Confetti, Crop,
  Database, FilmSlate, Flask, ForkKnife, GameController, GitBranch, GraduationCap, Heart, House,
  Image, Lightbulb, MagicWand, MapPin, MusicNotes, Newspaper, Notebook, Package, PaintBrush,
  Palette, PenNib, Presentation, Robot, ShoppingCart, Sparkle, Star, Terminal, TelevisionSimple,
  Translate, Wallet, Wrench,
} from "@phosphor-icons/react";

// Named rather than dynamically imported: the whole point of the closed set is that the bundle
// knows exactly which glyphs can ever appear, and a dynamic path would drag the entire icon
// library in behind it.
const GLYPHS = {
  Airplane, Barbell, Basketball, BookOpen, Briefcase, Buildings, Bug, Calendar, Camera,
  ChartLine, ChartPieSlice, ChatCircle, Clipboard, Cloud, Code, Compass, Confetti, Crop,
  Database, FilmSlate, Flask, ForkKnife, GameController, GitBranch, GraduationCap, Heart, House,
  Image, Lightbulb, MagicWand, MapPin, MusicNotes, Newspaper, Notebook, Package, PaintBrush,
  Palette, PenNib, Presentation, Robot, ShoppingCart, Sparkle, Star, Terminal, TelevisionSimple,
  Translate, Wallet, Wrench,
};

// Filled, not outlined. At 17px over a photograph a line glyph loses its interior to whatever is
// behind it and reads as texture; a solid shape keeps its silhouette, which is the only thing
// carrying it at this size.
export function SectionIcon({ name, size = 17 }) {
  const Glyph = GLYPHS[name];
  if (!Glyph) return null;
  return <Glyph size={size} weight="fill" aria-hidden="true" />;
}

export const GLYPH_NAMES = Object.keys(GLYPHS);
