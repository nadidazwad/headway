import { Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Object3D, type ShaderMaterial } from "three";
import { Batch } from "../geometry";
import { drawPerson } from "../people";
import { toBufferGeometry } from "../render";
import { Rng, hashSeed } from "../shared/rng";
import { VEHICLE_LENGTH, buildVehicles, type VehicleKind } from "./vehicles";

interface Agent {
  kind: number;
  lane: number;
  /** Distance along the line at time zero. */
  base: number;
  jitterZ: number;
  phase: number;
  instance: number;
  tint: number;
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
const BEHIND = 240;

const CAR_COLORS = [0xffffff, 0xe9e6dd, 0xbfc3c6, 0x7b8388, 0x25282b, 0xa8312c, 0x2a4c6f];
const CNG_COLORS = [0x3f9b57, 0x38914f, 0x4aa861];
const RICKSHAW_COLORS = [0xe6407a, 0x2f8f6b, 0x2f6fb0, 0xe2a22d, 0xc8413a, 0x8a4fa3];
const BUS_COLORS = [0xc8413a, 0xc8413a, 0x2f6fb0, 0x2f8f6b, 0xe88a3a, 0xece7da];
const BIKE_COLORS = [0x262a2d, 0x8a1f2d, 0x2a4c6f, 0x5a6064];

const WALKERS = 8;
const OUTFITS = [
  { outfit: "shirt", female: false, hijab: false, palette: [0xf1eee4, 0x2d3a4a] },
  { outfit: "panjabi", female: false, hijab: false, palette: [0xe3d7ba, 0xf2efe6] },
  { outfit: "salwar", female: true, hijab: false, palette: [0xc8413a, 0xe07a2f] },
  { outfit: "saree", female: true, hijab: false, palette: [0x2f8f6b, 0x2f8f6b] },
  { outfit: "burqa", female: true, hijab: true, palette: [0x262a2e, 0x262a2e] },
  { outfit: "tshirt", female: false, hijab: false, palette: [0x2f6fb0, 0x39424a] },
  { outfit: "lungi", female: false, hijab: false, palette: [0x8fb1cf, 0x5a5346] },
  { outfit: "salwar", female: true, hijab: true, palette: [0xd86a9a, 0x6d5aa8] },
] as const;

/**
 * Road and pavement life. Everything loops inside a window that rides with the train, so the
 * streets are never empty and cost the same however far the train has gone. Vehicles sharing a
 * lane share a speed, so they keep their spacing without any collision logic.
 */
export function createTraffic(material: ShaderMaterial, seed: number): Traffic {
  const group = new Group();
  const meshes = buildVehicles();
  const rng = new Rng(hashSeed(seed, 77));
  const kinds: VehicleKind[] = ["car", "cng", "rickshaw", "bus", "bike"];
  const colors = [CAR_COLORS, CNG_COLORS, RICKSHAW_COLORS, BUS_COLORS, BIKE_COLORS];

  // Near lanes run away from the camera's left; Bangladesh drives on the left.
  const lanes: Lane[] = [
    { z: 3.6, direction: 1, speed: 3.9 },
    { z: 6.6, direction: 1, speed: 3.1 },
    { z: 9.6, direction: 1, speed: 2.3 },
    { z: 12.2, direction: 1, speed: 1.6 },
    { z: -3.6, direction: -1, speed: 4.2 },
    { z: -6.6, direction: -1, speed: 3.2 },
    { z: -9.6, direction: -1, speed: 2.4 },
    { z: -12.2, direction: -1, speed: 1.7 },
  ];
  const mix: VehicleKind[][] = [
    ["car", "car", "bike", "cng", "car", "car", "bus"],
    ["car", "cng", "cng", "bike", "car", "cng", "bus", "cng", "car"],
    ["cng", "cng", "rickshaw", "car", "cng", "bike"],
    ["rickshaw", "rickshaw", "rickshaw", "cng", "rickshaw", "rickshaw"],
    ["car", "car", "bike", "cng", "car", "car", "bus"],
    ["car", "cng", "cng", "bike", "car", "cng", "bus", "cng", "car"],
    ["cng", "cng", "rickshaw", "car", "cng", "bike"],
    ["rickshaw", "rickshaw", "rickshaw", "cng", "rickshaw", "rickshaw"],
  ];

  const agents: Agent[] = [];
  lanes.forEach((_, laneIndex) => {
    let cursor = rng.range(0, 12);
    while (cursor < WINDOW - 8) {
      const kindName = rng.pick(mix[laneIndex]!);
      const kind = kinds.indexOf(kindName);
      const length = VEHICLE_LENGTH[kindName];
      agents.push({ kind, lane: laneIndex, base: cursor + length / 2, jitterZ: rng.range(-0.35, 0.35), phase: rng.range(0, 6), instance: 0, tint: rng.pick(colors[kind]!) });
      cursor += length + rng.range(1.2, 9);
    }
  });

  const instanced: InstancedMesh[] = kinds.map((kindName, kind) => {
    const count = agents.filter((a) => a.kind === kind).length;
    const mesh = new InstancedMesh(toBufferGeometry(meshes[kindName]), material, Math.max(count, 1));
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
    color.setHex(agent.tint);
    instanced[agent.kind]!.setColorAt(agent.instance, color);
  }
  for (const mesh of instanced) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // People on the pavements: a small wardrobe of figures, loops of walkers along each side.
  const walkerMeshes: InstancedMesh[] = [];
  const walkers: Array<{ mesh: number; instance: number; z: number; direction: 1 | -1; speed: number; base: number; phase: number }> = [];
  const perWardrobe = 26;
  for (let w = 0; w < WALKERS; w++) {
    const look = OUTFITS[w]!;
    const b = new Batch(1 << 11);
    b.cull = false;
    drawPerson(b, {
      outfit: look.outfit,
      pose: w % 3 === 0 ? "phone" : "standing",
      female: look.female,
      hijab: look.hijab,
      backpack: w === 5,
      tone: [0xb88a63, 0xa97a54, 0xc99d76, 0x8f6443][w % 4]!,
      palette: [look.palette[0], look.palette[1]],
      hair: 0x1d1a18,
    });
    const mesh = new InstancedMesh(toBufferGeometry(b.finish()), material, perWardrobe);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    walkerMeshes.push(mesh);
    for (let i = 0; i < perWardrobe; i++) {
      const side = rng.chance(0.5) ? 1 : -1;
      walkers.push({
        mesh: w,
        instance: i,
        z: side * rng.range(14.3, 16.9),
        direction: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(0.9, 1.5),
        base: rng.range(0, WINDOW),
        phase: rng.range(0, 6),
      });
    }
  }

  const dummy = new Object3D();
  const matrix = new Matrix4();

  return {
    group,
    update(distance, time) {
      const windowStart = distance - BEHIND - WINDOW / 2 + BEHIND - 40;
      for (const agent of agents) {
        const lane = lanes[agent.lane]!;
        const travelled = agent.base + lane.direction * lane.speed * time;
        const s = windowStart + (((travelled - windowStart) % WINDOW) + WINDOW) % WINDOW;
        const x = distance - s;
        dummy.position.set(x, 0.03 + Math.abs(Math.sin(time * 2.2 + agent.phase)) * 0.012, lane.z + agent.jitterZ);
        dummy.rotation.set(0, lane.direction > 0 ? 0 : Math.PI, 0);
        dummy.updateMatrix();
        instanced[agent.kind]!.setMatrixAt(agent.instance, dummy.matrix);
      }
      for (const mesh of instanced) mesh.instanceMatrix.needsUpdate = true;
      for (const walker of walkers) {
        const travelled = walker.base + walker.direction * walker.speed * time;
        const s = windowStart + (((travelled - windowStart) % WINDOW) + WINDOW) % WINDOW;
        const x = distance - s;
        const step = Math.sin(time * 5.4 * walker.speed + walker.phase);
        dummy.position.set(x, 0.2 + Math.abs(step) * 0.03, walker.z);
        dummy.rotation.set(0, walker.direction > 0 ? -Math.PI / 2 : Math.PI / 2, step * 0.04);
        dummy.updateMatrix();
        walkerMeshes[walker.mesh]!.setMatrixAt(walker.instance, dummy.matrix);
      }
      for (const mesh of walkerMeshes) mesh.instanceMatrix.needsUpdate = true;
      void matrix;
    },
  };
}
