import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";

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
      {/* A neutral glass, not an engine's logo. The previous version drew Google's mark here,
          which both implied an affiliation we do not have and advertised the engine lock-in. */}
      <MagnifyingGlass className="search__glass" size={18} weight="bold" aria-hidden="true" />
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
