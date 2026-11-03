// Diagnostic: prints, per sampled walk frame, the heading the bake used against a heading taken from the hips.
// usage: node tools/dev/walk-headings.mjs asset-src/rocketbox Male_Adult_15 Female_Adult_06
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AnimationMixer, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
const noop = () => {};
globalThis.document ??= { createElementNS: () => ({ style: {}, addEventListener: noop, removeEventListener: noop }) };
globalThis.self ??= globalThis;
console.warn = () => {};
console.error = () => {};
const [source, ...names] = process.argv.slice(2);
const load = (p) => { const f = readFileSync(p); return new FBXLoader().parse(f.buffer.slice(f.byteOffset, f.byteOffset + f.length), ""); };
const bone = (root, ...tails) => { let found = null; root.traverse((n) => { if (!found && n.isBone && tails.some((t) => n.name.toLowerCase().endsWith(t))) found = n; }); return found; };
const deg = (r) => (r * 180) / Math.PI;
for (const name of names) {
  const gender = name.startsWith("Female") ? "f" : "m";
  const root = load(join(source, "avatars", name, `${name}.fbx`));
  const foot = bone(root, "l_foot", "l foot"), toe = bone(root, "l_toe0", "l toe0");
  const thighL = bone(root, "l_thigh", "l thigh"), thighR = bone(root, "r_thigh", "r thigh"), pelvis = bone(root, "pelvis");
  const clip = load(join(source, "anim", `${gender}_walk_neutral_01.max.fbx`)).animations[0];
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  const a = new Vector3(), b = new Vector3();
  const rows = [];
  for (let frame = 0; frame < 16; frame++) {
    mixer.setTime((clip.duration * frame) / 16);
    root.updateMatrixWorld(true);
    foot.getWorldPosition(a); toe.getWorldPosition(b);
    const used = Math.atan2(b.x - a.x, b.z - a.z);
    thighL.getWorldPosition(a); thighR.getWorldPosition(b);
    // Across the hips, right to left, turned a quarter: which way the body faces.
    const hips = Math.atan2(a.z - b.z, -(a.x - b.x));
    pelvis.getWorldPosition(a);
    rows.push(`${String(frame).padStart(2)}  bake heading ${deg(used).toFixed(0).padStart(5)}   hips ${deg(hips).toFixed(0).padStart(5)}   pelvis x ${a.x.toFixed(1).padStart(7)} y ${a.y.toFixed(1).padStart(7)} z ${a.z.toFixed(1).padStart(7)}`);
  }
  console.log(`${name}: clip ${clip.duration.toFixed(3)} s, ${clip.tracks.length} tracks`);
  console.log(rows.join("\n"));
}
