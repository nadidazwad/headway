// usage: film.mjs <url> <out-prefix> [frames] [everyNth] [width] [height] [gpu]
// Records real-GPU frames with Chrome's screencast, for judging motion. Writes <out-prefix>-NN.jpg.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
const [url, out, count = "16", nth = "6", width = "1400", height = "1000", gpu = "intel"] = process.argv.slice(2);
const pw = join(homedir(), ".cache/ms-playwright");
const dir = readdirSync(pw).find((n) => n.startsWith("chromium-"));
const bin = join(pw, dir, "chrome-linux64", "chrome");
const env = { ...process.env };
if (gpu === "nvidia") Object.assign(env, { __NV_PRIME_RENDER_OFFLOAD: "1", __GLX_VENDOR_LIBRARY_NAME: "nvidia", __VK_LAYER_NV_optimus: "NVIDIA_only" });
const port = 9300 + Math.floor(Math.random() * 400);
const p = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "metro-film-"))}`, `--window-size=${width},${height}`, "--no-first-run", "--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", "about:blank"], { env, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json(); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const frames = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Page.screencastFrame") {
    frames.push({ data: m.params.data, t: m.params.metadata.timestamp });
    send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: +width, height: +height, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 200; i++) { if (await ev("!!(window.__metro && window.__metro.world.loaded>0 && window.__metro.world.pending===0)")) break; await sleep(300); }
await sleep(1500);
if (process.env.PRE) await ev(process.env.PRE);
await send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: +nth });
while (frames.length < +count) await sleep(50);
await send("Page.stopScreencast");
const t0 = frames[0].t;
frames.slice(0, +count).forEach((f, i) => writeFileSync(`${out}-${String(i).padStart(2, "0")}.jpg`, Buffer.from(f.data, "base64")));
console.log("frames", Math.min(frames.length, +count), "times", frames.slice(0, +count).map((f) => (f.t - t0).toFixed(2)).join(" "));
p.kill("SIGKILL");
process.exit(0);
