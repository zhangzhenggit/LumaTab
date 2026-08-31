import { useEffect, useRef } from "react";

// A very slow pan across the wallpaper, driven from our own clock rather than from the document
// timeline.
//
// The obvious implementations both fail, and both failed here before this file existed. A CSS
// animation keeps advancing while the tab is hidden even though nothing is being painted, so
// returning to a tab jumps the picture across however long you were away; the guard everyone
// reaches for — toggling `animation-play-state` from `visibilitychange` — never actually applies,
// because that style change waits on a rendering update that will not happen until the tab is
// visible again, by which point the handler has already undone it. WAAPI's `pause()` looks like
// the answer but schedules a pause *task* whose ready time is read when the pipeline next runs,
// which is the same trap wearing a different hat.
//
// So the animation does not use a timeline at all. It accumulates its own elapsed time, one frame
// at a time, and clamps each step:
//
//     elapsed += Math.min(now - last, MAX_STEP_MS)
//
// requestAnimationFrame does not fire for a hidden tab, so time simply stops accumulating while
// you are away. The one frame that does report a huge delta is the first one after you come back,
// and the clamp caps its contribution at a single frame's worth of motion. There is no code path
// that can advance this by more than MAX_STEP_MS at once, which is why it cannot jump — not
// because visibility is being handled correctly, but because it is not being consulted.
//
// A new tab page is a fresh document every time, so every tab starts from the same frame. That is
// deliberate: an earlier version seeded a random start phase to avoid "always the same opening
// seconds", and bought that by opening consecutive tabs at visibly different framings — which is
// the jump everyone actually notices, invented on purpose.

// The whole safety property, in one number. Anything slower than ~10fps is treated as a stall
// rather than as elapsed time.
const MAX_STEP_MS = 100;

// One traverse. It reverses at each end, so a full round trip is twice this. Chosen from how long
// a new tab is actually looked at: a few seconds, over which ~4-5px of travel at the frame edge
// is enough to register as life without becoming a distraction.
const CYCLE_MS = 26_000;
// 10% of zoom moves a 1920px frame's edge by ~96px over a cycle; the pan adds ~38px.
const ZOOM = 0.1;
const PAN = 2;

// The picture arriving. 3.5% of extra zoom, released over 900ms, so a wallpaper settles into
// place instead of being switched on. Deliberately scale rather than opacity: fading the layer in
// would show the page's own background through it for those 900ms, and on a wallpaper *change*
// it would flash between the two pictures. Scale has neither problem and needs no second layer.
const INTRO_MS = 900;
const INTRO_ZOOM = 0.035;

// How much of each traverse is spent getting up to speed and slowing down again. A pure triangle
// wave reverses instantaneously at both ends; a full ease-in-out fixes that but spends most of
// the traverse barely moving, which is exactly the "it never moves" this feature was reported for
// the first time round. What a camera operator actually does is hold a steady rate and feather
// the two ends, and that is a trapezoidal velocity profile — constant through the middle, ramped
// across the outer 16%. It is the only one of the three with no velocity step at the turn *and*
// no dead middle.
const EASE_SPAN = 0.16;

// Traditional Ken Burns picks the move from the picture: pan toward the subject, and pan mostly
// sideways, because a steep vertical drift on a landscape reads as the frame sliding off rather
// than as a camera move. We cannot see the subject cheaply, but we can keep the second half of
// that — every angle here is within 40° of horizontal — and we can at least stop the move being
// the same one every day.
const ANGLES = [20, -20, 40, -40, 140, -140, 160, -160];

// Solid backgrounds. The ramp itself cannot move — translating a linear gradient gives you the
// same gradient very slightly moved — so the three aurora blobs are the only thing on a solid
// background that can drift at all. They travel on ellipses rather than back and forth, which
// needs no feathering because an ellipse never reverses; three different periods, deliberately
// not multiples of each other, so the composition never repeats within a visit. The wallpaper
// layer used to carry all three as one unit, which moves a still image around rather than
// animating anything.
const BLOB_MOTION = [
  { period: 37_000, x: 4.5, y: 3.0, phase: 0 },
  { period: 46_000, x: -3.5, y: 4.0, phase: 0.33 },
  { period: 29_000, x: 3.0, y: -3.5, phase: 0.66 },
];

// Deterministic, and deliberately so. Choosing a direction at random per visit would put
// consecutive tabs showing the same wallpaper on different paths, which is the "it looks like it
// jumped" complaint re-invented one level up. Keyed on the picture's own identity instead, the
// angle becomes a property of the picture: today's photo always drifts the same way, tomorrow's
// drifts differently.
export function driftAngleFor(seed) {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return ANGLES[Math.abs(hash) % ANGLES.length];
}

// Distance covered by fraction `t` of a traverse under the trapezoidal velocity profile above.
// Peak rate is 1/(1 - EASE_SPAN) so the areas still sum to exactly one traverse.
export function feather(t) {
  const peak = 1 / (1 - EASE_SPAN);
  if (t < EASE_SPAN) return (peak * t * t) / (2 * EASE_SPAN);
  if (t > 1 - EASE_SPAN) return 1 - (peak * (1 - t) * (1 - t)) / (2 * EASE_SPAN);
  return peak * (t - EASE_SPAN / 2);
}

function stilled() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// The clock every drift on this page shares. Returns a cancel function, or null if there is no
// business starting one.
function runClampedClock(onFrame) {
  if (typeof requestAnimationFrame !== "function" || stilled()) return null;
  let elapsed = 0;
  let last = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    elapsed += Math.min(now - last, MAX_STEP_MS);
    last = now;
    onFrame(elapsed);
    frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}

// `seed` identifies the wallpaper, not the visit — a photo's start date, or a solid background's
// colours. Changing it starts a new move from the beginning, which is what a new picture wants,
// and replays the arrival zoom for it.
export function useWallpaperDrift(seed = "") {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const radians = (driftAngleFor(seed) * Math.PI) / 180;
    // Both components stay under PAN, and the frame's overhang at progress p is 5p% per side
    // against a pan of at most 2p%, so the layer can never expose an edge mid-move.
    const panX = PAN * Math.cos(radians);
    const panY = PAN * Math.sin(radians);

    const stop = runClampedClock((elapsed) => {
      // Triangle wave: out across one cycle, back across the next, with each traverse feathered.
      const phase = (elapsed % (CYCLE_MS * 2)) / CYCLE_MS;
      const progress = feather(phase <= 1 ? phase : 2 - phase);
      // Quartic ease-out, matching --ease-out in styles.css closely enough that the wallpaper
      // settles on the same curve everything else on the page moves on.
      const arriving = Math.min(1, elapsed / INTRO_MS);
      const intro = INTRO_ZOOM * (1 - arriving) ** 4;
      // The standalone transform properties, not `transform`: they compose with it rather than
      // replacing it, which leaves the blur overscan that wallpaperFilterStyle writes as an
      // inline `transform` completely alone. React never touches these, because they are not in
      // the style object it renders.
      node.style.scale = (1 + ZOOM * progress + intro).toFixed(4);
      node.style.translate = `${(panX * progress).toFixed(3)}% ${(panY * progress).toFixed(3)}%`;
    });
    if (!stop) return undefined;

    return () => {
      stop();
      node.style.scale = "";
      node.style.translate = "";
    };
  }, [seed]);

  return ref;
}

// Drifts the blobs inside an <Aurora>. Separate from the wallpaper's own drift because it only
// ever runs on a solid background — a photograph has no blobs — and because the two want
// completely different motion: one traverse and reverse, three independent orbits.
export function useAuroraDrift(active = true) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !active) return undefined;
    const blobs = [...node.children].slice(0, BLOB_MOTION.length);
    if (!blobs.length) return undefined;

    const stop = runClampedClock((elapsed) => {
      blobs.forEach((blob, index) => {
        const { period, x, y, phase } = BLOB_MOTION[index];
        const angle = 2 * Math.PI * (elapsed / period + phase);
        blob.style.translate = `${(x * Math.sin(angle)).toFixed(3)}% ${(y * Math.cos(angle)).toFixed(3)}%`;
      });
    });
    if (!stop) return undefined;

    return () => {
      stop();
      for (const blob of blobs) blob.style.translate = "";
    };
  }, [active]);

  return ref;
}
