import { ArrowRight } from "@phosphor-icons/react";

// The mark is drawn here rather than taken from the icon set because each quarter of the ring
// carries its own colour, which no icon-set glyph can express.
//
// Four hues, but a plain magnifying glass: the shape is the generic search affordance, not any
// engine's mark. That distinction is the whole point — a palette is not a trademark, a lookalike
// logo is. Nothing about this icon claims an affiliation, and nothing about it claims to know
// which engine the box will reach, because it does not (see runSearch).
const RING = { cx: 10.5, cy: 10.5, r: 6.5, width: 2.7, gap: 8 };

// Gaps trimmed off both ends of every arc, so the four pieces read as four pieces. Without them
// the ring is one stroke that merely changes colour, and at 22px the hues smear together.
function arcPath(from, to) {
  const point = (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return `${(RING.cx + RING.r * Math.cos(radians)).toFixed(3)} ${(RING.cy + RING.r * Math.sin(radians)).toFixed(3)}`;
  };
  return `M ${point(from + RING.gap)} A ${RING.r} ${RING.r} 0 0 1 ${point(to - RING.gap)}`;
}

// Ordered clockwise from the right. The handle leaves the ring at 45°, where the first arc ends,
// so it takes that arc's colour and the stroke reads as one continuous line.
const SEGMENTS = [
  [-45, 45, "#4285F4"],
  [45, 135, "#34A853"],
  [135, 225, "#FBBC05"],
  [225, 315, "#EA4335"],
];
const HANDLE_COLOUR = SEGMENTS[0][2];

function SearchGlass() {
  return (
    <svg className="search__glass" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      {SEGMENTS.map(([from, to, colour]) => (
        <path key={colour} d={arcPath(from, to)} stroke={colour} strokeWidth={RING.width} strokeLinecap="round" />
      ))}
      <path d="M15.8 15.8 20.4 20.4" stroke={HANDLE_COLOUR} strokeWidth={RING.width} strokeLinecap="round" />
    </svg>
  );
}

// This box must not decide which search engine the user gets.
//
// The first submission built one engine's query URL here and was rejected under Chrome Web
// Store violation "Red Argon": a new tab override that also ships its own search is
// treated as changing the user's search experience, no matter how thin the search UI is.
// chrome.search.query is the sanctioned way out — it hands the text to whichever engine the user
// picked in Chrome's own settings, so this file no longer names an engine at all.
function runSearch(text) {
  // Declared in the manifest and available since Chrome 87, well under our 109 floor; the guard
  // exists so a missing API degrades to "nothing happens" rather than a thrown render error.
  // There is deliberately no URL fallback: any engine we could hardcode here is the violation.
  if (!chrome?.search?.query) {
    console.warn("LumaTab: chrome.search unavailable, cannot run a search");
    return;
  }
  Promise.resolve(chrome.search.query({ text, disposition: "CURRENT_TAB" }))
    .catch((error) => console.warn("LumaTab: search failed", error));
}

// Typing an address and pressing Enter goes straight there. That is navigation, not search, so it
// stays local — it never reaches an engine and never overrides one.
function asDirectUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return /^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(value) ? `https://${value}` : null;
  }
}

export function SearchBar() {
  function submitSearch(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("query")?.trim();
    if (!value) return;

    const direct = asDirectUrl(value);
    if (direct) {
      window.location.assign(direct);
      return;
    }
    runSearch(value);
  }

  return (
    <form className="search" role="search" onSubmit={submitSearch}>
      {/* Our own glass, not an engine's logo. The first version drew Google's mark here, which
          both implied an affiliation we do not have and advertised the engine lock-in. */}
      <SearchGlass />
      <input
        aria-label="搜索或输入网址"
        name="query"
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="搜索或输入网址"
      />
      <button className="search__submit" type="submit" aria-label="搜索">
        <ArrowRight size={18} weight="bold" />
      </button>
    </form>
  );
}
