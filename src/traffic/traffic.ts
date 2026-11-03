import { Color, DynamicDrawUsage, Frustum, Group, InstancedMesh, Matrix4, Object3D, Sphere, Vector3, type Camera, type ShaderMaterial } from "three";
import type { Assets } from "../assets";
import { Batch } from "../geometry";
import { toBufferGeometry } from "../render";
import { Rng, hashSeed } from "../shared/rng";
import { junctionsBetween } from "../world/plan";
import { ROAD_HALF } from "../world/layout";
import { CROSSERS_PER_JUNCTION, CROSS_MIX, createFlow, type Kind } from "./flow";
import { buildVehicles } from "./vehicles";

export interface Traffic {
  group: Group;
  /** Advances the road by `dt` seconds with the train at `distance`, and redraws what `camera` sees. */
  update(distance: number, time: number, dt: number, camera: Camera): void;
}

const AHEAD = 220;
const BEHIND = 300;
/** Junctions in the window at once, at most, for sizing the pools of crossing vehicles. */
const JUNCTIONS_AT_ONCE = 6;
const KINDS: Kind[] = ["sedan", "suv", "hatch", "taxi", "van", "truck", "delivery", "cng", "rickshaw_fan", "rickshaw_cycle", "bus_town", "bike"];

const RICKSHAW_SEATS = {
  rickshaw_fan: { pullerX: -0.42, pullerY: 0.42, fareX: 0.6, fareY: 0.18 },
  rickshaw_cycle: { pullerX: -0.42, pullerY: 0.42, fareX: 0.6, fareY: 0.18 },
};

const WALKING_CAST = ["Male_Adult_15", "Female_Adult_06", "Male_Adult_08", "Female_Adult_10", "Female_Adult_05", "Male_Adult_17"];
const PER_FRAME_POOL = 14;
/** The band of pavement people walk in: inside the kerb's poles and trees, outside the stalls and stairs. */
const WALK_INNER = ROAD_HALF + 1.45;
const WALK_OUTER = ROAD_HALF + 2.4;

const sideStreetY = (z: number): number => {
  const t = Math.min(1, Math.max(0, (Math.abs(z) - (ROAD_HALF - 0.9)) / 1.8));
  return 0.03 + 0.19 * t * t * (3 - 2 * t);
};

/** A rickshaw is never empty for long: the puller, and usually a fare under the hood. */
function seatRiders(b: Batch, assets: Assets, name: Kind, rng: Rng): void {
  const seat = RICKSHAW_SEATS[name as "rickshaw_fan" | "rickshaw_cycle"];
  const puller = assets.avatars.findIndex((a) => a.name === "Male_Adult_15");
  b.at(seat.pullerX, seat.pullerY, 0, () => b.stamp(assets.person(Math.max(0, puller), "sit", "lo"), 0.9), -Math.PI / 2);
  const fare = rng.int(0, assets.avatars.length - 1);
  b.at(seat.fareX, seat.fareY, 0, () => b.stamp(assets.person(fare, "sit", "lo"), 1.1), -Math.PI / 2);
}

/**
 * Road and pavement life, drawn from the simulation in `flow.ts`. Each kind of vehicle is one
 * instanced mesh; walkers are one instanced mesh per frame of their walk cycle.
 */
export function createTraffic(material: ShaderMaterial, assets: Assets, seed: number, startDistance: number): Traffic {
  const group = new Group();
  const rng = new Rng(hashSeed(seed, 77));
  const flow = createFlow({
    seed,
    junctionsBetween: (from, to) => junctionsBetween(seed, from, to),
    from: startDistance - BEHIND,
    to: startDistance + AHEAD,
  });
  // A minute of driving before anyone looks, so the queues and gaps have formed.
  for (let i = 0; i < 600; i++) flow.step(0.1, i * 0.1 - 60, startDistance - BEHIND, startDistance + AHEAD);

  const crossShare = (kind: Kind): number => (CROSS_MIX.includes(kind) ? JUNCTIONS_AT_ONCE * CROSSERS_PER_JUNCTION : 0);
  const bakedBike = buildVehicles().bike;
  const instanced: InstancedMesh[] = KINDS.map((name) => {
    const count = flow.vehicles.filter((v) => v.kind === name).length + crossShare(name);
    let geometry;
    if (name === "bike") {
      geometry = toBufferGeometry(bakedBike);
    } else {
      const b = new Batch(1 << 12);
      b.cull = false;
      b.stamp(assets.prop(name, "lo"));
      if (name === "rickshaw_fan" || name === "rickshaw_cycle") seatRiders(b, assets, name, rng);
      geometry = toBufferGeometry(b.finish());
    }
    const mesh = new InstancedMesh(geometry, material, Math.max(count, 1));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const tone = rng.range(1.0, 1.25);
      mesh.setColorAt(i, color.setRGB(tone, tone, tone));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  });

  // Walkers: a small cast, each with a real walk cycle. Each frame of each cycle is its own
  // instanced mesh, and every walker sits in the mesh for the frame it has reached.
  const frames = assets.walkFrames;
  const cast = WALKING_CAST.map((name) => assets.avatars.findIndex((a) => a.name === name)).filter((i) => i >= 0);
  const walkerMeshes: InstancedMesh[][] = cast.map((avatar) =>
    Array.from({ length: frames }, (_, frame) => {
      const b = new Batch(1 << 11);
      b.cull = false;
      b.stamp(assets.walkFrame(avatar, frame));
      const mesh = new InstancedMesh(toBufferGeometry(b.finish()), material, PER_FRAME_POOL);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      group.add(mesh);
      return mesh;
    }),
  );
  const WINDOW = AHEAD + BEHIND;
  const walkers = Array.from({ length: 56 }, () => {
    const side = rng.chance(0.5) ? 1 : -1;
    return {
      avatar: rng.int(0, cast.length - 1),
      z: side * rng.range(WALK_INNER, WALK_OUTER),
      direction: (rng.chance(0.5) ? 1 : -1) as 1 | -1,
      speed: rng.range(1.05, 1.4),
      base: rng.range(0, WINDOW),
      phase: rng.next(),
    };
  });

  const dummy = new Object3D();
  const walkCounts = cast.map(() => new Array<number>(frames).fill(0));
  const used = KINDS.map(() => 0);
  const kindIndex = new Map(KINDS.map((k, i) => [k, i]));
  let clock = 0;

  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  // A little larger than any vehicle, so one at the edge, or its shadow, never pops.
  const probe = new Sphere(new Vector3(), 7);
  const seen = (x: number, y: number, z: number): boolean => {
    probe.center.set(x, y, z);
    return frustum.intersectsSphere(probe);
  };

  const place = (kind: Kind, x: number, z: number, yaw: number, y = 0.03): void => {
    if (!seen(x, 1, z)) return;
    const k = kindIndex.get(kind)!;
    const mesh = instanced[k]!;
    if (used[k]! >= mesh.instanceMatrix.count) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(used[k]!++, dummy.matrix);
  };

  return {
    group,
    update(distance, time, dt, camera) {
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      clock += dt;
      const from = distance - BEHIND;
      const to = distance + AHEAD;
      flow.step(Math.min(dt, 0.1), clock, from, to);
      used.fill(0);
      for (const v of flow.vehicles) place(v.kind, distance - v.s, v.z, (v.direction > 0 ? 0 : Math.PI) + v.yaw);
      // The model's nose points along -x at rest; a crosser heading +z turns a quarter left.
      // Side streets meet the road at pavement height, so a crosser rises over the kerb onto them.
      for (const c of flow.crossers) place(c.kind, distance - c.s, c.z, c.heading > 0 ? Math.PI / 2 : -Math.PI / 2, sideStreetY(c.z));
      instanced.forEach((mesh, k) => {
        mesh.count = used[k]!;
        mesh.instanceMatrix.needsUpdate = true;
      });

      for (const counts of walkCounts) counts.fill(0);
      for (const walker of walkers) {
        const travelled = walker.base + walker.direction * walker.speed * time;
        const s = from + (((travelled - from) % WINDOW) + WINDOW) % WINDOW;
        // Feet keep to the ground: the cycle advances with the distance covered, not with the clock.
        const stride = assets.avatars[cast[walker.avatar]!]!.walkStride;
        const frame = Math.floor((((walker.speed * time) / stride + walker.phase) % 1) * frames) % frames;
        const slot = walkCounts[walker.avatar]![frame]!;
        if (slot >= PER_FRAME_POOL || !seen(distance - s, 1, walker.z)) continue;
        walkCounts[walker.avatar]![frame] = slot + 1;
        dummy.position.set(distance - s, 0.2, walker.z);
        dummy.rotation.set(0, walker.direction > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        dummy.updateMatrix();
        walkerMeshes[walker.avatar]![frame]!.setMatrixAt(slot, dummy.matrix);
      }
      walkerMeshes.forEach((row, avatar) => {
        row.forEach((mesh, frame) => {
          mesh.count = walkCounts[avatar]![frame]!;
          mesh.instanceMatrix.needsUpdate = true;
        });
      });
    },
  };
}
