import type { Assets } from "../assets";
import { Batch, type MeshData } from "../geometry";
import { Rng, hashSeed } from "../shared/rng";
import { apartmentBlock, brickBlock, glassTower, stackedBlock, type Plot } from "./buildings";
import { CHUNK_LENGTH, FAR_BACK, FAR_FRONT, FRONT_ROW, SIDEWALK_HALF, localX, type Context } from "./layout";
import { BRIDGE_HALF, STAIR_RUN, chunkPlan } from "./plan";
import { palm, tree } from "./nature";
import { footBridge, fruitCart, mosque, pond, teaStall } from "./landmarks";
import { buildRoad, buildSideStreet, buildStreetFurniture } from "./street";
import { buildViaduct } from "./viaduct";

export interface ChunkData {
  index: number;
  /** One stretch of city, cut into pieces small enough to skip when they are off screen. */
  parts: MeshData[];
  triangles: number;
}

const CELL = 20;

/** Hands out a separate mesh per cell of the chunk's plan. */
class Pieces {
  private readonly cells = new Map<number, Batch>();

  at(x: number, z: number): Batch {
    const key = Math.floor(x / CELL) * 1000 + Math.floor(z / CELL);
    let batch = this.cells.get(key);
    if (!batch) {
      batch = new Batch(1 << 12);
      this.cells.set(key, batch);
    }
    return batch;
  }

  get all(): Batch[] {
    return [...this.cells.values()];
  }
}

/** Tallest a building may stand here without hiding the train from any camera in the tour. */
function heightLimit(z: number): number {
  if (z < 0) return 200;
  return 3.5 + z * 0.36;
}

function lodAt(z: number): 0 | 1 | 2 {
  const distance = z < 0 ? -z : z;
  if (z < 0) return distance < 62 ? 0 : distance < 128 ? 1 : 2;
  return distance < 62 ? 0 : distance < 110 ? 1 : 2;
}

/** A downloaded landmark or tower, standing on the plot's centre with its long side to the road. */
function propOnPlot(b: Batch, assets: Assets, key: string, plot: Plot, lod: string, tone: number): boolean {
  if (!assets.hasProp(key)) return false;
  const [width, height, depth] = assets.propSize(key);
  if (width > plot.x1 - plot.x0 + 1 || depth > plot.z1 - plot.z0 + 6 || height > plot.maxHeight + 12) return false;
  b.at((plot.x0 + plot.x1) / 2, 0, (plot.z0 + plot.z1) / 2, () => b.stamp(assets.prop(key, lod), tone));
  return true;
}

function fillRow(pieces: Pieces, assets: Assets, rng: Rng, x0: number, x1: number, z0: number, z1: number, streetFront: boolean, gaps: Array<[number, number]>): void {
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
    const b = pieces.at(cursor + width / 2, (z0 + z1) / 2);
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
    const assetLod = plot.lod === 0 ? "hi" : "lo";
    if (roll > 0.982 && propOnPlot(b, assets, rng.chance(0.6) ? "mosque_lalbagh" : "mosque_stylized", { ...plot, x1: plot.x0 + 40 }, assetLod, 1)) {
      cursor += 34;
      continue;
    } else if (roll > 0.955 && plot.lod <= 1 && width > 14) {
      mosque(b, plot, rng);
    } else if (roll > 0.88 && plot.lod <= 1 && propOnPlot(b, assets, rng.chance(0.5) ? "tower_asian" : "tower_soviet", plot, assetLod, 1.05)) {
      // A real downloaded tower block standing among the generated ones.
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
    } else if (roll > 0.72 && plot.maxHeight > 16) {
      stackedBlock(b, plot, rng);
    } else if (roll < 0.24) {
      brickBlock(b, plot, rng);
    } else {
      apartmentBlock(b, plot, rng);
    }
    cursor += width;
  }
}

/** Builds one stretch of the endless line. Same seed and index, same bytes. */
export function generateChunk(seed: number, index: number, assets: Assets): ChunkData {
  const start = index * CHUNK_LENGTH;
  const context: Context = { seed, chunk: index, start };
  const rng = new Rng(hashSeed(seed, index));
  const b = new Batch(1 << 15);
  const street = new Batch(1 << 15);
  const pieces = new Pieces();

  const plan = chunkPlan(seed, index);
  const toLocal = (distance: number): number => localX(context, distance);
  const gaps: Array<[number, number]> = [];
  const junction = plan.sideStreet;
  if (junction) gaps.push([toLocal(junction.centre + junction.half), toLocal(junction.centre - junction.half)]);
  buildRoad(street, context, rng, gaps);
  buildViaduct(b, context);
  if (junction) buildSideStreet(street, gaps[0]![0], gaps[0]![1], junction.zebra, rng);

  // What keeps the pavement clear on each side: the junction, and a bridge's stair and columns.
  const blocked: Array<{ from: number; to: number; side: 0 | 1 | -1 }> = gaps.map(([a, c]) => ({ from: a - 3, to: c + 3, side: 0 }));
  const bridge = plan.footBridge;
  if (bridge) {
    const x = toLocal(bridge.centre);
    blocked.push({ from: x - BRIDGE_HALF - 2.2, to: x + BRIDGE_HALF + 2.2, side: 0 });
    bridge.stairs.forEach((direction, i) => {
      const run = -direction * (STAIR_RUN + BRIDGE_HALF + 1.5);
      blocked.push({ from: Math.min(x, x + run), to: Math.max(x, x + run), side: i === 0 ? 1 : -1 });
    });
  }
  const clear = (x: number, side: number): boolean => !blocked.some((r) => x > r.from && x < r.to && (r.side === 0 || r.side === side));
  buildStreetFurniture(street, context, rng, clear);

  // Street trade, and now and then a foot-over-bridge.
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-CHUNK_LENGTH + 3, -3);
    const side = rng.chance(0.5) ? 1 : -1;
    if (!clear(x - 2, side) || !clear(x + 2, side)) continue;
    if (rng.chance(0.55)) teaStall(street, assets, x, side, rng);
    else fruitCart(street, assets, x, side, rng);
  }
  if (bridge) footBridge(street, assets, toLocal(bridge.centre), [-bridge.stairs[0], -bridge.stairs[1]], rng);

  // Front rows of blocks, then the deep rows behind. A narrow lane separates each row.
  const xMin = -CHUNK_LENGTH;
  const rowFront = (from: number, to: number, first: boolean): void => {
    fillRow(pieces, assets, rng, xMin, 0, from, to, first, gaps);
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
    fillRow(pieces, assets, rng, xMin, 0, Math.max(z - depth, FAR_BACK), z, false, gaps);
    z -= depth + rng.range(4.5, 7);
    first = false;
  }
  void first;

  const batches = [b, street, ...pieces.all];
  const parts = batches.filter((batch) => batch.triangles > 0).map((batch) => batch.finish());
  return { index, parts, triangles: batches.reduce((sum, batch) => sum + batch.triangles, 0) };
}
