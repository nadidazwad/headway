// Measures shimmer: slides the frozen city in sub-pixel steps on a real GPU, undoes the slide, and scores what still changes.
// usage: flicker.mjs <out-prefix> [query] [steps] [metres] [gpu] [focus]   Prints a score per region and writes a heat map.
// focus: "x0,y0,x1,y1;x0,y0,x1,y1" scores those screen rectangles together, to watch one thing such as the piers.
// Several can be compared by name: "tree=x0,y0,x1,y1|pier=x0,y0,x1,y1". Use something known to be steady as a control: the score tracks edge contrast too.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
const [out, query = "seed=11&at=2085", stepsArg = "10", stepArg = "0.0713", gpu = "intel", focusArg = ""] = process.argv.slice(2);
const steps = +stepsArg, step = +stepArg, W = 1400, H = 1000, AZ = 35, EL = 23.5, VIEW = Number(process.env.VIEW ?? 62);
const url = `http://127.0.0.1:5180/?notour=1&freeze=1&az=${AZ}&el=${EL}&w=${VIEW}&pr=1&${query}`;
const pw = join(homedir(), ".cache/ms-playwright");
const bin = join(pw, readdirSync(pw).find((n) => n.startsWith("chromium-")), "chrome-linux64", "chrome");
const env = { ...process.env };
if (gpu === "nvidia") Object.assign(env, { __NV_PRIME_RENDER_OFFLOAD: "1", __GLX_VENDOR_LIBRARY_NAME: "nvidia", __VK_LAYER_NV_optimus: "NVIDIA_only" });
const port = 9700 + Math.floor(Math.random() * 200);
const p = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "metro-flick-"))}`, `--window-size=${W},${H}`, "--no-first-run", "--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", "about:blank"], { env, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json(); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 300; i++) { if (await ev("!!(window.__metro && window.__metro.world.loaded>0 && window.__metro.world.pending===0)")) break; await sleep(300); }
await sleep(1500);
// Only what slides rigidly may stay: the train and traffic hold still in this test, and so would read as movement.
await ev("(()=>{const m=window.__metro;m.train.group.visible=false;m.traffic.group.visible=false;m.opposing.group.visible=false;document.querySelector('#overlay').style.display='none';return 1})()");
await sleep(600);
const pxPerMetre = W / VIEW;
const az = (AZ * Math.PI) / 180, el = (EL * Math.PI) / 180;
const sx = Math.cos(az) * pxPerMetre, sy = Math.sin(az) * Math.sin(el) * pxPerMetre;
const stills = [];
for (let i = 0; i < steps; i++) {
  await ev(`window.__metro.skip(${step})`);
  await ev("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const png = PNG.sync.read(Buffer.from(shot.data, "base64"));
  const grey = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) grey[k] = 0.3 * png.data[k * 4] + 0.59 * png.data[k * 4 + 1] + 0.11 * png.data[k * 4 + 2];
  stills.push({ grey, dx: sx * step * i, dy: sy * step * i });
}
p.kill("SIGKILL");
// BLUR=1 looks at the finest grain, for the stair-step crawl that a wider window averages away.
const B = Number(process.env.BLUR ?? 6);
const blurred = stills.map(({ grey }) => {
  const sum = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum[(y + 1) * (W + 1) + x + 1] = grey[y * W + x] + sum[y * (W + 1) + x + 1] + sum[(y + 1) * (W + 1) + x] - sum[y * (W + 1) + x];
  return { sum };
});
const at = (i, x, y) => { const { sum } = blurred[i]; const x0 = x - B, y0 = y - B, x1 = x + B, y1 = y + B; return (sum[(y1 + 1) * (W + 1) + x1 + 1] - sum[y0 * (W + 1) + x1 + 1] - sum[(y1 + 1) * (W + 1) + x0] + sum[y0 * (W + 1) + x0]) / ((2 * B + 1) ** 2); };
// The slide is undone to a fraction of a pixel: a whole-pixel undo leaves every sharp edge up to half a pixel out, which scores as shimmer however stable the edge is.
const atFraction = (i, x, y) => {
  const fx = Math.min(W - B - 3, Math.max(B + 1, x)), fy = Math.min(H - B - 3, Math.max(B + 1, y));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  return (at(i, x0, y0) * (1 - tx) + at(i, x0 + 1, y0) * tx) * (1 - ty) + (at(i, x0, y0 + 1) * (1 - tx) + at(i, x0 + 1, y0 + 1) * tx) * ty;
};
const heat = new PNG({ width: W, height: H });
const regions = { all: [[0, 0, W, H]], upper: [[0, 0, W, 330]], middle: [[0, 330, W, 660]], lower: [[0, 660, W, H]] };
for (const [i, group] of focusArg.split("|").filter(Boolean).entries()) {
  const [name, rects] = group.includes("=") ? group.split("=") : [i ? `focus${i}` : "focus", group];
  regions[name] = rects.split(";").map((rect) => rect.split(",").map(Number));
}
const totals = Object.fromEntries(Object.keys(regions).map((k) => [k, { sum: 0, n: 0, hot: 0 }]));
const margin = Math.ceil(sx * step * steps) + B + 2;
for (let y = margin; y < H - margin; y += 2) for (let x = margin; x < W - margin; x += 2) {
  let mean = 0, sq = 0;
  for (let i = 0; i < steps; i++) { const v = atFraction(i, x + stills[i].dx, y - stills[i].dy); mean += v; sq += v * v; }
  mean /= steps;
  const std = Math.sqrt(Math.max(0, sq / steps - mean * mean));
  for (const [k, rects] of Object.entries(regions)) if (rects.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) { totals[k].sum += std; totals[k].n++; if (std > 0.6) totals[k].hot++; }
  const v = Math.max(0, 255 - std * 200);
  for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const o = ((y + ay) * W + x + ax) * 4; heat.data[o] = heat.data[o + 1] = heat.data[o + 2] = v; heat.data[o + 3] = 255; }
}
writeFileSync(`${out}-heat.png`, PNG.sync.write(heat));
console.log(Object.entries(totals).map(([k, t]) => `${k}: mean ${(t.sum / t.n).toFixed(3)} hot ${((100 * t.hot) / t.n).toFixed(2)}%`).join(" | "));
process.exit(0);
