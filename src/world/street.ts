import type { Batch, Vec3 } from "../geometry";
import type { Rng } from "../shared/rng";
import { city } from "../shared/palette";
import { CHUNK_LENGTH, FAR_BACK, FAR_FRONT, MEDIAN_HALF, ROAD_HALF, SIDEWALK_HALF, SPAN, latticeIn, localX, type Context } from "./layout";
import { tree } from "./nature";

/** The stretch of main road under the viaduct, its median, kerbs and pavements. */
/** `junctions` are the local x ranges where a side street meets the road and the median opens. */
export function buildRoad(b: Batch, context: Context, rng: Rng, junctions: ReadonlyArray<readonly [number, number]>): void {
  const x0 = -CHUNK_LENGTH;
  const x1 = 0;
  b.part();
  b.quad([x0, 0, FAR_FRONT], [x1, 0, FAR_FRONT], [x1, 0, FAR_BACK], [x0, 0, FAR_BACK], city.ground, [0, 1, 0]);
  b.part();
  b.quad([x0, 0.02, ROAD_HALF], [x1, 0.02, ROAD_HALF], [x1, 0.02, -ROAD_HALF], [x0, 0.02, -ROAD_HALF], city.road, [0, 1, 0]);

  // Lane dashes, in line position so they stay continuous across chunks.
  for (const distance of latticeIn(context, 6)) {
    const x = localX(context, distance);
    for (const z of [5.4, 9.4, -5.4, -9.4]) {
      b.quad([x - 2.6, 0.03, z + 0.07], [x, 0.03, z + 0.07], [x, 0.03, z - 0.07], [x - 2.6, 0.03, z - 0.07], city.roadLine, [0, 1, 0]);
    }
  }
  // Worn patches of darker tar, because every road here has been dug up at least twice.
  const patches = rng.int(2, 5);
  for (let i = 0; i < patches; i++) {
    const px = rng.range(x0 + 3, x1 - 3);
    const pz = rng.range(-12, 12);
    b.quad([px - rng.range(1, 3), 0.025, pz + rng.range(0.5, 1.2)], [px + rng.range(1, 3), 0.025, pz + rng.range(0.5, 1.2)], [px + rng.range(1, 3), 0.025, pz - rng.range(0.5, 1.2)], [px - rng.range(1, 3), 0.025, pz - rng.range(0.5, 1.2)], 0xbcbbb5, [0, 1, 0]);
  }

  // The viaduct's shadow, thrown away from the sun onto the far lanes.
  b.part();
  b.quad([x0, 0.028, -5], [x1, 0.028, -5], [x1, 0.028, -14], [x0, 0.028, -14], 0xb4b3ad, [0, 1, 0]);
  buildMedian(b, context, junctions);
  for (const side of [1, -1]) buildPavement(b, context, side);
}

function kerbStripes(b: Batch, context: Context, z: number, top: number, height: number): void {
  for (const distance of latticeIn(context, 1)) {
    const x = localX(context, distance);
    const dark = Math.floor(distance) % 2 === 0;
    b.box(x - 1, 0, z - 0.14, x, top + height, z + 0.14, dark ? city.kerbDark : city.kerbLight);
  }
}

function buildMedian(b: Batch, context: Context, junctions: ReadonlyArray<readonly [number, number]>): void {
  // The median stops for a junction, so the cross street can get through.
  const openings = junctions.map(([a, c]) => [a - 1.5, c + 1.5] as const);
  const solid = [-CHUNK_LENGTH, ...openings.flat(), 0];
  for (let i = 0; i + 1 < solid.length; i += 2) {
    b.part();
    b.box(solid[i]!, 0, -MEDIAN_HALF, solid[i + 1]!, 0.26, MEDIAN_HALF, city.soil);
  }
  // A low clipped hedge along the median, as under the real viaduct, broken at each pier and junction.
  const piersHere = latticeIn(context, SPAN).map((distance) => localX(context, distance));
  const breaks = [...piersHere.map((x) => [x - 3.2, x + 3.2] as const), ...openings].sort((a, c) => a[0] - c[0]);
  const edges = [-CHUNK_LENGTH, ...breaks.flat(), 0];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const from = Math.max(edges[i]!, -CHUNK_LENGTH);
    const to = Math.min(edges[i + 1]!, 0);
    if (to <= from) continue;
    b.part();
    b.box(from, 0.26, 0.5, to, 0.7, 1.1, 0xd6d8ce);
    b.part();
    b.box(from, 0.26, -1.1, to, 0.7, -0.5, 0xcfd2c6);
  }
}

function buildPavement(b: Batch, context: Context, side: number): void {
  const inner = side * ROAD_HALF;
  const outer = side * SIDEWALK_HALF;
  const z0 = Math.min(inner, outer);
  const z1 = Math.max(inner, outer);
  b.part();
  b.box(-CHUNK_LENGTH, 0, z0, 0, 0.2, z1, city.sidewalk);
  kerbStripes(b, context, inner, 0.21, 0);
  // Pavers and the drain slabs that are never quite level.
  for (const distance of latticeIn(context, 3)) {
    const x = localX(context, distance);
    b.quad([x - 0.02, 0.205, z1], [x + 0.02, 0.205, z1], [x + 0.02, 0.205, z0], [x - 0.02, 0.205, z0], city.paver, [0, 1, 0]);
  }
}

/** A side street running away from the main road, with its own crossing and building gap. */
export function buildSideStreet(b: Batch, x0: number, x1: number, zebra: boolean, rng: Rng): void {
  for (const [z0, z1] of [[SIDEWALK_HALF - 4.5, FAR_FRONT], [FAR_BACK, -SIDEWALK_HALF + 4.5]] as const) {
    b.part();
    b.quad([x0, 0.21, z1], [x1, 0.21, z1], [x1, 0.21, z0], [x0, 0.21, z0], 0x85848a, [0, 1, 0]);
  }
  void rng;
  // Zebra crossing over the main road.
  if (zebra) {
    for (let z = -12.5; z < 12.5; z += 1.2) {
      if (Math.abs(z) < MEDIAN_HALF + 0.3) continue;
      b.part();
      b.quad([x0 + 1, 0.035, z + 0.6], [x1 - 1, 0.035, z + 0.6], [x1 - 1, 0.035, z], [x0 + 1, 0.035, z], 0xeeebe0, [0, 1, 0]);
    }
  }
}

function sagging(a: Vec3, b: Vec3, sag: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * t * (1 - t) * sag, a[2] + (b[2] - a[2]) * t]);
  }
  return points;
}

/** Street life along the pavement: trees, and concrete poles with their famous wire tangles. */
export function buildStreetFurniture(b: Batch, context: Context, rng: Rng, clear: (x: number, side: number) => boolean): void {
  const clearX = (x: number, side: number): boolean => clear(x - 1.2, side) && clear(x + 1.2, side);
  const poleStep = 36;
  for (const side of [1, -1]) {
    const z = side * (ROAD_HALF + 0.75);
    for (const distance of latticeIn(context, poleStep, side > 0 ? 8 : 26)) {
      const x = localX(context, distance);
      if (!clearX(x, side)) continue;
      b.part();
      b.bar([x, 0.2, z], [x, 9.2, z], 0.14, 0.09, 0xa9a59a, 6);
      b.part();
      for (const armY of [8.9, 8.2]) {
        b.box(x - 0.05, armY, z - 0.8, x + 0.05, armY + 0.09, z + 0.8, 0x6f6c66);
      }
      // A transformer on one pole in three, wrapped in its usual knot of cable.
      if (Math.floor(distance / poleStep) % 3 === 0) {
        b.part();
        b.block(x, 5.8, z + side * 0.32, 0.7, 1.05, 0.5, 0x6e7a7a);
        b.part();
        b.cylinder(x, 6.85, z + side * 0.32, 0.05, 0.05, 0.28, 0x9fb09f, 5);
      }
      const cableColor = 0x5a5c5c;
      const next = x - poleStep;
      const lines = side > 0 ? 3 : 2;
      for (let i = 0; i < lines; i++) {
        const y = 8.9 - (i % 2) * 0.7;
        const offset = lines > 1 ? -0.7 + (i * 1.4) / (lines - 1) : 0;
        const sag = 0.55 + (i % 3) * 0.18;
        b.part();
        b.cable(sagging([x, y + 0.08, z + offset], [next, y + 0.08, z + offset], sag), 0.012, cableColor, 3);
      }
    }
    // Street lamps on long curved arms, as along the viaduct.
    for (const distance of latticeIn(context, 30, side > 0 ? 3 : 18)) {
      const x = localX(context, distance);
      if (!clearX(x, side)) continue;
      const lampZ = side * (ROAD_HALF + 0.3);
      b.part();
      b.bar([x, 0.2, lampZ], [x, 8, lampZ], 0.07, 0.05, 0x7b8588, 6);
      b.bar([x, 8, lampZ], [x, 8.4, lampZ - side * 1.3], 0.04, 0.03, 0x7b8588, 5);
      b.part();
      b.block(x, 8.34, lampZ - side * 1.5, 0.22, 0.09, 0.6, 0x5f6669);
    }
    // Pavement trees.
    for (const distance of latticeIn(context, 15, side > 0 ? 5 : 11)) {
      if (!rng.chance(0.55)) continue;
      const x = localX(context, distance) + rng.range(-3, 3);
      if (!clearX(x, side)) continue;
      const treeZ = side * (ROAD_HALF + 2.2);
      const h = rng.range(6.5, side > 0 ? 8.5 : 11);
      tree(b, x, treeZ, h, rng);
    }
  }
}
