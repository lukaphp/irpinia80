"use strict";
const $ = s => document.querySelector(s);
const cv = $("#map"), cx = cv.getContext("2d"), sg = $("#seis"), sx = sg.getContext("2d");
const TMAX = 150, T1 = 90, SH = 110;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let S = 1, DPR = Math.min(2, window.devicePixelRatio || 1), T = 0, playing = true, speed = 1, last = 0, sel = null, showInt = true;
const C = { sea: "#0b1117", land: "#19212a", coast: "#3b4a57", ink: "#ece7dd", mute: "#92a0ab", hot: "#ffb454", red: "#ff5a45" };

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const env = u => (u <= 0 ? 0 : (1 - Math.exp(-u / 0.8)) * Math.exp(-u / 20));

/* ---------- preparazione ---------- */
const SG = SEGS.map(s => ({ ...s, A: toKm(...s.a), B: toKm(...s.b), pa: toPx(...s.a), pb: toPx(...s.b), po: toPx(...s.o) }));
function dseg(p, A, B) {
  const vx = B.x - A.x, vy = B.y - A.y, u = clamp(((p.x - A.x) * vx + (p.y - A.y) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(p.x - (A.x + u * vx), p.y - (A.y + u * vy));
}
const mcs = d => 10.4 - 2.8 * Math.log10(1 + d / 5);
function arrivals(p) { return SG.map(s => { const d = dseg(p, s.A, s.B); return { d, ts: s.t + 3 + d / 3.5 }; }); }
function field(p) { const a = arrivals(p); return { I: mcs(Math.min(...a.map(x => x.d))), ts: Math.min(...a.map(x => x.ts)), a }; }
const collapseFrac = I => 0.9 * Math.pow(clamp((I - 6.2) / 3.8, 0, 1), 1.6);

const LAND = new Path2D();
COAST.forEach((c, i) => { const p = toPx(c[0], c[1]); i ? LAND.lineTo(p.x, p.y) : LAND.moveTo(p.x, p.y); });
LAND.lineTo(G.W, G.H); LAND.lineTo(G.W, 0); LAND.closePath();

const towns = TOWNS.map((t, i) => {
  const p = toPx(t.lat, t.lon), f = field(toKm(t.lat, t.lon)), r = rng(i * 97 + 13), n = t.city ? 22 : 12, R = t.city ? 30 : 15, fc = collapseFrac(f.I);
  const houses = [];
  for (let j = 0; j < n; j++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * R, q = r();
    houses.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, falls: q < fc, tc: f.ts + 2 + r() * 14 });
  }
  return { ...t, p, I: f.I, ts: f.ts, arr: f.a, houses };
});
const stadera = (() => { const p = toPx(STADERA.lat, STADERA.lon), f = field(toKm(STADERA.lat, STADERA.lon)); return { p, tc: f.ts + 3 }; })();
const byName = n => towns.find(t => t.n === n);

/* griglia di intensità */
const CW = 96, CH = 67, cells = [];
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
  const f = field({ x: ((i + .5) * 10) / G.PX, y: ((j + .5) * 10) / G.PX });
  cells.push({ I: f.I, ts: f.ts });
}
const off = document.createElement("canvas"); off.width = CW; off.height = CH;
const ox = off.getContext("2d"), img = ox.createImageData(CW, CH);
const STOPS = [[5, 255, 236, 150], [6, 255, 214, 80], [7, 255, 160, 50], [8, 255, 100, 40], [9, 235, 40, 55], [10, 200, 20, 150]];
function mcsRGB(I) {
  I = clamp(I, 5, 10);
  for (let k = 0; k < STOPS.length - 1; k++) {
    const a = STOPS[k], b = STOPS[k + 1];
    if (I <= b[0]) { const u = (I - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; }
  }
  return [200, 20, 150];
}
const ROM = ["<V", "V", "VI", "VII", "VIII", "IX", "X"];
const roman = I => ROM[clamp(Math.round(I) - 4, 0, 6)];

/* sismogramma sintetico (illustrativo) */
const SEIS = (() => {
  const r = rng(7), n = 90 * 30, out = new Float32Array(n); let f = 0, mx = 0;
  for (let i = 0; i < n; i++) {
    const t = i / 30; f = 0.55 * f + (r() - .5);
    let e = 0; SG.forEach(s => { e += s.amp * env(t - s.t - 0.5) * 1.6; });
    out[i] = e * (f + 0.5 * Math.sin(t * 8.1) + 0.35 * Math.sin(t * 17.3 + 1)); mx = Math.max(mx, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] /= mx; return out;
})();

/* ---------- disegno mappa ---------- */
function shakeAmp(t) {
  if (reduced || t > T1) return 0;
  let a = 0; SG.forEach(s => { a += s.amp * env(t - s.t - 3); }); return Math.min(6, a * 7);
}
function townShake(tn, t) {
  if (reduced) return 0;
  let a = 0; SG.forEach((s, k) => { a += s.amp * env(t - tn.arr[k].ts) / (1 + tn.arr[k].d / 15); });
  return a * clamp((tn.I - 5) / 5, 0, 1) * 6;
}
function drawIntensity() {
  const d = img.data;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k], rgb = mcsRGB(c.I), a = clamp((c.I - 4.8) / 3, 0, 1) * 0.6 * smooth((T - c.ts) / 4);
    d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = a * 255;
  }
  ox.putImageData(img, 0, 0);
  cx.save(); cx.clip(LAND); cx.imageSmoothingEnabled = true; cx.drawImage(off, 0, 0, G.W, G.H); cx.restore();
}
function drawWaves() {
  SG.forEach(s => {
    const tau = T - s.t - 2; if (tau <= 0) return;
    for (let m = 0; m < 6; m++) {
      const u = tau - m * 2; if (u <= 0) continue;
      const r = u * 3.5 * G.PX; if (r > 1400) continue;
      cx.strokeStyle = `rgba(255,190,100,${0.75 * Math.exp(-u * 3.5 / 80) * (1 - m * 0.14)})`;
      cx.lineWidth = 3 - m * 0.3; cx.beginPath(); cx.arc(s.po.x, s.po.y, r, 0, 6.283); cx.stroke();
    }
    const rp = tau * 6 * G.PX;
    if (rp < 1400) { cx.strokeStyle = `rgba(130,200,255,${0.35 * Math.exp(-tau * 6 / 140)})`; cx.lineWidth = 1.6; cx.beginPath(); cx.arc(s.po.x, s.po.y, rp, 0, 6.283); cx.stroke(); }
  });
}
function drawFaults() {
  SG.forEach(s => {
    const p = clamp((T - s.t) / 8, 0, 1); if (p <= 0) return;
    const x = s.pa.x + (s.pb.x - s.pa.x) * p, y = s.pa.y + (s.pb.y - s.pa.y) * p, hot = clamp(1 - (T - s.t) / 14, 0, 1);
    cx.save(); cx.lineCap = "round";
    cx.strokeStyle = C.red; cx.lineWidth = 3 + hot * 3; cx.shadowColor = C.red; cx.shadowBlur = hot * 18;
    cx.beginPath(); cx.moveTo(s.pa.x, s.pa.y); cx.lineTo(x, y); cx.stroke();
    if (p < 1) { cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(x, y, 5, 0, 6.283); cx.fill(); }
    cx.restore();
  });
  const e = SG[0].po, pulse = (performance.now() / 700) % 1;
  cx.strokeStyle = "#fff"; cx.lineWidth = 2.5; cx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -1.57 + i * 0.628, r = i % 2 ? 6 : 13; cx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); }
  cx.closePath(); cx.stroke();
  if (T < 6 && !reduced) { cx.strokeStyle = `rgba(255,255,255,${1 - pulse})`; cx.beginPath(); cx.arc(e.x, e.y, 10 + pulse * 40, 0, 6.283); cx.stroke(); }
}
function house(x, y, collapsed, age) {
  if (collapsed) { cx.fillStyle = "#5a3b33"; cx.fillRect(x - 4, y - 1.5, 8, 3); }
  else { cx.fillStyle = "#e3dccb"; cx.fillRect(x - 3, y - 3, 6, 6); }
  if (collapsed && age < 6) {
    cx.fillStyle = `rgba(205,185,150,${0.55 * (1 - age / 6)})`; cx.beginPath(); cx.arc(x, y - age * 1.5, 4 + age * 3.2, 0, 6.283); cx.fill();
  }
}
function drawTowns() {
  towns.forEach(tn => {
    const sh = townShake(tn, T), r = rng(Math.floor(T * 30) + 5);
    tn.houses.forEach(h => {
      const col = h.falls && T > h.tc, jx = col ? 0 : (r() - .5) * sh, jy = col ? 0 : (r() - .5) * sh;
      house(h.x + jx, h.y + jy, col, T - h.tc);
    });
  });
  const age = T - stadera.tc; house(stadera.p.x, stadera.p.y, T > stadera.tc, age);
}
function drawAftermath() {
  if (T < 92) return;
  const a = smooth((T - 92) / 6) * (1 - smooth((T - 140) / 8));
  towns.filter(t => t.r === 1 && !t.city).forEach(tn => {
    cx.strokeStyle = `rgba(255,180,84,${a * (0.5 + 0.3 * Math.sin(T * 3))})`; cx.setLineDash([5, 5]); cx.lineWidth = 2;
    cx.beginPath(); cx.arc(tn.p.x, tn.p.y, 26, 0, 6.283); cx.stroke(); cx.setLineDash([]);
  });
  CONVOYS.forEach((cv2, i) => {
    const A = byName(cv2[0]).p, B = byName(cv2[1]).p, q = smooth((T - 98 - i * 4) / 44); if (q <= 0) return;
    cx.strokeStyle = "rgba(140,210,255,.25)"; cx.setLineDash([4, 6]); cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(A.x, A.y); cx.lineTo(B.x, B.y); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = "#8cd2ff"; cx.beginPath(); cx.arc(A.x + (B.x - A.x) * q, A.y + (B.y - A.y) * q, 5, 0, 6.283); cx.fill();
  });
}
function drawLabels() {
  const fs = Math.max(12, 11 / S); cx.font = `600 ${fs}px "IBM Plex Sans", sans-serif`; cx.textBaseline = "middle"; cx.lineJoin = "round";
  const placed = [];
  towns.forEach(tn => {
    if (tn.r === 0 && sel !== tn) return; if (tn.r === 2 && S < 0.6 && sel !== tn) return;
    const lab = tn.n.replace("Sant'Angelo dei Lombardi", "Sant'Angelo d. L.").replace("Conza della Campania", "Conza").replace("Castelnuovo di Conza", "Castelnuovo");
    const w = cx.measureText(lab).width, x = tn.p.x + (tn.city ? 0 : 14), y = tn.p.y - (tn.city ? 38 : 0) + (tn.n === "Lioni" ? 14 : 0);
    const box = { x0: x, x1: x + w, y0: y - fs / 2, y1: y + fs / 2 };
    if (sel !== tn && placed.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return;
    placed.push(box);
    cx.strokeStyle = "rgba(11,17,23,.9)"; cx.lineWidth = 4; cx.strokeText(lab, x, y);
    cx.fillStyle = sel === tn ? C.hot : C.ink; cx.fillText(lab, x, y);
  });
  if (sel) { cx.strokeStyle = C.hot; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(sel.p.x, sel.p.y, sel.city ? 38 : 24, 0, 6.283); cx.stroke(); }
}
function drawChrome() {
  const fs = Math.max(11, 10 / S);
  cx.font = `500 ${fs}px "IBM Plex Mono", monospace`; cx.textBaseline = "alphabetic";
  const L = 20 * G.PX, bx = 24, by = G.H - 22;
  cx.strokeStyle = C.ink; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx, by - 6); cx.lineTo(bx, by); cx.lineTo(bx + L, by); cx.lineTo(bx + L, by - 6); cx.stroke();
  cx.fillStyle = C.ink; cx.fillText("20 km", bx, by - 10);
  const lw = 170, lx = G.W - lw - 24;
  for (let i = 0; i < lw; i++) { const c = mcsRGB(5 + (i / lw) * 5); cx.fillStyle = `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; cx.fillRect(lx + i, by - 12, 1.5, 10); }
  cx.fillStyle = C.mute; cx.textAlign = "center";
  ["V", "VI", "VII", "VIII", "IX", "X"].forEach((t, i) => cx.fillText(t, lx + (i / 5) * (lw - 8) + 4, by - 16));
  cx.textAlign = "left"; cx.fillText("Intensità MCS (modello)", lx, by + 14);
}
function drawMap() {
  cx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
  cx.fillStyle = C.sea; cx.fillRect(0, 0, G.W, G.H);
  const sh = shakeAmp(T);
  cx.save(); if (sh > 0.1) cx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
  cx.fillStyle = C.land; cx.fill(LAND);
  cx.strokeStyle = "rgba(255,255,255,.05)"; cx.lineWidth = 1; cx.beginPath();
  for (let lon = 14.25; lon < 16.05; lon += 0.25) { const x = toPx(40.5, lon).x; cx.moveTo(x, 0); cx.lineTo(x, G.H); }
  for (let lat = 40.25; lat < 41.2; lat += 0.25) { const y = toPx(lat, 15).y; cx.moveTo(0, y); cx.lineTo(G.W, y); }
  cx.stroke();
  if (showInt) drawIntensity();
  cx.strokeStyle = C.coast; cx.lineWidth = 2.5; cx.stroke(LAND);
  drawWaves(); drawFaults(); drawTowns(); drawAftermath(); drawLabels();
  cx.restore(); drawChrome();
}

/* ---------- sismogramma ---------- */
function drawSeis() {
  const W = 960, s = cvScale(sg); sx.setTransform(DPR * s, 0, 0, DPR * s, 0, 0);
  sx.fillStyle = "#0f151b"; sx.fillRect(0, 0, W, SH);
  sx.font = '500 20px "IBM Plex Mono", monospace'; sx.fillStyle = C.mute; sx.textBaseline = "alphabetic";
  const X = t => 14 + (t / 90) * (W - 28), mid = SH / 2 + 4;
  sx.strokeStyle = "rgba(255,255,255,.08)"; sx.lineWidth = 1; sx.beginPath();
  for (let t = 0; t <= 90; t += 10) { sx.moveTo(X(t), 8); sx.lineTo(X(t), SH - 22); }
  sx.moveTo(14, mid); sx.lineTo(W - 14, mid); sx.stroke();
  [0, 30, 60, 90].forEach(t => { sx.textAlign = t === 0 ? "left" : t === 90 ? "right" : "center"; sx.fillText(t + " s", X(t), SH - 4); });
  SG.forEach((s2, i) => { sx.fillStyle = C.red; sx.textAlign = "left"; sx.fillText(["1ª", "2ª", "3ª"][i], X(s2.t) + 4, 24); sx.strokeStyle = "rgba(255,90,69,.5)"; sx.beginPath(); sx.moveTo(X(s2.t), 8); sx.lineTo(X(s2.t), SH - 22); sx.stroke(); });
  const n = Math.min(SEIS.length - 1, Math.floor(Math.min(T, 90) * 30));
  sx.strokeStyle = C.hot; sx.lineWidth = 1.6; sx.beginPath();
  for (let i = 0; i <= n; i += 2) { const x = X(i / 30), y = mid - SEIS[i] * (SH / 2 - 26); i ? sx.lineTo(x, y) : sx.moveTo(x, y); }
  sx.stroke();
  const cxp = X(Math.min(T, 90)); sx.strokeStyle = "#fff"; sx.lineWidth = 2; sx.beginPath(); sx.moveTo(cxp, 6); sx.lineTo(cxp, SH - 22); sx.stroke();
}
function cvScale(c) { return c.clientWidth / 960 || 1; }

/* ---------- interfaccia ---------- */
const fmt = n => Math.round(n).toLocaleString("it-IT");
function updateUI() {
  const g = smooth((T - 6) / 84), h = smooth((T - 92) / 52);
  const sec = Math.floor(Math.min(T, T1));
  $("#v-dur").textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  $("#v-crol").textContent = fmt(FINAL.crolle * g);
  $("#v-gravi").textContent = fmt(FINAL.gravi * g);
  $("#v-lievi").textContent = fmt(FINAL.lievi * g);
  $("#v-morti").textContent = h > 0 ? fmt(FINAL.morti * h) : "—";
  $("#v-feriti").textContent = h > 0 ? fmt(FINAL.feriti * h) : "—";
  $("#v-sfoll").textContent = h > 0 ? fmt(FINAL.sfollati * h) : "—";
  let ev = EVENTS[0]; EVENTS.forEach(e => { if (T >= e.t) ev = e; });
  $("#clock").textContent = T < T1 ? "19:34:52 + " + Math.floor(T) + " s" : ev.c === "19:36" ? "23 nov, 19:36" : "dopo · " + ev.c;
  $("#ev-h").textContent = ev.h; $("#ev-x").textContent = ev.x;
  $("#phase").textContent = T < T1 ? "Atto 1 · i 90 secondi (tempo reale)" : "Atto 2 · ore e giorni dopo (tempo accelerato)";
  const r = $("#scrub"); if (document.activeElement !== r) r.value = T;
  $("#play").textContent = playing ? "Pausa" : T >= TMAX ? "Rivedi" : "Riprendi";
}
function showTown(t) {
  $("#town").innerHTML = t ? `<h3>${t.n}</h3><p class="mcs">Intensità stimata dal modello: <b>${roman(t.I)} MCS</b></p><p>${t.note}</p>` :
    `<h3>Tocca un paese sulla mappa</h3><p>Vedi cosa è successo in quel luogo. Le posizioni sono indicative.</p>`;
}
function resize() {
  const w = $("#mapwrap").clientWidth; S = w / G.W;
  cv.width = Math.round(w * DPR); cv.height = Math.round(w * G.H / G.W * DPR); cv.style.height = (w * G.H / G.W) + "px";
  const w2 = sg.clientWidth; sg.width = Math.round(w2 * DPR); sg.height = Math.round(w2 * SH / 960 * DPR); sg.style.height = (w2 * SH / 960) + "px";
}
/* audio dei 90 secondi, agganciato al tempo della simulazione */
const snd = $("#snd"); let audioOn = false;
function syncAudio() {
  if (!audioOn || !playing || T >= T1) { if (!snd.paused) snd.pause(); return; }
  if (snd.playbackRate !== speed) snd.playbackRate = speed;
  if (Math.abs(snd.currentTime - T) > 0.35) snd.currentTime = T;
  if (snd.paused) snd.play().catch(() => {});
}
function frame(ts) {
  if (!last) last = ts; const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  if (playing) { T += dt * speed; if (T >= TMAX) { T = TMAX; playing = false; } }
  drawMap(); drawSeis(); updateUI(); syncAudio(); requestAnimationFrame(frame);
}
$("#play").onclick = () => { if (T >= TMAX) T = 0; playing = !playing; };
$("#restart").onclick = () => { T = 0; playing = true; };
$("#scrub").oninput = e => { T = +e.target.value; playing = false; };
document.querySelectorAll("[data-speed]").forEach(b => b.onclick = () => {
  speed = +b.dataset.speed; document.querySelectorAll("[data-speed]").forEach(x => x.setAttribute("aria-pressed", x === b));
});
$("#tgInt").onclick = e => { showInt = !showInt; e.currentTarget.setAttribute("aria-pressed", showInt); };
$("#tgAudio").onclick = e => { audioOn = !audioOn; e.currentTarget.setAttribute("aria-pressed", audioOn); if (audioOn && T >= T1) { T = 0; playing = true; } };
cv.addEventListener("pointerdown", e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / S, y = (e.clientY - r.top) / S;
  let best = null, bd = 30 / S + 6;
  towns.forEach(t => { const d = Math.hypot(t.p.x - x, t.p.y - y); if (d < bd) { bd = d; best = t; } });
  sel = best; showTown(sel);
});
addEventListener("resize", resize);
resize(); showTown(null);
requestAnimationFrame(frame);
