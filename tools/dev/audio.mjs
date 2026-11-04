#!/usr/bin/env node
// Renders each state of the soundscape offline in a real browser, then measures it: peak, loudness, clicks and a spectrogram.
// usage: tools/dev/audio.mjs [out-dir]   Writes <state>.wav and <state>.png and prints a table. Needs the dev server and ffmpeg.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
const out = process.argv[2] ?? "/tmp/headway-audio";
mkdirSync(out, { recursive: true });

const WIDE = [[0, 62, 0]], CLOSE = [[0, 18, 0]], OPEN = [[0, 17, 1]];
const STATES = {
  wide: { seconds: 40, seed: 11, view: WIDE },
  close: { seconds: 30, seed: 12, view: CLOSE },
  open: { seconds: 30, seed: 13, view: OPEN },
  cabin: { seconds: 15, seed: 14, view: OPEN, alone: true },
  stopped: { seconds: 10, seed: 15, view: CLOSE, speed: 0 },
  // Into a coach and back out, to see the mix move and listen for any step in it.
  journey: { seconds: 30, seed: 16, view: [[0, 62, 0], [6, 62, 0], [10, 18, 0], [13, 17, 0], [15, 17, 1], [21, 17, 1], [23, 17, 0], [27, 62, 0], [30, 62, 0]] },
  sfx: { seconds: 10, seed: 17, view: CLOSE, interfaceSounds: [[1, "hover"], [2, "hover"], [3, "open"], [5, "thought"], [7, "close"]] },
  // The same stretch of line at double speed: the rail rhythm must halve, since it comes from distance alone.
  railsAtCruise: { seconds: 20, seed: 12, view: CLOSE, solo: "train" },
  railsAtDouble: { seconds: 20, seed: 12, view: CLOSE, solo: "train", speed: 21 },
  // Nothing random, so anything sudden in here can only be a seam: 120 s holds many crossfades.
  seams: { seconds: 120, seed: 18, view: WIDE, solo: "beds" },
};

const pw = join(homedir(), ".cache/ms-playwright");
const bin = join(pw, readdirSync(pw).find((n) => n.startsWith("chromium-")), "chrome-linux64", "chrome");
const port = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "metro-audio-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("http://127.0.0.1:5180/dev/audio.html")}`, { method: "PUT" })).json(); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result?.value; };
for (let i = 0; i < 100; i++) { if (await ev("!!window.__ready")) break; await sleep(200); }

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const only = process.argv.slice(3);
console.log("state           peak dBFS  LUFS   LRA  <200Hz  200-2k  >2k (dB)  sudden steps");
for (const [name, job] of Object.entries(STATES)) {
  if (only.length && !only.includes(name)) continue;
  const b64 = await ev(`window.__render(${JSON.stringify(job)})`);
  const wav = Buffer.from(b64, "base64");
  const file = join(out, `${name}.wav`);
  writeFileSync(file, wav);
  const samples = new Float32Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 4);
  let peak = 0;
  for (const v of samples) if (Math.abs(v) > peak) peak = Math.abs(v);
  // A click is a jump between samples far larger than anything the 40 ms around it does.
  let steps = 0;
  const left = new Float32Array(samples.length / 2);
  for (let i = 0; i < left.length; i++) left[i] = samples[i * 2];
  const WINDOW = 1764;
  for (let start = WINDOW; start + WINDOW < left.length; start += WINDOW) {
    let sum = 0, biggest = 0;
    for (let i = start; i < start + WINDOW; i++) { const d = Math.abs(left[i] - left[i - 1]); sum += d; if (d > biggest) biggest = d; }
    if (biggest > 0.04 && biggest > (sum / WINDOW) * 14) steps++;
  }
  const measure = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(measure)?.[1] ?? "?";
  const lra = /LRA:\s+([\d.]+) LU/.exec(measure)?.[1] ?? "?";
  const band = (af) => /mean_volume: (-?[\d.]+)/.exec(spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${af},volumedetect`, "-f", "null", "-"], { encoding: "utf8" }).stderr)?.[1] ?? "?";
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-lavfi", "showspectrumpic=s=900x240:legend=0:scale=log:fscale=log:gain=4", join(out, `${name}.png`)]);
  console.log(`${name.padEnd(15)} ${db(peak).toFixed(1).padStart(8)}  ${lufs.padStart(6)} ${lra.padStart(5)}  ${band("lowpass=f=200").padStart(6)}  ${band("highpass=f=200,lowpass=f=2000").padStart(6)}  ${band("highpass=f=2000").padStart(6)}   ${steps}`);
}
chrome.kill("SIGKILL");
process.exit(0);
