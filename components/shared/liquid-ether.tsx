"use client";

// Liquid Ether (UI-018): a slow, living fluid background for the opening
// moments only (app opening, onboarding, the demo password page). Everyday
// screens keep their still surfaces.
//
// The idea is React Bits Liquid Ether (MIT, reactbits.dev/c/backgrounds/liquid-ether)
// in its autoDemo mode: it drifts on its own, with no cursor force and no click
// bursts. This is a fresh, smaller version written for Practice-OS: a
// domain-warped noise field in one fragment shader on plain WebGL (no extra
// libraries), tinted with the calm palette from AGENTS.md.
//
// Rendered at half resolution with the pixel ratio capped; stops drawing when
// off screen or the tab is hidden. With reduced motion, or without WebGL, it is
// a still CSS gradient in the same colours (no canvas).
//
// Fills its parent (absolute inset-0); the parent decides placement and needs
// position relative/fixed. Decorative: aria-hidden, no pointer events.

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

/** A "#RRGGBB" colour laid over the base at this alpha (0-1). */
export type Tint = { hex: string; alpha: number };
export type EtherPalette = { base: string; tints: [Tint, Tint, Tint] };

/** Light: warm page with soft warm neutrals and a faint purple accent. Dark: #262624 with violet and blue. */
export const ETHER_PALETTES: { light: EtherPalette; dark: EtherPalette } = {
  light: {
    base: "#FAF9F5",
    tints: [
      { hex: "#EEE9DE", alpha: 0.85 },
      { hex: "#E3D9FF", alpha: 0.5 },
      { hex: "#8E7CF8", alpha: 0.12 },
    ],
  },
  dark: {
    base: "#262624",
    tints: [
      { hex: "#302F2C", alpha: 0.9 },
      { hex: "#8E7CF8", alpha: 0.16 },
      { hex: "#4E69DA", alpha: 0.14 },
    ],
  },
};

/** Fraction of CSS pixels the shader draws; the browser scales it up smoothly. */
export const RENDER_SCALE = 0.5;
export const MAX_DPR = 1.5;

export function etherPalette(dark: boolean): EtherPalette {
  return dark ? ETHER_PALETTES.dark : ETHER_PALETTES.light;
}

export function capDpr(dpr: number | undefined, max = MAX_DPR): number {
  if (!dpr || !Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, max);
}

/** Drawing-buffer size in device pixels for a box of CSS size w x h. Never 0. */
export function renderSize(w: number, h: number, dpr: number | undefined, scale = RENDER_SCALE): [number, number] {
  const k = capDpr(dpr) * scale;
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** "#RRGGBB" to [r, g, b] in 0-1. */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgba({ hex, alpha }: Tint): string {
  const [r, g, b] = hexToRgb01(hex).map((v) => Math.round(v * 255));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** The still fallback: the same three tints as soft pools over the base colour. */
export function stillBackground(p: EtherPalette): string {
  const [a, b, c] = p.tints;
  return [
    `radial-gradient(ellipse 70% 60% at 18% 22%, ${rgba(a)}, transparent 70%)`,
    `radial-gradient(ellipse 60% 55% at 82% 30%, ${rgba(b)}, transparent 70%)`,
    `radial-gradient(ellipse 65% 60% at 55% 85%, ${rgba(c)}, transparent 72%)`,
    p.base,
  ].join(", ");
}

const VERT = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`;

// Domain-warped fbm (Inigo Quilez's warping idea): the field folds into itself
// over time, which reads as slow ink in water.
const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float time;
uniform vec3 base;
uniform vec4 tint0;
uniform vec4 tint1;
uniform vec4 tint2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y) * 1.6;
  float t = time;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 0.03), fbm(p + 3.5 * q + vec2(8.3, 2.8) - t * 0.035));
  float f = fbm(p + 3.0 * r);
  vec3 col = base;
  col = mix(col, tint0.rgb, tint0.a * smoothstep(0.35, 0.75, f));
  col = mix(col, tint1.rgb, tint1.a * smoothstep(0.4, 0.95, length(q)));
  col = mix(col, tint2.rgb, tint2.a * smoothstep(0.45, 0.85, r.x) * (0.6 + 0.4 * uv.y));
  // Tiny dither so the soft gradients don't band.
  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Time runs this much slower than the clock, in shader seconds per real second. */
const SPEED = 0.35;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const darkQuery = "(prefers-color-scheme: dark)";
const watch = (query: string) => (cb: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const subscribeReduced = watch(reducedQuery);
const subscribeDark = watch(darkQuery);
const getReduced = () => window.matchMedia(reducedQuery).matches;
const getDark = () => window.matchMedia(darkQuery).matches;

let webgl: boolean | null = null;
const getWebgl = () => {
  if (webgl === null) {
    try {
      webgl = !!document.createElement("canvas").getContext("webgl");
    } catch {
      webgl = false;
    }
  }
  return webgl;
};
const noop = () => () => {};

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function LiquidEther({ className = "" }: { className?: string }) {
  // Server and first client render: still (no canvas) until the browser says otherwise.
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, () => true);
  const canWebgl = useSyncExternalStore(noop, getWebgl, () => false);
  const dark = useSyncExternalStore(subscribeDark, getDark, () => false);
  const [failed, setFailed] = useState(false);
  const live = !reduced && canWebgl && !failed;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<(p: EtherPalette) => void>(null);

  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "low-power" });
    if (!gl) {
      setFailed(true);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    // One triangle that covers the screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("res");
    const uTime = u("time");
    const uBase = u("base");
    const uTints = [u("tint0"), u("tint1"), u("tint2")];

    let raf = 0;
    let last = 0;
    // Start at a random moment so it doesn't look identical on every visit.
    let clock = Math.random() * 100;
    let onScreen = true;
    let alive = true;

    paletteRef.current = (p) => {
      gl.uniform3fv(uBase, hexToRgb01(p.base));
      p.tints.forEach((t, i) => gl.uniform4f(uTints[i], ...hexToRgb01(t.hex), t.alpha));
      if (!raf) draw();
    };
    paletteRef.current(etherPalette(getDark()));

    function draw() {
      gl!.uniform1f(uTime, clock);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }
    function tick(now: number) {
      raf = 0;
      if (!alive) return;
      // Cap the step so a long pause never jumps the fluid forward.
      clock += Math.min((now - last) / 1000, 0.1) * SPEED;
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (raf || !alive || !onScreen || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function resize() {
      const [w, h] = renderSize(canvas!.clientWidth, canvas!.clientHeight, window.devicePixelRatio);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uRes, w, h);
      if (!raf) draw();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    resize();
    start();

    return () => {
      alive = false;
      stop();
      paletteRef.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [live]);

  // Re-tint when the system theme flips.
  useEffect(() => {
    paletteRef.current?.(etherPalette(dark));
  }, [dark]);

  // The still gradient sits underneath in both modes, so there is no flash before the first frame.
  // It follows the theme in CSS (dark: variant), so it is right even before hydration.
  const style = {
    "--ether-light": stillBackground(ETHER_PALETTES.light),
    "--ether-dark": stillBackground(ETHER_PALETTES.dark),
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      data-ether={live ? "live" : "still"}
      className={`pointer-events-none absolute inset-0 overflow-hidden [background:var(--ether-light)] dark:[background:var(--ether-dark)] ${className}`}
      style={style}
    >
      {live && <canvas ref={canvasRef} className="block h-full w-full" />}
    </div>
  );
}
