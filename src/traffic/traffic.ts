import { Color, DynamicDrawUsage, Group, InstancedMesh, Object3D, type ShaderMaterial } from "three";
import type { Assets } from "../assets";
import { Batch } from "../geometry";
import { toBufferGeometry } from "../render";
import { Rng, hashSeed } from "../shared/rng";
import { buildVehicles } from "./vehicles";

interface Agent {
  kind: number;
  lane: number;
  base: number;
  jitterZ: number;
  phase: number;
  instance: number;
  tone: number;
}

interface Lane {
  z: number;
  direction: 1 | -1;
  speed: number;
}

export interface Traffic {
  group: Group;
  update(distance: number, time: number): void;
}

const WINDOW = 520;
const WINDOW_BEHIND = 300;

type Kind = "sedan" | "suv" | "hatch" | "taxi" | "van" | "truck" | "delivery" | "cng" | "rickshaw_fan" | "rickshaw_cycle" | "bus_town" | "bike";

const LENGTHS: Record<Kind, number> = { sedan: 4.4, suv: 4.7, hatch: 4, taxi: 4.4, van: 5, truck: 7, delivery: 6, cng: 2.9, rickshaw_fan: 2.7, rickshaw_cycle: 2.7, bus_town: 10.5, bike: 1.9 };

const RICKSHAW_SEATS = {
  rickshaw_fan: { pullerX: -0.42, pullerY: 0.42, fareX: 0.6, fareY: 0.18 },
  rickshaw_cycle: { pullerX: -0.42, pullerY: 0.42, fareX: 0.6, fareY: 0.18 },
};

const WALKING_CAST = ["Male_Adult_15", "Female_Adult_06", "Male_Adult_08", "Female_Adult_10", "Female_Adult_05", "Male_Adult_17"];
const PER_FRAME_POOL = 14;

/**
 * Road and pavement life. Everything loops inside a window that rides with the train, so the
 * streets are never empty and cost the same however far the train has gone. Vehicles sharing a
 * lane share a speed, so they keep their spacing without any collision logic.
 */
/** A rickshaw is never empty for long: the puller, and usually a fare under the hood. */
function seatRiders(b: Batch, assets: Assets, name: Kind, rng: Rng): void {
  const seat = RICKSHAW_SEATS[name as "rickshaw_fan" | "rickshaw_cycle"];
  const puller = assets.avatars.findIndex((a) => a.name === "Male_Adult_15");
  b.at(seat.pullerX, seat.pullerY, 0, () => b.stamp(assets.person(Math.max(0, puller), "sit", "lo"), 0.9), -Math.PI / 2);
  const fare = rng.int(0, assets.avatars.length - 1);
  b.at(seat.fareX, seat.fareY, 0, () => b.stamp(assets.person(fare, "sit", "lo"), 1.1), -Math.PI / 2);
}

export function createTraffic(material: ShaderMaterial, assets: Assets, seed: number): Traffic {
  const group = new Group();
  const rng = new Rng(hashSeed(seed, 77));
  const kinds: Kind[] = ["sedan", "suv", "hatch", "taxi", "van", "truck", "delivery", "cng", "rickshaw_fan", "rickshaw_cycle", "bus_town", "bike"];

  // Bangladesh drives on the left. Near lanes run the way the train does.
  const lanes: Lane[] = [
    { z: 3.4, direction: 1, speed: 3.9 },
    { z: 6.4, direction: 1, speed: 3.1 },
    { z: 9.4, direction: 1, speed: 2.3 },
    { z: 12.1, direction: 1, speed: 1.6 },
    { z: -3.4, direction: -1, speed: 4.2 },
    { z: -6.4, direction: -1, speed: 3.2 },
    { z: -9.4, direction: -1, speed: 2.4 },
    { z: -12.1, direction: -1, speed: 1.7 },
  ];
  const fast: Kind[] = ["sedan", "sedan", "suv", "bike", "cng", "hatch", "taxi", "sedan", "bus_town"];
  const middle: Kind[] = ["sedan", "cng", "cng", "bike", "suv", "cng", "bus_town", "van", "cng", "truck", "delivery"];
  const slow: Kind[] = ["cng", "cng", "rickshaw_fan", "hatch", "cng", "bike", "van", "rickshaw_cycle"];
  const kerb: Kind[] = ["rickshaw_fan", "rickshaw_cycle", "rickshaw_fan", "cng", "rickshaw_cycle", "rickshaw_fan"];
  const mix: Kind[][] = [fast, middle, slow, kerb, fast, middle, slow, kerb];

  const agents: Agent[] = [];
  lanes.forEach((_, laneIndex) => {
    let cursor = rng.range(0, 12);
    while (cursor < WINDOW - 8) {
      const name = rng.pick(mix[laneIndex]!);
      const length = LENGTHS[name];
      agents.push({ kind: kinds.indexOf(name), lane: laneIndex, base: cursor + length / 2, jitterZ: rng.range(-0.3, 0.3), phase: rng.range(0, 6), instance: 0, tone: rng.range(1.0, 1.25) });
      cursor += length + rng.range(6, 34);
    }
  });

  const bakedBike = buildVehicles().bike;
  const instanced: InstancedMesh[] = kinds.map((name, kind) => {
    const count = agents.filter((a) => a.kind === kind).length;
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
    mesh.count = count;
    group.add(mesh);
    return mesh;
  });
  const counters = kinds.map(() => 0);
  const color = new Color();
  for (const agent of agents) {
    agent.instance = counters[agent.kind]!++;
    color.setRGB(agent.tone, agent.tone, agent.tone);
    instanced[agent.kind]!.setColorAt(agent.instance, color);
  }
  for (const mesh of instanced) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

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
  const walkers = Array.from({ length: 56 }, () => {
    const side = rng.chance(0.5) ? 1 : -1;
    return {
      avatar: rng.int(0, cast.length - 1),
      z: side * rng.range(14.2, 17),
      direction: (rng.chance(0.5) ? 1 : -1) as 1 | -1,
      speed: rng.range(1.05, 1.4),
      base: rng.range(0, WINDOW),
      phase: rng.next(),
    };
  });

  const dummy = new Object3D();
  const walkCounts = cast.map(() => new Array<number>(frames).fill(0));

  return {
    group,
    update(distance, time) {
      const windowStart = distance - WINDOW_BEHIND;
      for (const agent of agents) {
        const lane = lanes[agent.lane]!;
        const travelled = agent.base + lane.direction * lane.speed * time;
        const s = windowStart + (((travelled - windowStart) % WINDOW) + WINDOW) % WINDOW;
        dummy.position.set(distance - s, 0.03, lane.z + agent.jitterZ);
        dummy.rotation.set(0, lane.direction > 0 ? 0 : Math.PI, 0);
        dummy.updateMatrix();
        instanced[agent.kind]!.setMatrixAt(agent.instance, dummy.matrix);
      }
      for (const mesh of instanced) mesh.instanceMatrix.needsUpdate = true;

      for (const counts of walkCounts) counts.fill(0);
      const cycle = 1.05;
      for (const walker of walkers) {
        const travelled = walker.base + walker.direction * walker.speed * time;
        const s = windowStart + (((travelled - windowStart) % WINDOW) + WINDOW) % WINDOW;
        const frame = Math.floor(((time / cycle + walker.phase) % 1) * frames) % frames;
        const slot = walkCounts[walker.avatar]![frame]!;
        if (slot >= PER_FRAME_POOL) continue;
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
