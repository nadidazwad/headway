// Radon scoring avoids the pixel-lattice bias of a gradient histogram: for each trial angle, project
// every edge pixel along that direction; the true direction of many straight lines gives the sharpest profile.
import { spawnSync } from "node:child_process";
const video = process.argv[2]; const N = 1024;
const score = (g, angle, select) => {
  const t = angle * Math.PI / 180, s = Math.sin(t), c = Math.cos(t);
  const bins = new Float64Array(4 * N);
  for (let y = 1; y < N - 1; y += 1) for (let x = 1; x < N - 1; x += 1) {
    const i = y * N + x; const gx = g[i + 1] - g[i - 1], gy = g[i + N] - g[i - N]; const m = Math.hypot(gx, gy);
    if (m < 45 || !select(x, y)) continue;
    bins[Math.floor(x * s + y * c + 2 * N)] += m;
  }
  let sum = 0; for (const b of bins) sum += b * b; return sum;
};
const scan = (g, lo, hi, select) => {
  let rows = [];
  for (let a = lo; a <= hi; a += 0.5) rows.push([a, score(g, a, select)]);
  rows.sort((p, q) => q[1] - p[1]);
  const out = []; for (const r of rows) { if (out.every((o) => Math.abs(o[0] - r[0]) > 3)) out.push(r); if (out.length === 3) break; }
  return out.map((r) => r[0].toFixed(1)).join(" ");
};

for (const t of [0.5, 42, 54, 28, 60]) {
  const g = spawnSync("ffmpeg", ["-v","error","-ss",String(t),"-i",video,"-frames:v","1","-vf",`scale=${N}:${N},format=gray`,"-f","rawvideo","-"],{maxBuffer:1<<26}).stdout;
  const all = () => true;
  const rise = scan(g, 2, 60, all).split(" ").map(Number)[0];
  const falls = scan(g, -70, -12, all);
  const fall = Math.abs(Number(falls.split(" ")[0]));
  const s2 = Math.tan(rise*Math.PI/180)*Math.tan(fall*Math.PI/180);
  const e = Math.asin(Math.sqrt(Math.min(1,s2)))*180/Math.PI;
  const az = Math.atan(Math.tan(rise*Math.PI/180)/Math.sin(e*Math.PI/180))*180/Math.PI;
  console.log(`t=${t} rise=${rise} falls=${falls} => elevation=${e.toFixed(1)} azimuth=${az.toFixed(1)}`);
}
