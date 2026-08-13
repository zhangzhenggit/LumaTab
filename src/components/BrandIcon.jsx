import { useEffect, useState } from "react";
import {
  BookOpen, ChatCircleDots, Cloud, Code, Compass, Database,
  GlobeHemisphereWest, HardDrives, TerminalWindow, Wrench,
} from "@phosphor-icons/react";
import { glassTintFor, patternFor } from "../lib/icons";

const GENERATED_SYMBOLS = [
  Code,
  Cloud,
  TerminalWindow,
  Database,
  Wrench,
  BookOpen,
  ChatCircleDots,
  GlobeHemisphereWest,
  Compass,
  HardDrives,
];

export function iconAppearance(item) {
  if (item.type === "folder") return { kind: "folder", surface: null };
  if (item.iconMode === "generated" || !item._iconUrl) {
    return { kind: "generated", surface: patternFor(item.name, item.url).colors[0] };
  }
  return { kind: "favicon", surface: glassTintFor(item.url) };
}

function GeneratedIcon({ item, compact = false }) {
  const { colors, variant } = patternFor(item.name, item.url);
  const Symbol = GENERATED_SYMBOLS[variant];
  return (
    <span
      className={`generated-icon ${compact ? "generated-icon--compact" : ""}`}
      style={{ "--icon-start": colors[0], "--icon-end": colors[1] }}
      aria-hidden="true"
    >
      <Symbol size={compact ? 14 : 34} weight="duotone" />
    </span>
  );
}

export function BrandIcon({ item, compact = false }) {
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setIconFailed(false);
  }, [item._iconUrl]);

  if (!item._iconUrl || iconFailed || item.iconMode === "generated") {
    return <GeneratedIcon item={item} compact={compact} />;
  }

  return (
    <img
      className={`brand-icon ${compact ? "brand-icon--compact" : ""}`}
      data-source={item._iconSource ?? "cache"}
      src={item._iconUrl}
      alt=""
      draggable="false"
      onError={() => setIconFailed(true)}
    />
  );
}
