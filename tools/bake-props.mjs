// Bakes downloaded models into one compact, grey, simplified prop library the renderer can stamp.
// usage: node tools/bake-props.mjs <props.config.json> <output folder>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import jpeg from "jpeg-js";
import { MeshoptSimplifier } from "meshoptimizer";
import { PNG } from "pngjs";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

const [configPath, output] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const images = new Map();
function decode(texture) {
  if (!texture) return null;
  if (images.has(texture)) return images.get(texture);
  const bytes = Buffer.from(texture.getImage());
  let image = null;
  try {
    if (bytes[0] === 0x89) {
      const png = PNG.sync.read(bytes);
      image = { data: png.data, width: png.width, height: png.height };
    } else if (bytes[0] === 0xff) {
      const jpg = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 2048 });
      image = { data: jpg.data, width: jpg.width, height: jpg.height };
    }
  } catch {
    image = null;
  }
  images.set(texture, image);
  return image;
}

function lumaAt(image, u, v) {
  if (!image) return 1;
  const x = Math.min(image.width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * image.width)));
  const y = Math.min(image.height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * image.height)));
  const i = (y * image.width + x) * 4;
  return (0.3 * image.data[i] + 0.59 * image.data[i + 1] + 0.11 * image.data[i + 2]) / 255;
}

function collect(document) {
  const positions = [];
  const greys = [];
  const parts = [];
  const indices = [];
  let partCounter = 0;
  const visit = (node, parent) => {
    const local = new Matrix4().fromArray(node.getMatrix());
    const world = new Matrix4().multiplyMatrices(parent, local);
    const mesh = node.getMesh();
    if (mesh) {
      const flip = world.determinant() < 0;
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) continue;
        const position = primitive.getAttribute("POSITION");
        if (!position) continue;
        const uv = primitive.getAttribute("TEXCOORD_0");
        const material = primitive.getMaterial();
        const factor = material?.getBaseColorFactor?.() ?? [1, 1, 1, 1];
        const image = decode(material?.getBaseColorTexture?.());
        const base = 0.3 * factor[0] ** 0.45 + 0.59 * factor[1] ** 0.45 + 0.11 * factor[2] ** 0.45;
        const first = positions.length / 3;
        const v = new Vector3();
        const p = [0, 0, 0];
        const t = [0, 0];
        const part = partCounter++;
        for (let i = 0; i < position.getCount(); i++) {
          position.getElement(i, p);
          v.set(p[0], p[1], p[2]).applyMatrix4(world);
          positions.push(v.x, v.y, v.z);
          if (uv && image) uv.getElement(i, t);
          greys.push(Math.min(1, base * (uv && image ? lumaAt(image, t[0], t[1]) : 1)));
          parts.push(part);
        }
        const list = primitive.getIndices();
        const count = list ? list.getCount() : position.getCount();
        for (let i = 0; i + 2 < count; i += 3) {
          const a = first + (list ? list.getScalar(i) : i);
          const b = first + (list ? list.getScalar(i + 1) : i + 1);
          const c = first + (list ? list.getScalar(i + 2) : i + 2);
          if (flip) indices.push(a, c, b);
          else indices.push(a, b, c);
        }
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  };
  for (const scene of document.getRoot().listScenes()) for (const node of scene.listChildren()) visit(node, new Matrix4());
  return { positions: Float32Array.from(positions), greys: Float32Array.from(greys), parts: Uint16Array.from(parts), indices: Uint32Array.from(indices) };
}

/** Removes any part much wider than the scene's median part: the ground plane or backdrop a model shipped on. */
function dropBackdrop(mesh, limit, absolute, keepRadius) {
  if (!limit && !absolute && !keepRadius) return mesh;
  const spans = new Map();
  for (let i = 0; i < mesh.parts.length; i++) {
    const part = mesh.parts[i];
    const span = spans.get(part) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let k = 0; k < 3; k++) {
      span.min[k] = Math.min(span.min[k], mesh.positions[i * 3 + k]);
      span.max[k] = Math.max(span.max[k], mesh.positions[i * 3 + k]);
    }
    spans.set(part, span);
  }
  const extent = (s) => Math.max(s.max[0] - s.min[0], s.max[2] - s.min[2]);
  const widest = Math.max(...[...spans.values()].map(extent));
  const dropped = new Set([...spans].filter(([, s]) => (limit && extent(s) >= widest * limit) || (absolute && extent(s) > absolute) || (keepRadius && Math.hypot((s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2) > keepRadius)).map(([part]) => part));
  console.log(`  dropped ${dropped.size} of ${spans.size} parts, widest ${widest.toFixed(1)}`);
  const indices = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    if (!dropped.has(mesh.parts[mesh.indices[i]])) indices.push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
  }
  // Keep only vertices still used, so bounds below ignore the backdrop.
  const remap = new Map();
  const positions = [];
  const greys = [];
  const parts = [];
  const newIndices = indices.map((v) => {
    if (!remap.has(v)) {
      remap.set(v, greys.length);
      positions.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
      greys.push(mesh.greys[v]);
      parts.push(mesh.parts[v]);
    }
    return remap.get(v);
  });
  return { positions: Float32Array.from(positions), greys: Float32Array.from(greys), parts: Uint16Array.from(parts), indices: Uint32Array.from(newIndices) };
}

/** Welds by position and part, so simplification can collapse across split UV seams. */
function weld({ positions, greys, parts, indices }, precision) {
  const map = new Map();
  const outPositions = [];
  const outGreys = [];
  const outParts = [];
  const remap = new Uint32Array(positions.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const key = `${parts[i]}:${Math.round(positions[i * 3] / precision)}:${Math.round(positions[i * 3 + 1] / precision)}:${Math.round(positions[i * 3 + 2] / precision)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = outGreys.length;
      map.set(key, id);
      outPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      outGreys.push(greys[i]);
      outParts.push(parts[i]);
    }
    remap[i] = id;
  }
  const outIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]], b = remap[indices[i + 1]], c = remap[indices[i + 2]];
    if (a !== b && b !== c && a !== c) outIndices.push(a, b, c);
  }
  return { positions: Float32Array.from(outPositions), greys: Float32Array.from(outGreys), parts: Uint16Array.from(outParts), indices: Uint32Array.from(outIndices) };
}

function normalsFor(positions, indices, crease) {
  // Split shading at hard edges: keep smooth surfaces round and machine edges sharp.
  const faceCount = indices.length / 3;
  const faceNormals = new Float32Array(faceCount * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
  const facesAt = new Map();
  for (let f = 0; f < faceCount; f++) {
    a.fromArray(positions, indices[f * 3] * 3);
    b.fromArray(positions, indices[f * 3 + 1] * 3);
    c.fromArray(positions, indices[f * 3 + 2] * 3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    const weight = ab.length();
    ab.normalize();
    faceNormals[f * 3] = ab.x;
    faceNormals[f * 3 + 1] = ab.y;
    faceNormals[f * 3 + 2] = ab.z;
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k];
      if (!facesAt.has(v)) facesAt.set(v, []);
      facesAt.get(v).push([f, weight]);
    }
  }
  return { faceNormals, facesAt, crease };
}

function expand(mesh, creaseDegrees) {
  const { positions, greys, parts, indices } = mesh;
  const { faceNormals, facesAt } = normalsFor(positions, indices, 0);
  const cosCrease = Math.cos((creaseDegrees * Math.PI) / 180);
  const out = { pos: [], nor: [], grey: [], part: [], index: [] };
  const vertexKey = new Map();
  const n = new Vector3();
  for (let f = 0; f < indices.length / 3; f++) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k];
      n.set(0, 0, 0);
      for (const [other, weight] of facesAt.get(v)) {
        const dot = faceNormals[f * 3] * faceNormals[other * 3] + faceNormals[f * 3 + 1] * faceNormals[other * 3 + 1] + faceNormals[f * 3 + 2] * faceNormals[other * 3 + 2];
        if (dot > cosCrease) {
          n.x += faceNormals[other * 3] * weight;
          n.y += faceNormals[other * 3 + 1] * weight;
          n.z += faceNormals[other * 3 + 2] * weight;
        }
      }
      n.normalize();
      const nx = Math.round(n.x * 127), ny = Math.round(n.y * 127), nz = Math.round(n.z * 127);
      const key = `${v}:${nx}:${ny}:${nz}`;
      let id = vertexKey.get(key);
      if (id === undefined) {
        id = out.grey.length;
        vertexKey.set(key, id);
        out.pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        out.nor.push(nx, ny, nz);
        out.grey.push(Math.round(greys[v] * 255));
        out.part.push(parts[v] % 250);
      }
      out.index.push(id);
    }
  }
  return out;
}

/** Every assembly keeps a budget in proportion to its size, and tiny fittings can vanish whole. */
function simplifyPartByPart(mesh, target) {
  const byPart = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const part = mesh.parts[mesh.indices[i]];
    if (!byPart.has(part)) byPart.set(part, []);
    byPart.get(part).push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
  }
  const area = (list) => {
    let sum = 0;
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let i = 0; i < list.length; i += 3) {
      a.fromArray(mesh.positions, list[i] * 3);
      b.fromArray(mesh.positions, list[i + 1] * 3);
      c.fromArray(mesh.positions, list[i + 2] * 3);
      sum += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    return sum;
  };
  const entries = [...byPart.values()].map((list) => ({ list, area: area(list) })).sort((p, q) => q.area - p.area);
  const total = entries.reduce((sum, entry) => sum + entry.area ** 0.7, 0);
  const out = [];
  for (const { list, area: partArea } of entries) {
    if (out.length / 3 >= target) break;
    const budget = Math.max(4, Math.round((target * partArea ** 0.7) / total));
    const indices = Uint32Array.from(list);
    const count = Math.min(budget, indices.length / 3);
    let [result] = MeshoptSimplifier.simplify(indices, mesh.positions, 3, count * 3, 0.6, []);
    // Open, non-manifold scan-like parts keep their borders; only the sloppy pass can reduce those.
    if (result.length > count * 4.5) [result] = MeshoptSimplifier.simplifySloppy(indices, mesh.positions, 3, null, count * 3, 0.6);
    for (const v of result.length ? result : indices.subarray(0, 12)) out.push(v);
  }
  return Uint32Array.from(out);
}

const chunks = [];
let offset = 0;
const push = (typed) => {
  while (offset % 4) {
    chunks.push(Buffer.alloc(1));
    offset += 1;
  }
  const start = offset;
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  chunks.push(bytes);
  offset += bytes.length;
  return start;
};

const index = { props: {} };
for (const prop of config.props) {
  const document = await io.read(prop.file);
  const raw = dropBackdrop(collect(document), prop.dropAbove, prop.dropExtent, prop.keepRadius);
  const source = raw.indices.length / 3;
  // Normalise: rotate, then rest on the ground and centre on the origin, then scale to size.
  const rotation = new Quaternion().setFromEuler(new Euler(...(prop.rotate ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180), "YXZ"));
  const v = new Vector3();
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < raw.positions.length; i += 3) {
    v.fromArray(raw.positions, i).applyQuaternion(rotation);
    v.toArray(raw.positions, i);
    lo.min(v);
    hi.max(v);
  }
  const size = hi.clone().sub(lo);
  const stretch = prop.stretch ?? [1, 1, 1];
  const scale = prop.length ? prop.length / size.x : prop.depth ? prop.depth / size.z : prop.height ? prop.height / size.y : 1;
  for (let i = 0; i < raw.positions.length; i += 3) {
    raw.positions[i] = (raw.positions[i] - (lo.x + hi.x) / 2) * scale * stretch[0];
    raw.positions[i + 1] = (raw.positions[i + 1] - lo.y) * scale * stretch[1];
    raw.positions[i + 2] = (raw.positions[i + 2] - (lo.z + hi.z) / 2) * scale * stretch[2];
  }
  const welded = weld(raw, prop.weld ?? 0.002);
  const entry = { size: size.clone().multiplyScalar(scale).toArray().map((x, k) => +(x * stretch[k]).toFixed(3)), source, lods: {} };
  for (const [lod, target] of Object.entries(prop.lods ?? { hi: 2500, lo: 500 })) {
    const count = Math.min(target, welded.indices.length / 3);
    const simplified = prop.perPart ? simplifyPartByPart(welded, count) : MeshoptSimplifier.simplifyWithAttributes(welded.indices, welded.positions, 3, welded.greys, 1, [0.5], null, count * 3, prop.error ?? 0.04, [])[0];
    const expanded = expand({ ...welded, indices: simplified }, prop.crease ?? 38);
    entry.lods[lod] = {
      vertices: expanded.grey.length,
      triangles: simplified.length / 3,
      pos: push(Float32Array.from(expanded.pos)),
      nor: push(Int8Array.from(expanded.nor)),
      grey: push(Uint8Array.from(expanded.grey)),
      part: push(Uint8Array.from(expanded.part)),
      index: push(Uint32Array.from(expanded.index)),
    };
  }
  index.props[prop.key] = entry;
  console.log(`${prop.key}: ${source} -> ${Object.entries(entry.lods).map(([k, l]) => `${k} ${l.triangles}`).join(", ")} | size ${entry.size.join(" x ")}`);
}
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "props.bin"), Buffer.concat(chunks));
writeFileSync(join(output, "props.json"), JSON.stringify(index));
console.log(`props.bin ${(offset / 1048576).toFixed(2)} MB`);
