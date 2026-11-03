// usage: perf.mjs <url> <width> <height> <gpu:intel|nvidia|sw> [seconds]
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
const [url, width = "1440", height = "900", gpu = "intel", seconds = "8"] = process.argv.slice(2);
const pw = join(homedir(), ".cache/ms-playwright");
const dir = readdirSync(pw).find((n) => n.startsWith("chromium-"));
const bin = join(pw, dir, "chrome-linux64", "chrome");
const env = { ...process.env };
if (gpu === "nvidia") Object.assign(env, { __NV_PRIME_RENDER_OFFLOAD: "1", __GLX_VENDOR_LIBRARY_NAME: "nvidia", __VK_LAYER_NV_optimus: "NVIDIA_only" });
const uncapped = process.env.UNCAPPED ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [];
const flags0 = gpu === "sw" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
const flags = [...flags0, ...uncapped];
const port = 9300 + Math.floor(Math.random() * 400);
const p = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "metro-perf-"))}`, `--window-size=${width},${height}`, "--no-first-run", ...flags, "about:blank"], { env, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json()); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: +width, height: +height, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 200; i++) { const ok = await ev("!!(window.__metro && window.__metro.world.loaded>0 && window.__metro.world.pending===0)"); if (ok) break; await sleep(300); }
await sleep(1500);
if (process.env.PRE) await ev(process.env.PRE);
const renderer = await ev(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
const result = await ev(`new Promise(res=>{const t=[];let l=performance.now();const end=l+${+seconds*1000};const gl=window.__metro.pipeline.renderer.getContext();const px=new Uint8Array(4);function f(n){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);t.push(n-l);l=n;if(n<end)requestAnimationFrame(f);else{t.sort((a,b)=>a-b);res({frames:t.length,avg:t.reduce((a,b)=>a+b,0)/t.length,p50:t[t.length>>1],p95:t[Math.floor(t.length*.95)],p99:t[Math.floor(t.length*.99)]})}}requestAnimationFrame(f)})`);
const info = await ev(`(()=>{const m=window.__metro,i=m.pipeline.renderer.info;return {tris:m.world.triangles,drawn:m.world.drawnTriangles,chunks:m.world.loaded,geoms:i.memory.geometries,pr:m.pipeline.pixelRatio}})()`);
const post = process.env.POST ? await ev(process.env.POST) : undefined;
console.log(JSON.stringify({ gpu, renderer, ...result, ...info, post }));
p.kill("SIGKILL");
process.exit(0);
