"use client";

// Liquid Aeon (UI-017): the live blob, drawn with raw WebGL2 and one fragment
// shader. Original Practice-OS code (written 2026-11-04).
//
// The blob is a 2D signed-distance shape: a breathing circle whose edge is
// bent by a few slow travelling waves, joined by a smooth union to small
// droplets. A splash throws droplets out and pulls them back while the body
// springs up from small; working bends the edge more and now and then lets a
// droplet bud off and rejoin. Shading treats the shape as a rounded dome:
// the normal comes from the distance field, and the surface reflects a
// simple studio of light bands tinted with the agent's own colours (chrome),
// mixes that with the flat gradient (liquid), or lets the gradient glow
// through (jelly). Eyes are two plain ovals that blink, squint through a
// splash and scan while working (motion.ts holds the timing rules).
//
// AgentBlob only mounts this when WebGL2 works and reduced motion is off.

import { useEffect, useRef, useState } from "react";
import {
  AGENT_STOPS,
  DOUBLE_BLINK_CHANCE,
  DOUBLE_BLINK_GAP_S,
  PARAMS,
  POP_MS,
  blinkOpenness,
  breathe,
  nextBlinkIn,
  popOpenness,
  readingGaze,
  type Agent,
  type Shown,
} from "./motion";

export type BlobMaterial = "liquid" | "chrome" | "jelly";

export type BlobCanvasProps = {
  agent: Agent;
  state: Shown;
  /** Increments each time a splash starts. */
  popId: number;
  material: BlobMaterial;
  /** Draw eyes (clinician-facing Aeon only). */
  eyes: boolean;
  /** Orb diameter in CSS pixels; the canvas is larger so splashes have room. */
  size: number;
  onSettled: (popId: number) => void;
};

/** Canvas is this many orb diameters wide, centred on the orb. */
export const CANVAS_SCALE = 1.9;

const DROPS = 6;
const MATERIAL_ID: Record<BlobMaterial, number> = { chrome: 0, liquid: 1, jelly: 2 };

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 u_res;      // canvas size in device pixels
uniform float u_radius;  // orb radius in device pixels
uniform float u_time;
uniform float u_body;    // body radius in orb radii (breath and spring)
uniform float u_bend;    // edge bend amount
uniform float u_flow;    // how fast the bend travels
uniform vec3 u_drops[${DROPS}]; // x, y, radius (radius 0 = unused), in orb radii
uniform vec3 u_stops[4];
uniform vec4 u_at;       // stop positions
uniform int u_material;
uniform float u_eyes;    // 0 none, 1 drawn
uniform float u_open;    // lid openness
uniform float u_gaze;    // -1..1

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shape(vec2 p) {
  float a = atan(p.y, p.x);
  float t = u_time * u_flow;
  float wave = 0.55 * sin(2.0 * a + t * 1.9 + 0.4)
             + 0.30 * sin(3.0 * a - t * 2.4 + 1.7)
             + 0.15 * sin(5.0 * a + t * 3.1 + 2.9);
  float d = length(p) - u_body * (1.0 + 0.11 * u_bend * wave);
  for (int i = 0; i < ${DROPS}; i++) {
    vec3 dr = u_drops[i];
    if (dr.z > 0.0) d = smin(d, length(p - dr.xy) - dr.z, 0.32);
  }
  return d;
}

vec3 ramp(float x) {
  vec3 c = u_stops[0];
  c = mix(c, u_stops[1], smoothstep(u_at.x, u_at.y, x));
  c = mix(c, u_stops[2], smoothstep(u_at.y, u_at.z, x));
  c = mix(c, u_stops[3], smoothstep(u_at.z, u_at.w, x));
  return c;
}

// A soft studio: a bright sky fading to the agent's deeper colours below, with
// no hard horizon (a dark line across the face could read as a mouth).
vec3 studio(vec3 r) {
  float y = r.y + 0.45;
  vec3 sky = mix(u_stops[1], u_stops[0], smoothstep(0.15, 1.0, y));
  vec3 floorTone = mix(u_stops[2], u_stops[3], smoothstep(0.1, -0.5, y));
  vec3 c = mix(floorTone, sky, smoothstep(-0.2, 0.35, y));
  // A soft window light from the upper left, and a faint bounce light low on the right.
  c += vec3(1.0) * 0.55 * smoothstep(0.86, 0.97, dot(r, normalize(vec3(-0.55, 0.62, 0.56))));
  c += u_stops[1] * 0.25 * smoothstep(0.7, 0.95, dot(r, normalize(vec3(0.6, -0.55, 0.58))));
  return c;
}

float oval(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_radius;
  float d = shape(p);
  float px = 1.5 / u_radius;
  float cover = 1.0 - smoothstep(-px, px, d);
  if (cover <= 0.0) { outColor = vec4(0.0); return; }

  // Normal of a dome over the shape.
  vec2 e = vec2(0.004, 0.0);
  vec2 g = vec2(shape(p + e.xy) - shape(p - e.xy), shape(p + e.yx) - shape(p - e.yx));
  vec2 out2 = length(g) > 0.0 ? normalize(g) : vec2(0.0);
  float depth = clamp(-d / max(u_body, 0.2), 0.0, 1.0);
  float rho = 1.0 - depth;
  vec3 n = normalize(vec3(out2 * rho, sqrt(max(0.0, 1.0 - rho * rho)) + 0.02));

  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 r = reflect(-view, n);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  vec2 hl = vec2(-0.3, 0.4) * u_body;
  vec3 tint = ramp(clamp(length(p - hl) / (1.35 * u_body), 0.0, 1.0));
  vec3 light = normalize(vec3(-0.5, 0.6, 0.65));
  float spec = pow(max(dot(r, light), 0.0), 48.0);

  vec3 col;
  float alpha = 1.0;
  if (u_material == 0) {
    col = mix(studio(r), tint, 0.32);
    col = mix(col, u_stops[3] * 0.8, fres * 0.35);
    col += spec * 0.6;
  } else if (u_material == 1) {
    col = mix(tint, studio(r), 0.38);
    col += spec * 0.45;
    col = mix(col, u_stops[3], fres * 0.25);
  } else {
    col = tint * (0.82 + 0.25 * depth);
    col = mix(col, u_stops[0], fres * 0.5);
    col += spec * 0.5;
    alpha = mix(0.72, 0.94, depth);
  }

  if (u_eyes > 0.5) {
    float s = u_body;
    vec2 shift = vec2(u_gaze * 0.06, 0.0) * s;
    vec2 rad = vec2(0.10, 0.15 * max(u_open, 0.06)) * s;
    for (int i = 0; i < 2; i++) {
      float side = i == 0 ? -1.0 : 1.0;
      vec2 c = vec2(side * 0.30, 0.10) * s + shift;
      float ed = oval(p, c, rad);
      float ink = 1.0 - smoothstep(-px, px, ed);
      vec2 shine = c + vec2(-0.32 * rad.x, 0.42 * rad.y);
      float glint = (1.0 - smoothstep(-px, px, length(p - shine) - 0.3 * rad.x)) * step(0.35, u_open);
      col = mix(col, vec3(0.090, 0.078, 0.169), ink);
      col = mix(col, vec3(1.0), glint * ink);
    }
  }

  float a = cover * alpha;
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;

const hex = (h: string): [number, number, number] => {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

type Drop = { angle: number; born: number; life: number; reach: number; radius: number; kind: "splash" | "bud" };

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("Liquid Aeon shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** The still orb shown until the first frame is drawn (the shader can take a moment to compile). */
const stillOrb = (agent: Agent) =>
  `radial-gradient(circle at 35% 30%, ${AGENT_STOPS[agent].map(([c, at]) => `${c} ${Math.round(at * 100)}%`).join(", ")})`;

export default function BlobCanvas({ agent, state, popId, material, eyes, size, onSettled }: BlobCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const firstFrame = useRef(setDrawn);
  // Everything the frame loop reads lives in one ref, so props never restart WebGL.
  const live = useRef({ agent, state, material, eyes, size, onSettled, popId, popAt: -1, kick: false, paused: true, ready: false });
  useEffect(() => {
    const l = live.current;
    l.agent = agent;
    l.state = state;
    l.material = material;
    l.eyes = eyes;
    l.size = size;
    l.onSettled = onSettled;
  });
  useEffect(() => {
    const l = live.current;
    if (state === "pop" && (l.popAt < 0 || popId !== l.popId)) {
      l.popId = popId;
      l.kick = true;
      // Set up but not drawing (off screen, hidden tab, no WebGL): there is no splash to wait for.
      if (l.ready && l.paused) {
        l.kick = false;
        l.onSettled(popId);
      }
    }
    // A late pop id with no splash showing (shouldn't happen) just settles.
    if (state !== "pop") l.popId = popId;
  }, [popId, state]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const mine = live.current;
    const settleNow = () => {
      const l = mine;
      l.paused = true;
      l.ready = true;
      if (l.kick || l.popAt >= 0) {
        l.kick = false;
        l.popAt = -1;
        l.onSettled(l.popId);
      }
    };
    const gl = el.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl || gl.isContextLost()) return settleNow();

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return settleNow();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return settleNow();
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const U = {
      res: u("u_res"),
      radius: u("u_radius"),
      time: u("u_time"),
      body: u("u_body"),
      bend: u("u_bend"),
      flow: u("u_flow"),
      drops: u("u_drops"),
      stops: u("u_stops"),
      at: u("u_at"),
      material: u("u_material"),
      eyes: u("u_eyes"),
      open: u("u_open"),
      gaze: u("u_gaze"),
    };

    // Physics state.
    let scale = 1;
    let speed = 0;
    let bend = PARAMS.rest.morph;
    let flow = PARAMS.rest.morphSpeed;
    let wobble = PARAMS.rest.wobble;
    let gaze = 0;
    let drops: Drop[] = [];
    let nextBud = 1.2;
    let blinkAt = nextBlinkIn("rest");
    let blinkStart = -10;
    let secondBlink = -1;
    let flowTime = 0;
    let last = performance.now();
    const t0 = last;
    let frame = 0;
    let running = false;
    let onScreen = true;
    const dropData = new Float32Array(DROPS * 3);

    const startSplash = (now: number) => {
      const s = (now - t0) / 1000;
      scale = 0.18;
      speed = 0;
      const count = 5;
      const turn = Math.random() * Math.PI * 2;
      drops = Array.from({ length: count }, (_, i) => ({
        angle: turn + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
        born: s,
        life: (POP_MS / 1000) * (0.62 + Math.random() * 0.18),
        reach: 1.15 + Math.random() * 0.35,
        radius: 0.13 + Math.random() * 0.09,
        kind: "splash" as const,
      }));
      live.current.popAt = now;
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const css = live.current.size * CANVAS_SCALE;
      const px = Math.round(css * ratio);
      if (el.width !== px || el.height !== px) {
        el.width = px;
        el.height = px;
      }
      return { px, radius: (live.current.size / 2) * ratio };
    };

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const l = live.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = (now - t0) / 1000;

      if (l.kick) {
        l.kick = false;
        startSplash(now);
      }
      const popping = l.state === "pop" && l.popAt >= 0;
      const popProgress = popping ? Math.min(1, (now - l.popAt) / POP_MS) : 1;
      if (popping && now - l.popAt >= POP_MS) {
        l.popAt = -1;
        l.onSettled(l.popId);
      }

      // Ease the shape targets toward the current state.
      const target = PARAMS[l.state];
      const ease = 1 - Math.exp(-dt * 4);
      bend += (target.morph - bend) * ease;
      flow += (target.morphSpeed - flow) * ease;
      wobble += (target.wobble - wobble) * ease;
      flowTime += dt;

      // Body spring toward 1: less damping means more jiggle.
      const stiff = 150;
      const damp = 2 * Math.sqrt(stiff) * (1 - 0.82 * wobble);
      speed += (stiff * (1 - scale) - damp * speed) * dt;
      scale += speed * dt;

      // While working, now and then a droplet buds off and rejoins.
      if (l.state === "work" && target.splitEvery) {
        nextBud -= dt;
        if (nextBud <= 0) {
          const [lo, hi] = target.splitEvery;
          nextBud = lo + Math.random() * (hi - lo);
          if (drops.length < DROPS) {
            drops.push({ angle: Math.random() * Math.PI * 2, born: s, life: 0.95 + Math.random() * 0.5, reach: 1.05 + Math.random() * 0.25, radius: 0.15 + Math.random() * 0.07, kind: "bud" });
            speed -= 0.5; // the body gives a little as it lets go
          }
        }
      }
      drops = drops.filter((d) => s - d.born < d.life);

      const body = scale * breathe(s);
      dropData.fill(0);
      drops.forEach((d, i) => {
        const k = (s - d.born) / d.life;
        // Out fast, back slower: sin of a bent clock.
        const out = d.kind === "splash" ? Math.sin(Math.PI * Math.pow(k, 0.7)) : Math.sin(Math.PI * k);
        const dist = body * (0.35 + (d.reach - 0.35) * out);
        const r = d.radius * (d.kind === "splash" ? 1 - 0.35 * k : 0.7 + 0.3 * out);
        dropData[i * 3] = Math.cos(d.angle) * dist;
        dropData[i * 3 + 1] = Math.sin(d.angle) * dist;
        dropData[i * 3 + 2] = r;
      });

      // Eyes: blinks (sometimes double at rest), squint through a splash, reading gaze while working.
      let open = 1;
      if (l.eyes) {
        if (s >= blinkAt) {
          blinkStart = s;
          secondBlink = l.state === "rest" && Math.random() < DOUBLE_BLINK_CHANCE ? s + DOUBLE_BLINK_GAP_S : -1;
          blinkAt = s + nextBlinkIn(l.state);
        }
        if (secondBlink > 0 && s >= secondBlink) {
          blinkStart = s;
          secondBlink = -1;
        }
        open = blinkOpenness(s - blinkStart);
        if (popping) open = Math.min(open, popOpenness(popProgress));
        const gazeTarget = l.state === "work" ? readingGaze(s) : 0;
        gaze += (gazeTarget - gaze) * (1 - Math.exp(-dt * 14));
      }

      const { px, radius } = resize();
      gl.viewport(0, 0, px, px);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const stops = AGENT_STOPS[l.agent];
      gl.uniform2f(U.res, px, px);
      gl.uniform1f(U.radius, radius);
      gl.uniform1f(U.time, flowTime);
      gl.uniform1f(U.body, body);
      gl.uniform1f(U.bend, bend);
      gl.uniform1f(U.flow, flow * 2.2);
      gl.uniform3fv(U.drops, dropData);
      gl.uniform3fv(U.stops, stops.flatMap(([c]) => hex(c)));
      gl.uniform4f(U.at, stops[0][1], stops[1][1], stops[2][1], stops[3][1]);
      gl.uniform1i(U.material, MATERIAL_ID[l.material]);
      gl.uniform1f(U.eyes, l.eyes ? 1 : 0);
      gl.uniform1f(U.open, open);
      gl.uniform1f(U.gaze, gaze);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      firstFrame.current(true);
    };

    const play = () => {
      const want = onScreen && document.visibilityState === "visible";
      if (want && !running) {
        running = true;
        live.current.paused = false;
        last = performance.now();
        frame = requestAnimationFrame(step);
      } else if (!want) {
        running = false;
        cancelAnimationFrame(frame);
        // A splash nobody can see still has to finish, or the blob would stay "popping".
        settleNow();
      }
    };

    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      play();
    });
    seen.observe(el);
    document.addEventListener("visibilitychange", play);
    const lost = (e: Event) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(frame);
      settleNow();
    };
    el.addEventListener("webglcontextlost", lost);
    play();
    live.current.ready = true;

    return () => {
      running = false;
      mine.paused = true;
      mine.ready = false;
      cancelAnimationFrame(frame);
      seen.disconnect();
      document.removeEventListener("visibilitychange", play);
      el.removeEventListener("webglcontextlost", lost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // Hand the context back once the canvas has really gone (browsers cap how
      // many can be open). Not at once: a quick remount reuses this canvas.
      window.setTimeout(() => {
        if (!el.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
  }, []);

  const css = size * CANVAS_SCALE;
  const inset = (css - size) / 2;
  return (
    <>
      {!drawn && <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: stillOrb(agent) }} />}
      <canvas
        ref={canvas}
        aria-hidden
        className="pointer-events-none absolute"
        style={{ width: css, height: css, left: -inset, top: -inset }}
      />
    </>
  );
}
