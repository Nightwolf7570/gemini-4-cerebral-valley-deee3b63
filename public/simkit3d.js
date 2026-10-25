// simkit3d: the 3D runtime every generated scene runs on.
// The scene defines window.__scene = () => Sim.create({...}); this module loads three.js, then calls it.
// The kit precomputes the whole run, so playback, scrubbing, the plot and the predicted path are free.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const C = {
  bg: "#0b0b0b", panel: "#141414", line: "#262626", text: "#ededed", dim: "#8a8a8a", faint: "#4a4a4a",
  accent: "#7cf0c8", v: "#7aa2ff", F: "#ffb454", a: "#ff7a9a", p: "#c9a2ff", warm: "#ff9f6b", cool: "#6bc8ff",
};
const FPS = 60;
const MAX_LABELS = 16, MAX_LABEL_CHARS = 10;

function err(msg) { try { parent.postMessage({ type: "simkit-error", message: String(msg) }, "*"); } catch (_) {} }

function fmt(v, digits) {
  if (typeof v !== "number") return String(v);
  if (!isFinite(v)) return "—";
  if (digits != null) return v.toFixed(digits);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  reset: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
};

const css = `
*{box-sizing:border-box}html,body{margin:0;height:100%;background:${C.bg};color:${C.text};font:13px/1.4 system-ui,-apple-system,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
::selection{background:${C.accent}44}
#sk{position:fixed;inset:0}#sk canvas{display:block;width:100%;height:100%;cursor:grab}#sk canvas:active{cursor:grabbing}
.sk-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.sk-lab{position:absolute;transform:translate(-50%,-50%);font-size:12px;color:${C.text};white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px #000,0 0 1px #000}
.sk-lab.dim{color:${C.dim}}
.sk-ans{position:absolute;left:20px;top:18px;display:flex;gap:28px;pointer-events:none}
.sk-ans .v{font-size:30px;font-weight:300;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.sk-ans .u{font-size:14px;color:${C.dim};margin-left:4px;font-weight:400}
.sk-ans .l{font-size:12px;color:${C.dim};margin-top:2px}
.sk-ans>div:first-child .v{color:${C.accent}}
.sk-title{position:absolute;right:20px;top:20px;color:${C.dim};font-size:12px}
.sk-given{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:210px;max-height:calc(100% - 140px);overflow:auto;padding:14px 16px 6px;background:${C.panel}e6;border:1px solid ${C.line};border-radius:16px}
.sk-p{margin-bottom:12px}.sk-p .row{display:flex;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums;margin-bottom:4px}
.sk-p .row span:first-child{color:${C.dim}}.sk-p b{font-weight:500}
input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;width:100%;height:16px;margin:0;cursor:pointer}
input[type=range]::-webkit-slider-runnable-track{height:3px;background:${C.line};border-radius:3px}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:${C.text};margin-top:-5px;box-shadow:0 1px 4px #0008}
input[type=range]:focus-visible{outline:none}input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px ${C.accent}55}
.sk-bar{position:absolute;left:16px;right:16px;bottom:14px;display:flex;align-items:center;gap:10px;padding:6px 8px;background:${C.panel}e6;border:1px solid ${C.line};border-radius:999px}
.sk-bar button{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;border:0;background:transparent;color:${C.text};cursor:pointer;font:inherit}
.sk-bar button:hover{background:${C.line}}.sk-bar button:focus-visible{outline:2px solid ${C.accent}66}
.sk-bar .speed{width:auto;padding:0 10px;border-radius:999px;color:${C.dim};font-size:12px;font-variant-numeric:tabular-nums}
.sk-time{color:${C.dim};font-size:12px;font-variant-numeric:tabular-nums;min-width:82px;text-align:right}
.sk-scrub{flex:1}
.sk-plot{position:absolute;left:16px;bottom:62px;width:230px;height:96px;background:${C.panel}e6;border:1px solid ${C.line};border-radius:14px;padding:6px 8px}
.sk-plot canvas{width:100%;height:100%;cursor:default}
.sk-plot span{position:absolute;left:12px;top:6px;color:${C.dim};font-size:11px}
@media (max-width:640px){.sk-given{top:auto;bottom:62px;transform:none;width:180px}.sk-plot{display:none}.sk-ans .v{font-size:22px}}`;

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (parent) parent.append(e);
  return e;
}

const V = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0] || 0, a[1] || 0, a[2] || 0));
const UP = new THREE.Vector3(0, 1, 0);

function create(spec) {
  try { build(spec); } catch (e) { err(e.message); console.error(e); }
}

function build(spec) {
  el("style", { textContent: css }, document.head);
  document.body.innerHTML = "";
  const root = el("div", { id: "sk" }, document.body);

  // Renderer, scene, lights.
  // Reversed float depth keeps surfaces a hair apart from fighting at any scene scale.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", reversedDepthBuffer: true });
  const reversedZ = renderer.capabilities.reversedDepthBuffer;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  root.append(renderer.domElement);

  const scene = new THREE.Scene();
  {
    const cv = document.createElement("canvas"); cv.width = 2; cv.height = 512;
    const g2 = cv.getContext("2d"), gr = g2.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#050505"); gr.addColorStop(0.55, "#101010"); gr.addColorStop(1, "#151515");
    g2.fillStyle = gr; g2.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog("#121212", 10, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1e7);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  let userMoved = false;
  controls.addEventListener("start", () => { userMoved = true; });

  const hemi = new THREE.HemisphereLight("#cfd6e0", "#0b0b0b", 0.5);
  const key = new THREE.DirectionalLight("#ffffff", 1.8);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight("#9fd8ff", 0.9);
  scene.add(hemi, key, key.target, rim);

  // The scene renders into this target, not the canvas, so depth format and MSAA are set here.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1, reversedZ ? THREE.FloatType : THREE.UnsignedIntType) });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.35, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Overlay UI.
  const labels = el("div", { className: "sk-labels" }, root);
  const ansEl = el("div", { className: "sk-ans" }, root);
  if (spec.title) el("div", { className: "sk-title", textContent: spec.title }, root);
  const given = el("div", { className: "sk-given" }, root);
  const plotSpec = (spec.plots || [])[0];
  let plotCv = null;
  if (plotSpec) {
    const box = el("div", { className: "sk-plot" }, root);
    plotCv = el("canvas", {}, box);
    el("span", { textContent: `${plotSpec.label}${plotSpec.unit ? ` · ${plotSpec.unit}` : ""}` }, box);
  }
  const bar = el("div", { className: "sk-bar" }, root);
  const bPlay = el("button", { innerHTML: ICON.pause, title: "Play / pause" }, bar);
  const bReset = el("button", { innerHTML: ICON.reset, title: "Restart" }, bar);
  const scrub = el("input", { type: "range", className: "sk-scrub", min: 0, max: 1000, value: 0, step: 1 }, bar);
  const tLabel = el("span", { className: "sk-time" }, bar);
  const speeds = [0.25, 0.5, 1, 2];
  let speed = spec.speed || 1;
  const bSpeed = el("button", { className: "speed", textContent: speed + "×" }, bar);

  const params = spec.params || [];
  const P = {};
  for (const q of params) {
    P[q.id] = q.value;
    const box = el("div", { className: "sk-p" }, given);
    const row = el("div", { className: "row" }, box);
    el("span", { textContent: q.label }, row);
    const val = el("span", {}, row);
    const out = el("b", { textContent: fmt(q.value, q.digits) }, val);
    val.append(" " + (q.unit || ""));
    const r = el("input", { type: "range", min: q.min, max: q.max, step: q.step || (q.max - q.min) / 200, value: q.value }, box);
    r.oninput = () => { P[q.id] = +r.value; out.textContent = fmt(+r.value, q.digits); dirty = true; };
  }
  if (!params.length) given.style.display = "none";

  // World group, rebuilt whenever params change.
  let world = new THREE.Group();
  scene.add(world);
  let size = 10;
  const labelEls = [];

  const mats = {};
  function mat(color, o = {}) {
    const k = JSON.stringify([color, o]);
    if (mats[k]) return mats[k];
    const name = typeof color === "string" && C[color] ? C[color] : color;
    let m;
    if (color === "clay" || color == null) m = new THREE.MeshStandardMaterial({ color: "#9c9c9c", roughness: 0.55, metalness: 0.05 });
    else if (color === "stone") m = new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.85, metalness: 0 });
    else if (color === "metal") m = new THREE.MeshStandardMaterial({ color: "#b0b0b0", roughness: 0.4, metalness: 0.9, envMapIntensity: 0.7 });
    else if (color === "glass") m = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0.95, thickness: 0.4, transparent: true, opacity: 0.35 });
    else {
      const c = new THREE.Color(name);
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.1, emissive: c, emissiveIntensity: o.glow != null ? o.glow : 0.22 });
    }
    if (o.opacity != null) { m = m.clone(); m.transparent = true; m.opacity = o.opacity; }
    if (o.roughness != null) { m = m.clone(); m.roughness = o.roughness; }
    return (mats[k] = m);
  }
  function add(obj, cast = true) {
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; } });
    world.add(obj);
    return obj;
  }

  let wantStars = false;
  const texCache = {};
  function planetTexture(kind, color) {
    const keyT = kind + color;
    if (texCache[keyT]) return texCache[keyT];
    const W = 512, H = 256;
    const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
    const noise = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
      const L = (a, b, t) => a + (b - a) * t;
      const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
      return L(L(L(c(0,0,0), c(1,0,0), u), L(c(0,1,0), c(1,1,0), u), v), L(L(c(0,0,1), c(1,0,1), u), L(c(0,1,1), c(1,1,1), u), v), w);
    };
    const fbm = (x, y, z, o = 5) => { let a = 0.5, f = 1, s = 0; for (let i = 0; i < o; i++) { s += a * noise(x * f, y * f, z * f); a *= 0.5; f *= 2.03; } return s; };
    const mk = (fn) => {
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const cx = cv.getContext("2d"), img = cx.createImageData(W, H);
      for (let j = 0; j < H; j++) {
        const lat = (0.5 - j / H) * Math.PI;
        for (let i = 0; i < W; i++) {
          const lon = (i / W) * Math.PI * 2;
          const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
          const [r, g, b, a] = fn(x, y, z, lat);
          const q = (j * W + i) * 4; img.data[q] = r; img.data[q + 1] = g; img.data[q + 2] = b; img.data[q + 3] = a;
        }
      }
      cx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
    let out;
    if (kind === "earth") {
      out = {
        map: mk((x, y, z, lat) => {
          const h = fbm(x * 1.6 + 3, y * 1.6, z * 1.6);
          const ice = Math.abs(lat) > 1.2 - fbm(x * 4, y * 4, z * 4, 3) * 0.25;
          let c;
          if (ice) c = [226, 232, 238];
          else if (h < 0.5) c = mix([8, 24, 52], [24, 70, 120], (h - 0.3) / 0.2);
          else c = mix([58, 92, 52], [140, 128, 88], (h - 0.5) / 0.2);
          return [...c, 255];
        }),
        clouds: mk((x, y, z) => { const c = fbm(x * 3 + 9, y * 5, z * 3, 5); const a = Math.max(0, (c - 0.52) * 4) * 230; return [255, 255, 255, a]; }),
      };
    } else if (kind === "moon") {
      out = { map: mk((x, y, z) => { const h = fbm(x * 3, y * 3, z * 3); const v = 70 + h * 120; return [v, v, v * 0.98, 255]; }) };
    } else if (kind === "mars") {
      out = { map: mk((x, y, z) => { const h = fbm(x * 2.2, y * 2.2, z * 2.2); return [...mix([110, 46, 26], [196, 110, 66], h), 255]; }) };
    } else if (kind === "gas") {
      out = { map: mk((x, y, z, lat) => { const b = Math.sin(lat * 14 + fbm(x * 2, y * 2, z * 2) * 4) * 0.5 + 0.5; return [...mix([150, 112, 80], [226, 204, 170], b), 255]; }) };
    } else if (kind === "sun") {
      out = { map: mk((x, y, z) => { const h = fbm(x * 5, y * 5, z * 5); return [...mix([255, 140, 40], [255, 230, 160], h), 255]; }) };
    } else {
      const base = new THREE.Color(color || "#5d7fa8");
      out = { map: mk((x, y, z) => { const h = 0.75 + fbm(x * 2.5, y * 2.5, z * 2.5) * 0.4; return [base.r * 255 * h, base.g * 255 * h, base.b * 255 * h, 255]; }) };
    }
    return (texCache[keyT] = out);
  }
  function addStars(radius) {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(a) * radius; pos[i * 3 + 1] = u * radius; pos[i * 3 + 2] = s * Math.sin(a) * radius;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#d8dde6", size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    pts.userData.nofit = true;
    world.add(pts);
  }

  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
  const unitCone = new THREE.ConeGeometry(1, 1, 24, 1);
  const unitSphere = new THREE.SphereGeometry(1, 64, 32);
  function orient(obj, a, b) {
    const A = V(a), B = V(b), d = B.clone().sub(A), L = d.length();
    obj.position.copy(A).addScaledVector(d, 0.5);
    obj.quaternion.setFromUnitVectors(UP, L > 1e-9 ? d.clone().normalize() : UP);
    return L;
  }

  // The k API the scene uses inside build(k, p, A).
  const k = {
    THREE, scene, camera, C,
    get size() { return size; },
    massRadius: (m, m0 = 1, r0 = 1) => r0 * Math.cbrt(Math.max(m, 1e-9) / m0),
    ball(o = {}) {
      const r = o.r != null ? o.r : size * 0.02;
      const mesh = add(new THREE.Mesh(unitSphere, mat(o.color || "accent", { glow: o.glow })));
      mesh.scale.setScalar(r);
      if (o.at) mesh.position.copy(V(o.at));
      return { mesh, at(x, y, z = 0) { mesh.position.set(x, y, z); return this; }, radius(r) { mesh.scale.setScalar(r); return this; } };
    },
    sphere(o = {}) { return k.ball({ color: "clay", ...o }); },
    planet(o = {}) {
      const r = o.r || 1, kind = o.kind || (o.color ? "plain" : "earth");
      const g = new THREE.Group();
      const look = planetTexture(kind, o.color);
      const body = new THREE.Mesh(unitSphere, kind === "sun"
        ? new THREE.MeshBasicMaterial({ map: look.map, color: "#ffd9a0" })
        : new THREE.MeshStandardMaterial({ map: look.map, roughness: 0.8, metalness: 0 }));
      body.scale.setScalar(r);
      g.add(body);
      let clouds = null;
      if (look.clouds) {
        clouds = new THREE.Mesh(unitSphere, new THREE.MeshStandardMaterial({ map: look.clouds, transparent: true, depthWrite: false, roughness: 1 }));
        clouds.scale.setScalar(r * 1.012); g.add(clouds);
      }
      if (kind !== "moon" && kind !== "sun") {
        const atm = new THREE.Mesh(unitSphere, new THREE.ShaderMaterial({
          uniforms: { c: { value: new THREE.Color(o.atmosphere || "#7fc6ff") } },
          vertexShader: "varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
          fragmentShader: "uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - abs(dot(n, v)), 3.0); gl_FragColor = vec4(c, f * 0.5); }",
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
        }));
        atm.scale.setScalar(r * 1.04); g.add(atm);
      }
      if (kind === "sun") { const glow = new THREE.PointLight("#ffcf8a", 3, 0, 0); g.add(glow); }
      if (o.at) g.position.copy(V(o.at));
      add(g, false);
      body.receiveShadow = false;
      wantStars = true;
      return { group: g, mesh: body, spin(a) { body.rotation.y = a; if (clouds) clouds.rotation.y = a * 1.15; return this; } };
    },
    box(o = {}) {
      const [w, h, d] = o.size || [1, 1, 1];
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(o.color || "clay", o)));
      if (o.at) mesh.position.copy(V(o.at));
      if (o.rot) mesh.rotation.z = o.rot;
      return { mesh, at(x, y, z = 0) { mesh.position.set(x, y, z); return this; }, rot(a) { mesh.rotation.z = a; return this; } };
    },
    cylinder(o = {}) {
      const mesh = add(new THREE.Mesh(unitCyl, mat(o.color || "clay", o)));
      mesh.scale.set(o.r || 0.5, o.h || 1, o.r || 0.5);
      if (o.at) mesh.position.copy(V(o.at));
      if (o.from && o.to) { const L = orient(mesh, o.from, o.to); mesh.scale.set(o.r || 0.5, L, o.r || 0.5); }
      return { mesh, at(x, y, z = 0) { mesh.position.set(x, y, z); return this; } };
    },
    slab(points, o = {}) {
      const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
      const depth = o.depth != null ? o.depth : size * 0.35;
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: size * 0.003, bevelSize: size * 0.003, bevelSegments: 2 });
      geo.translate(0, 0, -depth / 2 + (o.z || 0));
      return { mesh: add(new THREE.Mesh(geo, mat(o.color || "stone", o))) };
    },
    rod(o = {}) {
      const r = o.r || size * 0.004;
      const mesh = add(new THREE.Mesh(unitCyl, mat(o.color || "metal", o)));
      const h = { mesh, set(a, b) { const L = orient(mesh, a, b); mesh.scale.set(r, Math.max(L, 1e-6), r); return h; } };
      if (o.from && o.to) h.set(o.from, o.to);
      return h;
    },
    spring(o = {}) {
      const coils = o.coils || 12, R = o.radius || size * 0.025, wire = o.thickness || R * 0.12;
      const pts = [];
      for (let i = 0; i <= coils * 24; i++) {
        const t = i / (coils * 24), a = t * coils * Math.PI * 2;
        const lead = t < 0.04 || t > 0.96;
        pts.push(new THREE.Vector3(lead ? 0 : Math.cos(a) * R, t - 0.5, lead ? 0 : Math.sin(a) * R));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), coils * 24, wire, 8, false);
      const inner = new THREE.Mesh(geo, mat(o.color || "metal", o));
      const g = new THREE.Group(); g.add(inner); add(g);
      const h = { group: g, set(a, b) { const L = orient(g, a, b); inner.scale.set(1, Math.max(L, 1e-6), 1); return h; } };
      if (o.from && o.to) h.set(o.from, o.to);
      return h;
    },
    arrow(o = {}) {
      const col = C[o.kind || "v"] || o.color || C.v;
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(unitCyl, mat(col, { glow: 0.6 }));
      const head = new THREE.Mesh(unitCone, mat(col, { glow: 0.6 }));
      g.add(shaft, head); add(g, false);
      const lab = o.label ? k.label(o.label, [0, 0, 0], { dim: true, color: col }) : null;
      const h = {
        group: g,
        set(origin, vec) {
          const O = V(origin), D = V(vec), L = D.length();
          g.visible = L > size * 0.004;
          if (!g.visible) { if (lab) lab.hide(); return h; }
          const th = o.thickness || size * 0.0045, hl = Math.min(L * 0.35, th * 7);
          g.position.copy(O); g.quaternion.setFromUnitVectors(UP, D.clone().normalize());
          shaft.scale.set(th, L - hl, th); shaft.position.set(0, (L - hl) / 2, 0);
          head.scale.set(th * 2.6, hl, th * 2.6); head.position.set(0, L - hl / 2, 0);
          if (lab) lab.set(o.label, O.clone().addScaledVector(D, 1 + (th * 9) / L));
          return h;
        },
      };
      return h;
    },
    line(points, o = {}) {
      const geo = new THREE.BufferGeometry().setFromPoints(points.map(V));
      const m = o.dash ? new THREE.LineDashedMaterial({ color: o.color || C.faint, dashSize: size * 0.012, gapSize: size * 0.012, transparent: true, opacity: o.opacity ?? 1 })
        : new THREE.LineBasicMaterial({ color: o.color || C.faint, transparent: true, opacity: o.opacity ?? 1 });
      const ln = new THREE.Line(geo, m);
      if (o.dash) ln.computeLineDistances();
      world.add(ln);
      return { line: ln, set(pts) { ln.geometry.setFromPoints(pts.map(V)); if (o.dash) ln.computeLineDistances(); } };
    },
    tube(points, o = {}) {
      if (points.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(points.map(V));
      const geo = new THREE.TubeGeometry(curve, Math.max(16, points.length * 2), o.r || size * 0.004, 10, !!o.closed);
      return { mesh: add(new THREE.Mesh(geo, mat(o.color || "metal", o))) };
    },
    particles(n, o = {}) {
      const pos = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: C[o.color] || o.color || C.accent, size: o.size || size * 0.012, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      world.add(pts);
      return { points: pts, set(i, x, y, z = 0) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; geo.attributes.position.needsUpdate = true; } };
    },
    // Short tags only (names, symbols, values); calculations, lists and prose are dropped.
    label(text, at, o = {}) {
      const ok = (t) => { t = String(t); return t.length <= MAX_LABEL_CHARS && !/[=\[\]{}<>]/.test(t) && !/\d\s*[-+*/×÷·]\s*[\d(]/.test(t); };
      if (labelEls.length >= MAX_LABELS) return { set() {}, hide() {} };
      const e = el("div", { className: "sk-lab" + (o.dim ? " dim" : ""), textContent: text }, labels);
      if (o.color) e.style.color = o.color;
      if (!ok(text)) e.style.display = "none";
      const rec = { e, p: V(at) };
      labelEls.push(rec);
      return {
        set(t, p) { if (t != null) e.textContent = t; if (p) rec.p = V(p); e.style.display = ok(e.textContent) ? "" : "none"; },
        hide() { e.style.display = "none"; },
      };
    },
    dim(a, b, text, o = {}) {
      const A = V(a), B = V(b), off = V(o.offset || [0, 0, 0]);
      const A2 = A.clone().add(off), B2 = B.clone().add(off);
      k.line([A2, B2], { color: C.dim, opacity: 0.8 });
      const d = B2.clone().sub(A2).normalize(), n = new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(size * 0.01);
      k.line([A2.clone().add(n), A2.clone().sub(n)], { color: C.dim }); k.line([B2.clone().add(n), B2.clone().sub(n)], { color: C.dim });
      return k.label(text, A2.clone().add(B2).multiplyScalar(0.5), { dim: !o.bright });
    },
    marker(at, text) {
      const P0 = V(at);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.022, size * 0.0025, 12, 64), mat("accent", { glow: 1.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.copy(P0).add(new THREE.Vector3(0, size * 0.002, 0));
      world.add(ring);
      if (text) k.label(text, P0.clone().add(new THREE.Vector3(0, -size * 0.045, size * 0.03)));
      return { mesh: ring };
    },
    ground(o = {}) {
      const y = o.y || 0;
      const s = size * 40;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshStandardMaterial({ color: "#161616", roughness: 0.9 }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = y; plane.receiveShadow = true; plane.userData.nofit = true; plane.userData.under = true;
      world.add(plane);
      const step = Math.pow(10, Math.floor(Math.log10(size / 4)));
      const n = Math.min(400, Math.round((size * 6) / step / 2) * 2);
      const grid = new THREE.GridHelper(n * step, n, "#262626", "#1a1a1a");
      grid.position.y = y + size * 0.0005;
      grid.position.x = o.cx || 0; grid.userData.nofit = true;
      world.add(grid);
      return { mesh: plane };
    },
    bar(o = {}) {
      const base = V(o.at || [0, 0, 0]), w = o.width || size * 0.03, d = o.depth || w;
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(o.color || "accent", o)));
      const h = {
        mesh,
        set(v) {
          const hh = Math.max(0, v);
          mesh.visible = hh > size * 1e-4;
          mesh.scale.set(w, Math.max(hh, 1e-6), d);
          mesh.position.set(base.x, base.y + hh / 2, base.z);
          return h;
        },
      };
      return h.set(o.value || 0);
    },
    group() { const g = new THREE.Group(); add(g); return g; },
  };

  // Simulation.
  const maxT = spec.duration || 20;
  const playFor = Math.min(12, Math.max(3, maxT));
  const timeScale = spec.timeScale || (maxT < 3 || maxT > 12 ? maxT / playFor : 1);
  const recDt = timeScale / FPS;
  let dt = Math.min(spec.dt || 1 / 240, recDt);
  let perFrame = Math.max(1, Math.round(recDt / dt));
  const nFrames = Math.ceil(maxT / recDt);
  if (nFrames * perFrame > 3e6) { perFrame = Math.max(1, Math.floor(3e6 / nFrames)); dt = recDt / perFrame; }
  const frameDt = perFrame * dt;
  const tfmt = (t) => (run && run.T < 1 ? (t * 1000).toFixed(run.T < 0.1 ? 1 : 0) + " ms" : run && run.T > 180 ? (t / 60).toFixed(1) + " min" : t.toFixed(2) + " s");
  let run = null, A = {}, ansList = [], update = null, trail = null, plotData = [];

  function dispose(obj) {
    obj.traverse((o) => { if (o.geometry && o.geometry !== unitCyl && o.geometry !== unitCone && o.geometry !== unitSphere) o.geometry.dispose(); });
  }

  // Generated scenes often overlap solids with coplanar faces, which flicker. Meshes whose bounds touch
  // at any point in the run get different depth layers, so ties always resolve the same way. Greedy
  // coloring keeps layers small, so the offset stays a few pixels. The ground sits below every layer.
  function layerDepth(frames, p) {
    const meshes = [], under = [];
    world.traverse((o) => { if (o.isMesh) (o.userData.under ? under : meshes).push({ o, box: new THREE.Box3(), layer: 0 }); });
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      update(frames[Math.round(f * (frames.length - 1))], p, A);
      world.updateMatrixWorld(true);
      for (const m of meshes) m.box.union(new THREE.Box3().setFromObject(m.o));
    }
    meshes.forEach((m, i) => {
      const used = new Set();
      for (let j = 0; j < i; j++) if (meshes[j].box.intersectsBox(m.box)) used.add(meshes[j].layer);
      while (used.has(m.layer)) m.layer++;
    });
    for (const m of under) m.layer = -1;
    // Factor scales with the surface slope and covers grazing views; units cover face-on views.
    // three.js flips the factor sign for reversed depth but not the units sign.
    const units = reversedZ ? 32 : -2;
    for (const { o, layer } of [...meshes, ...under]) {
      o.onBeforeRender = (_r, _s, _c, _g, m) => { m.polygonOffset = layer !== 0; m.polygonOffsetFactor = -0.5 * layer; m.polygonOffsetUnits = units * layer; };
    }
  }

  function compute() {
    const p = { ...P };
    ansList = spec.answers ? spec.answers(p) || [] : [];
    A = {};
    for (const a of ansList) if (a.id) A[a.id] = a.value;
    ansEl.innerHTML = "";
    for (const a of ansList.slice(0, 3)) {
      const d = el("div", {}, ansEl);
      const v = el("div", { className: "v", textContent: fmt(a.value, a.digits) }, d);
      el("span", { className: "u", textContent: a.unit || "" }, v);
      el("div", { className: "l", textContent: a.label }, d);
    }
    let s = spec.init(p);
    if (s.t == null) s.t = 0;
    const frames = [structuredClone(s)], path = [];
    if (spec.track) path.push(spec.track(s, p));
    let ended = false;
    for (let f = 0; f < nFrames && !ended; f++) {
      for (let j = 0; j < perFrame; j++) {
        spec.step(s, dt, p);
        s.t += dt;
        if (spec.stop && spec.stop(s, p)) { ended = true; break; }
      }
      frames.push(structuredClone(s));
      if (spec.track) path.push(spec.track(s, p));
    }
    run = { p, frames, path, T: frames[frames.length - 1].t };
    plotData = plotSpec ? frames.map((fr) => plotSpec.value(fr, p)) : [];

    // World size from the spec, or from the track path.
    const box = new THREE.Box3();
    if (spec.bounds) { box.expandByPoint(V(spec.bounds[0])); box.expandByPoint(V(spec.bounds[1])); }
    else { for (const q of path) box.expandByPoint(V(q)); box.expandByPoint(new THREE.Vector3()); }
    size = box.getSize(new THREE.Vector3()).length();
    if (!(size > 1e-9)) size = 10;

    // Rebuild the 3D world.
    scene.remove(world); dispose(world);
    world = new THREE.Group(); scene.add(world);
    labels.innerHTML = ""; labelEls.length = 0; wantStars = false;
    update = spec.build(k, p, A) || (() => {});
    trail = null;
    // A straight-line path (carts, blocks on a track) gets no trail: it would only paint over the track.
    const pb = new THREE.Box3(); for (const q of path) pb.expandByPoint(V(q));
    const pd = pb.getSize(new THREE.Vector3()), pmax = Math.max(pd.x, pd.y, pd.z);
    const straight = [pd.x, pd.y, pd.z].filter((v) => v > pmax * 0.04).length < 2;
    if (path.length > 1 && !straight) {
      const pts = path.map(V);
      if (spec.predict !== false) k.line(pts, { dash: true, color: "#6a6a6a", opacity: 0.9 });
      const segs = Math.min(1500, pts.length - 1);
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, size * 0.0035, 8, false);
      const mesh = new THREE.Mesh(tube, mat("accent", { glow: 0.8 }));
      world.add(mesh);
      trail = { mesh, segs, per: 8 * 6 };
    }

    // Fit camera and shadows to the world.
    const wb = new THREE.Box3();
    for (const o of world.children) if (!o.userData.nofit) wb.expandByObject(o, true);
    if (wb.isEmpty()) wb.copy(box);
    const fitBox = spec.bounds ? box : wb.union(box);
    const center = fitBox.getCenter(new THREE.Vector3()), dims = fitBox.getSize(new THREE.Vector3());
    fit.target.copy(center);
    const usable = Math.max(0.5, 1 - (given.offsetWidth + 32) / Math.max(root.clientWidth, 1));
    const aspect = Math.max(0.6, (root.clientWidth * usable) / Math.max(root.clientHeight, 1));
    const span = Math.max(dims.x / aspect * 1.1, dims.y * 1.25, dims.z, size * 0.3);
    fit.dist = (span / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 0.84;
    const sh = key.shadow.camera, R = Math.max(dims.x, dims.y, dims.z) * 0.9 + size * 0.2;
    sh.left = -R; sh.right = R; sh.top = R; sh.bottom = -R; sh.near = 0.01; sh.far = R * 8; sh.updateProjectionMatrix();
    key.shadow.normalBias = R / 800; // about 1.3 shadow texels at any scale: no acne in km scenes, no floating shadows in mm scenes
    key.position.copy(center).add(new THREE.Vector3(-0.6, 1.4, 1.0).multiplyScalar(R * 2));
    key.target.position.copy(center);
    rim.position.copy(center).add(new THREE.Vector3(1.2, 0.6, -1.4).multiplyScalar(R * 2));
    camera.near = fit.dist / 500; camera.far = fit.dist * 50; camera.updateProjectionMatrix();
    scene.fog.near = fit.dist * 1.1; scene.fog.far = fit.dist * 3.2;
    if (wantStars) { addStars(fit.dist * 12); scene.fog.near = fit.dist * 20; scene.fog.far = fit.dist * 40; }
    layerDepth(frames, p);
  }

  const fit = { target: new THREE.Vector3(), dist: 10 };
  const cam = spec.camera || {};
  const az0 = cam.azimuth != null ? cam.azimuth : -0.42, el0 = cam.elevation != null ? cam.elevation : 0.42;
  function placeCamera(dist, az, elv) {
    camera.position.set(Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)).multiplyScalar(dist).add(fit.target);
    controls.target.copy(fit.target);
  }

  function layout() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    const shift = given.style.display === "none" || w < 640 ? 0 : (given.offsetWidth + 16) / 2;
    if (shift) camera.setViewOffset(w, h, shift, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (plotCv) { const r = plotCv.getBoundingClientRect(); plotCv.width = r.width * 2; plotCv.height = r.height * 2; }
  }

  function drawPlot(i) {
    if (!plotCv || !plotData.length) return;
    const cx = plotCv.getContext("2d"), w = plotCv.width, h = plotCv.height, d = plotData;
    cx.clearRect(0, 0, w, h);
    let lo = Math.min(...d), hi = Math.max(...d);
    const minSpan = Math.max(1e-12, Math.max(Math.abs(lo), Math.abs(hi)) * 0.05);
    if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan; hi = m + minSpan; }
    const pad = 8, top = 30;
    const px = (j) => pad + (j / (d.length - 1 || 1)) * (w - 2 * pad), py = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - pad - top);
    cx.lineWidth = 2; cx.strokeStyle = "#3a3a3a"; cx.beginPath();
    d.forEach((v, j) => (j ? cx.lineTo(px(j), py(v)) : cx.moveTo(px(j), py(v)))); cx.stroke();
    const col = plotSpec.color ? C[plotSpec.color] || plotSpec.color : C.accent;
    cx.lineWidth = 3; cx.strokeStyle = col; cx.beginPath();
    for (let j = 0; j <= i && j < d.length; j++) j ? cx.lineTo(px(j), py(d[j])) : cx.moveTo(px(j), py(d[j]));
    cx.stroke();
    const j = Math.min(i, d.length - 1);
    cx.fillStyle = col; cx.beginPath(); cx.arc(px(j), py(d[j]), 5, 0, 7); cx.fill();
    cx.fillStyle = C.text; cx.font = "22px system-ui"; cx.textAlign = "right"; cx.fillText(fmt(d[j]), w - pad, 22);
  }

  let tc = 0, playing = spec.autoplay !== false, last = performance.now(), dirty = false, clock = 0;
  const idx = () => Math.max(0, Math.min(run.frames.length - 1, Math.floor(tc / frameDt)));
  const tmp = new THREE.Vector3();

  function frame(now) {
    const real = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; clock += real;
    try {
      if (dirty) { dirty = false; compute(); tc = Math.min(tc, run.T); }
      if (playing) {
        tc += real * speed * timeScale;
        if (tc >= run.T) { tc = run.T; playing = false; bPlay.innerHTML = ICON.play; }
      }
      const i = idx(), s = run.frames[i];
      update(s, run.p, A);
      if (trail) trail.mesh.geometry.setDrawRange(0, Math.floor((i / Math.max(1, run.frames.length - 1)) * trail.segs) * trail.per);

      // Ease the camera toward the fitted framing; a gentle sway until the user takes over.
      controls.target.lerp(fit.target, userMoved ? 0.02 : 0.08);
      if (!userMoved) {
        const dist = camera.position.distanceTo(controls.target);
        const nd = dist + (fit.dist - dist) * 0.08;
        placeCamera(nd, az0 + Math.sin(clock * 0.25) * 0.06, el0 + Math.sin(clock * 0.17) * 0.02);
      }
      controls.update();

      for (const L of labelEls) {
        tmp.copy(L.p).project(camera);
        const vis = tmp.z < 1;
        L.e.style.left = ((tmp.x + 1) / 2) * root.clientWidth + "px";
        L.e.style.top = ((1 - tmp.y) / 2) * root.clientHeight + "px";
        L.e.style.visibility = vis ? "visible" : "hidden";
      }
      tLabel.textContent = `${tfmt(s.t)} / ${tfmt(run.T)}`;
      if (document.activeElement !== scrub) scrub.value = run.T ? Math.round((s.t / run.T) * 1000) : 0;
      drawPlot(i);
      composer.render();
    } catch (e) { err(e.message); console.error(e); return; }
    requestAnimationFrame(frame);
  }

  bPlay.onclick = () => {
    if (!playing && tc >= run.T) tc = 0;
    playing = !playing; bPlay.innerHTML = playing ? ICON.pause : ICON.play;
  };
  bReset.onclick = () => { tc = 0; playing = true; bPlay.innerHTML = ICON.pause; userMoved = false; };
  scrub.oninput = () => { tc = (scrub.value / 1000) * run.T; playing = false; bPlay.innerHTML = ICON.play; };
  bSpeed.onclick = () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length] || 1; bSpeed.textContent = speed + "×"; };
  new ResizeObserver(layout).observe(root);

  layout();
  compute();
  if (spec.startAt) tc = Math.min(Math.max(0, spec.startAt), run.T);
  placeCamera(fit.dist * 1.25, az0 - 0.3, el0 + 0.15);
  requestAnimationFrame(frame);
  try { parent.postMessage({ type: "simkit-ready", answers: ansList.map((a) => ({ label: a.label, value: a.value, unit: a.unit })) }, "*"); } catch (_) {}
}

window.Sim = { create, C, fmt };
if (typeof window.__scene === "function") {
  try { window.__scene(); } catch (e) { err(e.message); console.error(e); }
} else if (!window.__sceneFailed) {
  err("Scene code did not load (syntax error?)");
}
