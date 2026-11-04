import { Mesh, OrthographicCamera, Scene, Vector3 } from "three";
import { loadAssets } from "../assets";
import { Batch } from "../geometry";
import { createPipeline, toBufferGeometry, toLineGeometry } from "../render";
import { Rng } from "../shared/rng";
import { tree, type Species } from "../world/nature";

/** Dev: each species in a row at the film's camera, with someone beside it for scale and its triangle count. */
const q = new URLSearchParams(location.search);
const species = (q.get("trees") ?? "rain,krishnachura,mahogany,mango,coconut").split(",") as Species[];
const height = Number(q.get("h") ?? 9);
const spacing = Number(q.get("gap") ?? 20);
const far = q.has("far");
const seed = Number(q.get("seed") ?? 3);
const az = (Number(q.get("az") ?? 35) * Math.PI) / 180;
const el = (Number(q.get("el") ?? 23.5) * Math.PI) / 180;

const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const pipeline = createPipeline(canvas);
pipeline.setPixelRatio(1);
pipeline.resize(innerWidth, innerHeight);
pipeline.setHaze(5000, 6000);
const assets = await loadAssets("/");
const scene = new Scene();
const labels = document.querySelector("#l")!;

const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 3000);
const focus = new Vector3(Number(q.get("fx") ?? ((species.length - 1) * spacing) / 2), Number(q.get("fy") ?? height * 0.45), Number(q.get("fz") ?? 0));
const d = 800;
camera.position.set(focus.x - Math.sin(az) * Math.cos(el) * d, focus.y + Math.sin(el) * d, focus.z + Math.cos(az) * Math.cos(el) * d);
camera.lookAt(focus);
const width = Number(q.get("w") ?? species.length * spacing * 1.05);
const aspect = innerWidth / innerHeight;
camera.left = -width / 2;
camera.right = width / 2;
camera.top = width / aspect / 2;
camera.bottom = -width / aspect / 2;
camera.updateProjectionMatrix();
camera.updateMatrixWorld();

const place = new Vector3();
species.forEach((name, i) => {
  const b = new Batch(1 << 14);
  b.lines = true;
  const x = i * spacing;
  const before = b.triangles;
  tree(b, x, 0, height, new Rng(seed + i * 17), { species: name, far });
  const triangles = b.triangles - before;
  b.at(x + 2.2, 0, 1.5, () => b.stamp(assets.person(i % assets.avatars.length, "stand", "lo")));
  const data = b.finish();
  const geometry = toBufferGeometry(data);
  const mesh = new Mesh(geometry, pipeline.solid);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const lines = toLineGeometry(geometry, data);
  if (lines) {
    const line = new Mesh(lines, pipeline.lineMaterial);
    line.frustumCulled = false;
    pipeline.lineScene.add(line);
  }
  place.set(x, -1.2, 3).project(camera);
  const span = document.createElement("span");
  span.textContent = `${name} ${triangles}`;
  span.style.left = `${((place.x + 1) / 2) * innerWidth - 40}px`;
  span.style.top = `${((1 - place.y) / 2) * innerHeight + 6}px`;
  labels.append(span);
});

// A plain ground, to show what the crown lets through.
const ground = new Batch(16);
ground.quad([-200, 0, 200], [400, 0, 200], [400, 0, -200], [-200, 0, -200], 0xd8d8d0, [0, 1, 0]);
scene.add(new Mesh(toBufferGeometry(ground.finish()), pipeline.solid));

pipeline.render(scene, camera, d);
(window as unknown as { __sheet: boolean }).__sheet = true;
