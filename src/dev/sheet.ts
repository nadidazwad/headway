import { Mesh, OrthographicCamera, Scene, Vector3 } from "three";
import { loadAssets, type PersonPose } from "../assets";
import { Batch } from "../geometry";
import { createPipeline, toBufferGeometry } from "../render";

const q = new URLSearchParams(location.search);
const keys = (q.get("keys") ?? "").split(",").filter(Boolean);
const lod = q.get("lod") ?? "hi";
const az = Number(q.get("az") ?? 35) * Math.PI / 180;
const el = Number(q.get("el") ?? 23.5) * Math.PI / 180;
const cols = Number(q.get("cols") ?? 6);
const cell = Number(q.get("cell") ?? 14);

const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const pipeline = createPipeline(canvas);
pipeline.setPixelRatio(1);
pipeline.resize(innerWidth, innerHeight);
pipeline.setHaze(5000, 6000);
const assets = await loadAssets("/");
const scene = new Scene();
const b = new Batch(1 << 16);
b.cull = false;
const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 3000);
const places: Array<[string, Vector3]> = [];
const people = q.has("people");
const pose = (q.get("pose") ?? "stand") as PersonPose;
const walkFrame = q.has("walk") ? Number(q.get("walk")) : null;
const only = q.get("only")?.split(",");
if (people) {
  assets.avatars.forEach((avatar, i) => {
    if (!only || only.includes(avatar.name)) keys.push(String(i));
  });
}
keys.forEach((key, i) => {
  const x = (i % cols) * cell * Math.cos(az) ** -1;
  const z = 0;
  const row = Math.floor(i / cols);
  const p = new Vector3(x - Math.sin(az) * row * cell * 1.4, -row * cell * 1.0, z + Math.cos(az) * row * 0);
  if (people) {
    const avatar = Number(key);
    const stamp = walkFrame !== null ? assets.walkFrame(avatar, walkFrame) : assets.person(avatar, pose, lod as "hi");
    b.at(p.x, p.y, p.z, () => b.stamp(stamp), Number(q.get("turn") ?? 0));
  } else b.at(p.x, p.y, p.z, () => b.stamp(assets.prop(key, lod)));
  places.push([key, p]);
});
scene.add(new Mesh(toBufferGeometry(b.finish()), pipeline.solid));
const rows2 = Math.ceil(keys.length / cols);
const center = new Vector3(((cols - 1) * cell) / Math.cos(az) / 2, 0.8 - ((rows2 - 1) * cell) / 2, 0);
const d = 800;
camera.position.set(center.x - Math.sin(az) * Math.cos(el) * d, center.y + Math.sin(el) * d, center.z + Math.cos(az) * Math.cos(el) * d);
camera.lookAt(center);
const width = cols * cell * 1.05;
const aspect = innerWidth / innerHeight;
camera.left = -width / 2;
camera.right = width / 2;
camera.top = width / aspect / 2;
camera.bottom = -width / aspect / 2;
camera.updateProjectionMatrix();
camera.updateMatrixWorld();
const v = new Vector3();
const labels = document.querySelector("#l")!;
for (const [key, p] of places) {
  v.copy(p).project(camera);
  const span = document.createElement("span");
  span.textContent = people ? assets.avatars[Number(key)]!.name.replace("_Adult_", "") : `${key} ${assets.propSize(key).join("x")}`;
  span.style.left = `${((v.x + 1) / 2) * innerWidth - 40}px`;
  span.style.top = `${((1 - v.y) / 2) * innerHeight + 6}px`;
  labels.append(span);
}
pipeline.render(scene, camera, d);
(window as unknown as { __sheet: boolean }).__sheet = true;
