import { spawnSync } from "node:child_process"; import { writeFileSync } from "node:fs";
import { mkdirSync as __mk } from "node:fs"; __mk("/tmp/metro-tools", { recursive: true });
const [name, query, w = "1500", h = "1000"] = process.argv.slice(2);
const out = `/home/outversal/Projects/dhaka-metro-train-of-thought/shots/${name}.png`;
writeFileSync(`/tmp/metro-tools/s-${name}.json`, JSON.stringify([["until","window.__sheet===true",60000],["wait",1500],["shot",out,"canvas",1]]));
const r = spawnSync("node",[process.env.HOME+"/.claude/skills/anatomy/scripts/drive.mjs",`http://127.0.0.1:5180/dev/props.html?${query}`,"--actions",`/tmp/metro-tools/s-${name}.json`,"--width",w,"--height",h],{encoding:"utf8",timeout:170000});
console.log(r.stdout.split("\n").slice(-4).join("\n"), r.stderr.slice(0,400));
