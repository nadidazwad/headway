import { Box3, Frustum, Group, Matrix4, Mesh, Vector3, type Camera, type ShaderMaterial } from "three";
import { toBufferGeometry } from "../render";
import type { ChunkData } from "./generate";
import { CHUNK_LENGTH } from "./layout";

export interface World {
  group: Group;
  /** Keeps chunks in view around the train. Chunks build in workers and appear when ready. */
  update(distance: number, ahead: number, behind: number): void;
  /** Hides every piece of city outside the camera's view. Call after the camera has moved. */
  cull(camera: Camera): void;
  readonly drawnTriangles: number;
  /** How many chunks needed for the current view have not arrived yet. */
  readonly pending: number;
  readonly triangles: number;
  readonly loaded: number;
  whenReady(): Promise<void>;
}

interface LoadedPart {
  mesh: Mesh;
  box: Box3;
  triangles: number;
}

interface LoadedChunk {
  group: Group;
  parts: LoadedPart[];
  triangles: number;
}

const frustum = new Frustum();
const projection = new Matrix4();
const shifted = new Box3();
const offset = new Vector3();

/** Streams the endless city past a train that stays at the origin, so precision never decays. */
export function createWorld(material: ShaderMaterial, seed: number): World {
  const group = new Group();
  const meshes = new Map<number, LoadedChunk>();
  const requested = new Set<number>();
  const waiters: Array<() => void> = [];
  const queue: ChunkData[] = [];
  const workerCount = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
  const workers: Worker[] = [];
  const idle: Worker[] = [];
  const wanted: number[] = [];
  let needed = new Set<number>();
  let triangles = 0;
  let drawn = 0;
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

  const install = (chunk: ChunkData): void => {
    requested.delete(chunk.index);
    if (!needed.has(chunk.index)) return;
    const chunkGroup = new Group();
    const parts: LoadedPart[] = chunk.parts.map((part) => {
      const mesh = new Mesh(toBufferGeometry(part), material);
      // Culling happens against tight boxes in cull(), not three's bounding spheres.
      mesh.frustumCulled = false;
      chunkGroup.add(mesh);
      return { mesh, box: new Box3(new Vector3(...part.min), new Vector3(...part.max)), triangles: part.indices.length / 3 };
    });
    meshes.set(chunk.index, { group: chunkGroup, parts, triangles: chunk.triangles });
    group.add(chunkGroup);
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
      for (const [index, chunk] of meshes) {
        if (needed.has(index)) continue;
        group.remove(chunk.group);
        for (const part of chunk.parts) part.mesh.geometry.dispose();
        triangles -= chunk.triangles;
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
      for (const [index, chunk] of meshes) {
        chunk.group.position.x = distance - index * CHUNK_LENGTH;
      }
      if (pending() === 0) for (const resolve of waiters.splice(0)) resolve();
    },
    cull(camera) {
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      drawn = 0;
      for (const chunk of meshes.values()) {
        offset.set(chunk.group.position.x, 0, 0);
        for (const part of chunk.parts) {
          shifted.copy(part.box).translate(offset);
          part.mesh.visible = frustum.intersectsBox(shifted);
          if (part.mesh.visible) drawn += part.triangles;
        }
      }
    },
    get drawnTriangles() {
      return drawn;
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
