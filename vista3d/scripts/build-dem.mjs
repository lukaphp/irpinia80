// Scarica le tile di elevazione (AWS Terrain Tiles, formato Terrarium) e produce public/dem.bin:
// griglia NX x NZ di quote in metri (Int16, riga 0 = nord), stessa area della mappa 2D.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const [cacheDir = "dem-cache"] = process.argv.slice(2);
const LON0 = 14.15, LON1 = 16.05, LAT0 = 40.2, LAT1 = 41.2, NX = 321, NZ = 223, Z = 10;
const lon2x = lon => ((lon + 180) / 360) * 2 ** Z;
const lat2y = lat => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };

fs.mkdirSync(cacheDir, { recursive: true });
const tiles = new Map();
async function tile(x, y) {
  const k = `${x}_${y}`; if (tiles.has(k)) return tiles.get(k);
  const f = path.join(cacheDir, `${Z}_${k}.png`);
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!r.ok) throw new Error(`tile ${k}: ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  const png = PNG.sync.read(fs.readFileSync(f)); tiles.set(k, png); return png;
}
async function elev(fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy), t = await tile(x, y);
  const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256)), i = (py * 256 + px) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
const out = new Int16Array(NX * NZ);
let mn = Infinity, mx = -Infinity;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const lon = LON0 + (i / (NX - 1)) * (LON1 - LON0), lat = LAT1 - (j / (NZ - 1)) * (LAT1 - LAT0);
  // media di 3x3 campioni per smussare il rumore
  let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += await elev(lon2x(lon + a * 0.0012), lat2y(lat + b * 0.0009));
  const e = Math.round(s / 9); out[j * NX + i] = e; mn = Math.min(mn, e); mx = Math.max(mx, e);
}
fs.writeFileSync("public/dem.bin", Buffer.from(out.buffer));
console.log(`dem.bin ${NX}x${NZ}, quote ${mn}..${mx} m, ${tiles.size} tile`);
