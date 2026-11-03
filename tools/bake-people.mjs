// Bakes rigged Microsoft Rocketbox avatars (MIT) into compact posed meshes the renderer can stamp.
// usage: node tools/bake-people.mjs <rocketbox folder with avatars/ and anim/> <output folder> [avatar...]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { readSkeleton, tailor } from "./garments.mjs";

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
const FAR_TRIANGLES = 260;
const WALK_FRAMES = 8;
/** Quantisation of positions: 1 unit is 1/4096 of a metre. */
const QUANT = 4096;

/**
 * Who is in the city, and in what. No `piece` means the avatar's own clothes are right as they
 * stand: Rocketbox has a true burka, a hijab with a long robe, a white panjabi with a cap, and plenty
 * of men in shirts. Everyone else is re-dressed by garments.mjs. Greys are 0 to 255; everything but
 * the train is grey, so one outfit reads from the next by tone and by shape.
 */
const CAST = [
  { avatar: "Female_Adult_10", label: "burka" },
  { avatar: "Female_Adult_06", label: "burka" },
  { avatar: "Female_Adult_05", label: "burka", piece: "burka", upper: 40, hijab: true, scarf: 48, drape: 0.2 },
  { avatar: "Female_Adult_14", label: "burka", piece: "burka", upper: 96, hijab: true, scarf: 112, drape: 0.2 },
  { avatar: "Female_Adult_02", label: "shalwar", piece: "shalwar", upper: 170, lower: 104, orna: 214 },
  { avatar: "Female_Adult_11", label: "shalwar", piece: "shalwar", upper: 108, lower: 192, orna: 150 },
  { avatar: "Female_Adult_15", label: "shalwar", piece: "shalwar", upper: 208, lower: 92, hijab: true, scarf: 150 },
  { avatar: "Female_Adult_14", label: "shalwar", piece: "shalwar", upper: 78, lower: 164, hijab: true, scarf: 196 },
  { avatar: "Female_Adult_07", label: "shari", piece: "shari", upper: 196, lower: 120, border: 66 },
  { avatar: "Female_Adult_11", label: "shari", piece: "shari", upper: 118, lower: 66, border: 214 },
  { avatar: "Female_Adult_02", label: "shari", piece: "shari", upper: 232, lower: 190, border: 92 },
  { avatar: "Female_Adult_08", label: "kurta", piece: "kurta", upper: 156, lower: 58 },
  { avatar: "Female_Adult_15", label: "kurta", piece: "kurta", upper: 214, lower: 66, hijab: true, scarf: 124 },
  { avatar: "Female_Adult_05", label: "top" },
  { avatar: "Female_Adult_07", label: "top" },
  { avatar: "Female_Adult_08", label: "top" },
  { avatar: "Male_Adult_08", label: "shirt" },
  { avatar: "Male_Adult_14", label: "shirt" },
  { avatar: "Male_Adult_09", label: "tshirt" },
  { avatar: "Male_Adult_11", label: "tshirt" },
  { avatar: "Male_Adult_20", label: "tshirt" },
  { avatar: "Male_Adult_03", label: "suit" },
  { avatar: "Male_Adult_06", label: "suit", piece: "suit", upper: 54, lower: 48 },
  { avatar: "Male_Adult_15", label: "panjabi" },
  { avatar: "Male_Adult_02", label: "panjabi", piece: "panjabi", upper: 232, lower: 238, cap: 244 },
  { avatar: "Male_Adult_17", label: "panjabi", piece: "panjabi", upper: 126, lower: 226 },
  { avatar: "Male_Adult_06", label: "panjabi", piece: "panjabi", upper: 186, lower: 60 },
  { avatar: "Male_Adult_02", label: "lungi", piece: "lungi", upper: 206, lower: 104 },
];
const castId = (member) => member.avatar + (member.piece ? `-${member.label}` : "");
/** The rail is 2 m up and the ring hangs below it: a real reach for a short passenger. */
const RING_HEIGHT = 1.73;

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
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    const boneNames = mesh.skeleton.bones.map((bone) => bone.name.replace(/^bip0?1_?/i, "").toLowerCase());
    const dominantBone = (index) => {
      let best = 0;
      let bestWeight = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(index, k);
        if (w > bestWeight) {
          bestWeight = w;
          best = skinIndex.getComponent(index, k);
        }
      }
      return boneNames[best] ?? "";
    };
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
            vertices.push({ mesh, index, grey: luma(sample), part, bone: dominantBone(index) });
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

const SKIN_BONES = /head|hand|finger|thumb|masseter|cheek|lip|eye|brow|jaw|nose|tongue|caninus|mouth/;

async function bakeAvatar(member) {
  const name = member.avatar;
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

  const bone = (...names) => findBone(root, ...names);
  const skeletonBones = {
    pelvis: bone("pelvis"),
    spine: bone("_spine"),
    spine1: bone("spine1"),
    spine2: bone("spine2"),
    neck: bone("_neck"),
    head: bone("_head", " head"),
    leye: bone("leye"),
    reye: bone("reye"),
    claL: bone("l_clavicle"),
    claR: bone("r_clavicle"),
    upL: bone("l_upperarm"),
    upR: bone("r_upperarm"),
    foreL: bone("l_forearm"),
    foreR: bone("r_forearm"),
    handL: bone("l_hand"),
    handR: bone("r_hand"),
    thighL: bone("l_thigh"),
    thighR: bone("r_thigh"),
    calfL: bone("l_calf"),
    calfR: bone("r_calf"),
    footL: bone("l_foot"),
    footR: bone("r_foot"),
  };
  const headRest = skeletonBones.head.getWorldQuaternion(new Quaternion());
  const rawPerMetre = 1 / metres;
  const skeleton = () => {
    root.updateMatrixWorld(true);
    return readSkeleton(skeletonBones, rawPerMetre, headRest);
  };

  // South Asian skin and black hair, whatever the avatar was made with.
  vertices.forEach((vertex) => {
    if (vertex.part === 2) vertex.grey = Math.min(vertex.grey, 58);
    else if (SKIN_BONES.test(vertex.bone) || (vertex.bone === "neck" && !member.hijab)) vertex.grey *= 0.8;
  });
  const faceGreys = vertices.filter((vertex) => vertex.part === 1).map((vertex) => vertex.grey).sort((a, b) => a - b);
  const skinGrey = Math.round(faceGreys[faceGreys.length >> 1] ?? 120);
  // Under new clothes, a wrist must be a wrist, not the cuff of whatever the avatar came in.
  if (member.piece) {
    vertices.forEach((vertex) => {
      if (/hand|finger|thumb/.test(vertex.bone)) vertex.grey = skinGrey;
    });
  }

  const restSkeleton = skeleton();
  const brow = restSkeleton.eyes.y + 0.035 * rawPerMetre;
  const chin = restSkeleton.eyes.y - 0.145 * rawPerMetre;
  const faceFront = restSkeleton.eyes.z - 0.05 * rawPerMetre;
  const faceSide = 0.08 * rawPerMetre;
  // The avatar's own trouser hems ride on the foot bone: above the ankle they go with the trousers.
  const ankle = restSkeleton.footL.y + 0.02 * rawPerMetre;
  // Re-dressed, only what shows through the clothes is kept. A triangle must mostly belong to it.
  const SHOWS = /head|neck|hand|finger|thumb|foot|toe|masseter|cheek|lip|eye|brow|jaw|nose|tongue|caninus|mouth/;
  const showsThrough = (id) => SHOWS.test(vertices[id].bone);
  if (member.piece) {
    vertices.forEach((vertex, id) => {
      if (/_foot/.test(vertex.bone) && restPositions[id * 3 + 1] > ankle - 0.02 * rawPerMetre) vertex.grey = member.lower ?? member.upper ?? skinGrey;
    });
  }
  const isFace = (id) => {
    const x = restPositions[id * 3];
    const y = restPositions[id * 3 + 1];
    const z = restPositions[id * 3 + 2];
    return y < brow && y > chin && z > faceFront && Math.abs(x) < faceSide;
  };
  const keptBy = (keepsFace) => {
    const kept = [];
    for (let i = 0; i < indices.length; i += 3) {
      const corners = [indices[i], indices[i + 1], indices[i + 2]];
      const vs = corners.map((id) => vertices[id]);
      if (member.piece && !corners.every(showsThrough)) continue;
      if (member.hijab) {
        if (vs.some((v) => v.part === 2)) continue;
        if (vs.some((v) => SKIN_BONES.test(v.bone) && !/hand|finger|thumb/.test(v.bone))) {
          if (!keepsFace || !corners.every(isFace)) continue;
        }
      }
      kept.push(...corners);
    }
    return Uint32Array.from(kept);
  };

  const greys = new Float32Array(vertices.length);
  vertices.forEach((vertex, i) => (greys[i] = vertex.grey / 255));
  const simplified = (list, target, flags) => {
    if (list.length / 3 <= target) return list;
    const [result] = MeshoptSimplifier.simplifyWithAttributes(list, simplifyPositions, 3, greys, 1, [0.6], null, target * 3, 0.03, flags);
    return result;
  };
  const compact = (list) => {
    const remap = new Map();
    const used = [];
    const out = [];
    list.forEach((v) => {
      if (!remap.has(v)) {
        remap.set(v, used.length);
        used.push(v);
      }
      out.push(remap.get(v));
    });
    return { used, indices: out };
  };
  const BUDGET = { hi: HI_TRIANGLES, lo: LO_TRIANGLES, far: FAR_TRIANGLES };
  const lods = {};
  for (const lod of ["hi", "lo", "far"]) {
    const outfit = tailor(member, lod, skinGrey, gender === "f");
    outfit.build(restSkeleton, "stand");
    const clothTriangles = outfit.cloth.indices.length / 3;
    // A re-dressed body is islands (head, hands, feet) whose open edges must stay where the clothes meet them.
    const flags = member.piece && lod !== "far" ? ["LockBorder"] : [];
    const body = compact(simplified(keptBy(outfit.keepsFace), Math.max(50, BUDGET[lod] - clothTriangles), flags));
    const offset = body.used.length;
    lods[lod] = {
      outfit,
      used: body.used,
      indices: Uint16Array.from([...body.indices, ...outfit.cloth.indices.map((v) => v + offset)]),
      grey: [...body.used.map((v) => Math.round(vertices[v].grey)), ...outfit.cloth.greys],
      part: [...body.used.map((v) => vertices[v].part), ...outfit.cloth.parts],
    };
  }

  const pelvis = skeletonBones.pelvis;
  const headBone = skeletonBones.head;
  const footL = findBone(root, "l_foot", "l foot");
  const toeL = findBone(root, "l_toe0", "l toe0");
  const clavicleR = skeletonBones.claR;
  const thighL = skeletonBones.thighL;
  const thighR = skeletonBones.thighR;

  const scale = metres;
  /** Which way the body faces, from across the hips. A foot will not do: lifted, its toe points down and its heading is noise. */
  const bodyHeading = () => {
    root.updateMatrixWorld(true);
    const left = thighL.getWorldPosition(new Vector3());
    const right = thighR.getWorldPosition(new Vector3());
    return Math.atan2(right.z - left.z, left.x - right.x);
  };
  /** One still of the current skeleton, normalised: feet on y = 0, pelvis over the origin, facing +Z. */
  const capture = (lod, heading = bodyHeading(), pose = "stand") => {
    root.updateMatrixWorld(true);
    const positions = skinnedPositions(vertices);
    let lowest = Infinity;
    for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]);
    const anchor = new Vector3();
    pelvis.getWorldPosition(anchor);
    const c = Math.cos(heading), s = Math.sin(heading);
    const { used, outfit } = lods[lod];
    const cloth = outfit.build(skeleton(), pose).positions;
    const out = new Float32Array(used.length * 3 + cloth.length);
    const put = (i, px, py, pz) => {
      const x = px - anchor.x;
      const z = pz - anchor.z;
      out[i * 3] = (x * c - z * s) * scale;
      out[i * 3 + 1] = (py - lowest) * scale;
      out[i * 3 + 2] = (x * s + z * c) * scale;
    };
    used.forEach((source, i) => put(i, positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]));
    for (let i = 0; i < cloth.length; i += 3) put(used.length + i / 3, cloth[i], cloth[i + 1], cloth[i + 2]);
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
    poses[key] = { hi: capture("hi", undefined, key), lo: capture("lo", undefined, key), far: capture("far", undefined, key) };
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
    root.updateMatrixWorld(true);
    const positions = skinnedPositions(vertices);
    let lowest = Infinity;
    for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]);
    const shoulder = skeletonBones.upR.getWorldPosition(new Vector3());
    const forward = new Vector3().subVectors(toeWorld(), footWorld()).setY(0).normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    // The wrist just under the ring, straight up from the shoulder and a little ahead of it.
    const target = shoulder.clone().addScaledVector(forward, 0.08 / scale);
    target.y = lowest + (RING_HEIGHT - 0.07) / scale;
    reach(root, "r", target, right.multiplyScalar(0.7).add(new Vector3(0, -0.3, 0)));
  });
  stills("sitphone", () => {
    setPose(ANIM(gender, "sit_chair_idle_neutral_01"), 0.3);
    root.updateMatrixWorld(true);
    const forward = new Vector3().subVectors(toeWorld(), footWorld()).setY(0).normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    // Held up in front of the chest, elbow easy at the side, as anyone reads a phone on a bench.
    const target = clavicleR.getWorldPosition(new Vector3());
    target.addScaledVector(new Vector3(0, 1, 0), -0.26 / scale);
    target.addScaledVector(forward, 0.27 / scale);
    target.addScaledVector(right, -0.06 / scale);
    reach(root, "r", target, right.multiplyScalar(0.55).add(new Vector3(0, -1, 0)));
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
    // One heading for the whole cycle, the way the hips travel, so the swing of the pelvis stays in.
    const pelvisAt = (time) => {
      mixer.setTime(time);
      root.updateMatrixWorld(true);
      return pelvis.getWorldPosition(new Vector3());
    };
    const start = pelvisAt(0);
    const end = pelvisAt(clip.duration * 0.999);
    const heading = Math.atan2(end.x - start.x, end.z - start.z);
    walk.stride = start.distanceTo(end) * scale;
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      mixer.setTime((clip.duration * frame) / WALK_FRAMES);
      walk.push(capture("lo", heading, "walk"));
    }
  }

  return {
    name: castId(member),
    outfit: member.label,
    female: gender === "f",
    triangles: indices.length / 3,
    lods,
    poses,
    walk,
    walkStride: walk.stride,
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

const members = only.length ? CAST.filter((member) => only.includes(castId(member))) : CAST;
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
for (const member of members) {
  const started = Date.now();
  const avatar = await bakeAvatar(member);
  const name = avatar.name;
  const entry = { name, outfit: avatar.outfit, female: avatar.female, lods: {}, poses: {}, walk: [], walkStride: +avatar.walkStride.toFixed(3) };
  for (const lod of ["hi", "lo", "far"]) {
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
    entry.poses[pose] = { hi: push(packStill(still.hi, avatar.lods.hi.indices)), lo: push(packStill(still.lo, avatar.lods.lo.indices)), far: push(packStill(still.far, avatar.lods.far.indices)), top: +still.hi.top.toFixed(3) };
  }
  for (const still of avatar.walk) entry.walk.push(push(packStill(still, avatar.lods.lo.indices)));
  index.avatars.push(entry);
  console.log(`${name}: hi ${entry.lods.hi.triangles}, lo ${entry.lods.lo.triangles}, far ${entry.lods.far.triangles}, height ${entry.poses.stand.top}m, sit ${entry.poses.sit.top}m (${Date.now() - started} ms)`);
}

mkdirSync(output, { recursive: true });
writeFileSync(join(output, "people.bin"), Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))));
writeFileSync(join(output, "people.json"), JSON.stringify(index));
console.log(`people.bin ${(offset / 1048576).toFixed(2)} MB, ${index.avatars.length} avatars`);
