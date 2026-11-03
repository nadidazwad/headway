import { Batch, type MeshData } from "../geometry";
import { stationStops } from "../line6";
import { Rng, hashSeed } from "../shared/rng";
import { apartmentBlock, brickBlock, glassTower, type Plot } from "./buildings";
import { CHUNK_LENGTH, FAR_BACK, FAR_FRONT, FRONT_ROW, SIDEWALK_HALF, type Context } from "./layout";
import { palm, tree } from "./nature";
import { footBridge, fruitCart, mosque, pond, teaStall } from "./landmarks";
import { buildRoad, buildSideStreet, buildStreetFurniture } from "./street";
import { STATION_HALF, buildStation } from "./station";
import { buildViaduct } from "./viaduct";

export interface ChunkData {
  index: number;
  mesh: MeshData;
  triangles: number;
}

/** Tallest a building may stand here without hiding the train from any camera in the tour. */
function heightLimit(z: number): number {
  if (z < 0) return 200;
  return z * 0.52;
}

function lodAt(z: number): 0 | 1 | 2 {
  const distance = z < 0 ? -z : z;
  if (z < 0) return distance < 62 ? 0 : distance < 128 ? 1 : 2;
  return distance < 62 ? 0 : distance < 110 ? 1 : 2;
}

function fillRow(b: Batch, rng: Rng, x0: number, x1: number, z0: number, z1: number, streetFront: boolean, gaps: Array<[number, number]>): void {
  let cursor = x0;
  while (cursor < x1 - 5) {
    const gap = gaps.find(([a, b2]) => cursor >= a - 3 && cursor < b2);
    if (gap) {
      cursor = gap[1] + 0.4;
      continue;
    }
    const next = gaps.filter(([a]) => a > cursor).reduce((m, [a]) => Math.min(m, a), x1);
    const width = Math.min(rng.range(11, 24), next - cursor);
    if (width < 5) {
      cursor = next;
      continue;
    }
    const inset = rng.range(0, 1.4);
    const plot: Plot = {
      x0: cursor,
      x1: cursor + width - rng.range(0.3, 1.1),
      z0: z0 + inset * 0.3,
      z1: z1 - inset,
      lod: lodAt((z0 + z1) / 2),
      maxHeight: heightLimit(z0),
      streetFront,
    };
    const distance = Math.abs((z0 + z1) / 2);
    const roll = rng.next();
    if (roll > 0.955 && plot.lod <= 1 && width > 14) {
      mosque(b, plot, rng);
    } else if (roll > 0.93 && plot.lod === 0 && width > 12) {
      pond(b, plot, rng);
    } else if (roll < 0.05 && plot.lod === 0) {
      // An empty lot: a tree or two, a few palms. There is always one nearby.
      const trees = rng.int(1, 3);
      for (let i = 0; i < trees; i++) {
        const tx = rng.range(plot.x0 + 2, plot.x1 - 2);
        const tz = rng.range(plot.z0 + 2, plot.z1 - 2);
        if (rng.chance(0.5)) palm(b, tx, tz, rng.range(7, 11), rng);
        else tree(b, tx, tz, rng.range(7, 12), rng);
      }
    } else if (z0 < -40 && distance > 45 && roll < 0.36 && plot.maxHeight > 40) {
      glassTower(b, plot, rng);
    } else if (roll < 0.24) {
      brickBlock(b, plot, rng);
    } else {
      apartmentBlock(b, plot, rng);
    }
    cursor += width;
  }
}

/** Builds one stretch of the endless line. Same seed and index, same bytes. */
export function generateChunk(seed: number, index: number): ChunkData {
  const start = index * CHUNK_LENGTH;
  const context: Context = { seed, chunk: index, start };
  const rng = new Rng(hashSeed(seed, index));
  const b = new Batch(1 << 16);

  const stops = stationStops(start - CHUNK_LENGTH, start + CHUNK_LENGTH * 2);
  const stationCenters = stops.map((stop) => -(stop.center - start));
  const inStation = (x: number): boolean => stationCenters.some((center) => Math.abs(x - center) < STATION_HALF);

  buildRoad(b, context, rng);
  buildViaduct(b, context, inStation);
  for (const stop of stops) buildStation(b, context, stop, rng);

  const gaps: Array<[number, number]> = [];
  if (rng.chance(0.42)) {
    const width = rng.range(6.5, 9);
    const gapStart = -CHUNK_LENGTH + rng.range(4, CHUNK_LENGTH - width - 4);
    gaps.push([gapStart, gapStart + width]);
    buildSideStreet(b, gapStart, gapStart + width, rng);
  }
  buildStreetFurniture(b, context, rng, (x) => !gaps.some(([a, c]) => x > a && x < c));

  // Street trade and the odd foot-over-bridge, away from stations that already bridge the road.
  const clear = (x: number): boolean => !inStation(x) && !gaps.some(([a, c]) => x > a - 3 && x < c + 3);
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-CHUNK_LENGTH + 3, -3);
    if (!clear(x)) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    if (rng.chance(0.55)) teaStall(b, x, side, rng);
    else fruitCart(b, x, side, rng);
  }
  if (rng.chance(0.16)) {
    const x = rng.range(-CHUNK_LENGTH + 8, -8);
    if (clear(x) && clear(x - 5) && clear(x + 5)) footBridge(b, x, rng);
  }

  // Front rows of blocks, then the deep rows behind. A narrow lane separates each row.
  const xMin = -CHUNK_LENGTH;
  const rowFront = (from: number, to: number, first: boolean): void => {
    fillRow(b, rng, xMin, 0, from, to, first, gaps);
  };
  let z = FRONT_ROW;
  let first = true;
  while (z < FAR_FRONT - 12) {
    const depth = rng.range(15, 22);
    rowFront(z, Math.min(z + depth, FAR_FRONT), first);
    z += depth + rng.range(4.5, 7);
    first = false;
  }
  z = -SIDEWALK_HALF;
  first = true;
  while (z > FAR_BACK + 12) {
    const depth = rng.range(15, 24);
    fillRow(b, rng, xMin, 0, Math.max(z - depth, FAR_BACK), z, false, gaps);
    z -= depth + rng.range(4.5, 7);
    first = false;
  }
  void first;

  return { index, mesh: b.finish(), triangles: b.triangles };
}
