// Bakes rigged Microsoft Rocketbox avatars (MIT) into compact posed meshes the renderer can stamp.
// usage: node tools/bake-people.mjs <rocketbox folder with avatars/ and anim/> <output folder> [avatar...]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { MeshoptSimplifier } from "meshoptimizer";

const noop = () => {};
globalThis.document ??= { createElementNS: () => ({ style: {}, addEventListener: noop, removeEventListener: noop }) };
globalThis.self ??= globalThis;
const warn = console.warn;
const quiet = (...args) => {
  const text = String(args[0]);
  if (!text.includes("FBXLoader") && !text.includes("PropertyBinding")) warn(...args);
};
console.warn = quiet;
console.error = quiet;

const [source, output, ...only] = process.argv.slice(2);
const HI_TRIANGLES = 3400;
const LO_TRIANGLES = 700;
const WALK_FRAMES = 8;
/** Quantisation of positions: 1 unit is 1/4096 of a metre. */
const QUANT = 4096;

const toBuffer = (path) => {
  const file = readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.length);
};
const loadFbx = (path) => new FBXLoader().parse(toBuffer(path), "");

function loadTexture(path) {
  const parsed = new TGALoader().parse(toBuffer(path));
  return parsed;
}

function sampleTexture(texture, u, v) {
  const x = Math.min(texture.width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * texture.width)));
  // TGALoader returns rows top first; FBX UVs count v up from the bottom.
  const y = Math.min(texture.height - 1, Math.max(0, Math.floor((1 - (((v % 1) + 1) % 1)) * texture.height)));
  const i = (y * texture.width + x) * 4;
  const d = texture.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

const luma = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Merges the avatar's split triangles into one welded mesh, remembering each vertex's source. */
function weld(root, textures) {
  const vertices = [];
  const lookup = new Map();
  const triangles = [];
  const meshes = [];
  root.traverse((node) => {
    if (node.isSkinnedMesh) meshes.push(node);
  });
  const rest = new Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }];
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      const name = (material?.name ?? "").toLowerCase();
      const kind = name.includes("opacity") ? "opacity" : name.includes("head") ? "head" : "body";
      const texture = textures[kind] ?? textures.body;
      const part = kind === "head" ? 1 : kind === "opacity" ? 2 : 0;
      for (let t = group.start; t + 2 < group.start + group.count; t += 3) {
        const corners = [];
        let alpha = 0;
        for (let k = 0; k < 3; k++) {
          const index = geometry.index ? geometry.index.getX(t + k) : t + k;
          rest.fromBufferAttribute(position, index);
          const sample = uv && texture ? sampleTexture(texture, uv.getX(index), uv.getY(index)) : [160, 160, 160, 255];
          alpha += sample[3] / 255 / 3;
          const key = `${meshes.indexOf(mesh)}:${part}:${Math.round(rest.x * 200)}:${Math.round(rest.y * 200)}:${Math.round(rest.z * 200)}`;
          let id = lookup.get(key);
          if (id === undefined) {
            id = vertices.length;
            lookup.set(key, id);
            vertices.push({ mesh, index, grey: luma(sample), part });
          }
          corners.push(id);
        }
        // Hair and lash cards are cut from an alpha map; drop what would have been invisible.
        if (kind === "opacity" && alpha < 0.45) continue;
        if (corners[0] !== corners[1] && corners[1] !== corners[2] && corners[0] !== corners[2]) triangles.push(...corners);
      }
    }
  }
  return { vertices, indices: new Uint32Array(triangles) };
}

function skinnedPositions(vertices) {
  const out = new Float32Array(vertices.length * 3);
  const v = new Vector3();
  vertices.forEach(({ mesh, index }, i) => {
    mesh.getVertexPosition(index, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  });
  return out;
}

function vertexNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    const [p, q, r] = [indices[i], indices[i + 1], indices[i + 2]];
    a.fromArray(positions, p * 3);
    b.fromArray(positions, q * 3);
    c.fromArray(positions, r * 3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    for (const n of [p, q, r]) {
      normals[n * 3] += ab.x;
      normals[n * 3 + 1] += ab.y;
      normals[n * 3 + 2] += ab.z;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  return normals;
}

function findBone(root, ...names) {
  let found = null;
  root.traverse((node) => {
    if (!found && node.isBone && names.some((name) => node.name.toLowerCase().endsWith(name))) found = node;
  });
  return found;
}

/** Points a bone at a world position by turning it, keeping everything below attached. */
function aimBone(bone, child, target) {
  const from = new Vector3(), to = new Vector3(), childAt = new Vector3();
  bone.getWorldPosition(from);
  child.getWorldPosition(childAt);
  const current = childAt.sub(from).normalize();
  const wanted = to.copy(target).sub(from).normalize();
  const turn = new Quaternion().setFromUnitVectors(current, wanted);
  const world = new Quaternion();
  bone.getWorldQuaternion(world);
  world.premultiply(turn);
  const parent = new Quaternion();
  bone.parent.getWorldQuaternion(parent);
  bone.quaternion.copy(parent.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/** Two-bone reach: shoulder, elbow, hand. The elbow is pushed out to the pole side. */
function reach(root, side, target, pole) {
  const upper = findBone(root, `${side}_upperarm`, `${side} upperarm`);
  const fore = findBone(root, `${side}_forearm`, `${side} forearm`);
  const hand = findBone(root, `${side}_hand`, `${side} hand`);
  if (!upper || !fore || !hand) return false;
  const s = new Vector3(), e = new Vector3(), h = new Vector3();
  upper.getWorldPosition(s);
  fore.getWorldPosition(e);
  hand.getWorldPosition(h);
  const a = s.distanceTo(e);
  const b = e.distanceTo(h);
  const toTarget = target.clone().sub(s);
  const d = Math.min(a + b - 0.5, toTarget.length());
  const axis = toTarget.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const side2 = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  const elbow = s.clone().addScaledVector(axis, along).addScaledVector(side2, height);
  aimBone(upper, fore, elbow);
  aimBone(fore, hand, s.clone().addScaledVector(axis, d));
  return true;
}

const ANIM = (gender, name) => join(source, "anim", `${gender}_${name}.max.fbx`);

async function bakeAvatar(name) {
  const gender = name.startsWith("Female") ? "f" : "m";
  const folder = join(source, "avatars", name);
  const textures = {};
  for (const file of readdirSync(folder)) {
    if (!file.endsWith("_color.tga")) continue;
    const kind = file.includes("head") ? "head" : file.includes("opacity") ? "opacity" : "body";
    textures[kind] = loadTexture(join(folder, file));
  }
  const root = loadFbx(join(folder, `${name}.fbx`));
  root.updateMatrixWorld(true);
  const { vertices, indices } = weld(root, textures);
  const restPositions = skinnedPositions(vertices);

  // Decide scale and facing from the rest pose.
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < restPositions.length; i += 3) {
    minY = Math.min(minY, restPositions[i + 1]);
    maxY = Math.max(maxY, restPositions[i + 1]);
    minZ = Math.min(minZ, restPositions[i + 2]);
    maxZ = Math.max(maxZ, restPositions[i + 2]);
  }
  const zUp = maxZ - minZ > (maxY - minY) * 1.5;
  if (zUp) throw new Error(`${name} is Z-up`);
  const restHeight = maxY - minY;
  const metres = (gender === "f" ? 1.58 : 1.69) / restHeight;

  await MeshoptSimplifier.ready;
  const simplifyPositions = new Float32Array(restPositions.length);
  for (let i = 0; i < restPositions.length; i++) simplifyPositions[i] = restPositions[i] * metres;
  const greys = new Float32Array(vertices.length);
  vertices.forEach((vertex, i) => (greys[i] = vertex.grey / 255));
  const simplified = (target) => {
    const [result] = MeshoptSimplifier.simplifyWithAttributes(indices, simplifyPositions, 3, greys, 1, [0.6], null, target * 3, 0.03, []);
    return result;
  };
  const lodIndices = { hi: simplified(HI_TRIANGLES), lo: simplified(LO_TRIANGLES) };
  const compact = (list) => {
    const remap = new Map();
    const used = [];
    const out = new Uint16Array(list.length);
    list.forEach((v, i) => {
      if (!remap.has(v)) {
        remap.set(v, used.length);
        used.push(v);
      }
      out[i] = remap.get(v);
    });
    return { used, indices: out };
  };
  const lods = { hi: compact(lodIndices.hi), lo: compact(lodIndices.lo) };

  const pelvis = findBone(root, "pelvis");
  const headBone = findBone(root, "_head", " head");
  const footL = findBone(root, "l_foot", "l foot");
  const toeL = findBone(root, "l_toe0", "l toe0");
  const handR = findBone(root, "r_hand", "r hand");
  const neck = findBone(root, "neck");
  const clavicleR = findBone(root, "r_clavicle", "r clavicle");

  const scale = metres;
  /** One still of the current skeleton, normalised: feet on y = 0, pelvis over the origin, facing +Z. */
  const capture = (lod, keepRoot = null) => {
    root.updateMatrixWorld(true);
    const positions = skinnedPositions(vertices);
    let lowest = Infinity;
    for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]);
    const p = new Vector3();
    pelvis.getWorldPosition(p);
    const foot = new Vector3(), toe = new Vector3();
    footL.getWorldPosition(foot);
    toeL.getWorldPosition(toe);
    const anchor = keepRoot ?? { x: p.x, z: p.z };
    const heading = keepRoot?.heading ?? Math.atan2(toe.x - foot.x, toe.z - foot.z);
    const c = Math.cos(heading), s = Math.sin(heading);
    const out = new Float32Array(lods[lod].used.length * 3);
    lods[lod].used.forEach((source, i) => {
      const x = positions[source * 3] - anchor.x;
      const z = positions[source * 3 + 2] - anchor.z;
      out[i * 3] = (x * c - z * s) * scale;
      out[i * 3 + 1] = (positions[source * 3 + 1] - lowest) * scale;
      out[i * 3 + 2] = (x * s + z * c) * scale;
    });
    let top = 0;
    for (let i = 1; i < out.length; i += 3) top = Math.max(top, out[i]);
    return { positions: out, top };
  };

  const setPose = (animationFile, fraction) => {
    const clip = loadFbx(animationFile).animations[0];
    const mixer = new AnimationMixer(root);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    return { mixer, clip, action };
  };

  const poses = {};
  const stills = (key, make) => {
    make();
    const hi = capture("hi");
    const lo = capture("lo");
    poses[key] = { hi, lo };
  };

  stills("stand", () => setPose(ANIM(gender, "idle_neutral_01"), 0.3));
  stills("look", () => setPose(ANIM(gender, "idle_look_around_01"), 0.45));
  stills("phone", () => setPose(ANIM(gender, "cell_phone_textmessage"), 0.5));
  stills("music", () => setPose(ANIM(gender, "headphones_idle"), 0.4));
  stills("bag", () => setPose(ANIM(gender, gender === "f" ? "hold_bag_idle_01" : "hold_bag_idle"), 0.4));
  stills("sit", () => setPose(ANIM(gender, "sit_chair_idle_neutral_01"), 0.3));
  stills("sitrest", () => setPose(ANIM(gender, "sit_chair_breathe_01"), 0.5));
  stills("strap", () => {
    setPose(ANIM(gender, "idle_neutral_01"), 0.3);
    const shoulder = new Vector3();
    clavicleR.getWorldPosition(shoulder);
    const head = new Vector3();
    headBone.getWorldPosition(head);
    const target = shoulder.clone();
    // The ring hangs a little ahead of the shoulder, about a hand above the head.
    target.y = head.y + 0.28 / scale;
    const forward = new Vector3();
    forward.subVectors(toeWorld(), footWorld()).setY(0).normalize();
    target.addScaledVector(forward, 0.08 / scale);
    reach(root, "r", target, new Vector3(0, -0.2, 0).addScaledVector(forward, -1));
    void neck;
    void handR;
  });
  stills("sitphone", () => {
    setPose(ANIM(gender, "sit_chair_idle_neutral_01"), 0.3);
    const chest = new Vector3();
    clavicleR.getWorldPosition(chest);
    const forward = new Vector3().subVectors(toeWorld(), footWorld()).setY(0).normalize();
    const target = chest.clone();
    target.y -= 0.2 / scale;
    target.addScaledVector(forward, 0.26 / scale);
    reach(root, "r", target, new Vector3(0, -1, 0));
  });

  function toeWorld() {
    return toeL.getWorldPosition(new Vector3());
  }
  function footWorld() {
    return footL.getWorldPosition(new Vector3());
  }

  // A walk cycle in the low level of detail, for the pavements. Root motion is held still.
  const walk = [];
  {
    const clip = loadFbx(ANIM(gender, "walk_neutral_01")).animations[0];
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      mixer.setTime((clip.duration * frame) / WALK_FRAMES);
      walk.push(capture("lo"));
    }
    walk.duration = clip.duration;
  }

  return {
    name,
    female: gender === "f",
    triangles: indices.length / 3,
    lods: Object.fromEntries(
      Object.entries(lods).map(([lod, data]) => [lod, { grey: data.used.map((v) => Math.round(vertices[v].grey)), part: data.used.map((v) => vertices[v].part), indices: data.indices }]),
    ),
    poses,
    walk,
    walkDuration: walk.duration,
  };
}

function packStill(still, indices) {
  const normals = vertexNormals(still.positions, indices);
  const count = still.positions.length / 3;
  const out = new DataView(new ArrayBuffer(count * 10));
  for (let i = 0; i < count; i++) {
    const o = i * 10;
    out.setInt16(o, Math.round(still.positions[i * 3] * QUANT), true);
    out.setInt16(o + 2, Math.round(still.positions[i * 3 + 1] * QUANT), true);
    out.setInt16(o + 4, Math.round(still.positions[i * 3 + 2] * QUANT), true);
    out.setInt8(o + 6, Math.round(normals[i * 3] * 127));
    out.setInt8(o + 7, Math.round(normals[i * 3 + 1] * 127));
    out.setInt8(o + 8, Math.round(normals[i * 3 + 2] * 127));
  }
  return new Uint8Array(out.buffer);
}

const names = only.length ? only : readdirSync(join(source, "avatars")).sort();
const chunks = [];
let offset = 0;
const push = (bytes) => {
  const start = offset;
  chunks.push(bytes);
  offset += bytes.byteLength;
  if (offset % 2) {
    chunks.push(new Uint8Array(1));
    offset += 1;
  }
  return start;
};

const index = { quant: QUANT, stride: 10, avatars: [] };
for (const name of names) {
  const started = Date.now();
  const avatar = await bakeAvatar(name);
  const entry = { name, female: avatar.female, lods: {}, poses: {}, walk: [], walkDuration: avatar.walkDuration };
  for (const lod of ["hi", "lo"]) {
    const data = avatar.lods[lod];
    entry.lods[lod] = {
      vertices: data.grey.length,
      triangles: data.indices.length / 3,
      indices: push(new Uint8Array(data.indices.buffer, data.indices.byteOffset, data.indices.byteLength)),
      grey: push(Uint8Array.from(data.grey)),
      part: push(Uint8Array.from(data.part)),
    };
  }
  for (const [pose, still] of Object.entries(avatar.poses)) {
    entry.poses[pose] = { hi: push(packStill(still.hi, avatar.lods.hi.indices)), lo: push(packStill(still.lo, avatar.lods.lo.indices)), top: +still.hi.top.toFixed(3) };
  }
  for (const still of avatar.walk) entry.walk.push(push(packStill(still, avatar.lods.lo.indices)));
  index.avatars.push(entry);
  console.log(`${name}: source ${avatar.triangles} tris, hi ${entry.lods.hi.triangles}, lo ${entry.lods.lo.triangles}, height ${entry.poses.stand.top}m, sit ${entry.poses.sit.top}m (${Date.now() - started} ms)`);
}

mkdirSync(output, { recursive: true });
writeFileSync(join(output, "people.bin"), Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))));
writeFileSync(join(output, "people.json"), JSON.stringify(index));
console.log(`people.bin ${(offset / 1048576).toFixed(2)} MB, ${index.avatars.length} avatars`);
