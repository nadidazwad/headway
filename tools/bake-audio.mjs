#!/usr/bin/env node
// Cuts the downloaded recordings in asset-src/audio/<freesound id>/ down to what the site plays, level-matched.
// usage: node tools/bake-audio.mjs   Needs ffmpeg. Writes public/audio/*.mp3 and prints the total size.
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";

const OUT = "public/audio";
const RECIPES = [
  // Beds: long and stereo, crossfaded at random in the engine, so they never loop.
  { name: "bed-bridge", id: 466271, from: 12, length: 55, stereo: true, lufs: -23, kbps: 96, filter: "highpass=f=35" },
  { name: "bed-street", id: 715399, from: 0, length: 40, stereo: true, lufs: -23, kbps: 96, filter: "highpass=f=35" },
  // One-shots: mono, and only the band each is known by, so no second street comes along with it.
  { name: "cng", id: 658928, from: 11, length: 9, lufs: -20, kbps: 56, filter: "highpass=f=55,lowpass=f=1900" },
  { name: "horn-long", id: 403981, from: 0.3, length: 3, lufs: -20, kbps: 48, filter: "highpass=f=180", fade: 0.04 },
  { name: "horn-pass", id: 684719, from: 9, length: 2.6, lufs: -20, kbps: 48, filter: "highpass=f=180", fade: 0.08 },
  { name: "bell-1", id: 245287, from: 3.6, length: 1.1, lufs: -22, kbps: 48, filter: "highpass=f=1300", fade: 0.012 },
  { name: "bell-2", id: 245287, from: 7.42, length: 1.2, lufs: -22, kbps: 48, filter: "highpass=f=1300", fade: 0.012 },
  { name: "bell-3", id: 245287, from: 12.62, length: 1.2, lufs: -22, kbps: 48, filter: "highpass=f=1300", fade: 0.012 },
  { name: "crows", id: 452714, from: 0, length: 12.5, lufs: -28, kbps: 48, filter: "highpass=f=250", fade: 0.4 },
];

const run = (args) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" });
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const { name, id, from, length, stereo, lufs, kbps, filter, fade = 0 } of RECIPES) {
  const source = ["-ss", String(from), "-t", String(length), "-i", `asset-src/audio/${id}/source.mp3`];
  const measured = run([...source, "-af", `${filter},ebur128=framelog=quiet`, "-f", "null", "-"]);
  const loudness = Number(/I:\s+(-?[\d.]+) LUFS/.exec(measured.stderr)?.[1]);
  const fades = fade ? `,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, length - fade * 4)}:d=${fade * 4}` : "";
  const chain = `${filter},volume=${(lufs - loudness).toFixed(2)}dB,alimiter=limit=0.8:level=false${fades}`;
  const file = `${OUT}/${name}.mp3`;
  const made = run(["-y", ...source, "-af", chain, "-ac", stereo ? "2" : "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-map_metadata", "-1", "-id3v2_version", "0", file]);
  if (made.status !== 0) throw new Error(made.stderr);
  const bytes = statSync(file).size;
  total += bytes;
  console.log(`${name.padEnd(12)} ${(bytes / 1024).toFixed(0).padStart(5)} KB  was ${loudness.toFixed(1)} LUFS`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
