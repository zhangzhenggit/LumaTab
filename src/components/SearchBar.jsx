import { MagnifyingGlass } from "@phosphor-icons/react";

function GoogleMark() {
  return <img className="google-mark" src="/assets/sites/google.png" alt="" />;
}

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
      <GoogleMark />
      <input
        aria-label="Google 搜索或输入网址"
        name="query"
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="搜索 Google 或输入网址"
      />
      <button type="submit" aria-label="搜索">
        <MagnifyingGlass size={22} weight="bold" />
      </button>
    </form>
  );
}
