import { Box3, Group, Mesh, Sphere, Vector3, type ShaderMaterial } from "three";
import { toBufferGeometry } from "../render";
import type { ChunkData } from "./generate";
import { CHUNK_LENGTH, FAR_BACK, FAR_FRONT, WORLD_TOP } from "./layout";

export interface World {
  group: Group;
  /** Keeps chunks in view around the train. Chunks build in workers and appear when ready. */
  update(distance: number, ahead: number, behind: number): void;
  /** How many chunks needed for the current view have not arrived yet. */
  readonly pending: number;
  readonly triangles: number;
  readonly loaded: number;
  whenReady(): Promise<void>;
}

/** Streams the endless city past a train that stays at the origin, so precision never decays. */
export function createWorld(material: ShaderMaterial, seed: number): World {
  const group = new Group();
  const meshes = new Map<number, Mesh & { triangles?: number }>();
  const requested = new Set<number>();
  const waiters: Array<() => void> = [];
  const queue: ChunkData[] = [];
  const workerCount = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
  const workers: Worker[] = [];
  const idle: Worker[] = [];
  const wanted: number[] = [];
  let needed = new Set<number>();
  let triangles = 0;
  let currentDistance = 0;

  const dispatch = (): void => {
    while (idle.length && wanted.length) {
      wanted.sort((a, b) => Math.abs(a * CHUNK_LENGTH - currentDistance) - Math.abs(b * CHUNK_LENGTH - currentDistance));
      const index = wanted.shift()!;
      idle.pop()!.postMessage({ seed, index });
    }
  };

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ChunkData>) => {
      queue.push(event.data);
      idle.push(worker);
      dispatch();
    };
    workers.push(worker);
    idle.push(worker);
  }

  const bounds = new Box3(new Vector3(-CHUNK_LENGTH, 0, FAR_BACK), new Vector3(0, WORLD_TOP, FAR_FRONT));
  const sphere = bounds.getBoundingSphere(new Sphere());

  const install = (chunk: ChunkData): void => {
    requested.delete(chunk.index);
    if (!needed.has(chunk.index)) return;
    const geometry = toBufferGeometry(chunk.mesh);
    geometry.boundingBox = bounds;
    geometry.boundingSphere = sphere;
    const mesh: Mesh & { triangles?: number } = new Mesh(geometry, material);
    mesh.triangles = chunk.triangles;
    mesh.matrixAutoUpdate = true;
    meshes.set(chunk.index, mesh);
    group.add(mesh);
    triangles += chunk.triangles;
  };

  const pending = (): number => {
    let count = 0;
    for (const index of needed) if (!meshes.has(index)) count++;
    return count;
  };

  return {
    group,
    update(distance, ahead, behind) {
      currentDistance = distance;
      const first = Math.floor((distance - behind) / CHUNK_LENGTH);
      const last = Math.floor((distance + ahead) / CHUNK_LENGTH);
      needed = new Set<number>();
      for (let index = first; index <= last; index++) {
        needed.add(index);
        if (!meshes.has(index) && !requested.has(index)) {
          requested.add(index);
          wanted.push(index);
        }
      }
      for (const [index, mesh] of meshes) {
        if (needed.has(index)) continue;
        group.remove(mesh);
        mesh.geometry.dispose();
        triangles -= mesh.triangles ?? 0;
        meshes.delete(index);
      }
      for (let i = wanted.length - 1; i >= 0; i--) {
        if (!needed.has(wanted[i]!)) {
          requested.delete(wanted[i]!);
          wanted.splice(i, 1);
        }
      }
      dispatch();
      // One upload a frame, so a new block of city never costs a visible hitch.
      const next = queue.shift();
      if (next) install(next);
      for (const [index, mesh] of meshes) {
        mesh.position.x = distance - index * CHUNK_LENGTH;
      }
      if (pending() === 0) for (const resolve of waiters.splice(0)) resolve();
    },
    get pending() {
      return pending();
    },
    get triangles() {
      return triangles;
    },
    get loaded() {
      return meshes.size;
    },
    whenReady() {
      return new Promise((resolve) => {
        if (pending() === 0 && needed.size) resolve();
        else waiters.push(resolve);
      });
    },
  };
}
