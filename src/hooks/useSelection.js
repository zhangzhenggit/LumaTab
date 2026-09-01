import { useCallback, useEffect, useRef, useState } from "react";
import { bandRect, bandStarted, pruneSelection, tilesInBand } from "../lib/marquee";
import { measureTiles, typeMap } from "../lib/grid-metrics";

// Anything that already means something when you press on it. A band can only begin on the parts
// of the page that mean nothing — the wallpaper, the margins, the row gaps — which is the same
// rule Finder and Explorer follow, and the reason it can be added without taking a gesture away
// from anything else.
const LIVE = ".shortcut, .section-heading, .section-add, .search, button, a, input, textarea, [role=\"dialog\"]";

export function useSelection(itemsRef) {
  const [selection, setSelection] = useState(() => new Set());
  const [band, setBand] = useState(null);
  // The grid as it was when the band started. Same contract as the drag: measured once, never
  // re-read, so nothing the band does to the page can move what it is measuring against.
  const cellsRef = useRef([]);
  const baseRef = useRef(new Set());
  const originRef = useRef(null);

  const clear = useCallback(() => {
    setSelection((current) => (current.size ? new Set() : current));
  }, []);

  const toggle = useCallback((id) => {
    setSelection((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0 || event.target.closest(LIVE)) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    originRef.current = { x: event.clientX, y: event.clientY };
    cellsRef.current = measureTiles(typeMap(itemsRef.current));
    baseRef.current = additive ? new Set(selection) : new Set();
    if (!additive) clear();

    const move = (moveEvent) => {
      const point = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (!bandStarted(originRef.current, point)) return;
      const rect = bandRect(originRef.current, point);
      setBand(rect);
      setSelection(new Set([...baseRef.current, ...tilesInBand(cellsRef.current, rect)]));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      originRef.current = null;
      setBand(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [clear, itemsRef, selection]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clear]);

  // Ids only mean anything while the items behind them exist. A link that was deleted, swallowed
  // by a folder or replaced by an import leaves a stale id in the set, and a stale id would
  // quietly widen the next drag to include something that is not there.
  const prune = useCallback((items) => {
    setSelection((current) => pruneSelection(current, items));
  }, []);

  return { selection, band, onPointerDown, toggle, clear, prune };
}
