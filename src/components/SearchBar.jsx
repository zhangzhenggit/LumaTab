import { MagnifyingGlass } from "@phosphor-icons/react";

export function SearchBar() {
  function submitSearch(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("query")?.trim();
    if (!value) return;

    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol)) {
        window.location.assign(url.toString());
        return;
      }
    } catch {
      if (/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(value)) {
        window.location.assign(`https://${value}`);
        return;
      }
    }

    window.location.assign(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <form className="search" role="search" onSubmit={submitSearch}>
      {/* No caret: Google is the only engine and there is nothing to open. A disclosure arrow
          that does nothing when clicked is worse than no affordance at all. */}
      <img className="google-mark" src="/assets/sites/google.png" alt="" aria-hidden="true" />
      <input
        aria-label="搜索或输入网址"
        name="query"
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="输入搜索内容"
      />
      <button className="search__submit" type="submit" aria-label="搜索">
        <MagnifyingGlass size={18} weight="bold" />
      </button>
    </form>
  );
}
