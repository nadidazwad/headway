import type { Batch, Vec3 } from "../geometry";
import type { StationStop } from "../line6";
import { STATIONS, TRAIN_LENGTH } from "../line6";
import { concrete, city, LINE_GREEN } from "../shared/palette";
import { boardUv } from "../signs/regions";
import { CHUNK_LENGTH, DECK_Y, RAIL_Y, TRACK_Z, localX, type Context } from "./layout";
import { trackRun } from "./viaduct";

export const STATION_HALF = 84;
const PLATFORM_HALF = TRAIN_LENGTH / 2 + 5;
const PLATFORM_Y = RAIL_Y + 1.15;
const EDGE_Z = 3.5;
const OUTER_Z = 9.4;
const COLUMN_Z = 8.9;
const CONCOURSE_FLOOR = 9.2;
const CONCOURSE_TOP = DECK_Y - 0.4;
const CONCOURSE_Z = 11.2;
const COLUMN_STEP = 12;
const CREST = RAIL_Y + 10.6;
const SPRING = RAIL_Y + 7.2;

const steelRoof = 0x8f989a;
const steelRib = 0xa9b0b1;
const corrugated = 0xcfd2cf;
const cladding = 0xd5d3ca;
const claddingDark = 0x9da2a0;
const platformTile = 0xb9bbb5;
const stainless = 0xc3c8c9;
const brick = 0x9d4d39;

type Clip = [number, number] | null;

function clip(context: Context, sA: number, sB: number): Clip {
  // s runs opposite to local x. Returns the x range of this chunk within the stretch.
  const x0 = Math.max(localX(context, Math.max(sA, sB)), -CHUNK_LENGTH);
  const x1 = Math.min(localX(context, Math.min(sA, sB)), 0);
  return x1 > x0 ? [x0, x1] : null;
}

function anchors(context: Context, center: number, half: number, step: number): number[] {
  // Anchors counted from the station's own centre, so its bays line up whichever chunk draws them.
  const out: number[] = [];
  const first = Math.ceil((Math.max(center - half, context.start) - center) / step);
  for (let k = first; ; k++) {
    const s = center + k * step;
    if (s > center + half || s >= context.start + CHUNK_LENGTH) break;
    if (s >= context.start) out.push(s);
  }
  return out;
}

const roofY = (z: number): number => SPRING + (CREST - SPRING) * Math.sqrt(Math.max(0, 1 - (z / COLUMN_Z) ** 2));

function arch(b: Batch, x: number): void {
  const points: Vec3[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = -1 + (i * 2) / steps;
    const z = t * COLUMN_Z;
    points.push([x, roofY(z), z]);
  }
  b.part();
  b.cable(points, 0.14, steelRib, 6);
  // Tie rods and the struts that kick up to the purlins, as on the real platform roof.
  b.part();
  for (let i = 2; i < steps - 1; i += 3) {
    const p = points[i]!;
    b.bar(p, [x + 3.2, p[1] + 0.34, p[2]], 0.05, 0.05, steelRoof, 4);
  }
}

function roofPanels(b: Batch, x0: number, x1: number): void {
  // Only the far half is roofed in the drawing, so the train stays visible under it.
  const rows = 10;
  for (let i = 0; i < rows; i++) {
    const a = -COLUMN_Z + (i * (COLUMN_Z - 0.6)) / rows;
    const d = -COLUMN_Z + ((i + 1) * (COLUMN_Z - 0.6)) / rows;
    const ya = roofY(a) + 0.16;
    const yd = roofY(d) + 0.16;
    b.part();
    b.quad([x0, ya, a], [x1, ya, a], [x1, yd, d], [x0, yd, d], i % 3 === 1 ? 0xdfe2dc : corrugated, [0, 1, 0.2]);
  }
  // Purlins on the open half.
  for (const z of [1.5, 4, 6.5, 8.2]) {
    b.part();
    b.box(x0, roofY(z) + 0.12, z - 0.05, x1, roofY(z) + 0.24, z + 0.05, steelRoof);
  }
}

function platform(b: Batch, x0: number, x1: number, side: number): void {
  const near = side > 0;
  const zA = side * EDGE_Z;
  const zB = side * OUTER_Z;
  const z0 = Math.min(zA, zB);
  const z1 = Math.max(zA, zB);
  b.part();
  b.box(x0, DECK_Y - 0.1, z0, x1, PLATFORM_Y, z1, near ? 0xaeb0aa : platformTile);
  b.part();
  b.box(x0, PLATFORM_Y, z0, x1, PLATFORM_Y + 0.012, z1, platformTile);
  // The yellow tactile strip the photographs show along the screen doors.
  b.part();
  const stripA = side * (EDGE_Z + 0.75);
  const stripB = side * (EDGE_Z + 1.1);
  b.box(x0, PLATFORM_Y + 0.012, Math.min(stripA, stripB), x1, PLATFORM_Y + 0.02, Math.max(stripA, stripB), 0xdfb83c);
}

/** A stainless half-height screen door bay. Panel runs along x at the platform's track edge. */
function screenDoors(b: Batch, x: number, side: number): void {
  const z = side * (EDGE_Z + 0.02);
  const h = 1.42;
  const y = PLATFORM_Y;
  b.part();
  b.box(x - 0.08, y, z - 0.06, x + 0.08, y + h, z + 0.06, 0xa6acad);
  b.part();
  b.box(x - 0.95, y, z - 0.035, x + 0.95, y + h - 0.02, z + 0.035, stainless);
  b.part();
  // Seam in the middle where the two leaves meet, and a thin top rail.
  b.box(x - 0.012, y + 0.02, z + 0.035, x + 0.012, y + h - 0.04, z + 0.04, 0x848a8c);
  b.box(x - 0.95, y + h - 0.02, z - 0.05, x + 0.95, y + h, z + 0.05, 0xdee1e1);
}

function column(b: Batch, x: number, side: number): void {
  const z = side * COLUMN_Z;
  b.part();
  b.cylinder(x, PLATFORM_Y, z, 0.42, 0.42, 0.3, 0x8e9090, 12);
  b.part();
  b.cylinder(x, PLATFORM_Y + 0.3, z, 0.22, 0.2, SPRING - PLATFORM_Y - 0.1, 0xdfe0da, 12);
  b.part();
  b.cylinder(x, SPRING - 0.1, z, 0.2, 0.28, 0.3, steelRib, 12);
}

function hangingSign(b: Batch, x: number, side: number, stationIndex: number): void {
  // Green name board hung beneath the arch, with Bangla and English.
  const z = side * 6.4;
  const height = 0.62;
  const width = 6.2;
  const bottom = PLATFORM_Y + 3.05;
  b.part();
  b.bar([x - 2.4, bottom + height, z], [x - 2.4, roofY(z), z], 0.022, 0.022, steelRoof, 4);
  b.bar([x + 2.4, bottom + height, z], [x + 2.4, roofY(z), z], 0.022, 0.022, steelRoof, 4);
  b.part();
  b.box(x - width / 2, bottom, z - 0.06, x + width / 2, bottom + height, z + 0.06, LINE_GREEN);
  b.part();
  b.quad(
    [x - width / 2 + 0.03, bottom + 0.03, z + 0.065],
    [x + width / 2 - 0.03, bottom + 0.03, z + 0.065],
    [x + width / 2 - 0.03, bottom + height - 0.03, z + 0.065],
    [x - width / 2 + 0.03, bottom + height - 0.03, z + 0.065],
    0xffffff,
    [0, 0, 1],
    boardUv(stationIndex),
  );
}

function bench(b: Batch, x: number, side: number): void {
  const z = side * 7.6;
  b.part();
  b.box(x - 1.1, PLATFORM_Y + 0.02, z - 0.22, x + 1.1, PLATFORM_Y + 0.42, z + 0.22, 0x8a9094);
  b.part();
  b.box(x - 1.15, PLATFORM_Y + 0.42, z - 0.26, x + 1.15, PLATFORM_Y + 0.48, z + 0.26, 0xdcdcd4);
  b.part();
  b.box(x - 1.15, PLATFORM_Y + 0.48, z - side * 0.28 - 0.02, x + 1.15, PLATFORM_Y + 0.9, z - side * 0.28 + 0.02, 0xdcdcd4);
}

function outerWall(b: Batch, x0: number, x1: number): void {
  // The long near face of the concourse, in pale cladding over a band of louvres.
  b.part();
  b.box(x0, CONCOURSE_FLOOR, -CONCOURSE_Z, x1, CONCOURSE_TOP, CONCOURSE_Z, cladding);
  b.part();
  b.box(x0, CONCOURSE_FLOOR - 0.6, -CONCOURSE_Z - 0.2, x1, CONCOURSE_FLOOR, CONCOURSE_Z + 0.2, 0xb8b4a8);
  b.part();
  b.box(x0, CONCOURSE_TOP, -CONCOURSE_Z - 0.2, x1, CONCOURSE_TOP + 0.3, CONCOURSE_Z + 0.2, 0xe5e2d8);
  // Top of the slab between the track deck and the platforms.
  b.part();
  b.box(x0, CONCOURSE_TOP + 0.3, -CONCOURSE_Z, x1, DECK_Y, CONCOURSE_Z, 0xc2bdb0);
}

function louvreBay(b: Batch, x: number, width: number): void {
  const z = CONCOURSE_Z;
  const y0 = CONCOURSE_FLOOR + 0.5;
  const y1 = CONCOURSE_TOP - 0.5;
  b.part();
  b.box(x - width / 2 - 0.1, y0 - 0.1, z, x + width / 2 + 0.1, y1 + 0.1, z + 0.05, claddingDark);
  b.part();
  b.box(x - width / 2, y0, z + 0.05, x + width / 2, y1, z + 0.06, 0x82a0a8);
  for (let y = y0 + 0.2; y < y1; y += 0.34) {
    b.part();
    b.box(x - width / 2, y, z + 0.06, x + width / 2, y + 0.07, z + 0.14, 0xe2e2da);
  }
  b.part();
  for (let u = x - width / 2; u <= x + width / 2 + 0.01; u += width / 4) {
    b.box(u - 0.04, y0, z + 0.06, u + 0.04, y1, z + 0.16, 0xb8bcbb);
  }
}

function hammerPier(b: Batch, x: number): void {
  b.part();
  b.block(x, 0, 0, 3.6, 0.3, 3.6, 0xb7b1a2);
  const w = 1.7;
  const r = w * 0.32;
  const outline: Array<[number, number]> = [
    [x - w + r, -w], [x + w - r, -w], [x + w, -w + r], [x + w, w - r],
    [x + w - r, w], [x - w + r, w], [x - w, w - r], [x - w, -w + r],
  ];
  b.part();
  b.prism(outline, 0.3, CONCOURSE_FLOOR - 2.2, concrete.pier);
  // Flared cross-head carrying the whole station.
  const levels: Array<[number, number]> = [[CONCOURSE_FLOOR - 2.2, w], [CONCOURSE_FLOOR - 1.5, 3.4], [CONCOURSE_FLOOR - 1, 7.2], [CONCOURSE_FLOOR - 0.6, CONCOURSE_Z]];
  b.part();
  for (let i = 0; i + 1 < levels.length; i++) {
    const [y0, z0] = levels[i]!;
    const [y1, z1] = levels[i + 1]!;
    b.quad([x - 1.5, y0, z0], [x + 1.5, y0, z0], [x + 1.5, y1, z1], [x - 1.5, y1, z1], concrete.pier, [0, -0.5, 0.8]);
    b.quad([x - 1.5, y0, -z0], [x - 1.5, y0, z0], [x - 1.5, y1, z1], [x - 1.5, y1, -z1], concrete.web, [-1, 0, 0]);
  }
}

function stair(b: Batch, x: number, side: number, boardIndex: number): void {
  // An entrance: a bridge from the concourse, a covered stair down to the pavement, a lift tower.
  const nearSide = side > 0;
  const innerZ = side * CONCOURSE_Z;
  const landingZ = side * 15.9;
  const width = 2.6;
  const runLength = 13;
  const dir = 1;
  const top = CONCOURSE_FLOOR;
  const z0 = landingZ - width / 2;
  const z1 = landingZ + width / 2;
  // Bridge deck between concourse and stair head.
  b.part();
  b.box(x - 2, top - 0.3, Math.min(innerZ, landingZ), x + 2, top, Math.max(innerZ, landingZ), 0xbcb7aa);
  b.part();
  b.box(x - 2.05, top, Math.min(innerZ, landingZ), x - 1.95, top + 2.9, Math.max(innerZ, landingZ), 0xcfd3cf);
  b.box(x + 1.95, top, Math.min(innerZ, landingZ), x + 2.05, top + 2.9, Math.max(innerZ, landingZ), 0xcfd3cf);
  b.part();
  b.box(x - 2.2, top + 2.9, Math.min(innerZ, landingZ), x + 2.2, top + 3.05, Math.max(innerZ, landingZ), 0xdedbd0);
  // The stair run itself, stepping down along the road.
  const steps = 26;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const y = top - t0 * (top - 0.2);
    const sx = x + dir * (2 + t0 * runLength);
    b.part();
    b.box(sx, y - 0.32, z0, sx + (dir * runLength) / steps, y, z1, i % 2 ? 0xc6c1b4 : 0xd2cdc0);
  }
  // Balustrade and roof following the slope.
  const low: Vec3 = [x + 2 + runLength, 0.2 + 2.9, z1];
  const high: Vec3 = [x + 2, top + 2.9, z1];
  b.part();
  b.quad([x + 2, top + 1.05, z1], [x + 2 + runLength, 0.2 + 1.05, z1], [x + 2 + runLength, 0.2, z1], [x + 2, top, z1], 0xa9c4cc, [0, 0, 1]);
  b.part();
  b.bar([x + 2, top + 1.05, z1 + 0.04], [x + 2 + runLength, 1.25, z1 + 0.04], 0.03, 0.03, 0x8b9396, 5);
  b.part();
  b.quad(high, low, [low[0], low[1], z0], [high[0], high[1], z0], 0xdcd9ce, [0.1, 1, 0]);
  for (let i = 0; i <= 3; i++) {
    const px = x + 2 + (i * runLength) / 3;
    const py = top - (i / 3) * (top - 0.2);
    b.part();
    b.bar([px, Math.max(0.2, py - 0.32), z1 - 0.1], [px, py + 2.85, z1 - 0.1], 0.05, 0.05, 0x8b9396, 5);
    if (py > 2.2) b.bar([px, 0.2, z1 - 0.1], [px, py - 0.3, z1 - 0.1], 0.08, 0.08, 0xb2ad9f, 6);
  }
  // Lift tower in the red brick seen beside the stations.
  const towerX = x - 2.2;
  b.part();
  b.box(towerX - 3.2, 0.2, z0 - 0.2, towerX, top + 3.4, z1 + 0.2, brick);
  b.part();
  b.box(towerX - 3.3, top + 3.4, z0 - 0.3, towerX + 0.1, top + 3.65, z1 + 0.3, 0xe5e2d8);
  for (let y = 1.2; y < top + 3; y += 0.74) {
    b.part();
    b.box(towerX - 3.2, y, z1 + 0.2, towerX, y + 0.02, z1 + 0.206, 0xbd6a53);
  }
  b.part();
  b.box(towerX - 2.4, 0.2, z1 + 0.2, towerX - 0.8, 2.5, z1 + 0.22, 0xc6cbcc);
  b.box(towerX - 1.61, 0.22, z1 + 0.22, towerX - 1.59, 2.48, z1 + 0.224, 0x6f7577);
  if (nearSide) {
    // Station name on the lift tower, the first thing you read from the pavement.
    b.part();
    const sy = top + 1.2;
    b.quad([towerX - 3.08, sy, z1 + 0.22], [towerX - 0.12, sy, z1 + 0.22], [towerX - 0.12, sy + 0.42, z1 + 0.22], [towerX - 3.08, sy + 0.42, z1 + 0.22], 0xffffff, [0, 0, 1], boardUv(boardIndex));
  }
}

/** Draws the part of one station that falls in this chunk. */
export function buildStation(b: Batch, context: Context, stop: StationStop): void {
  const center = stop.center;
  const boardIndex = STATIONS.indexOf(stop.station);
  const whole = clip(context, center - STATION_HALF, center + STATION_HALF);
  if (!whole) return;
  const [x0, x1] = whole;

  // Concourse and deck run the whole building.
  const concourse = clip(context, center - 62, center + 62);
  if (concourse) outerWall(b, concourse[0], concourse[1]);
  // Beyond the concourse the plain viaduct deck carries on inside the roof's ends.
  for (const [a, d] of [[center - STATION_HALF, center - 62], [center + 62, center + STATION_HALF]] as const) {
    const stretch = clip(context, a, d);
    if (!stretch) continue;
    b.part();
    b.box(stretch[0], DECK_Y - 1.7, -3.6, stretch[1], DECK_Y, 3.6, concrete.web);
    b.part();
    b.box(stretch[0], DECK_Y - 0.1, -4.7, stretch[1], DECK_Y, 4.7, concrete.deck);
  }
  trackRun(b, x0, x1, TRACK_Z, context);
  trackRun(b, x0, x1, -TRACK_Z, context);

  const platformRange = clip(context, center - PLATFORM_HALF, center + PLATFORM_HALF);
  if (platformRange) {
    platform(b, platformRange[0], platformRange[1], 1);
    platform(b, platformRange[0], platformRange[1], -1);
  }

  for (const s of anchors(context, center, 62, 15)) hammerPier(b, localX(context, s));
  for (const s of anchors(context, center, 60, 6)) {
    if (Math.abs(s - center) < 58) louvreBay(b, localX(context, s), 4.8);
  }

  for (const s of anchors(context, center, PLATFORM_HALF + 6, COLUMN_STEP)) {
    const x = localX(context, s);
    arch(b, x);
    column(b, x, 1);
    column(b, x, -1);
  }
  // Roof bays are clipped to the chunk, so each is drawn by every chunk it touches.
  const roofRun = clip(context, center - PLATFORM_HALF - 6, center + PLATFORM_HALF + 6);
  if (roofRun) roofPanels(b, roofRun[0], roofRun[1]);

  // Screen doors line up with where the train's own doors stop.
  for (let car = 0; car < 6; car++) {
    for (const offset of [-7.05, -2.35, 2.35, 7.05]) {
      const s = stop.distance - (9.9 + car * 20 + offset);
      if (s < context.start || s >= context.start + CHUNK_LENGTH) continue;
      const x = localX(context, s);
      screenDoors(b, x, 1);
      screenDoors(b, x, -1);
    }
  }
  // Fixed stainless panels between the doors, broken at each bay.
  for (const s of anchors(context, center, PLATFORM_HALF, 2.35)) {
    const x = localX(context, s);
    for (const side of [1, -1]) {
      b.part();
      b.box(x - 1.17, PLATFORM_Y + 0.02, side * EDGE_Z - 0.015, x + 1.17, PLATFORM_Y + 1.2, side * EDGE_Z + 0.015, 0xb6bcbd);
    }
  }
  // Platform furniture.
  for (const s of anchors(context, center, PLATFORM_HALF - 8, COLUMN_STEP)) {
    const x = localX(context, s) + 5;
    bench(b, x, 1);
    bench(b, x, -1);
  }
  for (const s of anchors(context, center, 40, 40)) hangingSign(b, localX(context, s) + 6, 1, boardIndex);

  // Near-side railing so the platform has an edge against the drop.
  if (platformRange) {
    b.part();
    b.box(platformRange[0], PLATFORM_Y, OUTER_Z - 0.04, platformRange[1], PLATFORM_Y + 1.1, OUTER_Z, 0xbcd0d4);
    b.part();
    b.box(platformRange[0], PLATFORM_Y + 1.1, OUTER_Z - 0.07, platformRange[1], PLATFORM_Y + 1.16, OUTER_Z + 0.03, 0x8d979a);
  }

  // Entrances on both pavements at either end of the concourse.
  for (const [offset, side] of [[-40, 1], [34, 1], [-22, -1], [46, -1]] as const) {
    const s = center + offset;
    if (s < context.start || s >= context.start + CHUNK_LENGTH) continue;
    stair(b, localX(context, s), side, boardIndex);
  }

  // A long name board on the near face of the concourse.
  for (const s of anchors(context, center, 30, 60)) {
    const x = localX(context, s);
    const y0 = CONCOURSE_TOP - 0.1;
    b.part();
    b.box(x - 6.2, y0 - 0.1, CONCOURSE_Z + 0.2, x + 6.2, y0 + 1, CONCOURSE_Z + 0.32, LINE_GREEN);
    b.part();
    b.quad([x - 6.1, y0, CONCOURSE_Z + 0.33], [x + 6.1, y0, CONCOURSE_Z + 0.33], [x + 6.1, y0 + 0.9, CONCOURSE_Z + 0.33], [x - 6.1, y0 + 0.9, CONCOURSE_Z + 0.33], 0xffffff, [0, 0, 1], boardUv(boardIndex));
  }
  void city;
}
