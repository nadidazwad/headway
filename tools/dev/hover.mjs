#!/usr/bin/env node
// Rests a real mouse on every thought bubble that has a close neighbour, and counts how often the open bubble changes.
// A hand that has stopped must change it once at most: anything more is bubbles flipping on their own.
// usage: tools/dev/hover.mjs [seed] [coaches, comma separated]   Needs the dev server.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
const seed = process.argv[2] ?? "7";
const coaches = (process.argv[3] ?? "1,2,3,4,5,6").split(",").map(Number);
const HOLD = 2600;
const pw = join(homedir(), ".cache/ms-playwright");
const bin = join(pw, readdirSync(pw).find((n) => n.startsWith("chromium-")), "chrome-linux64", "chrome");
const port = 9800 + Math.floor(Math.random() * 90);
const chrome = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "metro-hover-"))}`, "--window-size=1440,900", "--no-first-run", "--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:5180/?seed=${seed}&notour=1&pr=1`)}`, { method: "PUT" })).json(); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 300; i++) { if (await ev("!!(window.__metro && window.__metro.world.pending===0 && window.__metro.world.loaded>0)")) break; await sleep(300); }
await sleep(1000);
const openNow = () => ev("[...document.querySelectorAll('.bubble')].findIndex((b)=>b.classList.contains('open'))");
const faces = () => ev("[...document.querySelectorAll('.bubble')].map((b)=>{const r=b.querySelector('.bubble-face').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})");
let worst = 0, tried = 0, flipping = 0, wrong = 0;
for (const coach of coaches) {
  await mouse(4, 4);
  await ev(`window.__metro.focusOn(window.__metro.targets[${coach}]);1`);
  await sleep(4600);
  const start = await faces();
  const packed = start.map((a, i) => [i, Math.min(...start.map((b, j) => (i === j ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1]))))]).filter(([, near]) => near < 120).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([i]) => i);
  const line = [];
  for (const i of packed) {
    await mouse(4, 4);
    await sleep(150);
    // Faces can be elsewhere by now, so look again just before reaching for this one.
    const [x, y] = (await faces())[i];
    if (x < 2 || x > 1438 || y < 2 || y > 898) continue;
    await mouse(x - 6, y - 3);
    await mouse(x, y);
    let last = await openNow();
    let changes = 0;
    const end = Date.now() + HOLD;
    while (Date.now() < end) {
      await sleep(50);
      const now = await openNow();
      if (now !== last) { changes++; last = now; }
    }
    tried++;
    if (changes > 1) flipping++;
    worst = Math.max(worst, changes);
    line.push(`${i}:${changes}`);
    const underHand = await ev(`(()=>{const e=document.elementFromPoint(${x},${y});const b=e&&e.closest('.bubble');return b?[...document.querySelectorAll('.bubble')].indexOf(b):-1})()`);
    if (underHand !== last) wrong++;
  }
  console.log(`coach ${coach}: ${start.length} bubbles, ${packed.length} packed; changes while the hand rests: ${line.join(" ") || "-"}`);
}
console.log(`seed ${seed}: ${tried} tried, ${flipping} flipped on their own, worst ${worst} changes in ${HOLD / 1000} s, ${wrong} ended on something other than what is under the hand`);
chrome.kill("SIGKILL");
process.exit(0);
