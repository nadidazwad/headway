import { Batch, type MeshData } from "../geometry";
import { train as c } from "../shared/palette";

/** Local frame of one car: x along the car with +x towards the tail, y up from rail top, z sideways. */
export const CAR_PITCH = 20;
export const CAR_LENGTH = 19.8;
export const HALF_WIDTH = 2.95 / 2;
export const FLOOR_Y = 1.15;
export const ROOF_Y = 4.05;
export const CAB_DEPTH = 2.7;
/** Door centres from the car's middle: four pairs a side on the real cars. */
export const DOOR_CENTERS = [-7.05, -2.35, 2.35, 7.05] as const;
export const DOOR_HALF = 0.65;
export const DOOR_HEIGHT = 1.9;

export interface CarMeshes {
  /** Floor, underframe, far wall and everything that stays while the car is opened. */
  fixed: MeshData;
  /** Near wall, roof and roof equipment: the part cut away to look inside. */
  shell: MeshData;
}

interface CarOptions {
  /** Which end carries a driving cab, if any. */
  cab: "none" | "front" | "rear";
  pantograph: boolean;
}

function bogie(b: Batch, x: number): void {
  const z = 0.75;
  b.part();
  b.box(x - 1.3, 0.48, -1.06, x + 1.3, 0.72, 1.06, c.under);
  b.part();
  b.box(x - 0.34, 0.68, -0.55, x + 0.34, 0.98, 0.55, 0x2f3234);
  // Air springs under the bolster.
  for (const side of [-1, 1]) {
    b.part();
    b.cylinder(x - 0.5, 0.72, side * 0.9, 0.17, 0.17, 0.24, 0x1f2224, 8);
    b.part();
    b.cylinder(x + 0.5, 0.72, side * 0.9, 0.17, 0.17, 0.24, 0x1f2224, 8);
  }
  for (const wheelX of [x - 1.05, x + 1.05]) {
    b.part();
    b.block(wheelX, 0.46, z + 0.34, 0.5, 0.2, 0.14, 0x4d5154);
    b.part();
    wheel(b, wheelX, z);
    b.part();
    wheel(b, wheelX, -z);
  }
}

/** A flanged wheel on the rail, with its dished disc. */
function wheel(b: Batch, x: number, z: number): void {
  const r = 0.42;
  const segments = 14;
  const cull = b.cull;
  b.cull = true;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const y0 = r + Math.sin(a0) * r;
    const x0 = x + Math.cos(a0) * r;
    const y1 = r + Math.sin(a1) * r;
    const x1 = x + Math.cos(a1) * r;
    b.quad([x, r, z + 0.09], [x0, y0, z + 0.09], [x1, y1, z + 0.09], [x, r, z + 0.09], c.wheel, [0, 0, 1]);
    b.quad([x0, y0, z - 0.09], [x1, y1, z - 0.09], [x1, y1, z + 0.09], [x0, y0, z + 0.09], 0x3b3e41, [Math.cos(a0), Math.sin(a0), 0]);
    const inner = r * 0.55;
    b.quad([x + Math.cos(a0) * inner, r + Math.sin(a0) * inner, z + 0.1], [x + Math.cos(a1) * inner, r + Math.sin(a1) * inner, z + 0.1], [x0 * 0.0 + x + Math.cos(a1) * r * 0.86, r + Math.sin(a1) * r * 0.86, z + 0.1], [x + Math.cos(a0) * r * 0.86, r + Math.sin(a0) * r * 0.86, z + 0.1], 0x4a4e51, [0, 0, 1]);
  }
  b.cull = cull;
}

/** Underframe boxes: inverters, batteries and compressors hung between the bogies. */
function underframe(b: Batch, x0: number, x1: number): void {
  b.part();
  b.box(x0, FLOOR_Y - 0.26, -HALF_WIDTH + 0.05, x1, FLOOR_Y, HALF_WIDTH - 0.05, c.under);
  const boxes = [
    [-5.4, 2.1, 0.5],
    [-2.6, 1.5, 0.44],
    [-0.6, 1.8, 0.52],
    [2, 2.4, 0.46],
    [5.1, 1.3, 0.42],
  ] as const;
  for (const [x, length, depth] of boxes) {
    b.part();
    b.box(x - length / 2, FLOOR_Y - 0.26 - depth, 0.2, x + length / 2, FLOOR_Y - 0.26, HALF_WIDTH - 0.14, 0x4f5457);
    b.part();
    for (let u = x - length / 2 + 0.15; u < x + length / 2 - 0.1; u += 0.28) {
      b.box(u, FLOOR_Y - 0.26 - depth + 0.06, HALF_WIDTH - 0.14, u + 0.14, FLOOR_Y - 0.32, HALF_WIDTH - 0.13, 0x383c3e);
    }
  }
}

/** One side of the car body, flat in +z facing coordinates, with windows and door openings. */
function bodySide(b: Batch, x0: number, x1: number, z: number, outward: number, cabEnd: number | null): void {
  const belt = FLOOR_Y + 0.72;
  const head = FLOOR_Y + 1.98;
  const openings: Array<[number, number, "door" | "window"]> = [];
  const carHalf = CAR_LENGTH / 2;
  for (const center of DOOR_CENTERS) openings.push([center - DOOR_HALF - 0.08, center + DOOR_HALF + 0.08, "door"]);
  const panes: Array<[number, number]> = [[-5.75, -3.65], [-1.45, 1.45], [3.65, 5.75], [-9.65, -8.35], [8.35, 9.65]];
  for (const [w0, w1] of panes) openings.push([w0, w1, "window"]);
  openings.sort((a, c2) => a[0] - c2[0]);
  const skin = c.silver;
  const y0 = FLOOR_Y;
  const y1 = ROOF_Y - 0.55;
  const add = (u0: number, u1: number, v0: number, v1: number, color: number): void => {
    if (u1 <= u0 || v1 <= v0) return;
    b.quad([u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z], color, [0, 0, outward]);
  };
  b.part();
  let cursor = x0;
  for (const [o0, o1, kind] of openings) {
    const a = Math.max(o0, x0);
    const d = Math.min(o1, x1);
    if (d <= x0 || a >= x1) continue;
    add(cursor, a, y0, y1, skin);
    if (kind === "window") {
      add(a, d, y0, belt, skin);
      add(a, d, head, y1, skin);
    } else {
      add(a, d, y0 + DOOR_HEIGHT + 0.08, y1, skin);
    }
    cursor = d;
  }
  add(cursor, x1, y0, y1, skin);
  void carHalf;
  void cabEnd;
  // The green band along the cantrail and the thin stripe under the windows.
  b.part();
  add(x0, x1, head + 0.08, head + 0.32, c.band);
}

/** Corrugated stainless ribs along the lower body, as on Kawasaki's sets. */
function bodyRibs(b: Batch, x0: number, x1: number, z: number): void {
  for (let y = FLOOR_Y + 0.12; y < FLOOR_Y + 0.68; y += 0.11) {
    b.part();
    for (const [u0, u1] of ribRuns(x0, x1)) {
      b.box(u0, y, z, u1, y + 0.022, z + 0.012, c.silverDark);
    }
  }
}

function ribRuns(x0: number, x1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cursor = x0;
  for (const center of DOOR_CENTERS) {
    const a = center - DOOR_HALF - 0.14;
    const d = center + DOOR_HALF + 0.14;
    if (d <= x0 || a >= x1) continue;
    if (a > cursor) out.push([cursor, a]);
    cursor = Math.max(cursor, d);
  }
  if (cursor < x1) out.push([cursor, x1]);
  return out;
}

/** The trim around each opening: red door posts and rounded dark window frames. */
function openingsTrim(b: Batch, x0: number, x1: number, z: number, outward: number): void {
  const belt = FLOOR_Y + 0.72;
  const head = FLOOR_Y + 1.98;
  const out = z + outward * 0.012;
  const panel = (u0: number, v0: number, u1: number, v1: number, color: number): void => {
    b.quad([u0, v0, out], [u1, v0, out], [u1, v1, out], [u0, v1, out], color, [0, 0, outward]);
  };
  for (const center of DOOR_CENTERS) {
    if (center + DOOR_HALF < x0 || center - DOOR_HALF > x1) continue;
    b.part();
    // Line 6's doors sit between red posts, the one strong colour on the side of the train.
    panel(center - DOOR_HALF - 0.13, FLOOR_Y, center - DOOR_HALF - 0.04, FLOOR_Y + DOOR_HEIGHT + 0.08, c.doorRed);
    panel(center + DOOR_HALF + 0.04, FLOOR_Y, center + DOOR_HALF + 0.13, FLOOR_Y + DOOR_HEIGHT + 0.08, c.doorRed);
    panel(center - DOOR_HALF - 0.13, FLOOR_Y + DOOR_HEIGHT + 0.05, center + DOOR_HALF + 0.13, FLOOR_Y + DOOR_HEIGHT + 0.11, c.doorRed);
    b.part();
    panel(center - 0.32, FLOOR_Y + DOOR_HEIGHT + 0.17, center + 0.32, FLOOR_Y + DOOR_HEIGHT + 0.33, 0x24292b);
  }
  void belt;
  void head;
}

/** Window glass as seen from outside, set in dark rubber. */
function glazing(b: Batch, x0: number, x1: number, z: number, outward: number): void {
  // Rubber window surrounds only: with no pane to tint them, the passengers show from outside,
  // which is how the reference's train keeps its people visible at a distance.
  const belt = FLOOR_Y + 0.72;
  const head = FLOOR_Y + 1.98;
  const panes: Array<[number, number]> = [
    [-5.75, -3.65], [-1.45, 1.45], [3.65, 5.75], [-9.65, -8.35], [8.35, 9.65],
  ];
  const t = 0.06;
  const out = z + outward * 0.012;
  for (const [u0, u1] of panes) {
    if (u1 < x0 || u0 > x1) continue;
    b.part();
    b.box(u0, belt, Math.min(z, out), u1, belt + t, Math.max(z, out), 0x2e3438);
    b.box(u0, head - t, Math.min(z, out), u1, head, Math.max(z, out), 0x2e3438);
    b.box(u0, belt + t, Math.min(z, out), u0 + t, head - t, Math.max(z, out), 0x2e3438);
    b.box(u1 - t, belt + t, Math.min(z, out), u1, head - t, Math.max(z, out), 0x2e3438);
  }
}

function roof(b: Batch, x0: number, x1: number, pantograph: boolean, cab: "none" | "front" | "rear"): void {
  const edge = HALF_WIDTH;
  const shoulder = ROOF_Y - 0.55;
  const crest = ROOF_Y;
  const flat = HALF_WIDTH * 0.55;
  b.part();
  b.quad([x0, shoulder, edge], [x1, shoulder, edge], [x1, crest - 0.08, flat], [x0, crest - 0.08, flat], c.silver, [0, 0.7, 0.7]);
  b.quad([x0, crest - 0.08, flat], [x1, crest - 0.08, flat], [x1, crest, 0], [x0, crest, 0], c.roof, [0, 1, 0.1]);
  b.quad([x0, crest, 0], [x1, crest, 0], [x1, crest - 0.08, -flat], [x0, crest - 0.08, -flat], c.roof, [0, 1, -0.1]);
  b.quad([x0, crest - 0.08, -flat], [x1, crest - 0.08, -flat], [x1, shoulder, -edge], [x0, shoulder, -edge], c.silver, [0, 0.7, -0.7]);
  // Gutter rails at the roof shoulder.
  b.part();
  b.box(x0, shoulder - 0.02, edge - 0.02, x1, shoulder + 0.05, edge + 0.03, c.band);
  // Two roof air conditioners per car: the published fit-out.
  for (const centre of [-5.1, 5.1]) {
    if (centre - 1.9 < x0 || centre + 1.9 > x1) continue;
    airConditioner(b, centre);
  }
  if (pantograph) drawPantograph(b);
  void cab;
}

function airConditioner(b: Batch, x: number): void {
  const y = ROOF_Y;
  b.part();
  b.box(x - 1.9, y - 0.08, -0.95, x + 1.9, y + 0.3, 0.95, c.equipment);
  b.part();
  b.box(x - 1.82, y + 0.3, -0.87, x + 1.82, y + 0.38, 0.87, 0x7f8587);
  // Louvres.
  for (let u = x - 1.6; u < x + 1.6; u += 0.2) {
    b.part();
    b.box(u, y + 0.38, -0.7, u + 0.1, y + 0.415, 0.7, 0x4e5355);
  }
  for (let u = x - 1.74; u < x + 1.74; u += 0.11) {
    b.part();
    b.box(u, y - 0.04, 0.95, u + 0.05, y + 0.26, 0.96, 0x4a4f51);
  }
}

function drawPantograph(b: Batch): void {
  const y = ROOF_Y;
  const steel = 0x3f4446;
  b.part();
  b.box(-1.1, y, -0.72, 1.1, y + 0.16, 0.72, 0x5f6567);
  for (const z of [-0.5, 0.5]) {
    b.part();
    b.bar([-0.95, y + 0.16, z], [0.2, y + 0.82, z * 0.6], 0.03, 0.025, steel, 5);
    b.bar([0.2, y + 0.82, z * 0.6], [-0.3, y + 1.25, 0], 0.025, 0.02, steel, 5);
  }
  b.part();
  b.box(-0.4, y + 1.25, -0.85, -0.3, y + 1.3, 0.85, steel);
  b.box(-0.18, y + 1.25, -0.85, -0.08, y + 1.3, 0.85, steel);
  // Insulators at the base.
  for (const [ix, iz] of [[-0.9, -0.55], [-0.9, 0.55], [0.9, -0.55], [0.9, 0.55]] as const) {
    b.part();
    b.cylinder(ix, y - 0.1, iz, 0.06, 0.05, 0.26, 0x7b8f7c, 6);
  }
}

/** The Kawasaki cab: a raked deep-green upper half over a silver lower half with four lamps. */
function cabNose(b: Batch, tipX: number, direction: number): void {
  // direction is -1 for a nose at the head of the train (towards -x).
  const backX = tipX - direction * CAB_DEPTH;
  const midX = tipX - direction * 0.45;
  const half = HALF_WIDTH;
  const lowY = FLOOR_Y - 0.22;
  const beltY = FLOOR_Y + 0.72;
  const screenTop = ROOF_Y - 0.32;
  const crest = ROOF_Y;
  // Lower silver face.
  b.part();
  const cornerZ = half * 0.72;
  b.quad([tipX, lowY, -cornerZ], [tipX, lowY, cornerZ], [tipX, beltY, cornerZ], [tipX, beltY, -cornerZ], c.silver, [direction, 0, 0]);
  b.quad([tipX, lowY, cornerZ], [midX, lowY, half], [midX, beltY, half], [tipX, beltY, cornerZ], c.silverDark, [direction * 0.6, 0, 0.8]);
  b.quad([tipX, lowY, -cornerZ], [midX, lowY, -half], [midX, beltY, -half], [tipX, beltY, -cornerZ], c.silverDark, [direction * 0.6, 0, -0.8]);
  // Upper deep-green hood, raked back.
  const topX = tipX - direction * 0.4;
  b.part();
  b.quad([tipX, beltY, -cornerZ], [tipX, beltY, cornerZ], [topX, screenTop, cornerZ * 0.96], [topX, screenTop, -cornerZ * 0.96], c.cab, [direction * 0.9, 0.2, 0]);
  b.quad([tipX, beltY, cornerZ], [midX, beltY, half], [midX + -direction * 0.1, screenTop, half], [topX, screenTop, cornerZ * 0.96], c.cab, [direction * 0.5, 0.1, 0.85]);
  b.quad([tipX, beltY, -cornerZ], [midX, beltY, -half], [midX + -direction * 0.1, screenTop, -half], [topX, screenTop, -cornerZ * 0.96], c.cab, [direction * 0.5, 0.1, -0.85]);
  // Roof of the hood running back to the crest.
  const roofBack = backX;
  b.part();
  b.quad([topX, screenTop, -cornerZ * 0.96], [topX, screenTop, cornerZ * 0.96], [roofBack, crest, cornerZ * 0.72], [roofBack, crest, -cornerZ * 0.72], c.cab, [0, 1, 0]);
  b.quad([topX, screenTop, cornerZ * 0.96], [midX - direction * 0.1, screenTop, half], [roofBack, crest - 0.55, half], [roofBack, crest, cornerZ * 0.72], c.cab, [0, 0.7, 0.7]);
  // Green side panels running back to the first door.
  b.part();
  b.quad([midX - direction * 0.1, beltY, half], [backX, beltY, half], [backX, crest - 0.55, half], [midX - direction * 0.1, crest - 0.55, half], c.cab, [0, 0, 1]);
  b.quad([midX, lowY, half], [backX, lowY, half], [backX, beltY, half], [midX, beltY, half], c.silver, [0, 0, 1]);
  // Two windscreens: the big driver's one and the narrower door window beside it.
  const glass = c.glassCab;
  const screenY0 = beltY + 0.1;
  const screenY1 = screenTop - 0.24;
  const rake = (y: number): number => tipX - direction * (0.4 * (y - beltY)) / (screenTop - beltY) + direction * 0.015;
  b.part();
  b.quad([rake(screenY0), screenY0, -cornerZ * 0.86], [rake(screenY0), screenY0, cornerZ * 0.05], [rake(screenY1), screenY1, cornerZ * 0.05], [rake(screenY1), screenY1, -cornerZ * 0.86], glass, [direction * 0.9, 0.2, 0]);
  b.part();
  b.quad([rake(screenY0), screenY0, cornerZ * 0.2], [rake(screenY0), screenY0, cornerZ * 0.86], [rake(screenY1), screenY1, cornerZ * 0.86], [rake(screenY1), screenY1, cornerZ * 0.2], glass, [direction * 0.9, 0.2, 0]);
  // Destination display over the windscreen.
  b.part();
  const destY0 = screenY1 + 0.03;
  const destY1 = screenY1 + 0.19;
  b.quad([rake(destY0) + direction * 0.003, destY0, -cornerZ * 0.46], [rake(destY0) + direction * 0.003, destY0, cornerZ * 0.46], [rake(destY1) + direction * 0.003, destY1, cornerZ * 0.46], [rake(destY1) + direction * 0.003, destY1, -cornerZ * 0.46], 0x121416, [direction * 0.9, 0.2, 0]);
  b.part();
  b.quad([rake(destY0) + direction * 0.006, destY0 + 0.05, -cornerZ * 0.3], [rake(destY0) + direction * 0.006, destY0 + 0.05, cornerZ * 0.3], [rake(destY1) + direction * 0.006, destY1 - 0.05, cornerZ * 0.3], [rake(destY1) + direction * 0.006, destY1 - 0.05, -cornerZ * 0.3], 0xe59a2c, [direction * 0.9, 0.2, 0]);
  // Wipers on the big screen.
  b.part();
  b.bar([rake(screenY0) + direction * 0.02, screenY0 + 0.02, -cornerZ * 0.55], [rake(screenY0 + 0.65) + direction * 0.02, screenY0 + 0.65, -cornerZ * 0.3], 0.008, 0.008, 0x0d0f10, 3);
  b.bar([rake(screenY0) + direction * 0.02, screenY0 + 0.02, -cornerZ * 0.15], [rake(screenY0 + 0.65) + direction * 0.02, screenY0 + 0.65, cornerZ * 0.02], 0.008, 0.008, 0x0d0f10, 3);
  // Paired headlamps, each with a chrome ring, low on the silver face.
  for (const side of [-1, 1]) {
    for (const lamp of [0.56, 0.32]) {
      const lz = side * cornerZ * lamp * 1.05;
      const ly = lowY + 0.46;
      lampDisc(b, tipX + direction * 0.01, ly, lz, 0.1, direction);
    }
  }
  // Red pinstripe and bumper at the bottom of the silver.
  b.part();
  b.box(tipX - 0.02, lowY - 0.14, -cornerZ, tipX + 0.03, lowY + 0.02, cornerZ, c.doorRed);
  // Emblem between the lamps.
  b.part();
  b.quad([tipX + direction * 0.015, lowY + 0.38, -0.12], [tipX + direction * 0.015, lowY + 0.38, 0.12], [tipX + direction * 0.015, lowY + 0.56, 0.12], [tipX + direction * 0.015, lowY + 0.56, -0.12], c.cab, [direction, 0, 0]);
  // Coupler and skirt below.
  b.part();
  b.box(tipX - direction * 0.3 - 0.3, lowY - 0.42, -0.25, tipX - direction * 0.3 + 0.3, lowY - 0.18, 0.25, 0x2b2e30);
  b.part();
  b.quad([tipX, lowY - 0.18, -cornerZ], [tipX, lowY - 0.18, cornerZ], [tipX - direction * 0.25, lowY - 0.62, cornerZ * 0.94], [tipX - direction * 0.25, lowY - 0.62, -cornerZ * 0.94], 0x3a3e41, [direction * 0.9, -0.3, 0]);
}

function lampDisc(b: Batch, x: number, y: number, z: number, r: number, direction: number): void {
  const segments = 12;
  b.part();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.quad([x, y, z], [x, y + Math.sin(a0) * r * 1.3, z + Math.cos(a0) * r * 1.3], [x, y + Math.sin(a1) * r * 1.3, z + Math.cos(a1) * r * 1.3], [x, y, z], 0xb6bbbd, [direction, 0, 0]);
  }
  b.part();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const dx = x + direction * 0.003;
    b.quad([dx, y, z], [dx, y + Math.sin(a0) * r, z + Math.cos(a0) * r], [dx, y + Math.sin(a1) * r, z + Math.cos(a1) * r], [dx, y, z], c.light, [direction, 0, 0]);
  }
}

function endWall(b: Batch, x: number, facing: number): void {
  b.part();
  b.quad([x, FLOOR_Y - 0.26, -HALF_WIDTH], [x, FLOOR_Y - 0.26, HALF_WIDTH], [x, ROOF_Y - 0.1, HALF_WIDTH], [x, ROOF_Y - 0.1, -HALF_WIDTH], c.silver, [facing, 0, 0]);
  // Gangway door opening with a small window.
  b.part();
  b.quad([x + facing * 0.01, FLOOR_Y, -0.55], [x + facing * 0.01, FLOOR_Y, 0.55], [x + facing * 0.01, FLOOR_Y + 2, 0.55], [x + facing * 0.01, FLOOR_Y + 2, -0.55], c.silverDark, [facing, 0, 0]);
  b.part();
  b.quad([x + facing * 0.02, FLOOR_Y + 1.05, -0.3], [x + facing * 0.02, FLOOR_Y + 1.05, 0.3], [x + facing * 0.02, FLOOR_Y + 1.85, 0.3], [x + facing * 0.02, FLOOR_Y + 1.85, -0.3], c.glass, [facing, 0, 0]);
}

/** The interior: light green longitudinal benches, white poles, ring straps, cream walls. */
function interior(b: Batch, x0: number, x1: number): void {
  const inside = HALF_WIDTH - 0.08;
  b.part();
  b.box(x0, FLOOR_Y - 0.02, -inside, x1, FLOOR_Y, inside, c.floor);
  // The grey aisle strip, with the yellow and blue guide lines from the real cars.
  b.part();
  b.quad([x0, FLOOR_Y + 0.003, 0.5], [x1, FLOOR_Y + 0.003, 0.5], [x1, FLOOR_Y + 0.003, -0.5], [x0, FLOOR_Y + 0.003, -0.5], c.aisle, [0, 1, 0]);
  // Far wall's inside face, a warm cream with its windows and doors.
  const wallZ = -inside;
  const wall = c.wall;
  const y0 = FLOOR_Y;
  const y1 = ROOF_Y - 0.24;
  const windows: Array<[number, number]> = [[-5.75, -3.65], [-1.45, 1.45], [3.65, 5.75]];
  b.part();
  const cuts = [...windows.map(([a, d]) => [a, d, "w"] as const), ...DOOR_CENTERS.map((center) => [center - DOOR_HALF - 0.04, center + DOOR_HALF + 0.04, "d"] as const)].sort((a, d) => a[0] - d[0]);
  let cursor = x0;
  const belt = FLOOR_Y + 0.72;
  const head = FLOOR_Y + 1.98;
  for (const [a, d, kind] of cuts) {
    if (d <= x0 || a >= x1) continue;
    const from = Math.max(a, x0);
    const to = Math.min(d, x1);
    if (from > cursor) b.quad([cursor, y0, wallZ], [from, y0, wallZ], [from, y1, wallZ], [cursor, y1, wallZ], wall, [0, 0, 1]);
    if (kind === "w") {
      b.quad([from, y0, wallZ], [to, y0, wallZ], [to, belt, wallZ], [from, belt, wallZ], wall, [0, 0, 1]);
      b.quad([from, head, wallZ], [to, head, wallZ], [to, y1, wallZ], [from, y1, wallZ], wall, [0, 0, 1]);
      // The far windows are real openings: the city goes by through them.
      b.part();
      const t = 0.05;
      b.box(from, belt, wallZ, to, belt + t, wallZ + 0.04, 0x8a8f90);
      b.box(from, head - t, wallZ, to, head, wallZ + 0.04, 0x8a8f90);
      b.box(from, belt, wallZ, from + t, head, wallZ + 0.04, 0x8a8f90);
      b.box(to - t, belt, wallZ, to, head, wallZ + 0.04, 0x8a8f90);
      b.part();
    } else {
      b.quad([from, y0 + DOOR_HEIGHT + 0.04, wallZ], [to, y0 + DOOR_HEIGHT + 0.04, wallZ], [to, y1, wallZ], [from, y1, wallZ], wall, [0, 0, 1]);
      b.part();
      b.quad([from, y0, wallZ - 0.01], [(from + to) / 2 - 0.01, y0, wallZ - 0.01], [(from + to) / 2 - 0.01, y0 + DOOR_HEIGHT, wallZ - 0.01], [from, y0 + DOOR_HEIGHT, wallZ - 0.01], c.door, [0, 0, 1]);
      b.quad([(from + to) / 2 + 0.01, y0, wallZ - 0.01], [to, y0, wallZ - 0.01], [to, y0 + DOOR_HEIGHT, wallZ - 0.01], [(from + to) / 2 + 0.01, y0 + DOOR_HEIGHT, wallZ - 0.01], c.door, [0, 0, 1]);
      b.part();
      for (const u of [from + 0.14, (from + to) / 2 + 0.14]) {
        b.quad([u, y0 + 1, wallZ - 0.005], [u + 0.36, y0 + 1, wallZ - 0.005], [u + 0.36, y0 + 1.75, wallZ - 0.005], [u, y0 + 1.75, wallZ - 0.005], 0xaac8d2, [0, 0, 1]);
      }
      // Information screens above the door, as on the real cars.
      b.part();
      b.quad([(from + to) / 2 - 0.42, y0 + DOOR_HEIGHT + 0.09, wallZ + 0.03], [(from + to) / 2 + 0.42, y0 + DOOR_HEIGHT + 0.09, wallZ + 0.03], [(from + to) / 2 + 0.42, y0 + DOOR_HEIGHT + 0.41, wallZ + 0.03], [(from + to) / 2 - 0.42, y0 + DOOR_HEIGHT + 0.41, wallZ + 0.03], 0x20262a, [0, 0, 1]);
    }
    cursor = to;
    b.part();
  }
  if (x1 > cursor) b.quad([cursor, y0, wallZ], [x1, y0, wallZ], [x1, y1, wallZ], [cursor, y1, wallZ], wall, [0, 0, 1]);
  // Far-side green benches between the doors.
  const benches: Array<[number, number]> = [[-6.3, -3.1], [-1.75, 1.75], [3.1, 6.3], [-9.6, -7.85], [7.85, 9.6]];
  for (const side of [-1, 1]) {
    const z = side * (inside - 0.26);
    for (const [u0, u1] of benches) {
      if (u1 < x0 || u0 > x1) continue;
      const from = Math.max(u0, x0);
      const to = Math.min(u1, x1);
      const seatY = FLOOR_Y + 0.46;
      b.part();
      // Seat pan over a cantilevered base.
      b.box(from, FLOOR_Y + 0.08, z - 0.2, to, seatY - 0.08, z + 0.2, 0x8a9094);
      b.part();
      b.box(from, seatY - 0.08, z - 0.26, to, seatY, z + 0.26, c.seat);
      // Back rest. On the near side it goes with the wall when the car is opened.
      if (side < 0) {
        b.part();
        const backZ = side * inside - side * 0.06;
        b.box(from, seatY, Math.min(backZ, backZ - side * 0.1), to, seatY + 0.55, Math.max(backZ, backZ - side * 0.1), c.seat);
      }
      // White screens at the bench ends, low on the near side so they do not hide anyone.
      const screenTop = side < 0 ? FLOOR_Y + 1.25 : FLOOR_Y + 0.62;
      for (const end of [from, to]) {
        b.part();
        b.box(end - 0.03, FLOOR_Y + 0.05, Math.min(z - 0.28, side * inside), end + 0.03, screenTop, Math.max(z + 0.28, side * inside), c.seatEnd);
      }
      // Curved grab rail over the end of the bench.
      b.part();
      b.bar([from, FLOOR_Y + 1.25, z + side * 0.2], [from, ROOF_Y - 0.5, z - side * 0.15], 0.02, 0.02, c.pole, 5);
    }
  }
  // Floor-to-ceiling poles and the two overhead rails with ring straps.
  for (const center of DOOR_CENTERS) {
    if (center < x0 || center > x1) continue;
    for (const side of [-1, 1]) {
      b.part();
      b.bar([center, FLOOR_Y, side * 0.42], [center, ROOF_Y - 0.34, side * 0.42], 0.024, 0.024, c.pole, 6);
    }
  }
  for (const side of [-1, 1]) {
    const railZ = side * 0.78;
    const railY = ROOF_Y - 0.56;
    b.part();
    b.bar([x0 + 0.1, railY, railZ], [x1 - 0.1, railY, railZ], 0.018, 0.018, c.pole, 5);
    for (let u = x0 + 0.5; u < x1 - 0.4; u += 0.72) {
      b.part();
      b.box(u - 0.012, railY - 0.2, railZ - 0.02, u + 0.012, railY, railZ + 0.02, c.strap);
      ringStrap(b, u, railY - 0.27, railZ);
    }
  }
  // Inside-ceiling suggestion on the far side so an opened car still has a top edge.
  b.part();
  b.box(x0, ROOF_Y - 0.24, -inside, x1, ROOF_Y - 0.2, -inside + 0.28, 0xeee7d2);
  // Ad frames above the far windows.
  for (const [u0, u1] of windows) {
    if (u1 < x0 || u0 > x1) continue;
    b.part();
    b.quad([Math.max(u0, x0), head + 0.05, wallZ + 0.01], [Math.min(u1, x1), head + 0.05, wallZ + 0.01], [Math.min(u1, x1), head + 0.33, wallZ + 0.01], [Math.max(u0, x0), head + 0.33, wallZ + 0.01], 0xf5efdf, [0, 0, 1]);
  }
}

function ringStrap(b: Batch, x: number, y: number, z: number): void {
  const segments = 10;
  const r = 0.065;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.bar([x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.011, 0.011, c.strap, 3);
  }
}

function cabInterior(b: Batch, tipX: number, direction: number): void {
  // Operator's desk, seat and side console, seen once the shell is cut away.
  const deskX = tipX - direction * 0.72;
  b.part();
  b.box(deskX - 0.32, FLOOR_Y, -1.1, deskX + 0.32, FLOOR_Y + 0.82, 0.55, 0xc6c9c7);
  b.part();
  b.box(deskX - 0.36, FLOOR_Y + 0.82, -1.14, deskX + 0.36, FLOOR_Y + 0.88, 0.59, 0xe5e6e1);
  // Two desk screens and the master controller.
  for (const z of [-0.7, -0.15]) {
    b.part();
    b.box(deskX - 0.1, FLOOR_Y + 0.88, z - 0.2, deskX - 0.06, FLOOR_Y + 1.14, z + 0.2, 0x20262a);
    b.part();
    b.box(deskX - 0.11, FLOOR_Y + 0.92, z - 0.17, deskX - 0.1, FLOOR_Y + 1.11, z + 0.17, 0x63c29b);
  }
  b.part();
  b.box(deskX + 0.12, FLOOR_Y + 0.88, -0.05, deskX + 0.3, FLOOR_Y + 0.93, 0.25, 0x2b2f31);
  b.part();
  b.bar([deskX + 0.21, FLOOR_Y + 0.93, 0.1], [deskX + 0.21, FLOOR_Y + 1.1, 0.1], 0.016, 0.02, 0x8b8f91, 5);
  b.ellipsoid(deskX + 0.21, FLOOR_Y + 1.12, 0.1, 0.035, 0.035, 0.035, 0xc23a33, 4, 6);
  // Bulkhead between the cab and the passengers, with its door.
  const wallX = tipX - direction * CAB_DEPTH;
  b.part();
  b.quad([wallX, FLOOR_Y, -HALF_WIDTH + 0.08], [wallX, FLOOR_Y, HALF_WIDTH - 0.08], [wallX, ROOF_Y - 0.25, HALF_WIDTH - 0.08], [wallX, ROOF_Y - 0.25, -HALF_WIDTH + 0.08], c.wall, [direction, 0, 0]);
  b.part();
  b.quad([wallX + direction * 0.01, FLOOR_Y, -0.42], [wallX + direction * 0.01, FLOOR_Y, 0.42], [wallX + direction * 0.01, FLOOR_Y + 1.95, 0.42], [wallX + direction * 0.01, FLOOR_Y + 1.95, -0.42], c.door, [direction, 0, 0]);
  b.part();
  b.quad([wallX + direction * 0.02, FLOOR_Y + 1.1, -0.2], [wallX + direction * 0.02, FLOOR_Y + 1.1, 0.2], [wallX + direction * 0.02, FLOOR_Y + 1.75, 0.2], [wallX + direction * 0.02, FLOOR_Y + 1.75, -0.2], c.glass, [direction, 0, 0]);
}

/** Builds both halves of a car. The local origin is the middle of the car at rail height. */
export function buildCar({ cab, pantograph }: CarOptions): CarMeshes {
  const half = CAR_LENGTH / 2;
  const noseAt = cab === "front" ? -half : cab === "rear" ? half : null;
  const bodyFrom = cab === "front" ? -half + CAB_DEPTH : -half;
  const bodyTo = cab === "rear" ? half - CAB_DEPTH : half;

  const fixed = new Batch(1 << 14);
  underframe(fixed, -half, half);
  bogie(fixed, -6.8);
  bogie(fixed, 6.8);
  if (cab !== "front") endWall(fixed, -half, -1);
  // Side skirt on the near side, under the body line.
  fixed.part();
  fixed.quad([-half, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [half, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [half, FLOOR_Y, HALF_WIDTH - 0.04], [-half, FLOOR_Y, HALF_WIDTH - 0.04], 0x53585b, [0, 0, 1]);
  interior(fixed, bodyFrom, bodyTo);
  if (noseAt !== null) {
    const direction = cab === "front" ? -1 : 1;
    // Cab floor stays with the opened car, like the reference's exposed cab platform.
    fixed.part();
    const a = Math.min(noseAt - direction * 0.05, noseAt - direction * CAB_DEPTH);
    const d = Math.max(noseAt - direction * 0.05, noseAt - direction * CAB_DEPTH);
    const tip = noseAt;
    const shoulder = noseAt - direction * 0.45;
    const back = noseAt - direction * CAB_DEPTH;
    const w = HALF_WIDTH - 0.05;
    void a;
    void d;
    fixed.prism([[tip, -w * 0.72], [shoulder, -w], [back, -w], [back, w], [shoulder, w], [tip, w * 0.72]], FLOOR_Y - 0.3, FLOOR_Y, c.floor);
    // A low white rim where the nose was cut away, so the platform reads as the front of a cab.
    fixed.part();
    fixed.box(back, FLOOR_Y, w - 0.06, shoulder, FLOOR_Y + 0.16, w, c.seatEnd);
    fixed.box(back, FLOOR_Y, -w, shoulder, FLOOR_Y + 0.16, -w + 0.06, c.seatEnd);
    fixed.prism([[tip, -w * 0.72], [shoulder, -w], [shoulder + direction * -0.06, -w], [tip - direction * 0.06, -w * 0.68], [tip - direction * 0.06, w * 0.68], [shoulder + direction * -0.06, w], [shoulder, w], [tip, w * 0.72]], FLOOR_Y, FLOOR_Y + 0.16, c.seatEnd);
    cabInterior(fixed, noseAt, direction);
  }

  const shell = new Batch(1 << 14);
  // Far side's outer skin is hidden by the camera; only the near skin and the roof are drawn.
  bodySide(shell, bodyFrom, bodyTo, HALF_WIDTH, 1, noseAt);
  bodyRibs(shell, bodyFrom, bodyTo, HALF_WIDTH);
  openingsTrim(shell, bodyFrom, bodyTo, HALF_WIDTH, 1);
  glazing(shell, bodyFrom, bodyTo, HALF_WIDTH, 1);
  roof(shell, bodyFrom, bodyTo, pantograph, cab);
  if (noseAt !== null) cabNose(shell, noseAt, cab === "front" ? -1 : 1);
  // Near benches' backs belong to the wall behind them, so they leave with it.
  for (const [u0, u1] of [[-6.3, -3.1], [-1.75, 1.75], [3.1, 6.3], [-9.6, -7.85], [7.85, 9.6]] as const) {
    if (u1 < bodyFrom || u0 > bodyTo) continue;
    shell.part();
    const inside = HALF_WIDTH - 0.08;
    shell.box(Math.max(u0, bodyFrom), FLOOR_Y + 0.46, inside - 0.16, Math.min(u1, bodyTo), FLOOR_Y + 1.01, inside - 0.06, c.seat);
  }
  if (cab !== "rear") {
    // Gangway bellows towards the next car.
    shell.part();
    for (let i = 0; i < 5; i++) {
      shell.part();
      const gx = half + i * 0.045;
      shell.box(gx, FLOOR_Y - 0.1, -1.1, gx + 0.03, ROOF_Y - 0.3, 1.1, 0x3f4345);
    }
  }
  return { fixed: fixed.finish(), shell: shell.finish() };
}

/** One sliding door leaf in stainless steel with a tall window. Origin at its bottom middle. */
export function buildDoorLeaf(): MeshData {
  const b = new Batch(256);
  const w = DOOR_HALF / 2 + 0.02;
  b.part();
  b.quad([-w, 0, 0.02], [w, 0, 0.02], [w, DOOR_HEIGHT, 0.02], [-w, DOOR_HEIGHT, 0.02], c.door, [0, 0, 1]);
  b.part();
  b.quad([-w + 0.07, 0.95, 0.025], [w - 0.07, 0.95, 0.025], [w - 0.07, DOOR_HEIGHT - 0.14, 0.025], [-w + 0.07, DOOR_HEIGHT - 0.14, 0.025], c.glass, [0, 0, 1]);
  b.part();
  b.quad([-w + 0.04, 0.05, 0.024], [w - 0.04, 0.05, 0.024], [w - 0.04, 0.09, 0.024], [-w + 0.04, 0.09, 0.024], 0xe6c94d, [0, 0, 1]);
  return b.finish();
}
