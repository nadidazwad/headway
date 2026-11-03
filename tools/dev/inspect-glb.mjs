// Lists a model's parts, largest first, with size and centre, for deciding how to split or clean it.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Vector3 } from "three";
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const rows = [];
let total = 0;
const visit = (n, p) => {
  const w = new Matrix4().multiplyMatrices(p, new Matrix4().fromArray(n.getMatrix()));
  const m = n.getMesh();
  if (m) for (const pr of m.listPrimitives()) {
    const a = pr.getAttribute("POSITION");
    if (!a) continue;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], v = new Vector3(), e = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); v.set(...e).applyMatrix4(w); lo[0] = Math.min(lo[0], v.x); lo[1] = Math.min(lo[1], v.y); lo[2] = Math.min(lo[2], v.z); hi[0] = Math.max(hi[0], v.x); hi[1] = Math.max(hi[1], v.y); hi[2] = Math.max(hi[2], v.z); }
    const tris = (pr.getIndices()?.getCount() ?? a.getCount()) / 3;
    total += tris;
    rows.push([n.getName().slice(0, 24), pr.getMaterial()?.getName()?.slice(0, 16), tris, hi.map((h, i) => +(h - lo[i]).toFixed(2)).join("x"), lo.map((l, i) => +((l + hi[i]) / 2).toFixed(2)).join(",")]);
  }
  for (const c of n.listChildren()) visit(c, w);
};
for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, new Matrix4());
rows.sort((a, b) => b[2] - a[2]);
console.log(`${rows.length} parts, ${total} triangles`);
for (const r of rows.slice(0, +(process.argv[3] ?? 14))) console.log(r.join(" | "));
