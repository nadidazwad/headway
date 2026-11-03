import type { Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import type { Assets, PersonPose } from "../assets";
import { awnings, city } from "../shared/palette";
import { posterUv } from "../signs/regions";
import { ROAD_HALF, SIDEWALK_HALF } from "./layout";
import type { Plot } from "./buildings";
import { tree } from "./nature";

const IDLE_POSES: readonly PersonPose[] = ["stand", "look", "phone", "music", "bag"];

/** Somebody standing about, or sat down: at a tea stall, on a bridge. */
export function bystander(b: Batch, assets: Assets, x: number, y: number, z: number, facing: number, rng: Rng, seated = false): void {
  const avatar = rng.int(0, assets.avatars.length - 1);
  const pose = seated ? "sit" : rng.pick(IDLE_POSES);
  b.at(x, y, z, () => b.stamp(assets.person(avatar, pose, "lo")), facing);
}

/** A neighbourhood mosque: mint and white, dome and a slender minaret with its balconies. */
export function mosque(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1, lod } = plot;
  const width = x1 - x0;
  const depth = z1 - z0;
  const wall = rng.pick([0xf2efe3, 0xcfe6d8, 0xf2e6c9]);
  const trim = rng.pick([0x2f8f6b, 0x3f9f9f, 0xc39a3f]);
  const h = Math.min(7.2, plot.maxHeight - 3);
  b.part();
  b.box(x0, 0, z0, x1, h, z1, wall);
  b.part();
  b.box(x0 - 0.1, h, z0 - 0.1, x1 + 0.1, h + 0.28, z1 + 0.1, 0xffffff);
  // Pointed arches along the road face, drawn as insets with a dark doorway inside.
  const bays = Math.max(3, Math.round(width / 2.7));
  for (let i = 0; i < bays; i++) {
    const u = x0 + ((i + 0.5) * width) / bays;
    const half = (width / bays) * 0.3;
    const arch: Array<[number, number]> = [[-half, 0.12], [half, 0.12], [half, h * 0.58], [half * 0.55, h * 0.72], [0, h * 0.8], [-half * 0.55, h * 0.72], [-half, h * 0.58]];
    b.part();
    for (let j = 1; j + 1 < arch.length; j++) {
      const [ax, ay] = arch[0]!;
      const [bx, by] = arch[j]!;
      const [cx, cy] = arch[j + 1]!;
      b.quad([u + ax, ay, z1 + 0.01], [u + bx, by, z1 + 0.01], [u + cx, cy, z1 + 0.01], [u + cx, cy, z1 + 0.01], 0x3f5f62, [0, 0, 1]);
    }
    b.part();
    b.box(u - half - 0.08, h * 0.58, z1, u - half, 0.1, z1 + 0.03, trim);
    b.box(u + half, h * 0.58, z1, u + half + 0.08, 0.1, z1 + 0.03, trim);
  }
  b.part();
  b.box(x0, h - 0.7, z1, x1, h - 0.45, z1 + 0.04, trim);
  // Dome on a drum.
  const domeR = Math.min(width, depth) * 0.3;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  b.part();
  b.cylinder(cx, h + 0.28, cz, domeR * 0.98, domeR * 0.98, 1.1, wall, 20);
  b.part();
  const y = h + 1.38;
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    profile.push([domeR * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + 0.1 * Math.sin(t * Math.PI)), y + t * domeR * 1.15]);
  }
  profile[10] = [0.02, y + domeR * 1.15];
  b.lathe(cx, cz, profile, trim, 20);
  b.part();
  b.bar([cx, y + domeR * 1.1, cz], [cx, y + domeR * 1.1 + 1.2, cz], 0.03, 0.015, 0xd9b53a, 5);
  // The minaret.
  const mx = x0 + 1.4;
  const mz = z1 - 1.4;
  const mh = Math.min(plot.maxHeight + 8, rng.range(17, 26));
  b.part();
  b.cylinder(mx, 0, mz, 1, 0.82, mh * 0.64, wall, 12);
  b.part();
  b.cylinder(mx, mh * 0.64, mz, 1.05, 1.15, 0.26, trim, 12, true);
  b.part();
  b.cylinder(mx, mh * 0.64 + 0.26, mz, 0.72, 0.6, mh * 0.26, wall, 12);
  b.part();
  b.cylinder(mx, mh * 0.9 + 0.26, mz, 0.72, 0.8, 0.2, trim, 12);
  b.part();
  b.lathe(mx, mz, [[0.64, mh * 0.9 + 0.46], [0.6, mh * 0.93 + 0.46], [0.4, mh * 0.97 + 0.46], [0.03, mh + 0.9]], trim, 12);
  if (lod === 0) {
    // Loudspeakers wired to the minaret, an ever-present detail.
    b.part();
    b.block(mx + 0.72, mh * 0.5, mz + 0.5, 0.24, 0.3, 0.32, 0xe7e2d5);
  }
}

/** A pond in an empty lot, with a brick ghat and leaning palms. Dhaka still keeps a few. */
export function pond(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1 } = plot;
  b.part();
  b.box(x0, 0, z0, x1, 0.06, z1, 0xa8b98a);
  b.part();
  b.quad([x0 + 1.5, 0.08, z1 - 1.5], [x1 - 1.5, 0.08, z1 - 1.5], [x1 - 1.5, 0.08, z0 + 1.5], [x0 + 1.5, 0.08, z0 + 1.5], 0x6fa3a6, [0, 1, 0]);
  // Lily pads and ripples, drawn flat on the water.
  for (let i = 0; i < 18; i++) {
    const px = rng.range(x0 + 2.2, x1 - 2.2);
    const pz = rng.range(z0 + 2.2, z1 - 2.2);
    b.quad([px - 0.3, 0.09, pz + 0.3], [px + 0.3, 0.09, pz + 0.3], [px + 0.3, 0.09, pz - 0.3], [px - 0.3, 0.09, pz - 0.3], i % 4 === 0 ? 0x4f8f62 : 0x7fb3b3, [0, 1, 0]);
  }
  b.part();
  b.box(x0, 0, z1 - 2, x0 + 3.2, 0.34, z1, city.brick);
  for (let step = 0; step < 4; step++) {
    b.part();
    b.box(x0 + 3.2 + step * 0.5, 0, z1 - 2, x0 + 3.7 + step * 0.5, 0.3 - step * 0.07, z1, step % 2 ? 0xb5624a : city.brick);
  }
  tree(b, x0 + 2, z0 + 2.2, rng.range(8, 11), rng);
  tree(b, x1 - 2, z0 + 3, rng.range(7, 10), rng);
}

/** A tea stall on the pavement: lean-to, kettle, biscuits in jars, a bench and two customers. */
export function teaStall(b: Batch, assets: Assets, x: number, side: number, rng: Rng): void {
  const z = side * (ROAD_HALF + 2.9);
  const w = 2.1;
  const d = 1.1;
  const y = 0.22;
  b.part();
  b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.92, z + d / 2, rng.pick([0x8c6a44, 0x4f7f73, 0x7a4a26]));
  b.part();
  b.box(x - w / 2 - 0.04, y + 0.92, z - d / 2 - 0.04, x + w / 2 + 0.04, y + 0.98, z + d / 2 + 0.04, 0xd9cfba);
  for (const px of [x - w / 2 + 0.05, x + w / 2 - 0.05]) {
    b.part();
    b.bar([px, y + 0.98, z - d / 2 + 0.05], [px, y + 2.25, z - d / 2 + 0.05], 0.02, 0.02, 0x6a6459, 4);
    b.bar([px, y + 0.98, z + d / 2 - 0.05], [px, y + 2.15, z + d / 2 + 0.12], 0.02, 0.02, 0x6a6459, 4);
  }
  b.part();
  b.quad([x - w / 2 - 0.2, y + 2.25, z - d / 2], [x + w / 2 + 0.2, y + 2.25, z - d / 2], [x + w / 2 + 0.2, y + 2.05, z + d / 2 + 0.45], [x - w / 2 - 0.2, y + 2.05, z + d / 2 + 0.45], rng.chance(0.5) ? city.tin : city.tinRust, [0, 1, 0.1]);
  b.part();
  b.cylinder(x - 0.45, y + 0.98, z, 0.17, 0.11, 0.26, 0xa8a8a0, 8);
  for (let i = 0; i < 4; i++) {
    b.part();
    b.cylinder(x + 0.05 + i * 0.22, y + 0.98, z - 0.15, 0.08, 0.08, 0.24, rng.pick([0xe2a22d, 0xf4f1e7, 0xc8413a]), 7);
  }
  for (let i = 0; i < 3; i++) {
    b.part();
    b.box(x - 0.8 + i * 0.5, y + 1.92, z - 0.02, x - 0.45 + i * 0.5, y + 2.06, z + 0.02, rng.pick(awnings));
  }
  const benchZ = z - side * 1.1;
  b.part();
  b.box(x - 1.3, y, benchZ - 0.12, x + 1.3, y + 0.42, benchZ + 0.12, 0x6e5a43);
  bystander(b, assets, x - 0.6, y, benchZ, 0, rng, true);
  if (rng.chance(0.6)) bystander(b, assets, x + 0.5, y, benchZ, 0.3, rng, true);
}

/** A fruit cart, heaped with whatever is in season. */
export function fruitCart(b: Batch, assets: Assets, x: number, side: number, rng: Rng): void {
  const z = side * (ROAD_HALF + 1.5);
  const y = 0.22;
  b.part();
  b.box(x - 1, y + 0.55, z - 0.45, x + 1, y + 0.68, z + 0.45, 0x8c6a44);
  for (const [dx, dz] of [[-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4]] as const) {
    b.part();
    b.bar([x + dx, y, z + dz], [x + dx, y + 0.55, z + dz], 0.03, 0.03, 0x4a4238, 4);
  }
  const fruit = rng.pick([0xe88a2d, 0xc8413a, 0x8fb63f, 0xf0c93a]);
  for (let i = 0; i < 26; i++) {
    b.part();
    const r = rng.range(0.07, 0.11);
    b.ellipsoid(x + rng.range(-0.85, 0.85), y + 0.76 + rng.range(0, 0.14), z + rng.range(-0.34, 0.34), r, r, r, fruit, 3, 6);
  }
  bystander(b, assets, x + 1.35, y, z - side * 0.2, side > 0 ? 0.2 : 2.9, rng);
}

/**
 * A foot-over-bridge across the main road: stairs at each end, a caged deck, and people crossing.
 * The sheer number of them was the reference video's other visual idea, here in Dhaka's own steel.
 */
export function footBridge(b: Batch, assets: Assets, x: number, rng: Rng): void {
  const deckY = 6.6;
  const halfZ = SIDEWALK_HALF - 2.4;
  const width = 2.6;
  const steel = 0x6e8088;
  const paint = 0x3f7f6e;
  const x0 = x - width / 2;
  const x1 = x + width / 2;
  // Deck.
  b.part();
  b.box(x0, deckY - 0.4, -halfZ, x1, deckY, halfZ, paint);
  b.part();
  b.box(x0 + 0.04, deckY, -halfZ, x1 - 0.04, deckY + 0.02, halfZ, 0xbdb6a6);
  // Side trusses with their mesh, on the visible near (-x) side and its far twin.
  for (const u of [x0, x1]) {
    b.part();
    b.box(u - 0.04, deckY + 1.15, -halfZ, u + 0.04, deckY + 1.23, halfZ, steel);
    for (let z = -halfZ; z <= halfZ; z += 1.6) {
      b.part();
      b.bar([u, deckY, z], [u, deckY + 1.2, z], 0.03, 0.03, steel, 4);
      if (z + 1.6 <= halfZ) b.bar([u, deckY, z], [u, deckY + 1.2, z + 1.6], 0.015, 0.015, steel, 3);
    }
  }
  // Support legs each side of the road.
  for (const z of [-ROAD_HALF - 0.6, ROAD_HALF + 0.6]) {
    b.part();
    b.block(x, 0.2, z, 1.1, 0.2, 1.1, 0xb7b1a2);
    b.part();
    b.bar([x, 0.4, z], [x, deckY - 0.4, z], 0.17, 0.15, steel, 8);
  }
  // Stairs running along the pavement on both ends.
  for (const side of [-1, 1]) {
    const startZ = side * halfZ;
    const run = 8;
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const y = deckY - t * (deckY - 0.2);
      const zA = startZ + (side * (i * run)) / 16;
      const zB = startZ + (side * ((i + 1) * run)) / 16;
      b.part();
      b.box(x0, y - 0.2, Math.min(zA, zB), x1, y, Math.max(zA, zB), i % 2 ? 0xbdb6a6 : 0xb0a998);
    }
    b.part();
    b.bar([x0, deckY + 1.1, startZ], [x0, 1.3, startZ + side * run], 0.03, 0.03, steel, 4);
    b.bar([x1, deckY + 1.1, startZ], [x1, 1.3, startZ + side * run], 0.03, 0.03, steel, 4);
  }
  // A banner across the deck, as every footbridge in the city carries.
  b.part();
  b.box(x0 - 0.04, deckY + 0.2, -5, x0, deckY + 1.05, 5, 0xf4f1e7);
  b.part();
  b.quad([x0 - 0.05, deckY + 0.24, 4.9], [x0 - 0.05, deckY + 0.24, -4.9], [x0 - 0.05, deckY + 1.01, -4.9], [x0 - 0.05, deckY + 1.01, 4.9], 0xffffff, [-1, 0, 0], posterUv(rng.int(0, 5)));
  const crossers = rng.int(2, 6);
  for (let i = 0; i < crossers; i++) {
    bystander(b, assets, x + rng.range(-0.6, 0.6), deckY + 0.02, rng.range(-halfZ + 1, halfZ - 1), rng.chance(0.5) ? 0 : Math.PI, rng);
  }
}
