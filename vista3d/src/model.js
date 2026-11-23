/* Dati e modello condivisi con la mappa 2D: data.js è la stessa fonte, letta come testo. */
import src from "../../data.js?raw";

export const D = new Function(`${src}; return { G, toKm, SEGS, TOWNS, STADERA, CONVOYS, EVENTS, FINAL };`)();
const { G, toKm } = D;

export const T1 = 90, TMAX = 150, AOFF = 10;            /* fine scossa, fine simulazione, ritardo della scossa nell'audio */
export const EXAG = 3;                                    /* esagerazione verticale del rilievo */
export const DEPTH = 20, HYPO = 12, DIP = 60 * Math.PI / 180;
export const NX = 321, NZ = 223;                          /* griglia di public/dem.bin */
export const W_KM = (G.W / G.PX), H_KM = (G.H / G.PX);   /* 160 x 111 km */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const env = u => (u <= 0 ? 0 : (1 - Math.exp(-u / 0.8)) * Math.exp(-u / 20));
export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* km della mappa 2D (x verso est, y verso sud) -> coordinate della scena (x est, z nord, centrata) */
export const kmToXZ = p => ({ x: p.x - W_KM / 2, z: H_KM / 2 - p.y });
export const llToXZ = (lat, lon) => kmToXZ(toKm(lat, lon));

/* stesso modello di intensità della mappa 2D */
export const SG = D.SEGS.map(s => ({ ...s, A: toKm(...s.a), B: toKm(...s.b) }));
function dseg(p, A, B) {
  const vx = B.x - A.x, vy = B.y - A.y, u = clamp(((p.x - A.x) * vx + (p.y - A.y) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(p.x - (A.x + u * vx), p.y - (A.y + u * vy));
}
export const mcs = d => 10.4 - 2.8 * Math.log10(1 + d / 5);
export function field(p) {
  const a = SG.map(s => { const d = dseg(p, s.A, s.B); return { d, ts: s.t + 3 + d / 3.5 }; });
  return { I: mcs(Math.min(...a.map(x => x.d))), ts: Math.min(...a.map(x => x.ts)), a };
}
export const collapseFrac = I => 0.9 * Math.pow(clamp((I - 6.2) / 3.8, 0, 1), 1.6);
export function shakeAmp(t) { if (t > T1) return 0; let a = 0; SG.forEach(s => { a += s.amp * env(t - s.t - 3); }); return a; }

const STOPS = [[5, 255, 236, 150], [6, 255, 214, 80], [7, 255, 160, 50], [8, 255, 100, 40], [9, 235, 40, 55], [10, 200, 20, 150]];
export function mcsRGB(I) {
  I = clamp(I, 5, 10);
  for (let k = 0; k < STOPS.length - 1; k++) {
    const a = STOPS[k], b = STOPS[k + 1];
    if (I <= b[0]) { const u = (I - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; }
  }
  return [200, 20, 150];
}
const ROM = ["<V", "V", "VI", "VII", "VIII", "IX", "X"];
export const roman = I => ROM[clamp(Math.round(I) - 4, 0, 6)];

/* Piani di faglia: faglie normali che immergono di circa 60° verso nord-est, da 0 a 15 km.
   Ogni piano passa per l'ipocentro, a 12 km sotto il punto d'innesco del segmento. Geometria indicativa. */
export const FAULTS = SG.map(s => {
  const a = kmToXZ(s.A), b = kmToXZ(s.B), o = kmToXZ(toKm(...s.o));
  const ux = b.x - a.x, uz = b.z - a.z, L = Math.hypot(ux, uz);
  let nx = uz / L, nz = -ux / L; if (nx + nz < 0) { nx = -nx; nz = -nz; }   /* verso nord-est */
  const run = d => (d - HYPO) / Math.tan(DIP);                              /* spostamento orizzontale alla profondità d */
  const at = (p, d) => ({ x: p.x + nx * run(d), y: -d, z: p.z + nz * run(d) });
  return { ...s, a, b, o, L, at, hypo: { x: o.x, y: -HYPO, z: o.z } };
});

/* tempo della simulazione e stato dell'interfaccia, condivisi tra scena e pannelli */
export const sim = {
  T: 0, playing: true, speed: 1, audioOn: false,
  subsoil: false, intensity: true, tour: true,
  sel: null, xr: { vr: false, ar: false, enter: null }
};

if (import.meta.env.DEV || location.search.includes("debug")) window.__sim = sim;
