import { useEffect, useRef, useState } from "react";
import { CaretDown, DotsSixVertical, DotsThree } from "@phosphor-icons/react";
import { useDraggable } from "@dnd-kit/core";
import { isCollapsed, isNamed } from "../lib/sections";
import { SectionIcon } from "./SectionIcon";

const MAX_NAME = 24;

// The heading carries every action a section has, and carries them where they can be seen. The
// first version put rename on a click and delete on a right-click only, which is the shape most
// people never find: right-click is the power-user path everywhere it appears, never the only
// one. Notion, Steam and Figma all hang a visible menu button off the group title on hover, and
// Windows 10's Start groups put a drag grip in the same place — so both live here, revealed on
// hover and on keyboard focus.
export function SectionHeading({
  section, index, blockIndex, count, editing, seamArmed, dropArmed,
  onStartEdit, onCommit, onCancel, onContextMenu, onToggleCollapse,
}) {
  const inputRef = useRef(null);
  // Escape unmounts the input, and removing a focused field fires blur — which would then commit
  // the very draft the user just abandoned. The flag is read once and cleared.
  const cancelled = useRef(false);
  const [draft, setDraft] = useState(section.name);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: section.id });

  const named = isNamed(section);
  const collapsed = isCollapsed(section);
  // A heading with no name and nothing hidden behind it is laid out at zero height; collapsed it
  // has to stay visible, or a section with neither a name nor visible tiles would be a piece of
  // the grid nobody could find again.
  const compact = !named && !collapsed;

  useEffect(() => {
    if (!editing) return;
    setDraft(section.name);
    cancelled.current = false;
  }, [editing, section.name]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Selected, not caret-at-end: a heading is born named "新分区" and every one of those is
    // meant to be typed straight over.
    input.select();
  }, [editing]);

  const controls = (
    <>
      <button
        type="button"
        className="section-heading__menu"
        aria-label="分区操作"
        onClick={onContextMenu}
        onContextMenu={onContextMenu}
      ><DotsThree size={18} weight="bold" /></button>
      <button
        ref={setNodeRef}
        type="button"
        className="section-heading__grip"
        aria-label="拖动以移动分区"
        {...attributes}
        {...listeners}
      ><DotsSixVertical size={16} weight="bold" /></button>
    </>
  );

  return (
    <div
      className={[
        "section-heading",
        compact ? "section-heading--compact" : "",
        collapsed ? "section-heading--collapsed" : "",
        isDragging ? "section-heading--dragging" : "",
        dropArmed ? "section-heading--armed" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--i": index }}
      data-seam={blockIndex}
      // Only when collapsed. The block has no tiles on screen then, so the heading itself has to
      // be the thing a drag can aim at; while it is expanded its own tiles are the targets, and a
      // second target on the same marker would just be a magnet sitting in the row gap.
      {...(collapsed ? { "data-tile-id": section.id } : null)}
    >
      <span className="section-seam" aria-hidden="true" data-armed={seamArmed ? "" : undefined} />
      {collapsed && <span className="shortcut__icon section-heading__target" aria-hidden="true" />}
      {!compact && (
        <button
          type="button"
          className="section-heading__caret"
          aria-label={collapsed ? "展开分区" : "折叠分区"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        ><CaretDown size={13} weight="bold" /></button>
      )}
      {!compact && section.glyph && (
        // Coloured, the glyph goes into a small squircle: a saturated shape has to bring its own
        // background over an arbitrary photograph, and a chip in the tile's own corner curve is
        // the material this product already speaks. Uncoloured, it stays a bare white glyph —
        // which is what every heading was before colour existed, so the default page is unchanged.
        <span
          className={`section-heading__icon ${section.accentColor ? "section-heading__icon--chip" : ""}`}
          style={section.accentColor ? { "--section-accent": section.accentColor } : undefined}
        ><SectionIcon name={section.glyph} size={section.accentColor ? 13 : 17} /></span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          className="section-heading__input"
          value={draft}
          maxLength={MAX_NAME}
          aria-label="分区名称"
          placeholder="分区名称（可留空）"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelled.current) { cancelled.current = false; return; }
            onCommit(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); onCommit(draft); }
            if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; onCancel(); }
          }}
        />
      ) : compact ? (
        // A heading with its name cleared keeps the break and gives back the line. The row is
        // laid out at zero height, so the two row-gaps either side of it simply meet; what sits
        // in the gap is an overlay that occupies nothing and shows nothing until pointed at,
        // which is also the only way back to naming it.
        <span className="section-heading__float">
          <button type="button" className="section-heading__add" onClick={onStartEdit}>命名此分区</button>
          {controls}
        </span>
      ) : (
        <>
          <button
            type="button"
            className="section-heading__name"
            title="点击重命名"
            onClick={onStartEdit}
            onContextMenu={onContextMenu}
          >{named ? section.name : "未命名"}</button>
          {collapsed && <span className="section-heading__count">{count}</span>}
          {controls}
        </>
      )}
    </div>
  );
}

// An empty section still has to be somewhere a link can be dropped, and the grid only aims at
// things that were measured — so the placeholder carries the marker's own id. planDrop then
// resolves it like any other cell and lands the link immediately after the marker, which is
// exactly "inside this section". No new drop kind, no new branch in applyPlan.
//
// It draws nothing at rest. The first version drew a visible outlined square, which sat next to
// the "+" tile looking almost exactly like it while meaning something entirely different; Notion
// and Steam both leave an empty group as a heading over blank space, and the ring only has to
// exist at the moment it is being aimed at.
export function SectionDropCell({ section, index, armed }) {
  return (
    <div
      className={`shortcut section-drop ${armed ? "section-drop--armed" : ""}`}
      style={{ "--i": index }}
      data-tile-id={section.id}
      aria-hidden="true"
    >
      <span className="shortcut__icon section-drop__icon" />
    </div>
  );
}
