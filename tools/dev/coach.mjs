// Opens a coach (1 to 6, 0 for the cab) with the camera snapped onto it and shoots the page, bubbles included.
// usage: coach.mjs name coach [metres across] [width height] [query] [waitMs]   SCALE=2 for a sharper shot. Needs the dev server.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [name, coach = "2", vw = "17", w = "1500", h = "900", query = "", wait = "2500"] = process.argv.slice(2);
const out = `/home/outversal/Projects/dhaka-metro-train-of-thought/shots/${name}.png`;
const actions = [["wait",800],["until","window.__metro && window.__metro.world.loaded>0 && window.__metro.world.pending===0",110000],["wait",800],
["eval",`const m=window.__metro; m.focusOn(m.targets[${coach}]); const c=m.train.cars[Math.max(0,${coach}-1)]; if(${coach}>0) c.openness=1; else c.cabin.openness=1; m.aim.width=${vw}; m.rig.target.width=${vw}; m.rig.target.azimuth=26; m.rig.target.elevation=27.5; m.rig.target.focus.copy(m.aim.focus); m.rig.snap(); 1`],["wait",+wait],["shot",out,"body",1]];
const file = `/tmp/metro-tools/o-${name}.json`;
writeFileSync(file, JSON.stringify(actions));
const r = spawnSync("node", [process.env.HOME + "/.claude/skills/anatomy/scripts/drive.mjs", `http://127.0.0.1:5180/?seed=7&notour=1&${query}`, "--actions", file, "--width", w, "--height", h, "--scale", process.env.SCALE ?? "1"], { encoding: "utf8", timeout: 170000 });
console.log(r.stdout.split("\n").slice(-4).join("\n"), r.stderr.slice(0,500));
