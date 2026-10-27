
// WebGL engine for Liquid Aeon (UI-017). Adapted from React Bits BlobCursor
// (MIT, reactbits.dev/c/animations/blob-cursor): the signed-distance blob
// shader and its spring physics are kept; the pointer, trail, instanced spray
// and shadow pass are removed. The blob sits still in its box and is driven by
// the agent's state instead of the cursor. Loaded only where a live blob shows.

import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AGENT_STOPS, PARAMS, POP_MS, breathe, type Agent, type Shown } from "./motion";

export type BlobMaterial = "liquid" | "chrome" | "jelly";

export type BlobCanvasProps = {
  agent: Agent;
  state: Shown;
  /** Increments each time a splash starts. */
  popId: number;
  material: BlobMaterial;
  /** Orb diameter in CSS pixels; the canvas is larger so splashes have room. */
  size: number;
  onSettled: (popId: number) => void;
};

/** Canvas is this many orb diameters wide, centred on the orb. */
export const CANVAS_SCALE = 1.9;

type Ball = { x: number; y: number; vx: number; vy: number; angle: number; spread: number; shape: number; tx: number; ty: number; grow: number };
type Drop = { x: number; y: number; vx: number; vy: number; r: number; age: number; hold: number; sink: number };

const CORE = 8;
const HEAD_RADIUS = 0.7;
const HEAD_BLEND = 0.6;
const MAX_DROPS = 12;
const MAX_PARTS = CORE + MAX_DROPS;

const FIELD = `
#define BLOB_MAX ${MAX_PARTS}
uniform vec4 blobSeg[BLOB_MAX];
uniform vec4 blobInfo[BLOB_MAX];
uniform int blobCount;
uniform float blobLift;
uniform float blobTop;
uniform float blobRef;
uniform vec2 blobDepth;
uniform vec2 blobCenter;
uniform vec3 tint0;
uniform vec3 tint1;
uniform vec3 tint2;
uniform vec3 tint3;
uniform vec2 tintStops;
varying vec2 vBlobSpot;

vec4 blobPart(vec2 p, int i, float z) {
  vec2 d = p - blobSeg[i].xy;
  float dist = max(sqrt(dot(d, d) + z * z), 0.0001);
  return vec4(dist - blobInfo[i].x, vec3(d, z) / dist);
}

vec4 blobSmooth(vec4 a, vec4 b, float k) {
  float h = k > 0.0 ? max(k - abs(a.x - b.x), 0.0) / k : 0.0;
  float weight = b.x < a.x ? 1.0 - 0.5 * h * h : 0.5 * h * h;
  return vec4(min(a.x, b.x) - h * h * h * k / 6.0, mix(a.yzw, b.yzw, weight));
}

vec4 blobShape(vec2 p, float z) {
  vec4 body = blobPart(p, 0, z);
  for (int i = 1; i < BLOB_MAX; i++) {
    if (i >= blobCount) break;
    body = blobSmooth(body, blobPart(p, i, z), blobInfo[i].z);
  }
  return body;
}

// Same radial gradient as the CSS orb: centred at 35% / 30% of the orb box,
// reaching its farthest corner (1.91 radii away).
vec3 blobTint() {
  float t = clamp(length(vBlobSpot - blobCenter - vec2(-0.3, 0.4) * blobRef) / (1.91 * blobRef), 0.0, 1.0);
  vec3 c = mix(tint0, tint1, smoothstep(0.0, tintStops.x, t));
  c = mix(c, tint2, smoothstep(tintStops.x, tintStops.y, t));
  return mix(c, tint3, smoothstep(tintStops.y, 1.0, t));
}
`;

const SURFACE = `
  vec4 blobBase = blobShape(vBlobSpot, 0.0);
  float blobAlpha = clamp(0.5 - blobBase.x / max(fwidth(blobBase.x), 0.0001), 0.0, 1.0);
  if (blobAlpha <= 0.0) discard;
  float blobLow = 0.0;
  float blobHigh = blobTop;
  float blobZ = min(sqrt(max(-blobBase.x, 0.0) * max(2.0 * blobRef + blobBase.x, 0.0)), blobTop);
  for (int k = 0; k < 8; k++) {
    vec4 blobTry = blobShape(vBlobSpot, blobZ);
    if (blobTry.x > 0.0) blobHigh = blobZ;
    else blobLow = blobZ;
    float blobNext = blobZ - blobTry.x / max(blobTry.w, 0.0001);
    blobZ = blobNext > blobLow && blobNext < blobHigh ? blobNext : 0.5 * (blobLow + blobHigh);
  }
  vec4 blobAt = blobShape(vBlobSpot, blobZ);
  vec3 blobNormal = normalize(vec3(blobAt.yz, blobAt.w / blobLift));
  gl_FragDepth = blobDepth.x - blobDepth.y * blobZ * blobLift;
`;

const SURFACE_NORMAL = `
  float faceDirection = 1.0;
  vec3 normal = normalize((viewMatrix * vec4(blobNormal, 0.0)).xyz);
  vec3 nonPerturbedNormal = normal;
`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const between = ([a, b]: [number, number]) => mix(a, b, Math.random());

function finish(m: THREE.MeshPhysicalMaterial, kind: BlobMaterial) {
  m.color.set("#ffffff");
  m.iridescence = 0;
  if (kind === "chrome") {
    m.metalness = 1;
    m.roughness = 0.08;
    m.clearcoat = 0;
    m.envMapIntensity = 1.25;
  } else if (kind === "jelly") {
    m.metalness = 0;
    m.roughness = 0.25;
    m.clearcoat = 1;
    m.clearcoatRoughness = 0.04;
    m.envMapIntensity = 0.7;
  } else {
    m.metalness = 0.4;
    m.roughness = 0.18;
    m.clearcoat = 1;
    m.clearcoatRoughness = 0.05;
    m.envMapIntensity = 0.85;
  }
  m.needsUpdate = true;
}

export default function BlobCanvas({ agent, state, popId, material, size, onSettled }: BlobCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useRef({ agent, state, popId, material, size, onSettled });
  // Layout effect runs before the effects below, so they always see fresh props.
  useLayoutEffect(() => {
    live.current = { agent, state, popId, material, size, onSettled };
  });
  const poke = useRef<{ restyle: () => void; splash: () => void } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const canvas = renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.03);
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.environmentRotation.set(-0.9, 0.35, 0);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    camera.position.set(0, 0, 2000);

    const field = {
      blobSeg: { value: new Float32Array(MAX_PARTS * 4) },
      blobInfo: { value: new Float32Array(MAX_PARTS * 4) },
      blobCount: { value: 0 },
      blobLift: { value: 1 },
      blobTop: { value: 1 },
      blobRef: { value: 1 },
      blobDepth: {
        value: new THREE.Vector2((camera.position.z - camera.near) / (camera.far - camera.near), 1 / (camera.far - camera.near)),
      },
      blobCenter: { value: new THREE.Vector2() },
      tint0: { value: new THREE.Color() },
      tint1: { value: new THREE.Color() },
      tint2: { value: new THREE.Color() },
      tint3: { value: new THREE.Color() },
      tintStops: { value: new THREE.Vector2(0.3, 0.65) },
    };

    const skin = new THREE.MeshPhysicalMaterial({ transparent: true });
    skin.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, field);
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "varying vec2 vBlobSpot;\nvoid main() {")
        .replace("#include <project_vertex>", "#include <project_vertex>\n\tvBlobSpot = (modelMatrix * vec4(transformed, 1.0)).xy;");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `${FIELD}\nvoid main() {\n${SURFACE}`)
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse * blobTint(), opacity * blobAlpha );")
        .replace("#include <normal_fragment_begin>", SURFACE_NORMAL);
    };
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skin);
    blob.frustumCulled = false;
    scene.add(blob);

    const view = { width: 1, height: 1 };
    const core: Ball[] = Array.from({ length: CORE }, (_, i) => ({
      x: 0, y: 0, vx: 0, vy: 0, spread: i / (CORE - 1), angle: (i / CORE) * Math.PI * 2, shape: 0, tx: 0, ty: 0, grow: 1,
    }));
    const drops: Drop[] = [];
    const swell = { value: 0, velocity: 0 };
    const seeds = Array.from({ length: 4 }, () => Math.random() * Math.PI * 2);
    let clock = Math.random() * 60;
    let breath = 0;
    let nextSplit = 0.6;
    let settleTimer = 0;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let alive = true;

    const restyle = () => {
      const stops = AGENT_STOPS[live.current.agent];
      field.tint0.value.set(stops[0][0]);
      field.tint1.value.set(stops[1][0]);
      field.tint2.value.set(stops[2][0]);
      field.tint3.value.set(stops[3][0]);
      field.tintStops.value.set(stops[1][1], stops[2][1]);
      finish(skin, live.current.material);
    };

    const radius = () => live.current.size / 2;

    const spawn = (count: number, speed: [number, number], rSize: [number, number], hold: [number, number]) => {
      const R = radius();
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        if (drops.length >= MAX_DROPS) drops.shift();
        const angle = offset + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / count);
        const pace = R * between(speed);
        drops.push({
          x: Math.cos(angle) * R * 0.3,
          y: Math.sin(angle) * R * 0.3,
          vx: Math.cos(angle) * pace,
          vy: Math.sin(angle) * pace,
          r: R * between(rSize),
          age: 0,
          hold: between(hold),
          sink: -1,
        });
      }
    };

    // Splash: the blob swells from nothing past full size, throws droplets
    // that drift out, then pulls them back in and settles.
    const splash = () => {
      const R = radius();
      swell.value = 0.05;
      swell.velocity = 0;
      // A timer, not the frame loop: blobs scrolled out of view stop drawing
      // but must still settle.
      window.clearTimeout(settleTimer);
      const id = live.current.popId;
      settleTimer = window.setTimeout(() => live.current.onSettled(id), POP_MS);
      for (const ball of core) {
        const a = Math.random() * Math.PI * 2;
        const push = R * mix(3, 6, Math.random());
        ball.vx += Math.cos(a) * push;
        ball.vy += Math.sin(a) * push;
      }
      spawn(6, [3.2, 4.6], [0.1, 0.2], [0.22, 0.34]);
    };

    const resize = () => {
      view.width = Math.max(1, root.clientWidth);
      view.height = Math.max(1, root.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(view.width, view.height, false);
      camera.left = -view.width / 2;
      camera.right = view.width / 2;
      camera.top = view.height / 2;
      camera.bottom = -view.height / 2;
      camera.updateProjectionMatrix();
      start();
    };

    const integrate = (b: { x: number; y: number; vx: number; vy: number }, tx: number, ty: number, k: number, damp: number, h: number) => {
      b.vx += ((tx - b.x) * k - b.vx * damp) * h;
      b.vy += ((ty - b.y) * k - b.vy * damp) * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
    };

    const step = (dt: number) => {
      const { state } = live.current;
      const p = PARAMS[state];
      const R = radius();
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      const bounce = mix(0.95, 0.4, p.wobble);

      breath += dt;
      clock += dt * 4 * Math.pow(p.morphSpeed, 1.5);
      const bend = p.morph * (0.6 + 0.4 * Math.sin(clock * 0.71 + seeds[0]));
      const bendAngle = clock * 0.23 + seeds[1];
      const fold = p.morph * 0.8 * (0.5 + 0.5 * Math.sin(clock * 0.53 + seeds[2]));
      const foldAngle = seeds[3] - clock * 0.17;
      let strain = 0;
      for (const ball of core) {
        ball.shape = bend * Math.cos(2 * (ball.angle - bendAngle)) + fold * Math.cos(3 * (ball.angle - foldAngle));
        strain += (ball.shape * ball.shape) / CORE;
      }
      const hold = 1 / (1 + 0.3 * strain);
      for (const ball of core) {
        const out = R * clamp(0.14 + 0.75 * ball.shape, 0, 0.8) * hold;
        ball.tx = Math.cos(ball.angle) * out;
        ball.ty = Math.sin(ball.angle) * out;
        ball.grow = (1 + 0.35 * ball.shape) * hold;
      }

      if (p.splitEvery) {
        nextSplit -= dt;
        if (nextSplit <= 0) {
          spawn(Math.random() < 0.5 ? 1 : 2, [1.4, 2.2], [0.12, 0.2], [0.18, 0.3]);
          nextSplit = between(p.splitEvery);
        }
      }

      const swellTarget = breathe(breath);
      const coreK = 520;
      for (let i = 0; i < steps; i++) {
        for (const ball of core) {
          const k = coreK * mix(1.3, 0.7, ball.spread);
          integrate(ball, ball.tx, ball.ty, k, 2 * Math.sqrt(k) * bounce, h);
        }
        for (const d of drops) {
          d.age += h;
          if (d.sink >= 0) {
            d.sink = Math.min(1, d.sink + h / 0.16);
            d.x *= 1 - 12 * h;
            d.y *= 1 - 12 * h;
          } else if (d.age < d.hold) {
            const ease = Math.exp(-4 * h);
            d.vx *= ease;
            d.vy *= ease;
            d.x += d.vx * h;
            d.y += d.vy * h;
          } else {
            integrate(d, 0, 0, 90, 2 * Math.sqrt(90) * 0.55, h);
          }
        }
        const swellK = 300;
        swell.velocity += ((swellTarget - swell.value) * swellK - swell.velocity * 2 * Math.sqrt(swellK) * mix(0.8, 0.3, p.wobble)) * h;
        swell.value += swell.velocity * h;
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.sink < 0 && d.age > d.hold && Math.hypot(d.x, d.y) < R * 0.5) d.sink = 0;
        if (d.sink >= 1 || d.age > 4) drops.splice(i, 1);
      }

    };

    const build = () => {
      const R = radius();
      const out = drops.filter((d) => d.sink < 0).reduce((sum, d) => sum + Math.pow(d.r / R, 3), 0);
      const r = R * Math.max(swell.value, 0) * Math.cbrt(Math.max(0.55, 1 - out * 1.6));
      const seg = field.blobSeg.value;
      const info = field.blobInfo.value;
      let n = 0;
      let reach = 0;
      let top = 1;
      const put = (x: number, y: number, pr: number, k: number) => {
        seg.set([x, -y, x, -y], n * 4);
        info.set([pr, pr, k, 0], n * 4);
        reach = Math.max(reach, Math.hypot(x, y) + pr + k);
        top = Math.max(top, pr + k);
        n++;
      };
      for (const ball of core) put(ball.x * swell.value, ball.y * swell.value, r * HEAD_RADIUS * ball.grow, r * HEAD_BLEND);
      for (const d of drops) {
        const dr = d.r * Math.min(1, d.age / 0.05) * (d.sink < 0 ? 1 : Math.cbrt(1 - d.sink));
        if (dr > 0.5) put(d.x, d.y, dr, Math.min(R * 0.55, dr * 1.8));
      }
      field.blobCount.value = n;
      field.blobTop.value = top;
      field.blobRef.value = Math.max(r, 1);
      field.blobLift.value = 1;
      field.blobCenter.value.set(0, 0);
      const box = Math.min(reach + 4, Math.max(view.width, view.height));
      blob.scale.set(box * 2, box * 2, 1);
      blob.visible = r >= 0.5;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive || !onScreen) return;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      step(dt);
      build();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    function start() {
      if (raf || !alive || !onScreen) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    // Stop drawing while the blob is scrolled out of view.
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
    });
    io.observe(root);

    poke.current = { restyle, splash };
    restyle();
    resize();
    if (live.current.state === "pop") splash();
    else swell.value = 1;

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      poke.current = null;
      resizeObserver.disconnect();
      io.disconnect();
      blob.geometry.dispose();
      skin.dispose();
      environment.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    poke.current?.restyle();
  }, [agent, material]);

  const firstPop = useRef(popId);
  useEffect(() => {
    if (popId !== firstPop.current) poke.current?.splash();
  }, [popId]);

  const box = size * CANVAS_SCALE;
  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute"
      style={{ width: box, height: box, left: (size - box) / 2, top: (size - box) / 2 }}
    />
  );
}
