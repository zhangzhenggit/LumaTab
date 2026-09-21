import { silkPalette, silkSeed } from "./background-cache-keys.js";

// The solid background's renderer: a full-screen fragment shader that draws folded silk in the
// preset's colours. Everything pure — which colours, which seed — lives in background-cache-keys
// so the worker can import it and a test can assert it; this file is the part that needs a GPU.
//
// Why a shader and not CSS. The previous solid background was three `filter: blur(90px)` discs
// over a two-stop ramp, and it read as unfinished — "像基础 Demo" — for a structural reason: a
// gaussian blob has no edge anywhere, and nothing built only from soft edges can look resolved.
// What the eye reads as finished in a macOS or iOS wallpaper is *relief*: a surface with ridges
// that catch light and troughs that fall away from it, which is geometry, not colour. CSS cannot
// light a surface. A fragment shader can: build a height field from domain-warped noise, take
// its slope with dFdx/dFdy, and shade it from one fixed light in the upper left. The result has
// contours that are sharp exactly where a fold turns over and smooth everywhere else — which is
// what "清晰" means for something that is not a photograph.
//
// It renders at a capped internal resolution and lets the browser scale the canvas up. The field
// is low-frequency by construction, so the upscale is invisible, and the film grain layered over
// the whole page (see .grain) is what puts pixel-level texture back. Cost is bounded by that cap,
// not by the display.

// Two GLSL dialects, one body. WebGL2 speaks ESSL 3.00, where derivatives are built in and the
// fragment output is a declared variable; WebGL1 speaks ESSL 1.00 and needs the derivatives
// extension. Everything below the preamble is shared, so the two cannot drift apart.
const VERTEX_1 = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const VERTEX_2 = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const PREAMBLE_1 = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
`;
const PREAMBLE_2 = `#version 300 es
precision highp float;
out vec4 fragColor;
#define gl_FragColor fragColor
`;

const FRAGMENT_BODY = `
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_seed;
uniform float u_angle;
uniform vec3 u_deep;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_light;
uniform vec3 u_accent;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Gradient noise: smoother than value noise at the same octave count, and free of the
// axis-aligned plateaus value noise shows once it is stretched across a whole screen.
vec2 grad(vec2 p) {
  float h = hash(p) * 6.2831853;
  return vec2(cos(h), sin(h));
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(dot(grad(i), f), dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Three octaves, not four, and a steep falloff. A fourth octave at this scale puts detail in
// the field that is finer than a fold — the first version had it and read as marbled liquid
// rather than as cloth, because relief shading turns every one of those wrinkles into an edge.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.58;
  mat2 m = rot(0.62) * 2.03;
  for (int i = 0; i < 3; i++) { v += a * gnoise(p); p = m * p; a *= 0.42; }
  return v;
}

// Domain warping: the field is noise sampled through two layers of noise-driven displacement.
// One layer gives blobs; two give the long, folded, self-similar bands that read as fabric.
// Warp strength is what decides whether this reads as cloth or as a lava lamp. Strong warping
// folds the field back over itself many times inside one screen, which is the marbling the first
// attempt produced; gentle warping bends a handful of long bands, which is drapery.
float field(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + 0.05 * t), fbm(p + vec2(5.2, 1.3) - 0.04 * t));
  vec2 r = vec2(fbm(p + 1.7 * q + vec2(1.7, 9.2) + 0.03 * t), fbm(p + 1.7 * q + vec2(8.3, 2.8) - 0.02 * t));
  return fbm(p + 1.45 * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  // Well under one noise cell across the screen: three or four folds, not thirty. This number is
  // the single biggest lever on whether the result looks calm, and it was 1.35 in the version
  // that came out as psychedelic marble.
  p = rot(u_angle) * p * 0.95 + u_seed;
  float h = field(p, u_time);
  float v = clamp(h * 0.60 + 0.5, 0.0, 1.0);

  // Relief. The slope of the field is the surface normal; one light, fixed in the upper left,
  // so every preset is lit the same way and the page keeps one light source with the tiles.
  // Scaled by the viewport so a fold is lit the same way at any window size — the derivative is
  // per device pixel, so without this the relief would fade as the window grows.
  vec2 slope = vec2(dFdx(h), dFdy(h)) * u_res.y * 0.85;
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 l = normalize(vec3(-0.45, 0.62, 0.64));
  float diff = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 42.0);

  // Colour follows height: troughs deep, ridges light.
  vec3 col = mix(u_deep, u_base, smoothstep(0.12, 0.48, v));
  col = mix(col, u_mid, smoothstep(0.44, 0.74, v));
  col = mix(col, u_light, smoothstep(0.70, 0.96, v));
  // One contour carries the accent, faintly — a second colour along a single fold line is what
  // separates silk from a tinted height map, and one line is all it takes.
  float glint = smoothstep(0.16, 0.0, abs(v - 0.62)) * 0.13;
  col = mix(col, u_accent, glint * (0.35 + 0.65 * diff));

  // A narrow lighting range on purpose. The wallpaper's job is to be the thing the icons are in
  // front of, so the fold that catches the most light and the one that catches the least have to
  // stay within a few per cent of each other; at ±20% the folds themselves became the subject.
  col *= 0.84 + 0.26 * diff;
  col += u_light * spec * 0.10;
  // Broad falloff toward the lower right, so the page has a lit side the way a room does.
  col *= 0.90 + 0.20 * smoothstep(0.0, 1.0, uv.y * 0.55 + (1.0 - uv.x) * 0.45);

  // One LSB of dither: the ramps here span whole screens and 8-bit output bands without it.
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Internal resolution cap. 1600 across is enough that no fold edge is ever softened by the
// upscale on a 2560 display, and the field's cost is flat past it.
const MAX_INTERNAL_WIDTH = 1600;
// How fast the folds move. Slow enough to register as life rather than as an animation: about
// one per cent of the page per second at the fold scale, the same order as the photograph's
// drift, and for the same reason.
const TIME_SCALE = 0.22;

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`silk shader: ${log}`);
  }
  return shader;
}

function getContext(canvas, options) {
  // WebGL2 has derivatives built in; WebGL1 needs the extension, and without it there is no
  // relief to draw, so the caller falls back to the CSS ramp rather than to a flat field.
  const gl2 = canvas.getContext("webgl2", options);
  if (gl2) return { gl: gl2, vertex: VERTEX_2, fragment: PREAMBLE_2 + FRAGMENT_BODY };
  const gl1 = canvas.getContext("webgl", options);
  if (gl1 && gl1.getExtension("OES_standard_derivatives")) {
    return { gl: gl1, vertex: VERTEX_1, fragment: PREAMBLE_1 + FRAGMENT_BODY };
  }
  return null;
}

// Builds a renderer on `canvas`, or returns null when the platform cannot draw it. `draw(seconds)`
// paints one frame; `resize()` re-reads the canvas's CSS size; `dispose()` frees the context.
export function createSilkRenderer(canvas, colors, { preserve = false } = {}) {
  const context = getContext(canvas, {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: preserve,
    powerPreference: "low-power",
  });
  if (!context) return null;
  const { gl } = context;

  let program;
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, context.vertex);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, context.fragment);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn("LumaTab: silk unavailable", error);
    return null;
  }
  gl.useProgram(program);

  // One triangle that covers the clip space; the rasteriser clips the rest.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const u = { res: uniform("u_res"), time: uniform("u_time"), seed: uniform("u_seed"), angle: uniform("u_angle") };
  const [deep, base, mid, light, accent] = silkPalette(colors).map(hexToRgb);
  gl.uniform3fv(uniform("u_deep"), deep);
  gl.uniform3fv(uniform("u_base"), base);
  gl.uniform3fv(uniform("u_mid"), mid);
  gl.uniform3fv(uniform("u_light"), light);
  gl.uniform3fv(uniform("u_accent"), accent);
  const seed = silkSeed(colors);
  gl.uniform2f(u.seed, seed.x, seed.y);
  gl.uniform1f(u.angle, seed.angle);

  function resize(width = canvas.clientWidth, height = canvas.clientHeight) {
    if (!width || !height) return;
    const scale = Math.min(1, MAX_INTERNAL_WIDTH / width);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
  }

  function draw(seconds) {
    gl.uniform1f(u.time, seconds * TIME_SCALE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  resize();
  return { gl, draw, resize, dispose };
}

// Settings swatches. Twelve live contexts for twelve 40px squares would run into the browser's
// context limit and burn GPU on things that never move, so each preset is rendered once, through
// the same shader, into one shared offscreen canvas and kept as a data URL. The swatch is the
// real thing at a small size, which is the whole point of a swatch.
const thumbnails = new Map();
let thumbnailCanvas = null;

export function silkThumbnail(colors, size = 96) {
  const key = colors.join("|") + "@" + size;
  if (thumbnails.has(key)) return thumbnails.get(key);
  if (typeof document === "undefined") return null;
  let url = null;
  try {
    thumbnailCanvas ??= document.createElement("canvas");
    const canvas = thumbnailCanvas;
    canvas.width = size;
    canvas.height = size;
    const renderer = createSilkRenderer(canvas, colors, { preserve: true });
    if (renderer) {
      renderer.resize(size, size);
      renderer.draw(0);
      url = canvas.toDataURL("image/png");
      renderer.dispose();
      // A lost context leaves the element unusable for the next preset; start fresh each time.
      thumbnailCanvas = null;
    }
  } catch (error) {
    console.warn("LumaTab: silk thumbnail failed", error);
  }
  thumbnails.set(key, url);
  return url;
}
