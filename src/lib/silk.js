import { silkPalette, silkSeed } from "./background-cache-keys.js";

// The solid background's renderer: a full-screen fragment shader that draws a mesh gradient in
// the preset's colours. Everything pure — which colours, which seed — lives in
// background-cache-keys so the worker can import it and a test can assert it; this file is the
// part that needs a GPU.
//
// Two versions came before it and each was rejected for the opposite reason, which is what fixed
// the target. Three `blur(90px)` discs over a ramp read as unfinished — every edge in a gaussian
// blob is a falloff, and nothing built only from soft edges looks resolved. So the next version
// built a height field and lit it, taking the slope with dFdx/dFdy and shading from one fixed
// light. That gave it edges, and the edges read as crumpled fabric — "纯色褶皱效果不好". Relief
// was the wrong kind of structure: Apple's own backdrops are not lit surfaces at all, and iOS 18's
// MeshGradient is a grid of colours blended smoothly into each other, cloud-like, with no normals
// anywhere in it.
//
// So the lighting is gone and colour does all the work. Having no derivatives also means WebGL1
// needs no extension, so this draws on strictly more machines than the folded version did.
//
// It renders at a capped internal resolution and lets the browser scale the canvas up. The field
// is low-frequency by construction, so the upscale is invisible, and the film grain layered over
// the whole page (see .grain) is what puts pixel-level texture back. Cost is bounded by that cap,
// not by the display.

// Two GLSL dialects, one body. WebGL2 speaks ESSL 3.00, where the fragment output is a declared
// variable; WebGL1 speaks ESSL 1.00. Everything below the preamble is shared, so the two cannot
// drift apart.
const VERTEX_1 = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const VERTEX_2 = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const PREAMBLE_1 = `
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
// Three octaves, not four, and a steep falloff. A fourth octave at this scale puts detail into the
// field finer than the colour regions it is shaping, which reads as mottling rather than as a
// blend — and when this field was still being lit, it read as marbled liquid.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.58;
  mat2 m = rot(0.62) * 2.03;
  for (int i = 0; i < 3; i++) { v += a * gnoise(p); p = m * p; a *= 0.42; }
  return v;
}

// Domain warping: the field is noise sampled through two layers of noise-driven displacement.
// One layer gives blobs, which is a lava lamp; two give long interleaving regions, which is what a
// mesh gradient's control points produce when they are pulled about. Strong warping folds the
// field back over itself many times inside one screen and turns it into marbling, so the strength
// here is deliberately gentle.
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
  p = rot(u_angle) * p * 0.72 + u_seed;
  float h = field(p, u_time);
  float v = clamp(h * 0.78 + 0.5, 0.0, 1.0);

  // Colour is the whole thing now; there are no normals anywhere in here. The stops overlap
  // generously so no two ever meet at an edge — what should read is one field of colour bleeding
  // into the next, the way a mesh gradient does, rather than a height map that has been tinted.
  vec3 col = mix(u_deep, u_base, smoothstep(0.00, 0.44, v));
  col = mix(col, u_mid, smoothstep(0.30, 0.70, v));
  col = mix(col, u_light, smoothstep(0.56, 1.00, v));

  // The accent arrives as its own broad region rather than along one contour. A contour is a
  // line, and a line is exactly the kind of edge this version must not have; sampling a second,
  // slower field at a different scale puts the colour in a place instead of on an edge.
  float a = clamp(field(p * 0.64 + vec2(19.3, 7.1), u_time * 0.7) * 0.9 + 0.5, 0.0, 1.0);
  col = mix(col, u_accent, smoothstep(0.58, 0.98, a) * 0.38);

  // One very broad falloff, and it is all that is left of the lighting. The fold shading it
  // replaced is what made the surface read as crumpled fabric.
  col *= 0.93 + 0.11 * smoothstep(0.0, 1.0, uv.y * 0.55 + (1.0 - uv.x) * 0.45);

  // One LSB of dither: the ramps here span whole screens and 8-bit output bands without it.
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Internal resolution cap. Nothing in the field has a hard edge any more, so the upscale has
// nothing to soften; 1600 is simply well past the point where more pixels change the picture.
const MAX_INTERNAL_WIDTH = 1600;
// How fast the colour regions move. Slow enough to register as life rather than as an animation,
// the same order as the photograph's drift and for the same reason.
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
  const gl2 = canvas.getContext("webgl2", options);
  if (gl2) return { gl: gl2, vertex: VERTEX_2, fragment: PREAMBLE_2 + FRAGMENT_BODY };
  // WebGL1 needs no extension. The folded version took the field's slope with dFdx/dFdy and so
  // required OES_standard_derivatives; a mesh gradient has no normals to compute, so any context
  // at all can draw it — the set of machines that get a real background is strictly larger now.
  const gl1 = canvas.getContext("webgl", options);
  if (gl1) return { gl: gl1, vertex: VERTEX_1, fragment: PREAMBLE_1 + FRAGMENT_BODY };
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
