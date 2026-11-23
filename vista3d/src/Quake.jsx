import { useEffect } from "react";
import { useScene } from "reactylon";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateLines, CreateDashedLines } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import "@babylonjs/core/Culling/ray.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture.js";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock.js";
import {
  D, sim, T1, EXAG, DEPTH, HYPO, NX, NZ, W_KM, H_KM, FAULTS, SG, clamp, smooth, env, rng,
  llToXZ, kmToXZ, field, collapseFrac, shakeAmp, mcsRGB
} from "./model.js";

const SEA_Y = 0.03, TAU = Math.PI * 2;
const PAL = [[0, .34, .40, .28], [400, .44, .47, .31], [900, .56, .53, .38], [1400, .68, .63, .52], [1900, .86, .84, .80]];
function landRGB(e) {
  for (let k = 0; k < PAL.length - 1; k++) {
    const a = PAL[k], b = PAL[k + 1];
    if (e <= b[0]) { const u = clamp((e - a[0]) / (b[0] - a[0]), 0, 1); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; }
  }
  return PAL[PAL.length - 1].slice(1);
}
const mat = (scene, name, o) => Object.assign(new StandardMaterial(name, scene), { specularColor: Color3.Black() }, o);

/* Il plastico: rilievo vero (quote reali, esagerate 3 volte), crosta fino a 20 km, faglie, onde, paesi. */
export default function Quake({ dem }) {
  const scene = useScene();

  useEffect(() => {
    const cam = scene.activeCamera, canvas = scene.getEngine().getRenderingCanvas();
    if (!cam.inputs.attachedToElement) cam.attachControl(canvas, true);
    Object.assign(cam, { lowerRadiusLimit: 6, upperRadiusLimit: 320, wheelDeltaPercentage: 0.02, pinchDeltaPercentage: 0.004,
      panningSensibility: 40, lowerBetaLimit: 0.05, upperBetaLimit: Math.PI / 2 - 0.03, minZ: 0.1, maxZ: 3000 });
    const root = new TransformNode("plastico", scene);
    const glow = new GlowLayer("glow", scene, { blurKernelSize: 24 }); glow.intensity = 0.45;
    const disposers = [() => glow.dispose(), () => root.dispose()];

    /* ---------- rilievo ---------- */
    const Y = new Float32Array(NX * NZ), land = new Uint8Array(NX * NZ);
    for (let k = 0; k < NX * NZ; k++) { const e = dem[k]; land[k] = e > 2 ? 1 : 0; Y[k] = e > 2 ? Math.max(0.06, e * EXAG / 1000) : -0.3; }
    const gx = i => -W_KM / 2 + (i / (NX - 1)) * W_KM, gz = j => H_KM / 2 - (j / (NZ - 1)) * H_KM;
    function hAt(x, z) {   /* quota della superficie (mare compreso) nel punto x,z */
      const fi = clamp((x + W_KM / 2) / W_KM * (NX - 1), 0, NX - 1.001), fj = clamp((H_KM / 2 - z) / H_KM * (NZ - 1), 0, NZ - 1.001);
      const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, s = k => Math.max(SEA_Y, Y[k]);
      const k = j * NX + i;
      return (s(k) * (1 - u) + s(k + 1) * u) * (1 - v) + (s(k + NX) * (1 - u) + s(k + NX + 1) * u) * v;
    }
    const pos = new Float32Array(NX * NZ * 3), base = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 4);
    const cellI = new Float32Array(NX * NZ), cellT = new Float32Array(NX * NZ), irgb = new Float32Array(NX * NZ * 3);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = gx(i), z = gz(j);
      pos.set([x, Y[k], z], k * 3);
      const c = land[k] ? landRGB(dem[k]) : [.05, .09, .13];
      base.set(c, k * 3); col.set([...c, 1], k * 4);
      const f = field({ x: x + W_KM / 2, y: H_KM / 2 - z }); cellI[k] = land[k] ? f.I : 0; cellT[k] = f.ts;
      const m = mcsRGB(f.I); irgb[k * 3] = m[0] / 255; irgb[k * 3 + 1] = m[1] / 255; irgb[k * 3 + 2] = m[2] / 255;
    }
    const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6); let n = 0;
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const k = j * NX + i; idx.set([k, k + 1, k + NX, k + 1, k + NX + 1, k + NX], n); n += 6;
    }
    const terrain = new Mesh("rilievo", scene); terrain.parent = root;
    const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.colors = col;
    const nrm = []; VertexData.ComputeNormals(pos, idx, nrm); vd.normals = nrm; vd.applyToMesh(terrain, true);
    const terrMat = mat(scene, "m-rilievo", { diffuseColor: Color3.White(), emissiveColor: new Color3(.1, .1, .09), backFaceCulling: false });
    terrain.material = terrMat; terrain.useVertexColors = true;

    const sea = CreateGround("mare", { width: W_KM, height: H_KM }, scene); sea.parent = root; sea.position.y = SEA_Y; sea.isPickable = false;
    const seaMat = mat(scene, "m-mare", { diffuseColor: new Color3(.06, .12, .18), alpha: 0.88, specularColor: new Color3(.15, .2, .25), specularPower: 64 });
    sea.material = seaMat;

    /* ---------- pareti della crosta, fino a 20 km ---------- */
    const wallPos = [], wallCol = [], wallIdx = [];
    const strata = y => { const t = -y / DEPTH, band = (Math.floor(-y / 5) % 2) * 0.03; return [.30 - .17 * t + band, .24 - .14 * t + band, .19 - .11 * t + band, 1]; };
    function wall(pts) {   /* pts: punti in superficie lungo un bordo */
      const o = wallPos.length / 3, rows = [0, -2, -5, -10, -15, -DEPTH];
      pts.forEach(p => rows.forEach((d, r) => { const y = r === 0 ? Math.max(SEA_Y, p.y) : d; wallPos.push(p.x, y, p.z); wallCol.push(...strata(Math.min(y, 0))); }));
      const R = rows.length;
      for (let a = 0; a < pts.length - 1; a++) for (let r = 0; r < R - 1; r++) {
        const k = o + a * R + r; wallIdx.push(k, k + R, k + 1, k + 1, k + R, k + R + 1);
      }
    }
    const edge = (fn, len) => Array.from({ length: len }, (_, t) => fn(t));
    const P = k => ({ x: pos[k * 3], y: Y[k], z: pos[k * 3 + 2] });
    wall(edge(i => P((NZ - 1) * NX + i), NX));             /* sud */
    wall(edge(i => P(NX - 1 - i), NX));                      /* nord */
    wall(edge(j => P(j * NX), NZ));                          /* ovest */
    wall(edge(j => P((NZ - 1 - j) * NX + NX - 1), NZ));      /* est */
    const walls = new Mesh("crosta", scene); walls.parent = root; walls.isPickable = false;
    const wvd = new VertexData(); wvd.positions = wallPos; wvd.indices = wallIdx; wvd.colors = wallCol;
    const wn = []; VertexData.ComputeNormals(wallPos, wallIdx, wn); wvd.normals = wn; wvd.applyToMesh(walls);
    const wallMat = mat(scene, "m-crosta", { diffuseColor: Color3.White(), backFaceCulling: false, emissiveColor: new Color3(.08, .07, .06) });
    walls.material = wallMat; walls.useVertexColors = true;
    const bottom = CreateGround("fondo", { width: W_KM, height: H_KM }, scene); bottom.parent = root; bottom.position.y = -DEPTH; bottom.isPickable = false;
    bottom.material = mat(scene, "m-fondo", { diffuseColor: new Color3(.1, .08, .07), backFaceCulling: false });

    /* ---------- faglie, ipocentri, tracce in superficie ---------- */
    const faultMat = mat(scene, "m-faglia", { diffuseColor: new Color3(.5, .12, .1), emissiveColor: new Color3(.25, .05, .04), alpha: 0.45, backFaceCulling: false });
    const ruptMat = mat(scene, "m-rottura", { diffuseColor: new Color3(.9, .25, .18), emissiveColor: new Color3(.85, .22, .15), alpha: 0.7, backFaceCulling: false });
    const quad = (name, m) => { const q = new Mesh(name, scene); q.parent = root; q.material = m; q.isPickable = false;
      const v = new VertexData(); v.positions = new Float32Array(12); v.indices = [0, 1, 2, 0, 2, 3]; v.normals = new Float32Array(12); v.applyToMesh(q, true); return q; };
    const setQuad = (q, A, B, d0, d1, f) => {
      const p = [f.at(A, d0), f.at(B, d0), f.at(B, d1), f.at(A, d1)];
      q.updateVerticesData("position", p.flatMap(v => [v.x, v.y, v.z]));
    };
    const lerpXZ = (A, B, u) => ({ x: A.x + (B.x - A.x) * u, z: A.z + (B.z - A.z) * u });
    const faults = FAULTS.map((f, k) => {
      const plane = quad("faglia" + k, faultMat); setQuad(plane, f.a, f.b, 0.3, 15, f);
      const rupt = quad("rottura" + k, ruptMat); rupt.setEnabled(false);
      const hypo = CreateSphere("ipo" + k, { diameter: k === 0 ? 1.6 : 1.1, segments: 16 }, scene); hypo.parent = root; hypo.isPickable = false;
      hypo.position.set(f.hypo.x, f.hypo.y, f.hypo.z);
      hypo.material = mat(scene, "m-ipo" + k, { emissiveColor: new Color3(1, .95, .8), diffuseColor: Color3.Black() });
      const trace = CreateLines("traccia" + k, { points: Array.from({ length: 24 }, () => Vector3.Zero()), updatable: true }, scene);
      trace.parent = root; trace.color = new Color3(1, .35, .27); trace.isPickable = false;
      return { f, plane, rupt, hypo, trace };
    });
    const epi = FAULTS[0];
    const drop = CreateDashedLines("verticale", { points: [new Vector3(epi.o.x, hAt(epi.o.x, epi.o.z) + 0.3, epi.o.z), new Vector3(epi.o.x, -HYPO, epi.o.z)], dashSize: 2, gapSize: 1.4, dashNb: 30 }, scene);
    drop.color = new Color3(1, 1, 1); drop.alpha = 0.7; drop.parent = root; drop.isPickable = false;
    const star = CreateTorus("epicentro", { diameter: 2.2, thickness: 0.35, tessellation: 40 }, scene); star.parent = root; star.isPickable = false;
    star.position.set(epi.o.x, hAt(epi.o.x, epi.o.z) + 0.3, epi.o.z);
    star.material = mat(scene, "m-epi", { emissiveColor: new Color3(1, 1, 1), diffuseColor: Color3.Black() });

    /* ---------- onde ---------- */
    const RING = 96, ringPts = () => Array.from({ length: RING + 1 }, () => Vector3.Zero()), ringCols = (c, a) => Array.from({ length: RING + 1 }, () => new Color4(c.r, c.g, c.b, a));
    const waves = SG.map((s, k) => {
      const mk = (name, c) => { const l = CreateLines(name, { points: ringPts(), colors: ringCols(c, 1), updatable: true, useVertexAlpha: true }, scene);
        l.base = c; l.parent = root; l.isPickable = false; l.setEnabled(false); return l; };
      const S = Array.from({ length: 5 }, (_, m) => mk(`S${k}-${m}`, new Color3(1, .72, .38)));
      const Pr = mk(`P${k}`, new Color3(.55, .8, 1));
      const sph = (name, c) => { const m = CreateSphere(name, { diameter: 2, segments: 32 }, scene); m.parent = root; m.isPickable = false; m.setEnabled(false);
        m.material = mat(scene, "m-" + name, { diffuseColor: c, emissiveColor: c.scale(0.6), alpha: 0.14, backFaceCulling: false }); return m; };
      return { s, f: FAULTS[k], S, P: Pr, sS: sph(`sferaS${k}`, new Color3(1, .6, .25)), sP: sph(`sferaP${k}`, new Color3(.45, .75, 1)) };
    });
    /* le sfere delle onde si vedono solo sotto il livello del mare */
    const under = new Plane(0, 1, 0, -SEA_Y);
    waves.forEach(w => [w.sS, w.sP].forEach(m => {
      m.onBeforeRenderObservable.add(() => { scene.clipPlane = under; });
      m.onAfterRenderObservable.add(() => { scene.clipPlane = null; });
    }));
    function setRing(l, c, R, alpha) {
      const pts = [], cols = [];
      for (let i = 0; i <= RING; i++) {
        const t = (i / RING) * TAU, x = c.x + Math.cos(t) * R, z = c.z + Math.sin(t) * R;
        const inside = Math.abs(x) < W_KM / 2 && Math.abs(z) < H_KM / 2, cx = clamp(x, -W_KM / 2, W_KM / 2), cz = clamp(z, -H_KM / 2, H_KM / 2);
        pts.push(new Vector3(cx, hAt(cx, cz) + 0.25, cz)); cols.push(new Color4(l.base.r, l.base.g, l.base.b, inside ? alpha : 0));
      }
      CreateLines(null, { points: pts, colors: cols, instance: l, useVertexAlpha: true });
    }

    /* ---------- paesi e case ---------- */
    const houseBase = CreateBox("casa", { size: 1 }, scene); houseBase.parent = root; houseBase.isVisible = false;
    houseBase.registerInstancedBuffer("color", 4); houseBase.instancedBuffers.color = new Color4(1, 1, 1, 1);
    houseBase.material = mat(scene, "m-casa", { diffuseColor: Color3.White(), emissiveColor: new Color3(.12, .12, .1) });
    const dustBase = CreateSphere("polvere", { diameter: 1, segments: 8 }, scene); dustBase.parent = root; dustBase.isVisible = false;
    dustBase.material = mat(scene, "m-polvere", { diffuseColor: new Color3(.85, .78, .62), emissiveColor: new Color3(.35, .3, .22), alpha: 0.38 });
    const HOUSE = new Color4(.9, .87, .8, 1), RUBBLE = new Color4(.36, .23, .2, 1);
    const PXKM = 1 / D.G.PX;
    const towns = D.TOWNS.map((t, i) => {
      const c = llToXZ(t.lat, t.lon), f = field({ x: c.x + W_KM / 2, y: H_KM / 2 - c.z }), r = rng(i * 97 + 13);
      const nH = t.city ? 22 : 12, R = (t.city ? 30 : 15) * PXKM, fc = collapseFrac(f.I), size = t.city ? 0.75 : 0.6;
      const houses = Array.from({ length: nH }, (_, j) => {
        const a = r() * TAU, d = Math.sqrt(r()) * R, q = r(), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, h = size * (0.8 + r() * 0.6);
        const inst = houseBase.createInstance(`casa-${i}-${j}`); inst.parent = root; inst.isPickable = false;
        const y0 = hAt(x, z) + h / 2; inst.position.set(x, y0, z); inst.scaling.set(size, h, size); inst.rotation.y = r() * 3;
        inst.instancedBuffers.color = HOUSE.clone();
        const dust = dustBase.createInstance(`polvere-${i}-${j}`); dust.parent = root; dust.isPickable = false; dust.setEnabled(false);
        dust.position.set(x, y0, z);
        return { inst, dust, x, z, y0, h, falls: q < fc, tc: f.ts + 2 + r() * 14, tilt: (r() - .5) * 1.4 };
      });
      const top = hAt(c.x, c.z);
      const anchor = new TransformNode("etichetta-" + i, scene); anchor.parent = root; anchor.position.set(c.x, top + (t.city ? 3.2 : 2), c.z);
      return { ...t, i, c, top, I: f.I, arr: f.a, houses, anchor, sh: 0 };
    });
    const st = llToXZ(D.STADERA.lat, D.STADERA.lon), stF = field({ x: st.x + W_KM / 2, y: H_KM / 2 - st.z });
    const stadera = houseBase.createInstance("via-stadera"); stadera.parent = root; stadera.isPickable = false;
    const stY = hAt(st.x, st.z); stadera.position.set(st.x, stY + 1, st.z); stadera.scaling.set(.8, 2, .8); stadera.instancedBuffers.color = HOUSE.clone();
    const byName = nm => towns.find(t => t.n === nm);

    const selRing = CreateTorus("selezione", { diameter: 1, thickness: 0.06, tessellation: 64 }, scene); selRing.parent = root; selRing.isPickable = false;
    selRing.material = mat(scene, "m-sel", { emissiveColor: new Color3(1, .7, .33), diffuseColor: Color3.Black() }); selRing.setEnabled(false);

    /* ---------- dopo la scossa: soccorsi ---------- */
    const pulse = towns.filter(t => t.r === 1 && !t.city).map(t => {
      const m = CreateTorus("allerta-" + t.i, { diameter: 9, thickness: 0.25, tessellation: 64 }, scene); m.parent = root; m.isPickable = false;
      m.position.set(t.c.x, t.top + 0.4, t.c.z); m.material = mat(scene, "m-allerta-" + t.i, { emissiveColor: new Color3(1, .7, .33), diffuseColor: Color3.Black(), alpha: 0 });
      return m;
    });
    const convoys = D.CONVOYS.map(([a, b], i) => {
      const A = byName(a).c, B = byName(b).c, path = Array.from({ length: 48 }, (_, u) => { const p = lerpXZ(A, B, u / 47); return new Vector3(p.x, hAt(p.x, p.z) + 0.5, p.z); });
      const line = CreateDashedLines("strada-" + i, { points: path, dashSize: 2, gapSize: 2, dashNb: 60 }, scene); line.color = new Color3(.55, .82, 1); line.alpha = 0; line.parent = root; line.isPickable = false;
      const dot = CreateSphere("soccorsi-" + i, { diameter: 1.4, segments: 12 }, scene); dot.parent = root; dot.isPickable = false; dot.setEnabled(false);
      dot.material = mat(scene, "m-soccorsi-" + i, { emissiveColor: new Color3(.55, .82, 1), diffuseColor: Color3.Black() });
      return { i, path, line, dot };
    });

    faults.forEach(o => { glow.addIncludedOnlyMesh(o.rupt); glow.addIncludedOnlyMesh(o.hypo); });
    convoys.forEach(c => glow.addIncludedOnlyMesh(c.dot));

    /* ---------- etichette ---------- */
    const ui = AdvancedDynamicTexture.CreateFullscreenUI("etichette", true, scene);
    ui.renderScale = 1; ui.useInvalidateRectOptimization = false;
    /* l'interfaccia è disegnata in pixel del dispositivo: le misure in px CSS vanno moltiplicate per la densità */
    const dpr = 1 / scene.getEngine().getHardwareScalingLevel(), px = v => Math.round(v * dpr);
    const big = () => (canvas.clientWidth < 700 ? 13 : 15);
    const label = (text, node, o = {}) => {
      const tb = new TextBlock("t-" + text, text);
      Object.assign(tb, { color: "#f3eee4", fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontWeight: "600",
        outlineWidth: px(4), outlineColor: "#080c10", resizeToFit: true, isPointerBlocker: false }, o);
      tb.fontSize = px(o.fontSize || big());
      ui.addControl(tb); tb.linkWithMesh(node); return tb;
    };
    towns.forEach(t => {
      t.label = label(t.n, t.anchor, t.city ? { fontWeight: "700", fontSize: big() + 2, color: "#ffffff" } : {});
      t.label.isPointerBlocker = true; t.label.onPointerClickObservable.add(() => select(t));
    });
    const hypoNode = new TransformNode("n-ipo", scene); hypoNode.parent = root; hypoNode.position.set(epi.hypo.x + 1.2, epi.hypo.y, epi.hypo.z);
    const hypoLabel = label("Ipocentro · circa 12 km", hypoNode, { color: "#ffe2b0", fontSize: big() - 1 }); hypoLabel.linkOffsetX = px(80);
    const depthLabels = [5, 10, 15].map(d => { const nd = new TransformNode("n-prof" + d, scene); nd.parent = root; nd.position.set(-W_KM / 2 + 4, -d, -H_KM / 2);
      return label(`−${d} km`, nd, { color: "#d9d0c0", fontSize: big() - 2, fontWeight: "500" }); });
    const seaNode = new TransformNode("n-mare", scene); seaNode.parent = root; seaNode.position.copyFrom(new Vector3(llToXZ(40.45, 14.55).x, 1, llToXZ(40.45, 14.55).z));
    const seaLabel = label("Mar Tirreno", seaNode, { color: "#8fb3cc", fontStyle: "italic", fontWeight: "500" });

    function select(t) {
      sim.sel = t ? { n: t.n, note: t.note, I: t.I } : null;
      if (t) { selRing.setEnabled(true); selRing.position.set(t.c.x, t.top + 0.5, t.c.z); selRing.scaling.setAll(t.city ? 13 : 8); }
      else selRing.setEnabled(false);
      towns.forEach(o => { o.label.color = o === t ? "#ffb454" : o.city ? "#ffffff" : "#f3eee4"; });
    }
    sim.select = nm => select(byName(nm) || null);
    const tap = scene.onPointerObservable.add(pi => {
      if (pi.type !== PointerEventTypes.POINTERTAP) return;
      const hit = scene.pick(scene.pointerX, scene.pointerY, m => m === terrain);
      if (!hit?.hit) return select(null);
      let best = null, bd = 7; towns.forEach(t => { const d = Math.hypot(t.c.x - hit.pickedPoint.x, t.c.z - hit.pickedPoint.z); if (d < bd) { bd = d; best = t; } });
      select(best);
    });
    disposers.push(() => scene.onPointerObservable.remove(tap), () => ui.dispose());

    /* ---------- visita guidata ---------- */
    const center = new Vector3(llToXZ(40.83, 15.2).x, 0, llToXZ(40.83, 15.2).z);
    const tv = (lat, lon, y = 0) => { const p = llToXZ(lat, lon); return new Vector3(p.x, y, p.z); };
    const SHOTS = [
      { t: 0, a: -2.25, b: 1.12, r: 78, tg: new Vector3(epi.hypo.x, -7, epi.hypo.z), sub: true },
      { t: 18, a: -2.55, b: 1.12, r: 82, tg: new Vector3(FAULTS[1].hypo.x, -7, FAULTS[1].hypo.z), sub: true },
      { t: 36, a: -1.4, b: 1.12, r: 88, tg: new Vector3(FAULTS[2].hypo.x, -7, FAULTS[2].hypo.z), sub: true },
      { t: 52, a: -1.85, b: 0.95, r: 125, tg: center, sub: false },
      { t: 92, a: -1.3, b: 0.95, r: 30, tg: tv(40.9277, 15.1777, 2), sub: false },
      { t: 110, a: -2.0, b: 1.0, r: 30, tg: tv(40.6492, 15.5042, 2), sub: false },
      { t: 124, a: -2.9, b: 1.05, r: 34, tg: tv(40.8518, 14.2681, 1), sub: false },
      { t: 136, a: -1.7, b: 0.85, r: 150, tg: center, sub: false }
    ];
    const stopTour = () => { if (sim.tour) { sim.tour = false; sim.emit?.(); } };
    canvas.addEventListener("pointerdown", stopTour); canvas.addEventListener("wheel", stopTour, { passive: true });
    disposers.push(() => { canvas.removeEventListener("pointerdown", stopTour); canvas.removeEventListener("wheel", stopTour); });
    const lerpAng = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };

    /* ---------- realtà virtuale e aumentata ---------- */
    let xr = null, inXR = false;
    if (navigator.xr) {
      Promise.all(["immersive-vr", "immersive-ar"].map(m => navigator.xr.isSessionSupported(m).catch(() => false))).then(async ([vr, ar]) => {
        if (!vr && !ar) return;
        xr = await WebXRDefaultExperience.CreateAsync(scene, { disableDefaultUI: true, disableTeleportation: true, ignoreNativeCameraTransformation: true });
        xr.baseExperience.onStateChangedObservable.add(s => {
          inXR = s === WebXRState.IN_XR;
          /* in XR il plastico diventa un modellino di circa 2 metri, davanti a chi guarda */
          root.scaling.setAll(inXR ? 0.0125 : 1); root.position.set(0, inXR ? 0.8 : 0, inXR ? 1.6 : 0);
          ui.rootContainer.isVisible = !inXR;
          const ar = inXR && xr.baseExperience.sessionManager.sessionMode === "immersive-ar";
          scene.clearColor = ar ? new Color4(0, 0, 0, 0) : new Color4(.043, .067, .09, 1);
        });
        sim.xr = { vr, ar, enter: mode => xr.baseExperience.enterXRAsync(mode, "local-floor") };
        sim.emit?.();
      });
    }
    disposers.push(() => xr?.dispose());

    /* ---------- animazione ---------- */
    const jit = rng(5); let frame = 0, lastT = -1, lastInt = null;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const T = sim.T, dt = scene.getEngine().getDeltaTime() / 1000; frame++;

      /* modalità sottosuolo: crosta trasparente, si vedono faglie e onde */
      const sub = sim.subsoil;
      terrMat.alpha = sub ? 0.5 : 1; seaMat.alpha = sub ? 0.3 : 0.88; wallMat.alpha = sub ? 0.2 : 1; bottom.material.alpha = sub ? 0.25 : 1;
      cam.upperBetaLimit = sub ? Math.PI * 0.72 : Math.PI / 2 - 0.03;
      [drop, hypoLabel].forEach(o => (o.isVisible = sub));
      faults.forEach(o => { o.plane.isVisible = sub; o.hypo.isVisible = sub || T < 4; });

      /* colore dell'intensità sul rilievo, aggiornato a ogni frame solo se cambia qualcosa */
      if ((Math.abs(T - lastT) > 0.04 || lastInt !== sim.intensity) && frame % 2 === 0) {
        const on = sim.intensity;
        for (let k = 0; k < NX * NZ; k++) {
          let a = 0; const I = cellI[k];
          if (on && I > 4.8) a = clamp((I - 4.8) / 3, 0, 1) * 0.72 * smooth((T - cellT[k]) / 4);
          const b = k * 3, c = k * 4;
          if (a <= 0) { col[c] = base[b]; col[c + 1] = base[b + 1]; col[c + 2] = base[b + 2]; continue; }
          col[c] = base[b] * (1 - a) + irgb[b] * a; col[c + 1] = base[b + 1] * (1 - a) + irgb[b + 1] * a; col[c + 2] = base[b + 2] * (1 - a) + irgb[b + 2] * a;
        }
        terrain.updateVerticesData("color", col); lastT = T; lastInt = on;
      }

      /* faglie: la rottura avanza lungo il segmento in 8 secondi */
      faults.forEach(o => {
        const p = clamp((T - o.f.t) / 8, 0, 1), hot = clamp(1 - (T - o.f.t) / 14, 0, 1);
        o.rupt.setEnabled(p > 0 && sub);
        if (p > 0) setQuad(o.rupt, o.f.a, lerpXZ(o.f.a, o.f.b, p), 0.3, 15, o.f);
        ruptMat.emissiveColor.set(.75 + hot * .25, .18 + hot * .3, .12 + hot * .15);
        const pts = Array.from({ length: 24 }, (_, u) => { const q = lerpXZ(o.f.a, o.f.b, p * u / 23); return new Vector3(q.x, hAt(q.x, q.z) + 0.35, q.z); });
        o.trace.setEnabled(p > 0); if (p > 0) CreateLines(null, { points: pts, instance: o.trace });
        o.hypo.scaling.setAll(1 + (T >= o.f.t && T < o.f.t + 6 ? Math.sin((T - o.f.t) * 9) * 0.35 + 0.4 : 0));
      });

      /* onde: anelli dove il fronte incontra la superficie, sfere nel sottosuolo */
      waves.forEach(w => {
        const tau = T - w.s.t;
        w.S.forEach((l, m) => {
          const R = (tau - m * 2) * 3.5, surf = R > HYPO ? Math.sqrt(R * R - HYPO * HYPO) : 0;
          const on = surf > 0.3 && R < 260 && T < T1 + 20; l.setEnabled(on);
          if (on) setRing(l, w.f.hypo, surf, 0.9 * Math.exp(-R / 80) * (1 - m * 0.16));
        });
        const Rp = tau * 6, sp = Rp > HYPO ? Math.sqrt(Rp * Rp - HYPO * HYPO) : 0, onP = sp > 0.3 && Rp < 320 && T < T1 + 20;
        w.P.setEnabled(onP); if (onP) setRing(w.P, w.f.hypo, sp, 0.6 * Math.exp(-Rp / 140));
        [[w.sS, tau * 3.5, 0.1], [w.sP, Rp, 0.05]].forEach(([m, R, a]) => {
          const on = sub && R > 0.2 && R < 200; m.setEnabled(on);
          if (on) { m.scaling.setAll(R); m.position.set(w.f.hypo.x, w.f.hypo.y, w.f.hypo.z); m.material.alpha = a * Math.exp(-R / 90); }
        });
      });

      /* case: tremano, poi crollano; polvere */
      towns.forEach(t => {
        let a = 0; SG.forEach((s, k) => { a += s.amp * env(T - t.arr[k].ts) / (1 + t.arr[k].d / 15); });
        const sh = a * clamp((t.I - 5) / 5, 0, 1) * 0.5;
        t.houses.forEach(h => {
          const age = T - h.tc, k = h.falls ? smooth(age / 1.6) : 0;
          const jx = k < 1 ? (jit() - .5) * sh : 0, jz = k < 1 ? (jit() - .5) * sh : 0;
          h.inst.position.set(h.x + jx, h.y0 - h.h * 0.36 * k, h.z + jz);
          h.inst.rotation.z = h.tilt * k; h.inst.scaling.y = h.h * (1 - 0.72 * k);
          const c = h.inst.instancedBuffers.color; c.r = HOUSE.r + (RUBBLE.r - HOUSE.r) * k; c.g = HOUSE.g + (RUBBLE.g - HOUSE.g) * k; c.b = HOUSE.b + (RUBBLE.b - HOUSE.b) * k;
          const dOn = h.falls && age > 0 && age < 7; h.dust.setEnabled(dOn);
          if (dOn) { const s = (0.8 + age * 0.9) * (1 - smooth((age - 3.5) / 3.5)); h.dust.scaling.setAll(s); h.dust.position.y = h.y0 + age * 0.25; }
        });
      });
      const sk = smooth((T - stF.ts - 3) / 1.6); stadera.scaling.y = 2 * (1 - 0.75 * sk); stadera.position.y = stY + 1 - 0.75 * sk; stadera.rotation.z = 0.5 * sk;
      const sc = stadera.instancedBuffers.color; sc.r = HOUSE.r + (RUBBLE.r - HOUSE.r) * sk; sc.g = HOUSE.g + (RUBBLE.g - HOUSE.g) * sk; sc.b = HOUSE.b + (RUBBLE.b - HOUSE.b) * sk;

      /* dopo la scossa */
      const af = smooth((T - 92) / 6) * (1 - smooth((T - 140) / 8));
      pulse.forEach(m => { m.material.alpha = af * (0.55 + 0.3 * Math.sin(T * 3)); m.setEnabled(af > 0.01); });
      convoys.forEach(cv => {
        const q = smooth((T - 98 - cv.i * 4) / 44); cv.line.alpha = q > 0 ? 0.45 : 0; cv.dot.setEnabled(q > 0);
        if (q > 0) { const f = q * (cv.path.length - 1), i0 = Math.min(cv.path.length - 2, Math.floor(f)); cv.dot.position.copyFrom(Vector3.Lerp(cv.path[i0], cv.path[i0 + 1], f - i0)); }
      });

      /* etichette: i paesi minori compaiono avvicinandosi */
      if (frame % 6 === 0 && !inXR) {
        towns.forEach(t => {
          const d = Vector3.Distance(cam.position, t.anchor.getAbsolutePosition());
          t.label.isVisible = sim.sel?.n === t.n || t.r === 1 || (t.r === 2 && d < 140) || (t.r === 0 && d < 70);
        });
        depthLabels.forEach(l => (l.isVisible = sub || cam.beta > 1.2)); seaLabel.isVisible = cam.radius > 60;
      }

      /* camera: visita guidata e tremore */
      if (!inXR) {
        if (sim.tour) {
          let s = SHOTS[0]; SHOTS.forEach(x => { if (T >= x.t) s = x; });
          if (sim.subsoil !== s.sub) { sim.subsoil = s.sub; sim.emit?.(); }
          const k = 1 - Math.exp(-dt * 0.9);
          cam.alpha = lerpAng(cam.alpha, s.a, k); cam.beta += (s.b - cam.beta) * k; cam.radius += (s.r * (canvas.clientWidth < canvas.clientHeight ? 1.4 : 1) - cam.radius) * k;  /* schermo verticale: inquadratura più larga */
          cam.target.copyFrom(Vector3.Lerp(cam.target, s.tg, k));  /* assegnare target ricalcolerebbe alpha, beta e raggio */
        }
        /* sul telefono il pannello copre la parte bassa: si alza la scena */
        const amp = shakeAmp(T) * 0.35, narrow = canvas.clientWidth < 640 ? cam.radius * 0.06 : 0;
        cam.targetScreenOffset.set(amp > 0.01 ? (jit() - .5) * amp : 0, narrow + (amp > 0.01 ? (jit() - .5) * amp : 0));
      }
    });
    disposers.push(() => scene.onBeforeRenderObservable.remove(obs));
    sim.ready = true; sim.emit?.();
    return () => disposers.forEach(f => f());
  }, [scene, dem]);

  return null;
}
