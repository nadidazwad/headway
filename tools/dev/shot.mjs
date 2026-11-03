#!/usr/bin/env node
// usage: shot.mjs name 'query' [width height scale]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("/tmp/metro-tools", { recursive: true });
const [name, query = "", width = "1400", height = "1000", scale = "1", extra = ""] = process.argv.slice(2);
const out = `/home/outversal/Projects/dhaka-metro-train-of-thought/shots/${name}.png`;
const actions = [
  ["wait", 1000],
  ["until", "window.__metro && window.__metro.world.loaded>0 && window.__metro.world.pending===0", 110000],
  ["wait", 1800],
  ...(extra ? JSON.parse(extra) : []),
  ["eval", "JSON.stringify({tris:window.__metro.world.triangles,loaded:window.__metro.world.loaded})"],
  ["shot", out, "#world", 1],
];
const file = `/tmp/metro-tools/a-${name}.json`;
writeFileSync(file, JSON.stringify(actions));
const r = spawnSync("node", [process.env.HOME + "/.claude/skills/anatomy/scripts/drive.mjs", `http://127.0.0.1:5180/?seed=7&freeze=1&${query}`, "--actions", file, "--width", width, "--height", height, "--scale", scale], { encoding: "utf8", timeout: 170000 });
console.log(r.stdout.split("\n").slice(-8).join("\n"), r.stderr);
