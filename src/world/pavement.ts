import type { Assets } from "../assets";
import { Surface, type Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { awnings, city } from "../shared/palette";
import { posterUv } from "../signs/regions";
import { CHUNK_LENGTH, FRONT_ROW, ROAD_HALF, SIDEWALK_HALF, type Cells } from "./layout";
import { bystander } from "./landmarks";

/**
 * A Dhaka footpath is never clear. It runs in three bands from the kerb: poles, trees and railings;
 * a narrow strip people actually walk in; and the frontage, taken by hawkers, parked motorbikes,
 * bus stops and whatever the shops have spilled out. On the near side a yard of open ground runs
 * on to the first buildings, with its rickshaw stand, parked cars and tea shack.
 *
 * Everything is in chunk-local x. `clear(x, side)` says where the pavement is free of a junction
 * or a bridge's stair.
 */

/** Distance from the road's centre to the inner edge of the frontage band. */
const FRONTAGE = ROAD_HALF + 2.55;

type Clear = (x: number, side: number) => boolean;

const facingRoad = (side: number): number => (side > 0 ? Math.PI : 0);

function goods(b: Batch, x0: number, x1: number, y: number, z0: number, z1: number, rng: Rng): void {
  for (let x = x0 + 0.08; x < x1 - 0.12; x += rng.range(0.14, 0.3)) {
    for (let z = z0 + 0.08; z < z1 - 0.12; z += rng.range(0.16, 0.3)) {
      if (rng.chance(0.25)) continue;
      b.part();
      if (rng.chance(0.5)) b.box(x, y, z, x + rng.range(0.08, 0.16), y + rng.range(0.05, 0.22), z + rng.range(0.08, 0.16), rng.pick([...awnings, 0xe8e4d8, 0x8c7a61]));
      else {
        const r = rng.range(0.05, 0.09);
        b.ellipsoid(x + r, y + r * 0.8, z + r, r, r * 0.85, r, rng.pick([0xe88a2d, 0xc8413a, 0x8fb63f, 0xf0c93a, 0x6a4a8a]), 3, 6);
      }
    }
  }
}

/** A tarp on the paving, heaped with whatever is for sale, and its seller on a low stool. */
function hawkerSheet(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const z0 = side * (FRONTAGE + 0.15);
  const z1 = side * (FRONTAGE + 1.25);
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  b.part();
  b.box(x - 0.9, 0.2, lo, x + 0.9, 0.225, hi, rng.pick([0x2f6fb0, 0xc8413a, 0x4a4f50, 0xe2a22d]));
  goods(b, x - 0.85, x + 0.85, 0.225, lo + 0.05, hi - 0.05, rng);
  b.part();
  b.box(x + 1.05, 0.2, side * (FRONTAGE + 0.7) - 0.15, x + 1.35, 0.42, side * (FRONTAGE + 0.7) + 0.15, 0x6e5a43);
  bystander(b, assets, x + 1.2, 0.0, side * (FRONTAGE + 0.7), facingRoad(side) + side * 0.6, rng, true);
  return 2.6;
}

/** A big umbrella over a folding table: phone recharge, a cobbler, a man selling lottery tickets. */
function umbrellaStall(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const z = side * (FRONTAGE + 0.75);
  b.part();
  b.box(x - 0.55, 0.2, z - 0.35, x + 0.55, 0.92, z + 0.35, rng.pick([0x8c6a44, 0x5e6a6d, 0xd9cfba]));
  goods(b, x - 0.5, x + 0.5, 0.92, z - 0.3, z + 0.3, rng);
  b.part();
  b.bar([x + 0.3, 0.2, z + side * 0.2], [x + 0.3, 2.5, z + side * 0.2], 0.025, 0.025, 0x4a4238, 4);
  b.part();
  const r = rng.range(1.0, 1.3);
  const canopy = rng.pick(awnings);
  const profile: Array<[number, number]> = [[r, 2.28], [r * 0.7, 2.46], [r * 0.35, 2.56], [0.02, 2.6]];
  b.lathe(x + 0.3, z + side * 0.2, profile, canopy, 10);
  bystander(b, assets, x - 0.2, 0.2, z + side * 0.65, facingRoad(side), rng, false);
  if (rng.chance(0.6)) bystander(b, assets, x + 0.2, 0.2, z - side * 0.75, facingRoad(-side), rng, false);
  return 2.5;
}

/** A bamboo frame with a tarp sloping down to the road, over a counter of goods. */
function tarpStall(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const zIn = side * (FRONTAGE + 0.15);
  const zOut = side * (SIDEWALK_HALF - 0.2);
  const bamboo = 0x9a8b74;
  for (const px of [x - 1.3, x + 1.3]) {
    b.part();
    b.bar([px, 0.2, zOut], [px, 2.55, zOut], 0.035, 0.03, bamboo, 5);
    b.bar([px, 0.2, zIn], [px, 2.05, zIn], 0.035, 0.03, bamboo, 5);
  }
  b.part();
  const tarp = rng.pick([0x2f6fb0, 0xc8413a, 0xe2a22d, 0x5e6a6d, 0x2f8f6b]);
  b.quad([x - 1.45, 2.58, zOut + side * 0.1], [x + 1.45, 2.58, zOut + side * 0.1], [x + 1.45, 2.0, zIn - side * 0.35], [x - 1.45, 2.0, zIn - side * 0.35], tarp, [0, 1, 0]);
  const lo = Math.min(zIn, zOut);
  const hi = Math.max(zIn, zOut);
  b.part();
  b.box(x - 1.2, 0.2, lo + 0.25, x + 1.2, 0.85, hi - 0.45, 0x8c6a44);
  goods(b, x - 1.15, x + 1.15, 0.85, lo + 0.3, hi - 0.5, rng);
  // Goods hung from the frame: bags, sandals, plastic toys.
  for (let u = x - 1.1; u < x + 1.1; u += rng.range(0.25, 0.45)) {
    b.part();
    b.box(u, 1.55, zIn - 0.03, u + 0.16, 1.95, zIn + 0.03, rng.pick([...awnings, 0xe8e4d8]));
  }
  bystander(b, assets, x + rng.range(-0.6, 0.6), 0.2, zOut - side * 0.25, facingRoad(side), rng, false);
  return 3.1;
}

/** What a shop has put out in front of itself: crates, sacks of rice, a stack of buckets. */
function spill(b: Batch, x: number, side: number, rng: Rng): number {
  const z = side * (SIDEWALK_HALF - 0.7);
  for (let u = x; u < x + 2; u += rng.range(0.45, 0.7)) {
    const kind = rng.next();
    b.part();
    if (kind < 0.4) {
      const h = rng.int(1, 3);
      for (let k = 0; k < h; k++) b.box(u, 0.2 + k * 0.32, z - 0.25, u + 0.42, 0.5 + k * 0.32, z + 0.25, rng.pick([0x8c6a44, 0x2f6fb0, 0xc8413a, 0xe2a22d]));
    } else if (kind < 0.75) {
      b.ellipsoid(u + 0.22, 0.45, z, 0.24, 0.27, 0.2, rng.pick([0xe8e0c8, 0xd8ccb0, 0xc9b08a]), 4, 7);
    } else {
      b.cylinder(u + 0.2, 0.2, z, 0.17, 0.2, rng.range(0.4, 1.1), rng.pick(awnings), 8);
    }
  }
  return 2.3;
}

/** Round baskets heaped with vegetables, and the woman selling them crouched behind. */
function baskets(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const z = side * (FRONTAGE + 0.6);
  for (let i = 0; i < 3; i++) {
    const bx = x + i * 0.6;
    b.part();
    b.lathe(bx, z, [[0.18, 0.2], [0.27, 0.32], [0.27, 0.36], [0.02, 0.36]], 0xb09a78, 9);
    b.part();
    b.ellipsoid(bx, 0.38, z, 0.24, 0.1, 0.24, rng.pick([0x8fb63f, 0xe88a2d, 0xc8413a, 0x6a4a8a, 0xf0c93a]), 3, 7);
  }
  bystander(b, assets, x + 0.6, 0.0, z + side * 0.65, facingRoad(side), rng, true);
  return 2;
}

/** A row of motorbikes parked nose-in at an angle, as outside any bank or pharmacy. */
function parkedBikes(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const count = rng.int(3, 6);
  const z = side * (FRONTAGE + 0.85);
  for (let i = 0; i < count; i++) {
    b.part();
    const tone = rng.range(0.8, 1.15);
    b.at(x + i * 0.85, 0.2, z, () => b.stamp(assets.prop("bike_park", "lo"), tone), side * (Math.PI / 2 + rng.range(-0.75, -0.55)));
  }
  return count * 0.85 + 0.8;
}

/** A shelter, a bench, and people waiting for a bus that may or may not stop. */
function busStop(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const zBack = side * (SIDEWALK_HALF - 0.25);
  const zFront = side * (FRONTAGE - 0.1);
  const lo = Math.min(zBack, zFront);
  const hi = Math.max(zBack, zFront);
  const steel = 0x6e8088;
  for (const px of [x - 1.9, x + 1.9]) {
    for (const pz of [zBack, zFront]) {
      b.part();
      b.box(px - 0.05, 0.2, pz - 0.05, px + 0.05, 2.55, pz + 0.05, steel);
    }
  }
  b.part();
  b.box(x - 2.15, 2.55, lo - 0.25, x + 2.15, 2.64, hi + 0.35, 0xd9dcd6);
  b.part();
  b.box(x - 1.9, 0.6, zBack - 0.03, x + 1.9, 2.3, zBack + 0.03, 0xf4f1e7);
  b.quad([x - 1.8, 0.7, zBack - side * 0.04], [x - 0.3, 0.7, zBack - side * 0.04], [x - 0.3, 2.2, zBack - side * 0.04], [x - 1.8, 2.2, zBack - side * 0.04], 0xffffff, [0, 0, -side], posterUv(rng.int(0, 5)));
  b.part();
  b.box(x - 1.7, 0.2, zBack - side * 0.55 - 0.2, x + 1.7, 0.66, zBack - side * 0.55 + 0.2, 0x8d918f);
  const waiting = rng.int(2, 5);
  for (let i = 0; i < waiting; i++) {
    const seated = i < 2 && rng.chance(0.7);
    bystander(b, assets, x - 1.4 + i * 0.75 + rng.range(-0.1, 0.1), seated ? 0.24 : 0.2, seated ? zBack - side * 0.55 : zFront + side * rng.range(0.2, 0.7), facingRoad(side) + rng.range(-0.4, 0.4), rng, seated);
  }
  return 5;
}

/** Two to four people stopped to talk, half on the walking strip. */
function crowd(b: Batch, assets: Assets, x: number, side: number, rng: Rng): number {
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const px = x + Math.cos(a) * 0.45;
    const pz = side * (FRONTAGE + 0.45) + Math.sin(a) * 0.45;
    bystander(b, assets, px, 0.2, pz, Math.atan2(x - px, side * (FRONTAGE + 0.45) - pz), rng);
  }
  return 1.8;
}

/** Rubbish: sacks, a split carton, the rest scattered by crows. */
function rubbish(b: Batch, x: number, side: number, rng: Rng): number {
  const z = side * (ROAD_HALF + 0.75);
  for (let i = 0; i < 9; i++) {
    b.part();
    const r = rng.range(0.12, 0.28);
    b.ellipsoid(x + rng.range(-0.6, 0.6), 0.2 + r * 0.5, z + rng.range(-0.35, 0.35), r, r * 0.7, r * rng.range(0.7, 1.2), rng.pick([0x5f6366, 0xd8d4c8, 0x8a7a63, 0x40464a, 0xe8e4d8]), 3, 6);
  }
  b.part();
  b.box(x - 0.2, 0.2, z - 0.25, x + 0.25, 0.48, z + 0.2, 0xb09a78);
  return 1.6;
}

/** Bricks and sand for someone's repairs, left on the footpath until they are done. */
function bricks(b: Batch, x: number, side: number, rng: Rng): number {
  const z = side * (FRONTAGE + 0.7);
  b.part();
  b.as(Surface.brick, () => b.box(x - 0.6, 0.2, z - 0.4, x + 0.5, 0.2 + rng.range(0.45, 0.9), z + 0.4, city.brick));
  b.part();
  b.as(Surface.soil, () => b.cylinder(x + 1.2, 0.2, z, 0.75, 0.05, 0.55, 0xd9cfae, 9));
  return 2.4;
}

/** A missing drain slab: the dark channel under the footpath, open to anyone not looking. */
function openDrain(b: Batch, x: number, side: number): number {
  const z0 = side * (FRONTAGE + 0.2);
  const z1 = side * (FRONTAGE + 0.85);
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  b.part();
  b.quad([x - 0.5, 0.205, hi], [x + 0.5, 0.205, hi], [x + 0.5, 0.205, lo], [x - 0.5, 0.205, lo], 0x2c2f31, [0, 1, 0]);
  b.part();
  b.as(Surface.concrete, () => b.box(x + 0.55, 0.2, lo - 0.05, x + 1.25, 0.32, hi + 0.05, 0xc9c4b8));
  return 1.6;
}

/** A street dog asleep on the warm paving. */
function dog(b: Batch, x: number, side: number, rng: Rng): number {
  const z = side * (FRONTAGE + rng.range(0.3, 1.0));
  const coat = rng.pick([0xc9b08a, 0x8a7a63, 0xe8e0d0, 0x5a5048]);
  const turn = rng.range(0, Math.PI * 2);
  b.part();
  b.at(x, 0.2, z, () => {
    b.ellipsoid(0, 0.17, 0, 0.36, 0.16, 0.2, coat, 4, 8);
    b.ellipsoid(0.36, 0.14, 0.12, 0.13, 0.11, 0.11, coat, 4, 7);
    b.ellipsoid(0.47, 0.13, 0.13, 0.06, 0.05, 0.05, coat, 3, 5);
    b.bar([-0.3, 0.1, -0.1], [-0.42, 0.04, 0.22], 0.035, 0.02, coat, 4);
  }, turn);
  return 1.2;
}

/** A green electricity or telecom cabinet on a plinth, plastered with notices. */
function cabinet(b: Batch, x: number, side: number, rng: Rng): number {
  const z = side * (ROAD_HALF + 0.75);
  b.part();
  b.box(x - 0.45, 0.2, z - 0.3, x + 0.45, 0.32, z + 0.3, 0xb7b1a2);
  b.part();
  b.box(x - 0.4, 0.32, z - 0.25, x + 0.4, 1.5, z + 0.25, rng.pick([0x4f7f73, 0x7a8d96, 0x8c8f8a]));
  b.part();
  b.box(x - 0.42, 1.5, z - 0.28, x + 0.42, 1.55, z + 0.28, 0x6a6f70);
  return 1.3;
}

/** Kerbside railing, painted, to keep people off the road. They climb it anyway. */
function railing(b: Batch, x: number, side: number, rng: Rng, length: number): number {
  const z = side * (ROAD_HALF + 0.22);
  const paint = rng.pick([0x2f8f6b, 0xd6d6cc, 0x5e6a6d]);
  b.part();
  for (let u = 0; u <= length; u += 1.5) b.box(x + u - 0.03, 0.2, z - 0.03, x + u + 0.03, 1.15, z + 0.03, paint);
  b.part();
  b.box(x, 1.1, z - 0.035, x + length, 1.16, z + 0.035, paint);
  b.box(x, 0.55, z - 0.02, x + length, 0.59, z + 0.02, paint);
  return length + 0.5;
}

/** Rickshaws waiting for a fare, pullers dozing on their own seats. */
function rickshawStand(b: Batch, assets: Assets, x: number, z: number, rng: Rng): number {
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const kind = rng.chance(0.5) ? "rickshaw_fan" : "rickshaw_cycle";
    if (!assets.hasProp(kind)) continue;
    b.part();
    b.at(x + i * 1.35, 0.02, z + rng.range(-0.3, 0.3), () => b.stamp(assets.prop("rickshaw_park", "lo")), Math.PI / 2 + rng.range(-0.25, 0.25));
    if (rng.chance(0.5)) bystander(b, assets, x + i * 1.35 + 0.2, 0.36, z + 0.3, rng.range(0, 6), rng, true);
  }
  return count * 1.35 + 1;
}

/** A tea shack of tin and bamboo with a bench out front: the near side's open ground fills with these. */
function teaShack(b: Batch, assets: Assets, x: number, z: number, rng: Rng): number {
  const w = rng.range(2.4, 3.2);
  const d = 2;
  b.part();
  b.as(Surface.tin, () => b.box(x, 0, z, x + w, 2.3, z + d, city.tin));
  b.part();
  b.as(Surface.tin, () => b.quad([x - 0.3, 2.55, z - 0.6], [x + w + 0.3, 2.55, z - 0.6], [x + w + 0.3, 2.3, z + d + 0.2], [x - 0.3, 2.3, z + d + 0.2], rng.chance(0.5) ? city.tinRust : city.tin, [0, 1, 0]));
  b.part();
  b.panel(x + 0.3, 0.9, x + w - 0.3, 2.0, z - 0.01, 0x3a3d3f);
  for (const px of [x - 0.2, x + w + 0.2]) {
    b.part();
    b.bar([px, 0, z - 0.55], [px, 2.52, z - 0.55], 0.04, 0.035, 0x9a8b74, 5);
  }
  b.part();
  b.box(x + 0.2, 0, z - 1.3, x + w - 0.2, 0.42, z - 1.05, 0x6e5a43);
  bystander(b, assets, x + 0.6, 0.0, z - 1.18, Math.PI, rng, true);
  if (rng.chance(0.6)) bystander(b, assets, x + w - 0.6, 0.0, z - 1.18, Math.PI + 0.3, rng, true);
  return w + 1.2;
}

/** A car parked half on the open ground, nose to the road. */
function parkedCar(b: Batch, assets: Assets, x: number, z: number, rng: Rng): number {
  const kind = rng.pick(["sedan", "wagon", "taxi"]);
  if (!assets.hasProp(kind)) return 0;
  b.part();
  b.at(x + 1.2, 0.02, z + 1.8, () => b.stamp(assets.prop(kind, "lo"), rng.range(0.95, 1.2)), Math.PI / 2 + rng.range(-0.15, 0.15));
  return 2.8;
}

/** Fills both pavements of one chunk, and the near side's yard. */
export function furnishPavements(cells: Cells, assets: Assets, rng: Rng, clear: Clear): void {
  const free = (x0: number, x1: number, side: number): boolean => {
    for (let x = x0; x <= x1; x += 0.75) if (!clear(x, side)) return false;
    return clear(x1, side);
  };
  for (const side of [1, -1]) {
    let x = -CHUNK_LENGTH + rng.range(0.5, 3);
    let stops = 0;
    while (x < -1.5) {
      // The near pavement is mostly behind the roofs in front of it: it gets half the clutter.
      if (side > 0 && rng.chance(0.5)) {
        x += rng.range(2, 5);
        continue;
      }
      const roll = rng.next();
      const begin = x;
      let used = 0;
      const b = cells.at(x, side * ROAD_HALF);
      const tryItem = (length: number, draw: () => number): void => {
        if (x + length > -0.5 || !free(x - 0.3, x + length, side)) return;
        used = draw();
      };
      if (roll < 0.1) tryItem(2.8, () => hawkerSheet(b, assets, x + 0.9, side, rng));
      else if (roll < 0.19) tryItem(2.6, () => umbrellaStall(b, assets, x + 0.6, side, rng));
      else if (roll < 0.29) tryItem(3.2, () => tarpStall(b, assets, x + 1.5, side, rng));
      else if (roll < 0.39) tryItem(5.5, () => parkedBikes(b, assets, x, side, rng));
      else if (roll < 0.44 && stops === 0) tryItem(5, () => {
        stops++;
        return busStop(b, assets, x + 2.4, side, rng);
      });
      else if (roll < 0.52) tryItem(2, () => crowd(b, assets, x + 0.9, side, rng));
      else if (roll < 0.6) tryItem(2.3, () => spill(b, x, side, rng));
      else if (roll < 0.66) tryItem(2, () => baskets(b, assets, x + 0.3, side, rng));
      else if (roll < 0.71) tryItem(1.6, () => rubbish(b, x + 0.7, side, rng));
      else if (roll < 0.74) tryItem(2.4, () => bricks(b, x + 0.6, side, rng));
      else if (roll < 0.78) tryItem(1.6, () => openDrain(b, x + 0.5, side));
      else if (roll < 0.82) tryItem(1.2, () => dog(b, x + 0.5, side, rng));
      else if (roll < 0.86) tryItem(1.3, () => cabinet(b, x + 0.6, side, rng));
      else if (roll < 0.93) {
        const length = rng.range(4.5, 10.5);
        tryItem(length, () => railing(b, x, side, rng, length));
      }
      x = begin + Math.max(used, 0.5) + rng.range(0.2, 1.5);
    }
  }

  // The near side's open ground, between the pavement and the first row of buildings.
  const yard = SIDEWALK_HALF + 0.8;
  let x = -CHUNK_LENGTH + rng.range(0.5, 4);
  while (x < -3) {
    const roll = rng.next();
    const begin = x;
    let used = 0;
    const ok = (length: number): boolean => x + length < -0.5 && free(x - 0.5, x + length, 1) && free(x - 0.5, x + length, 2);
    const b = cells.at(x, yard);
    if (roll < 0.14 && ok(6)) used = rickshawStand(b, assets, x + 0.8, yard + 1.6, rng);
    else if (roll < 0.26 && ok(4.5)) used = teaShack(b, assets, x, FRONT_ROW - 2.6, rng);
    else if (roll < 0.36 && ok(3)) used = parkedCar(b, assets, x, yard + 0.6, rng);
    x = begin + Math.max(used, 2) + rng.range(2, 7);
  }
}
