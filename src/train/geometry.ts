import { Batch, Surface, type MeshData, type Vec3 } from "../geometry";
import { train as c } from "../shared/palette";
import { trainUv, type TrainPrint } from "../signs/regions";
import {
  BELT_Y,
  BENCHES,
  CAB_DEPTH,
  CAR_LENGTH,
  DOOR_CENTERS,
  DOOR_HALF,
  DOOR_HEIGHT,
  END_POST,
  END_RETURN,
  FLOOR_Y,
  GAP,
  HALF_WIDTH,
  HEAD_Y,
  INSIDE_HALF,
  NOSE_AT,
  RING_DROP,
  ROOF_Y,
  SEAT_HEIGHT,
  SHOULDER_Y,
  STRAP_RAIL_HEIGHT,
  STRAP_RAIL_Z,
  STRAP_STEP,
  WHEELCHAIR_BAY,
  WINDOWS,
  seatCentres,
} from "./layout";

export interface CarMeshes {
  /** Floor, underframe, far wall and everything that stays while the car is opened. */
  fixed: MeshData;
  /** Near wall, roof and roof equipment: the part cut away to look inside. */
  shell: MeshData;
  /** The front cab's own skin, cut away apart from the coach behind it. */
  cabin: MeshData | null;
  /** Everything only worth drawing from close to: built the first time anyone gets close. */
  detail: () => MeshData;
}

interface CarOptions {
  /** Which end carries a driving cab, if any. */
  cab: "none" | "front" | "rear";
  pantograph: boolean;
  /** The first coach of a Line 6 set is reserved for women. */
  women: boolean;
}

const SKIN_OUT = 0.006;
export const WHEEL_RADIUS = 0.42;
export const BOGIE_OFFSET = 5.6;
export const AXLE_OFFSET = 1.05;
export const WHEEL_Z = 0.72;

const SEAM = 0x9aa0a2;
const GASKET = 0x2e3438;
const STEEL_POLE = 0xe3e6e6;
const GUTTER = 0x50565a;
const END_STEEL = 0x7f8488;

/** Which ends of a car meet another coach, rather than a cab. */
interface PlainEnds {
  from: boolean;
  to: boolean;
}
const flatFrom = (x: number, ends: PlainEnds): number => (ends.from ? x + END_POST : x);
const flatTo = (x: number, ends: PlainEnds): number => (ends.to ? x - END_POST : x);

const printed = (b: Batch, name: TrainPrint, a: Vec3, d: Vec3, cc: Vec3, e: Vec3, facing: Vec3): void => {
  b.quad(a, d, cc, e, 0xffffff, facing, trainUv(name));
};

/** A flat shape with rounded corners, as a fan: the doors' tall windows and their gaskets. */
function roundedPanel(b: Batch, u0: number, u1: number, y0: number, y1: number, z: number, radius: number, color: number): void {
  const r = Math.min(radius, (u1 - u0) / 2, (y1 - y0) / 2);
  const cu = (u0 + u1) / 2;
  const cy = (y0 + y1) / 2;
  const points: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [
    [u1 - r, y1 - r, 0],
    [u0 + r, y1 - r, Math.PI / 2],
    [u0 + r, y0 + r, Math.PI],
    [u1 - r, y0 + r, Math.PI * 1.5],
  ];
  for (const [ox, oy, start] of corners) {
    for (let i = 0; i <= 3; i++) {
      const a = start + (i / 3) * (Math.PI / 2);
      points.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  }
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [dx, dy] = points[(i + 1) % points.length]!;
    b.quad([cu, cy, z], [ax, ay, z], [dx, dy, z], [dx, dy, z], color, [0, 0, 1]);
  }
}

function bogie(b: Batch, x: number): void {
  // The frame: a side beam from axle box to axle box, a transom across it.
  b.part();
  b.box(x - 1.38, 0.5, 0.86, x + 1.38, 0.68, 1.04, c.under);
  b.part();
  b.box(x - 0.42, 0.56, -0.86, x + 0.42, 0.72, 0.86, 0x34383a);
  // Axle boxes over each wheel, sitting on their coil springs.
  for (const axle of [-AXLE_OFFSET, AXLE_OFFSET]) {
    const ax = x + axle;
    b.part();
    b.box(ax - 0.17, 0.3, 0.9, ax + 0.17, 0.5, 1.08, 0x5a5e61);
    b.part();
    b.cylinder(ax, 0.3, 1.08, 0.08, 0.08, 0.01, 0x7c8083, 8);
    b.part();
    for (const dx of [-0.25, 0.25]) {
      b.cylinder(ax + dx, 0.44, 0.97, 0.075, 0.075, 0.09, 0x25282a, 8, false);
      b.cylinder(ax + dx, 0.53, 0.97, 0.06, 0.06, 0.03, 0x4a4e50, 8, false);
    }
  }
  // The air spring the body rides on, and the bolster that carries it.
  b.part();
  b.cylinder(x, 0.68, 0.84, 0.21, 0.23, 0.2, 0x202326, 12);
  b.part();
  b.box(x - 0.3, 0.86, 0.55, x + 0.3, 0.92, 1.08, 0x3a3e40);
  // A brake unit and a damper between the axles.
  b.part();
  b.box(x - 0.33, 0.28, 0.82, x - 0.07, 0.5, 0.98, 0x45494c);
  b.part();
  b.bar([x + 0.14, 0.34, 1.0], [x + 0.38, 0.84, 0.96], 0.028, 0.028, 0x7c8083, 5);
  // The earthing brush and cable that every powered axle trails.
  b.part();
  b.bar([x - 0.9, 0.52, 1.06], [x - 0.42, 0.92, 1.06], 0.012, 0.012, 0x151719, 3);
}

/** One wheel, for instancing and spinning. Built with its axle along z, facing the viewer. */
export function buildWheel(): MeshData {
  const b = new Batch(512);
  b.cull = false;
  const r = WHEEL_RADIUS;
  const segments = 18;
  b.part();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.quad([Math.cos(a0) * r, Math.sin(a0) * r, -0.08], [Math.cos(a1) * r, Math.sin(a1) * r, -0.08], [Math.cos(a1) * r, Math.sin(a1) * r, 0.08], [Math.cos(a0) * r, Math.sin(a0) * r, 0.08], 0x3b3e41, [Math.cos(a0), Math.sin(a0), 0]);
    b.quad([0, 0, 0.08], [Math.cos(a0) * r, Math.sin(a0) * r, 0.08], [Math.cos(a1) * r, Math.sin(a1) * r, 0.08], [0, 0, 0.08], c.wheel, [0, 0, 1]);
  }
  b.part();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const inner = r * 0.34;
    const outer = r * 0.84;
    b.quad([Math.cos(a0) * inner, Math.sin(a0) * inner, 0.09], [Math.cos(a1) * inner, Math.sin(a1) * inner, 0.09], [Math.cos(a1) * outer, Math.sin(a1) * outer, 0.09], [Math.cos(a0) * outer, Math.sin(a0) * outer, 0.09], 0x56595c, [0, 0, 1]);
  }
  // Disc bolts, so that it can be seen to turn.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.part();
    b.block(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58 - 0.018, 0.09, 0.036, 0.036, 0.016, 0x9a9d9f);
  }
  b.part();
  b.cylinder(0, -0.05, 0.1, 0.06, 0.06, 0.1, 0x26282a, 8);
  return b.finish();
}

/** Underframe equipment: inverter, compressor and battery boxes hung between the bogies. */
function underframe(b: Batch, x0: number, x1: number): void {
  b.part();
  b.box(x0, FLOOR_Y - 0.26, -HALF_WIDTH + 0.05, x1, FLOOR_Y - 0.03, HALF_WIDTH - 0.05, c.under);
  for (const [x, length, depth, fins] of [[-3.05, 1.9, 0.5, true], [-0.85, 1.7, 0.44, false], [1.15, 1.4, 0.52, true], [3.1, 1.5, 0.4, false]] as const) {
    const top = FLOOR_Y - 0.26;
    const face = HALF_WIDTH - 0.14;
    b.part();
    b.box(x - length / 2, top - depth, 0.2, x + length / 2, top, face, 0x4f5457);
    if (fins) {
      // A grille of cooling fins.
      b.part();
      for (let u = x - length / 2 + 0.12; u < x + length / 2 - 0.1; u += 0.1) {
        b.box(u, top - depth + 0.05, face, u + 0.05, top - 0.05, face + 0.012, 0x33373a);
      }
    } else {
      // A hinged cover with its catches.
      b.part();
      b.box(x - length / 2 + 0.06, top - depth + 0.05, face, x + length / 2 - 0.06, top - 0.05, face + 0.006, 0x585d60);
      b.part();
      for (const u of [-0.32, 0.32]) b.box(x + u - 0.04, top - depth + 0.1, face + 0.006, x + u + 0.04, top - depth + 0.16, face + 0.02, 0x2a2d2f);
    }
  }
  // Cable conduit running the length of the car, clipped under the solebar.
  b.part();
  b.box(x0 + 0.2, FLOOR_Y - 0.33, HALF_WIDTH - 0.16, x1 - 0.2, FLOOR_Y - 0.27, HALF_WIDTH - 0.1, 0x3a3e40);
}

/** The near skin: smooth stainless panels round every window and door, with real openings. */
function bodySide(b: Batch, bodyFrom: number, bodyTo: number, women: boolean, ends: PlainEnds): void {
  const z = HALF_WIDTH;
  const x0 = flatFrom(bodyFrom, ends);
  const x1 = flatTo(bodyTo, ends);
  const openings: Array<[number, number, "door" | "window"]> = [
    ...DOOR_CENTERS.map((center) => [center - DOOR_HALF - 0.1, center + DOOR_HALF + 0.1, "door"] as [number, number, "door"]),
    ...WINDOWS.map(([a, d]) => [a, d, "window"] as [number, number, "window"]),
  ].sort((a, d) => a[0] - d[0]);
  const add = (u0: number, u1: number, v0: number, v1: number, color: number, out = 0): void => {
    if (u1 <= u0 || v1 <= v0) return;
    b.quad([u0, v0, z + out], [u1, v0, z + out], [u1, v1, z + out], [u0, v1, z + out], color, [0, 0, 1]);
  };
  b.part();
  let cursor = x0;
  for (const [o0, o1, kind] of openings) {
    const a = Math.max(o0, x0);
    const d = Math.min(o1, x1);
    if (d <= x0 || a >= x1) continue;
    add(cursor, a, FLOOR_Y - 0.05, SHOULDER_Y, c.silver);
    if (kind === "window") {
      add(a, d, FLOOR_Y - 0.05, BELT_Y, c.silver);
      add(a, d, HEAD_Y, SHOULDER_Y, c.silver);
    } else {
      add(a, d, FLOOR_Y + DOOR_HEIGHT + 0.08, SHOULDER_Y, c.silver);
    }
    cursor = d;
  }
  add(cursor, x1, FLOOR_Y - 0.05, SHOULDER_Y, c.silver);
  // Line 6's green band runs the whole train above the windows.
  b.part();
  add(x0, x1, HEAD_Y + 0.1, HEAD_Y + 0.33, c.band, SKIN_OUT);
  // Panel seams: a welded joint at each pillar, and the solebar and rub rail along the bottom.
  b.part();
  const seams = new Set<number>();
  for (const [a, d] of WINDOWS) {
    seams.add(a - 0.06);
    seams.add(d + 0.06);
    if (d - a > 2) seams.add((a + d) / 2);
  }
  for (const u of seams) {
    if (u <= x0 + 0.02 || u >= x1 - 0.02) continue;
    add(u - 0.007, u + 0.007, FLOOR_Y - 0.05, BELT_Y, SEAM, SKIN_OUT);
    add(u - 0.007, u + 0.007, HEAD_Y, HEAD_Y + 0.1, SEAM, SKIN_OUT);
  }
  add(x0, x1, FLOOR_Y - 0.05, FLOOR_Y + 0.04, c.silverDark, SKIN_OUT);
  add(x0, x1, FLOOR_Y + 0.04, FLOOR_Y + 0.05, 0x7c8083, SKIN_OUT);
  // Window surrounds in dark rubber.
  for (const [u0, u1] of WINDOWS) {
    if (u1 < x0 || u0 > x1) continue;
    const a = Math.max(u0, x0);
    const d = Math.min(u1, x1);
    const t = 0.055;
    b.part();
    b.box(a, BELT_Y, z - 0.03, d, BELT_Y + t, z + 0.012, GASKET);
    b.box(a, HEAD_Y - t, z - 0.03, d, HEAD_Y, z + 0.012, GASKET);
    b.box(a, BELT_Y + t, z - 0.03, a + t, HEAD_Y - t, z + 0.012, GASKET);
    b.box(d - t, BELT_Y + t, z - 0.03, d, HEAD_Y - t, z + 0.012, GASKET);
    // A vertical glazing bar where the long windows divide.
    if (d - a > 2) {
      b.part();
      const m = (a + d) / 2;
      b.box(m - 0.03, BELT_Y + t, z - 0.03, m + 0.03, HEAD_Y - t, z + 0.008, 0x3a4145);
    }
  }
  for (const center of DOOR_CENTERS) {
    if (center + DOOR_HALF < x0 || center - DOOR_HALF > x1) continue;
    doorway(b, center, women);
  }
  if (ends.from) endPost(b, x0, -1);
  if (ends.to) endPost(b, x1, 1);
}

/**
 * The bare stainless post that closes a side: the green band and rub rail stop where it starts,
 * and it turns in towards the end wall, with the gutter sweeping down onto it.
 */
function endPost(b: Batch, x: number, outward: number): void {
  const end = x + outward * END_POST;
  const y0 = FLOOR_Y - 0.05;
  b.part();
  b.quad([x, y0, HALF_WIDTH], [end, y0, HALF_WIDTH - END_RETURN], [end, SHOULDER_Y, HALF_WIDTH - END_RETURN], [x, SHOULDER_Y, HALF_WIDTH], c.silverDark, [outward * 0.3, 0, 1]);
  b.part();
  b.bar([x, SHOULDER_Y + 0.01, HALF_WIDTH + 0.005], [x + outward * 0.12, SHOULDER_Y - 0.2, HALF_WIDTH - END_RETURN * 0.5], 0.022, 0.018, GUTTER, 5);
}

/** A doorway from outside: stainless leaves with tall round-cornered windows, between red posts. */
function doorway(b: Batch, center: number, women: boolean): void {
  const z = HALF_WIDTH;
  const top = FLOOR_Y + DOOR_HEIGHT;
  for (const side of [-1, 1]) {
    const leaf0 = center + (side < 0 ? -DOOR_HALF : 0.008);
    const leaf1 = center + (side < 0 ? -0.008 : DOOR_HALF);
    b.part();
    b.quad([leaf0, FLOOR_Y, z - 0.04], [leaf1, FLOOR_Y, z - 0.04], [leaf1, top, z - 0.04], [leaf0, top, z - 0.04], c.door, [0, 0, 1]);
    b.part();
    roundedPanel(b, leaf0 + 0.08, leaf1 - 0.08, FLOOR_Y + 0.88, top - 0.12, z - 0.038, 0.09, GASKET);
    b.part();
    roundedPanel(b, leaf0 + 0.11, leaf1 - 0.11, FLOOR_Y + 0.91, top - 0.15, z - 0.036, 0.07, c.glass);
    // The kick plate along the foot of each leaf.
    b.part();
    b.quad([leaf0 + 0.05, FLOOR_Y + 0.04, z - 0.036], [leaf1 - 0.05, FLOOR_Y + 0.04, z - 0.036], [leaf1 - 0.05, FLOOR_Y + 0.28, z - 0.036], [leaf0 + 0.05, FLOOR_Y + 0.28, z - 0.036], c.silverDark, [0, 0, 1]);
  }
  // The rubber nosing where the leaves meet.
  b.part();
  b.box(center - 0.012, FLOOR_Y + 0.02, z - 0.04, center + 0.012, top, z - 0.022, 0x24282a);
  // Red door posts and lintel: the one strong colour on a Line 6 coach's side.
  b.part();
  b.box(center - DOOR_HALF - 0.09, FLOOR_Y, z - 0.04, center - DOOR_HALF, top + 0.08, z + 0.012, c.doorRed);
  b.box(center + DOOR_HALF, FLOOR_Y, z - 0.04, center + DOOR_HALF + 0.09, top + 0.08, z + 0.012, c.doorRed);
  b.box(center - DOOR_HALF - 0.09, top, z - 0.04, center + DOOR_HALF + 0.09, top + 0.08, z + 0.012, c.doorRed);
  // The door-open lamp on the pillar, and the sill step.
  b.part();
  b.cylinder(center + DOOR_HALF + 0.17, top - 0.06, z + 0.002, 0.04, 0.04, 0.01, 0xd8a33a, 8);
  b.part();
  b.box(center - DOOR_HALF - 0.05, FLOOR_Y - 0.06, z - 0.02, center + DOOR_HALF + 0.05, FLOOR_Y, z + 0.05, 0x5c6063);
  if (women) {
    // Stations mark this coach with a red sign; here it stands beside each door.
    const u0 = center + DOOR_HALF + 0.14;
    b.part();
    printed(b, "women", [u0, BELT_Y + 0.5, z + 0.008], [u0 + 0.44, BELT_Y + 0.5, z + 0.008], [u0 + 0.44, BELT_Y + 0.61, z + 0.008], [u0, BELT_Y + 0.61, z + 0.008], [0, 0, 1]);
  }
}

const roofProfile = (u: number): number => SHOULDER_Y + (ROOF_Y - SHOULDER_Y) * (1 - Math.abs(u) ** 2.6);
/** Where the roof meets a plain end: drawn in with the post and rolled down a little. */
const ROOF_ROLL = 0.04;
const ROOF_ROWS = 8;
const endWidth = HALF_WIDTH - END_RETURN;

/** A strip of roof across the car, smooth from shoulder to crest. */
function roofSection(b: Batch, x0: number, x1: number, color: number): void {
  for (let i = 0; i < ROOF_ROWS; i++) {
    const u0 = -1 + (i * 2) / ROOF_ROWS;
    const u1 = -1 + ((i + 1) * 2) / ROOF_ROWS;
    const z0 = u0 * HALF_WIDTH;
    const z1 = u1 * HALF_WIDTH;
    b.quad([x0, roofProfile(u0), z0], [x0, roofProfile(u1), z1], [x1, roofProfile(u1), z1], [x1, roofProfile(u0), z0], color, [0, 1, 0]);
  }
}

/** A wall across the car at x, up to just under the roof's curve. */
function archedWall(b: Batch, x: number, facing: number, y0: number, width: number, color: number): void {
  for (let i = 0; i < ROOF_ROWS; i++) {
    const u0 = -1 + (i * 2) / ROOF_ROWS;
    const u1 = -1 + ((i + 1) * 2) / ROOF_ROWS;
    b.quad([x, y0, u0 * width], [x, y0, u1 * width], [x, roofProfile(u1) - ROOF_ROLL, u1 * width], [x, roofProfile(u0) - ROOF_ROLL, u0 * width], color, [facing, 0, 0]);
  }
}

function roofEnd(b: Batch, x: number, outward: number, color: number): void {
  const end = x + outward * END_POST;
  for (let i = 0; i < ROOF_ROWS; i++) {
    const u0 = -1 + (i * 2) / ROOF_ROWS;
    const u1 = -1 + ((i + 1) * 2) / ROOF_ROWS;
    b.quad(
      [x, roofProfile(u0), u0 * HALF_WIDTH],
      [x, roofProfile(u1), u1 * HALF_WIDTH],
      [end, roofProfile(u1) - ROOF_ROLL, u1 * endWidth],
      [end, roofProfile(u0) - ROOF_ROLL, u0 * endWidth],
      color,
      [outward * 0.2, 1, 0],
    );
  }
}

function roofEquipment(b: Batch, x0: number, x1: number, pantograph: boolean): void {
  // Rain gutter along the shoulder.
  b.part();
  b.box(x0, SHOULDER_Y - 0.03, HALF_WIDTH - 0.03, x1, SHOULDER_Y + 0.03, HALF_WIDTH + 0.02, GUTTER);
  for (const center of [-4.2, 4.2]) {
    if (center - 1.5 < x0 || center + 1.5 > x1) continue;
    airConditioner(b, center);
  }
  if (pantograph) drawPantograph(b);
  // Roof conduit tying the units together, in brackets.
  b.part();
  b.box(Math.max(x0, -2.6), ROOF_Y - 0.02, 0.72, Math.min(x1, 2.6), ROOF_Y + 0.05, 0.8, 0x8a8f91);
  for (let u = -2.4; u < 2.5; u += 0.8) {
    if (u < x0 || u > x1) continue;
    b.box(u - 0.03, ROOF_Y - 0.02, 0.68, u + 0.03, ROOF_Y + 0.065, 0.84, 0x6e7375);
  }
  // A strip of non-slip walkway down the middle of the roof.
  b.part();
  b.quad([x0 + 0.1, ROOF_Y + 0.004, -0.14], [x0 + 0.1, ROOF_Y + 0.004, 0.14], [x1 - 0.1, ROOF_Y + 0.004, 0.14], [x1 - 0.1, ROOF_Y + 0.004, -0.14], 0x9ca1a3, [0, 1, 0]);
}

/** Roof air conditioner, one of two a car: a pale housing with two banks of sloping louvres. */
function airConditioner(b: Batch, x: number): void {
  const y = ROOF_Y - 0.04;
  const top = y + 0.3;
  b.part();
  b.box(x - 1.5, y, -0.85, x + 1.5, top, 0.85, c.equipment);
  // The chamfered lid.
  b.part();
  b.box(x - 1.44, top, -0.78, x + 1.44, top + 0.05, 0.78, 0xa9aeb0);
  for (const bank of [-0.74, 0.74]) {
    const cx = x + bank;
    b.part();
    b.box(cx - 0.64, top + 0.05, -0.62, cx + 0.64, top + 0.058, 0.62, 0x7d8284);
    for (let u = -0.56; u < 0.58; u += 0.16) {
      b.part();
      b.quad([cx + u, top + 0.06, 0.58], [cx + u + 0.1, top + 0.06, 0.58], [cx + u + 0.1, top + 0.085, -0.58], [cx + u, top + 0.085, -0.58], 0xb4b9bb, [0, 1, 0.1]);
    }
  }
  // Side vents, the lifting lugs and the bolted feet.
  for (let u = x - 1.38; u < x + 1.38; u += 0.14) {
    b.part();
    b.box(u, y + 0.05, 0.85, u + 0.07, y + 0.25, 0.862, 0x6a6f71);
  }
  for (const u of [-1.3, 1.3]) {
    b.part();
    b.box(x + u - 0.05, top + 0.05, 0.7, x + u + 0.05, top + 0.1, 0.76, 0x747a7c);
    b.part();
    b.box(x + u - 0.12, y - 0.03, 0.85, x + u + 0.12, y + 0.02, 0.96, 0x6e7375);
  }
}

/** A single-arm pantograph: base frame on insulators, lower and upper arm, and the collector head. */
function drawPantograph(b: Batch): void {
  const y = ROOF_Y;
  const steel = 0x3f4446;
  b.part();
  b.box(-1, y + 0.13, -0.6, 1, y + 0.2, 0.6, 0x5f6567);
  for (const [ix, iz] of [[-0.82, -0.5], [-0.82, 0.5], [0.82, -0.5], [0.82, 0.5]] as const) {
    b.part();
    b.lathe(ix, iz, [[0.05, y - 0.02], [0.075, y + 0.03], [0.05, y + 0.06], [0.075, y + 0.09], [0.05, y + 0.14]], 0x6f8a78, 8);
  }
  const knee: Vec3 = [0.34, y + 0.82, 0];
  b.part();
  b.bar([-0.72, y + 0.22, 0.24], knee, 0.04, 0.03, steel, 6);
  b.bar([-0.72, y + 0.22, -0.24], knee, 0.04, 0.03, steel, 6);
  b.part();
  b.bar(knee, [-0.42, y + 1.3, 0], 0.03, 0.02, steel, 6);
  // The damper and raising spring under the lower arm.
  b.part();
  b.bar([-0.3, y + 0.2, 0], [0.16, y + 0.55, 0], 0.025, 0.02, 0x7a8082, 5);
  // The head: two carbon strips between horns.
  b.part();
  b.box(-0.54, y + 1.3, -0.82, -0.46, y + 1.34, 0.82, steel);
  b.box(-0.36, y + 1.3, -0.82, -0.28, y + 1.34, 0.82, steel);
  b.part();
  b.box(-0.54, y + 1.34, -0.72, -0.46, y + 1.36, 0.72, 0x1e2022);
  b.box(-0.36, y + 1.34, -0.72, -0.28, y + 1.36, 0.72, 0x1e2022);
  for (const side of [-1, 1]) {
    b.part();
    b.bar([-0.41, y + 1.32, side * 0.82], [-0.41, y + 1.22, side * 0.98], 0.016, 0.012, steel, 4);
  }
}

/**
 * The Kawasaki cab, from the photographs of sets 006 and 008: a rounded deep-green mask round two
 * dark windscreens, with the set's number in the corner and the destination over the glass; silver
 * below, with a pair of round lamps each side, the emblem at the mask's foot, and a red sill line.
 */
function cabNose(b: Batch, tip: number, d: number): void {
  const back = -d; // direction from the tip back along the car
  const planBack = (u: number): number => {
    const a = Math.abs(u);
    const corner = a > 0.74 ? 0.5 * (1 - Math.sqrt(Math.max(0, 1 - ((a - 0.74) / 0.26) ** 2))) : 0;
    return 0.14 * u * u + corner;
  };
  const TOP = 3.62;
  const rake = (y: number): number => (y > BELT_Y ? 0.3 * ((y - BELT_Y) / (TOP - BELT_Y)) ** 1.3 : 0);
  const surface = (u: number, y: number, out = 0): Vec3 => [tip + back * (planBack(u) + rake(y) - out), y, u * HALF_WIDTH];

  const patch = (u0: number, u1: number, y0: number, y1: number, color: number, out = 0): void => {
    const steps = Math.max(1, Math.ceil((u1 - u0) / 0.14));
    for (let i = 0; i < steps; i++) {
      const a = u0 + ((u1 - u0) * i) / steps;
      const e = u0 + ((u1 - u0) * (i + 1)) / steps;
      const mid = (a + e) / 2;
      // The face's outward side: round the corner it turns from the nose to the coach's flank.
      const slope = (planBack(mid + 0.01) - planBack(mid - 0.01)) / (0.02 * HALF_WIDTH);
      // Never higher than the roof it runs up to, or its top corners stand proud of the hood.
      const topA = Math.min(y1, roofProfile(a));
      const topE = Math.min(y1, roofProfile(e));
      b.quad(surface(a, Math.min(y0, topA), out), surface(e, Math.min(y0, topE), out), surface(e, topE, out), surface(a, topA, out), color, [d, 0.05, slope]);
    }
  };

  const lowY = FLOOR_Y - 0.14;
  const maskFoot = BELT_Y - 0.06;
  b.part();
  patch(-1, 1, lowY - 0.36, lowY, 0x3a3e41);
  b.part();
  patch(-1, 1, lowY, lowY + 0.1, c.doorRed);
  b.part();
  patch(-1, 1, lowY + 0.1, maskFoot, c.silver);
  // The mask: green from the foot of the glass to the crown, rounded at its lower corners and
  // dipping in the middle, where the emblem sits.
  b.part();
  patch(-1, 1, maskFoot, TOP, c.cab);
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const a = -1 + (i * 2) / steps;
    const e = -1 + ((i + 1) * 2) / steps;
    const dip = (u: number): number => 0.17 * Math.cos((u * Math.PI) / 2) ** 2;
    b.quad(surface(a, maskFoot - dip(a), 0.002), surface(e, maskFoot - dip(e), 0.002), surface(e, maskFoot, 0.002), surface(a, maskFoot, 0.002), c.cab, [d, 0.05, 0]);
  }
  // The silver lamp panels' seam, and the door in the nose, its outline under the narrow window.
  b.part();
  patch(-0.84, -0.825, lowY + 0.1, maskFoot, 0x8b9193, 0.005);
  patch(-0.42, -0.405, lowY + 0.1, maskFoot, 0x8b9193, 0.005);
  patch(-0.84, -0.405, lowY + 0.1, lowY + 0.115, 0x8b9193, 0.005);
  b.part();
  patch(-0.8, -0.72, BELT_Y - 0.5, BELT_Y - 0.42, 0x4e5356, 0.008);
  // Windscreens: the narrow door window and the wide driver's screen, set in black rubber.
  const screenLow = BELT_Y + 0.14;
  const screenHigh = TOP - 0.3;
  b.part();
  patch(-0.84, -0.4, screenLow - 0.03, screenHigh + 0.03, 0x0f1214, 0.008);
  patch(-0.36, 0.86, screenLow - 0.03, screenHigh + 0.03, 0x0f1214, 0.008);
  b.part();
  patch(-0.82, -0.42, screenLow, screenHigh, c.glassCab, 0.012);
  b.part();
  patch(-0.34, 0.84, screenLow, screenHigh, c.glassCab, 0.012);
  // Destination panel above the glass, in amber on black.
  // A flat panel over a curved face: it stands out far enough to clear the curve at its middle.
  const dest = (u: number, y: number): Vec3 => surface(u, y, 0.05);
  b.part();
  b.box(Math.min(tip + back * (rake(TOP - 0.16) - 0.045), tip + back * (rake(TOP - 0.16) + 0.04)), TOP - 0.28, -0.34 * HALF_WIDTH, Math.max(tip + back * (rake(TOP - 0.16) - 0.045), tip + back * (rake(TOP - 0.16) + 0.04)), TOP - 0.04, 0.44 * HALF_WIDTH, 0x121416);
  b.part();
  printed(b, "destination", dest(-0.3, TOP - 0.25), dest(0.4, TOP - 0.25), dest(0.4, TOP - 0.07), dest(-0.3, TOP - 0.07), [d, 0.05, 0]);
  // The set's number, in the corner of the screen.
  b.part();
  const num = (u: number, y: number): Vec3 => surface(u, y, 0.02);
  printed(b, "number", num(0.56, screenHigh - 0.2), num(0.8, screenHigh - 0.2), num(0.8, screenHigh - 0.05), num(0.56, screenHigh - 0.05), [d, 0.05, 0]);
  // Wipers parked on the screen.
  b.part();
  b.bar(surface(0.04, screenLow + 0.03, 0.03), surface(0.28, screenLow + 0.62, 0.03), 0.009, 0.009, 0x0b0d0e, 3);
  b.bar(surface(0.44, screenLow + 0.03, 0.03), surface(0.68, screenLow + 0.62, 0.03), 0.009, 0.009, 0x0b0d0e, 3);
  b.bar(surface(-0.68, screenLow + 0.03, 0.03), surface(-0.56, screenLow + 0.55, 0.03), 0.008, 0.008, 0x0b0d0e, 3);
  // Paired round lamps, each in its chrome ring.
  for (const u of [-0.76, -0.54, 0.54, 0.76]) lamp(b, surface(u, BELT_Y - 0.36, 0.01), 0.075, d);
  // The line's emblem, at the foot of the mask.
  const emblem = surface(0.02, maskFoot - 0.1, 0.012);
  lamp(b, emblem, 0.075, d, 0xf0efe9, c.cab);
  // Coupler under the nose, in its pocket.
  b.part();
  const cx = tip + back * 0.05;
  b.box(Math.min(cx, cx + back * 0.5), lowY - 0.5, -0.22, Math.max(cx, cx + back * 0.5), lowY - 0.24, 0.22, 0x25282a);
  b.part();
  b.box(Math.min(cx - d * 0.12, cx), lowY - 0.48, -0.14, Math.max(cx - d * 0.12, cx), lowY - 0.26, 0.14, 0x5a5e61);

  // Hood from the top of the mask, rising over the shoulder to the crown of the roof.
  const hoodBack = tip + back * CAB_DEPTH;
  const rows = 8;
  const columns = 10;
  b.part();
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    for (let i = 0; i < columns; i++) {
      const u0 = -1 + (i * 2) / columns;
      const u1 = -1 + ((i + 1) * 2) / columns;
      const point = (u: number, t: number): Vec3 => {
        const start = surface(u, Math.min(TOP, roofProfile(u)));
        const eased = Math.sin((t * Math.PI) / 2);
        return [start[0] + (hoodBack - start[0]) * t, start[1] + (roofProfile(u) - start[1]) * eased, u * HALF_WIDTH];
      };
      b.quad(point(u0, t0), point(u1, t0), point(u1, t1), point(u0, t1), c.cab, [d * 0.4, 1, u0 * 0.3]);
    }
  }

  // The cab's near side: silver below, green above, with its own window, door and handle.
  const sideFrom = tip + back * (planBack(1) + 0.02);
  const sideTo = hoodBack;
  const a = Math.min(sideFrom, sideTo);
  const e = Math.max(sideFrom, sideTo);
  const z = HALF_WIDTH;
  b.part();
  b.quad([a, lowY, z], [e, lowY, z], [e, BELT_Y, z], [a, BELT_Y, z], c.silver, [0, 0, 1]);
  b.part();
  b.quad([a, BELT_Y, z], [e, BELT_Y, z], [e, SHOULDER_Y, z], [a, SHOULDER_Y, z], c.cab, [0, 0, 1]);
  b.part();
  b.quad([a + 0.22, BELT_Y + 0.1, z + SKIN_OUT], [e - 0.14, BELT_Y + 0.1, z + SKIN_OUT], [e - 0.14, HEAD_Y - 0.08, z + SKIN_OUT], [a + 0.22, HEAD_Y - 0.08, z + SKIN_OUT], GASKET, [0, 0, 1]);
  b.part();
  b.quad([a + 0.26, BELT_Y + 0.14, z + 0.008], [e - 0.18, BELT_Y + 0.14, z + 0.008], [e - 0.18, HEAD_Y - 0.12, z + 0.008], [a + 0.26, HEAD_Y - 0.12, z + 0.008], c.glassCab, [0, 0, 1]);
  b.part();
  b.box(a + 0.1, lowY + 0.05, z, a + 0.13, HEAD_Y, z + SKIN_OUT, 0x8b9193);
  b.box(e - 0.08, lowY + 0.05, z, e - 0.05, HEAD_Y, z + SKIN_OUT, 0x8b9193);
  b.part();
  b.box(a, lowY, z, e, lowY + 0.1, z + SKIN_OUT, c.doorRed);
  b.part();
  b.box(e - 0.16, BELT_Y - 0.45, z, e - 0.13, BELT_Y + 0.1, z + 0.03, 0xdfe1e1);
  b.part();
  b.box(a + 0.3, lowY - 0.34, z - 0.05, e - 0.2, lowY - 0.3, z + 0.1, 0x4a4e50);
}

function lamp(b: Batch, at: Vec3, r: number, d: number, ring = 0xb6bbbd, core: number = c.light): void {
  const segments = 14;
  for (const [radius, color, push] of [[r * 1.35, ring, 0], [r, core, 0.003]] as const) {
    b.part();
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x = at[0] + d * push;
      b.quad([x, at[1], at[2]], [x, at[1] + Math.sin(a0) * radius, at[2] + Math.cos(a0) * radius], [x, at[1] + Math.sin(a1) * radius, at[2] + Math.cos(a1) * radius], [x, at[1], at[2]], color, [d, 0, 0]);
    }
  }
}

/** The outside of a car's end: dark in the photographs, in shade and catching none of the sky. */
function endWall(b: Batch, x: number, facing: number): void {
  // The underframe's own end closes the wall below this.
  b.part();
  archedWall(b, x, facing, FLOOR_Y - 0.03, endWidth, END_STEEL);
  b.part();
  for (const z of [-1, 1]) {
    const u = z * (endWidth - 0.34);
    b.quad([x + facing * 0.004, FLOOR_Y - 0.03, u - 0.008], [x + facing * 0.004, FLOOR_Y - 0.03, u + 0.008], [x + facing * 0.004, SHOULDER_Y, u + 0.008], [x + facing * 0.004, SHOULDER_Y, u - 0.008], 0x6a6f72, [facing, 0, 0]);
  }
}

const BELLOWS_HALF = 0.72;
const BELLOWS_TOP = FLOOR_Y + 2.2;
const BELLOWS_FOOT = FLOOR_Y - 0.1;

/**
 * The bellows from the coach at x back across the gap to the coach before it: rubber folds between
 * two steel mounting frames. No photograph shows them, since the slit hides them; they are sized to
 * the door they surround, in the usual form for a metro gangway.
 */
function bellows(b: Batch, x: number): void {
  const frame = 0.03;
  const folds = 7;
  const pitch = (GAP - frame * 2) / folds;
  for (let i = 0; i < folds; i++) {
    const inward = i % 2 ? 0.03 : 0;
    const from = x - frame - pitch * (i + 1);
    b.part();
    b.box(from + 0.004, BELLOWS_FOOT + inward, -BELLOWS_HALF + inward, from + pitch, BELLOWS_TOP - inward, BELLOWS_HALF - inward, i % 2 ? 0x24272a : 0x383c3f);
  }
  for (const u of [x - frame, x - GAP]) {
    const lip = 0.05;
    b.part();
    b.box(u, BELLOWS_FOOT - lip, -BELLOWS_HALF - lip, u + frame, BELLOWS_TOP + lip, BELLOWS_HALF + lip, 0x6d7275);
  }
}

/** A coupler housing hung under the end of a car. */
function draftGear(b: Batch, x: number, outward: number): void {
  const inner = x - outward * 0.5;
  b.part();
  b.box(Math.min(x, inner), FLOOR_Y - 0.5, -0.17, Math.max(x, inner), FLOOR_Y - 0.26, 0.17, 0x2c2f31);
  // The end sill closing the underframe above it.
  b.part();
  b.box(Math.min(x, x - outward * 0.06), FLOOR_Y - 0.34, -HALF_WIDTH + 0.12, Math.max(x, x - outward * 0.06), FLOOR_Y - 0.26, HALF_WIDTH - 0.12, 0x3f4346);
}

/** A cable or hose looping down across the gap, from the car at x to the one before it. */
function jumper(b: Batch, x: number, z: number, y: number, radius: number, color: number): void {
  const droop = 0.16;
  const points: Vec3[] = [
    [x, y, z],
    [x - GAP * 0.25, y - droop * 0.8, z],
    [x - GAP * 0.75, y - droop * 0.8, z],
    [x - GAP, y, z],
  ];
  b.part();
  for (let i = 0; i + 1 < points.length; i++) b.bar(points[i]!, points[i + 1]!, radius, radius, color, 5);
}

/**
 * The coupling under the gap: a bar with its joint collar, and the cables and air hoses that loop
 * across. Too small and dark to make out in the photographs, so this follows ordinary EMU practice.
 */
function coupling(b: Batch, x: number): void {
  b.part();
  b.box(x - GAP, FLOOR_Y - 0.44, -0.07, x, FLOOR_Y - 0.32, 0.07, 0x25282a);
  b.part();
  b.box(x - GAP / 2 - 0.05, FLOOR_Y - 0.47, -0.11, x - GAP / 2 + 0.05, FLOOR_Y - 0.29, 0.11, 0x45494c);
  for (const z of [0.34, 0.52, 0.7, 0.88]) jumper(b, x, z, FLOOR_Y - 0.3, 0.026, 0x17191b);
  for (const z of [-0.36, -0.58]) jumper(b, x, z, FLOOR_Y - 0.32, 0.03, 0x2a2d2f);
}

const floorTop = FLOOR_Y;

/** What is always there behind the windows: floor, far wall, benches. Enough from any distance. */
function interiorShell(b: Batch, x0: number, x1: number, wheelchair: boolean): void {
  const inside = INSIDE_HALF;
  b.part();
  b.box(x0, floorTop - 0.02, -inside, x1, floorTop, inside, c.floor);
  b.part();
  b.quad([x0, floorTop + 0.003, 0.5], [x1, floorTop + 0.003, 0.5], [x1, floorTop + 0.003, -0.5], [x0, floorTop + 0.003, -0.5], c.aisle, [0, 1, 0]);
  const wallZ = -inside;
  const y0 = floorTop;
  // Just under the roof at this wall, or it would show above the far shoulder from outside.
  const y1 = roofProfile(-inside / HALF_WIDTH) - 0.02;
  const panel = (a: number, d: number, v0: number, v1: number, color: number, out = 0): void => {
    if (d <= a || v1 <= v0) return;
    b.quad([a, v0, wallZ + out], [d, v0, wallZ + out], [d, v1, wallZ + out], [a, v1, wallZ + out], color, [0, 0, 1]);
  };
  const cuts = [
    ...WINDOWS.map(([a, d]) => [a, d, "w"] as const),
    ...DOOR_CENTERS.map((center) => [center - DOOR_HALF - 0.04, center + DOOR_HALF + 0.04, "d"] as const),
  ].sort((a, d) => a[0] - d[0]);
  b.part();
  let cursor = x0;
  for (const [a, d, kind] of cuts) {
    if (d <= x0 || a >= x1) continue;
    const from = Math.max(a, x0);
    const to = Math.min(d, x1);
    panel(cursor, from, y0, y1, c.wall);
    if (kind === "w") {
      panel(from, to, y0, BELT_Y, c.wall);
      panel(from, to, HEAD_Y, y1, c.wall);
      // Far windows are real openings: the city goes by through them.
      b.part();
      const t = 0.05;
      b.box(from, BELT_Y, wallZ, to, BELT_Y + t, wallZ + 0.04, 0x8a8f90);
      b.box(from, HEAD_Y - t, wallZ, to, HEAD_Y, wallZ + 0.04, 0x8a8f90);
      b.box(from, BELT_Y, wallZ, from + t, HEAD_Y, wallZ + 0.04, 0x8a8f90);
      b.box(to - t, BELT_Y, wallZ, to, HEAD_Y, wallZ + 0.04, 0x8a8f90);
      if (to - from > 1.8) b.box((from + to) / 2 - 0.02, BELT_Y, wallZ, (from + to) / 2 + 0.02, HEAD_Y, wallZ + 0.03, 0x8a8f90);
      b.part();
    } else {
      panel(from, to, y0 + DOOR_HEIGHT + 0.04, y1, c.wall);
      b.part();
      const mid = (from + to) / 2;
      panel(from, mid - 0.008, y0, y0 + DOOR_HEIGHT, 0x6f7578, -0.01);
      panel(mid + 0.008, to, y0, y0 + DOOR_HEIGHT, 0x6f7578, -0.01);
      b.part();
    }
    cursor = to;
  }
  panel(cursor, x1, y0, y1, c.wall);
  // The inside of the far end, so a window never looks through into the next car's back.
  b.part();
  b.as(Surface.interior, () => archedWall(b, x1 - 0.02, -1, y0, inside, c.wall));
  // Plain green benches, on both sides.
  for (const side of [-1, 1]) {
    const z = side * (inside - 0.26);
    for (const [u0, u1] of BENCHES) {
      if (u1 < x0 || u0 > x1) continue;
      if (side < 0 && wheelchair && u0 === WHEELCHAIR_BAY[0]) continue;
      const from = Math.max(u0, x0);
      const to = Math.min(u1, x1);
      const seatY = floorTop + SEAT_HEIGHT;
      b.part();
      b.box(from, seatY - 0.08, z - 0.25, to, seatY, z + 0.25, c.seat);
      if (side < 0) {
        b.part();
        const back = side * inside - side * 0.06;
        b.box(from, seatY, Math.min(back, back - side * 0.1), to, seatY + 0.55, Math.max(back, back - side * 0.1), c.seat);
      }
    }
  }
}

/** A moulded seat pan: a grid of facets dipping towards the middle, which is what the eye reads as a seat. */
function seatPan(b: Batch, u0: number, u1: number, z0: number, z1: number, y: number): void {
  const nu = 4;
  const nv = 3;
  const h = (i: number, j: number): number => y - 0.012 * Math.sin((i / nu) * Math.PI) * Math.sin((j / nv) * Math.PI);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = u0 + ((u1 - u0) * i) / nu;
      const d = u0 + ((u1 - u0) * (i + 1)) / nu;
      const e = z0 + ((z1 - z0) * j) / nv;
      const f = z0 + ((z1 - z0) * (j + 1)) / nv;
      b.quad([a, h(i, j + 1), f], [d, h(i + 1, j + 1), f], [d, h(i + 1, j), e], [a, h(i, j), e], c.seat, [0, 1, 0]);
    }
  }
}

function seatBack(b: Batch, u0: number, u1: number, z: number, y0: number, y1: number, lean: number): void {
  const nu = 4;
  const nv = 3;
  const zAt = (i: number, j: number): number => z + lean * (1 - j / nv) - 0.01 * Math.sin((i / nu) * Math.PI) * Math.sin((j / nv) * Math.PI);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = u0 + ((u1 - u0) * i) / nu;
      const d = u0 + ((u1 - u0) * (i + 1)) / nu;
      const e = y0 + ((y1 - y0) * j) / nv;
      const f = y0 + ((y1 - y0) * (j + 1)) / nv;
      b.quad([a, e, zAt(i, j)], [d, e, zAt(i + 1, j)], [d, f, zAt(i + 1, j + 1)], [a, f, zAt(i, j + 1)], c.seat, [0, 0, 1]);
    }
  }
}

/** The white quarter-round draught screen at a bench's end, and the stainless rail that arcs over it. */
function benchEnd(b: Batch, x: number, side: number, tall: boolean): void {
  const inside = INSIDE_HALF;
  const wall = side * inside;
  const out = -side * 0.6;
  const base = floorTop + 0.26;
  const shoulder = floorTop + 0.56;
  const top = tall ? floorTop + 1.38 : floorTop + 0.68;
  const steps = 9;
  const face = (px: number, facing: number): void => {
    const pivot: Vec3 = [px, base, wall];
    let prev: Vec3 = [px, base, wall + out];
    const next = (p: Vec3): void => {
      b.quad(pivot, prev, p, p, c.seatEnd, [facing, 0, 0]);
      prev = p;
    };
    next([px, shoulder, wall + out]);
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      next([px, shoulder + Math.sin(a) * (top - shoulder), wall + Math.cos(a) * out]);
    }
  };
  b.part();
  face(x - 0.015, -1);
  // The panel's rolled edge.
  b.part();
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * (Math.PI / 2);
    const a1 = ((i + 1) / steps) * (Math.PI / 2);
    const p = (a: number, dx: number): Vec3 => [x + dx, shoulder + Math.sin(a) * (top - shoulder), wall + Math.cos(a) * out];
    b.quad(p(a0, -0.015), p(a0, 0.015), p(a1, 0.015), p(a1, -0.015), 0xd6d6cf, [0, Math.sin(a1), side * -Math.cos(a1)]);
  }
  if (!tall) return;
  // The grab rail: up from a floor bracket in front of the panel, over and back to the wall.
  const railOut = out * 1.14;
  const railTop = floorTop + 1.96;
  const rail: Vec3[] = [[x, floorTop + 0.24, wall + railOut]];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    rail.push([x, shoulder + 0.1 + Math.sin(a) * (railTop - shoulder - 0.1), wall + Math.cos(a) * railOut]);
  }
  b.part();
  b.cable(rail, 0.016, STEEL_POLE, 6);
  b.part();
  b.box(x - 0.03, floorTop + 0.19, wall + railOut - 0.03, x + 0.03, floorTop + 0.25, wall + railOut + 0.03, 0x8e9294);
}

function ringStrap(b: Batch, x: number, y: number, z: number): void {
  const segments = 8;
  const r = 0.06;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.bar([x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.01, 0.01, c.strap, 3);
  }
}

/** The sloping panel over the far windows: adverts, the light strip, the door-top screens and the camera. */
function farCove(b: Batch, x0: number, x1: number, advert: (i: number) => TrainPrint): void {
  const wallZ = -INSIDE_HALF;
  const lowY = HEAD_Y + 0.04;
  const reach = 0.42;
  const highY = roofProfile((wallZ + reach) / HALF_WIDTH) - 0.03;
  const facing: Vec3 = [0, -0.55, 0.83];
  const at = (u: number, t: number, out = 0): Vec3 => [u, lowY + (highY - lowY) * t + out * -0.55, wallZ + reach * t + out * 0.83];
  b.part();
  b.quad(at(x0, 0), at(x1, 0), at(x1, 1), at(x0, 1), 0xf2eddc, facing);
  // The strip light along the top of the cove.
  b.part();
  b.quad(at(x0 + 0.1, 0.86, 0.01), at(x1 - 0.1, 0.86, 0.01), at(x1 - 0.1, 1, 0.01), at(x0 + 0.1, 1, 0.01), 0xffffff, facing);
  b.part();
  b.quad(at(x0, 0.84, 0.006), at(x1, 0.84, 0.006), at(x1, 0.86, 0.006), at(x0, 0.86, 0.006), 0xb4b6ae, facing);
  // Adverts over each long window.
  WINDOWS.forEach(([a, d], i) => {
    if (d < x0 || a > x1 || d - a < 2) return;
    b.part();
    printed(b, advert(i), at(Math.max(a, x0) + 0.05, 0.06, 0.008), at(Math.min(d, x1) - 0.05, 0.06, 0.008), at(Math.min(d, x1) - 0.05, 0.74, 0.008), at(Math.max(a, x0) + 0.05, 0.74, 0.008), facing);
  });
  // Door-top units: a white housing with two screens and a notice.
  for (const center of DOOR_CENTERS) {
    if (center < x0 || center > x1) continue;
    const u0 = center - 0.72;
    const u1 = center + 0.72;
    const y0 = floorTop + DOOR_HEIGHT + 0.08;
    const y1 = highY - 0.16;
    const z0 = wallZ + 0.03;
    const z1 = wallZ + 0.3;
    const front = (u: number, t: number, out = 0): Vec3 => [u, y0 + (y1 - y0) * t, z1 - (z1 - z0) * t * 0.55 + out];
    b.part();
    b.quad(front(u0, 0), front(u1, 0), front(u1, 1), front(u0, 1), 0xf4f1e6, [0, -0.1, 1]);
    b.quad([u0, y0, z0], [u0, y0, z1], [u0, y1, z0 + (z1 - z0) * 0.45], [u0, y1, z0], 0xe2dfd3, [-1, 0, 0]);
    b.part();
    b.quad(front(u0 + 0.12, 0.18, 0.004), front(center - 0.06, 0.18, 0.004), front(center - 0.06, 0.82, 0.004), front(u0 + 0.12, 0.82, 0.004), 0x14171a, [0, -0.1, 1]);
    b.part();
    printed(b, "route", front(u0 + 0.15, 0.24, 0.008), front(center - 0.09, 0.24, 0.008), front(center - 0.09, 0.76, 0.008), front(u0 + 0.15, 0.76, 0.008), [0, -0.1, 1]);
    b.part();
    b.quad(front(center + 0.06, 0.18, 0.004), front(u1 - 0.3, 0.18, 0.004), front(u1 - 0.3, 0.82, 0.004), front(center + 0.06, 0.82, 0.004), 0x14171a, [0, -0.1, 1]);
    b.part();
    b.quad(front(u1 - 0.26, 0.2, 0.004), front(u1 - 0.1, 0.2, 0.004), front(u1 - 0.1, 0.8, 0.004), front(u1 - 0.26, 0.8, 0.004), 0xd14a3a, [0, -0.1, 1]);
    // The dome camera on the ceiling cove beside it.
    b.part();
    const camera = at(center + 1.15, 0.72, 0.03);
    b.ellipsoid(camera[0], camera[1], camera[2], 0.06, 0.05, 0.06, 0xecebe4, 3, 8);
    b.part();
    b.ellipsoid(camera[0], camera[1] - 0.02, camera[2] + 0.025, 0.035, 0.03, 0.035, 0x22262a, 3, 7);
  }
  // A speaker grille between the units.
  for (const u of [-2.6, 2.6]) {
    if (u < x0 || u > x1) continue;
    b.part();
    for (let t = 0.76; t < 0.84; t += 0.02) b.quad(at(u - 0.18, t, 0.012), at(u + 0.18, t, 0.012), at(u + 0.18, t + 0.01, 0.012), at(u - 0.18, t + 0.01, 0.012), 0x9c9e96, facing);
  }
}

/** The far doors from inside: dark steel leaves with tall round-cornered windows, plate and intercom. */
function farDoors(b: Batch, x0: number, x1: number): void {
  const wallZ = -INSIDE_HALF;
  for (const center of DOOR_CENTERS) {
    if (center - DOOR_HALF < x0 || center + DOOR_HALF > x1) continue;
    const top = floorTop + DOOR_HEIGHT;
    for (const side of [-1, 1]) {
      const a = center + (side < 0 ? -DOOR_HALF : 0.012);
      const d = center + (side < 0 ? -0.012 : DOOR_HALF);
      b.part();
      roundedPanel(b, a + 0.09, d - 0.09, floorTop + 0.72, top - 0.12, wallZ + 0.012, 0.1, GASKET);
      b.part();
      roundedPanel(b, a + 0.12, d - 0.12, floorTop + 0.75, top - 0.15, wallZ + 0.016, 0.08, 0xaac8d2);
      // The kick plate.
      b.part();
      b.quad([a + 0.04, floorTop + 0.04, wallZ + 0.012], [d - 0.04, floorTop + 0.04, wallZ + 0.012], [d - 0.04, floorTop + 0.3, wallZ + 0.012], [a + 0.04, floorTop + 0.3, wallZ + 0.012], 0x8a8f91, [0, 0, 1]);
    }
    // Stainless pillars either side and a threshold on the floor.
    b.part();
    b.box(center - DOOR_HALF - 0.05, floorTop, wallZ, center - DOOR_HALF, top + 0.06, wallZ + 0.05, 0xc0c4c4);
    b.box(center + DOOR_HALF, floorTop, wallZ, center + DOOR_HALF + 0.05, top + 0.06, wallZ + 0.05, 0xc0c4c4);
    b.part();
    b.quad([center - DOOR_HALF, floorTop + 0.006, wallZ + 0.22], [center + DOOR_HALF, floorTop + 0.006, wallZ + 0.22], [center + DOOR_HALF, floorTop + 0.006, wallZ], [center - DOOR_HALF, floorTop + 0.006, wallZ], 0x7c8083, [0, 1, 0]);
    // The door's number.
    b.part();
    printed(b, "doorPlate", [center - 0.1, top + 0.0, wallZ + 0.055], [center + 0.1, top + 0.0, wallZ + 0.055], [center + 0.1, top + 0.08, wallZ + 0.055], [center - 0.1, top + 0.08, wallZ + 0.055], [0, 0, 1]);
    // The passenger intercom on the pillar: a grille and a call button.
    const ix = center + DOOR_HALF + 0.14;
    b.part();
    b.box(ix, floorTop + 1.22, wallZ, ix + 0.16, floorTop + 1.5, wallZ + 0.025, 0xb0b4b4);
    b.part();
    for (let y = floorTop + 1.34; y < floorTop + 1.46; y += 0.03) b.box(ix + 0.03, y, wallZ + 0.025, ix + 0.13, y + 0.012, wallZ + 0.028, 0x4a4e50);
    b.part();
    b.cylinder(ix + 0.08, floorTop + 1.25, wallZ + 0.032, 0.028, 0.028, 0.03, 0xc23a33, 8);
    // Stickers: no smoking on the wall, and the green way out over the door.
    b.part();
    const sx = center - DOOR_HALF - 0.42;
    printed(b, "noSmoking", [sx, floorTop + 1.4, wallZ + 0.004], [sx + 0.22, floorTop + 1.4, wallZ + 0.004], [sx + 0.22, floorTop + 1.62, wallZ + 0.004], [sx, floorTop + 1.62, wallZ + 0.004], [0, 0, 1]);
    b.part();
    printed(b, "exit", [center + DOOR_HALF + 0.06, top - 0.14, wallZ + 0.006], [center + DOOR_HALF + 0.42, top - 0.14, wallZ + 0.006], [center + DOOR_HALF + 0.42, top + 0.04, wallZ + 0.006], [center + DOOR_HALF + 0.06, top + 0.04, wallZ + 0.006], [0, 0, 1]);
  }
}

/** The space kept for a wheelchair, in the far corner: a marked floor, a padded rest and a low rail. */
function wheelchairBay(b: Batch, x0: number, x1: number): void {
  const [a, d] = WHEELCHAIR_BAY;
  if (a < x0 || d > x1) return;
  const wallZ = -INSIDE_HALF;
  b.part();
  b.quad([a + 0.1, floorTop + 0.006, wallZ + 1], [d - 0.1, floorTop + 0.006, wallZ + 1], [d - 0.1, floorTop + 0.006, wallZ + 0.05], [a + 0.1, floorTop + 0.006, wallZ + 0.05], 0x8fa3b8, [0, 1, 0]);
  b.part();
  b.box(a + 0.25, floorTop + 0.5, wallZ, d - 0.25, floorTop + 1.15, wallZ + 0.1, 0x9aa0a2);
  b.part();
  b.bar([a + 0.1, floorTop + 0.86, wallZ + 0.17], [d - 0.1, floorTop + 0.86, wallZ + 0.17], 0.016, 0.016, STEEL_POLE, 6);
  for (const u of [a + 0.14, d - 0.14]) b.bar([u, floorTop + 0.86, wallZ + 0.17], [u, floorTop + 0.86, wallZ + 0.01], 0.014, 0.014, STEEL_POLE, 5);
  b.part();
  printed(b, "wheelchair", [(a + d) / 2 - 0.13, floorTop + 1.25, wallZ + 0.006], [(a + d) / 2 + 0.13, floorTop + 1.25, wallZ + 0.006], [(a + d) / 2 + 0.13, floorTop + 1.51, wallZ + 0.006], [(a + d) / 2 - 0.13, floorTop + 1.51, wallZ + 0.006], [0, 0, 1]);
}

/**
 * The inside of the end wall the camera faces, proportioned from photographs of it: a stainless
 * door in a dark jamb, its big round-cornered window lit by the next coach, a notice on the glass,
 * handle and lock on the left, a small screen over it, and a sign on the panel to its right.
 */
function endWallInside(b: Batch, x: number): void {
  const px = x - 0.025;
  const door = 0.48;
  const top = floorTop + 2;
  b.part();
  b.quad([px, floorTop, -door - 0.03], [px, floorTop, door + 0.03], [px, top + 0.02, door + 0.03], [px, top + 0.02, -door - 0.03], GASKET, [-1, 0, 0]);
  b.part();
  b.quad([px - 0.003, floorTop + 0.006, -door], [px - 0.003, floorTop + 0.006, door], [px - 0.003, top, door], [px - 0.003, top, -door], 0xa9aeae, [-1, 0, 0]);
  b.part();
  roundedPanel3(b, px - 0.006, -0.36, 0.36, floorTop + 0.84, floorTop + 1.89, 0.12, GASKET);
  b.part();
  roundedPanel3(b, px - 0.009, -0.33, 0.33, floorTop + 0.87, floorTop + 1.86, 0.1, 0xd3dbd2);
  b.part();
  b.quad([px - 0.012, floorTop + 1.66, 0.02], [px - 0.012, floorTop + 1.66, 0.17], [px - 0.012, floorTop + 1.82, 0.17], [px - 0.012, floorTop + 1.82, 0.02], 0xeee8dc, [-1, 0, 0]);
  // Handle above, lock below, by the door's left edge.
  b.part();
  b.box(px - 0.05, floorTop + 1.2, -door + 0.03, px - 0.003, floorTop + 1.32, -door + 0.07, 0x54585a);
  b.part();
  b.cylinder(px - 0.008, floorTop + 0.89, -door + 0.05, 0.022, 0.022, 0.004, 0x54585a, 8);
  // The threshold plate the floor runs up to.
  b.part();
  b.quad([x - 0.17, floorTop + 0.004, door + 0.03], [px, floorTop + 0.004, door + 0.03], [px, floorTop + 0.004, -door - 0.03], [x - 0.17, floorTop + 0.004, -door - 0.03], 0x8f9496, [0, 1, 0]);
  // The screen over the door.
  b.part();
  b.quad([px, floorTop + 2.11, -0.23], [px, floorTop + 2.11, 0.23], [px, floorTop + 2.37, 0.23], [px, floorTop + 2.37, -0.23], 0x14171a, [-1, 0, 0]);
  b.part();
  printed(b, "route", [px - 0.004, floorTop + 2.13, -0.21], [px - 0.004, floorTop + 2.13, 0.21], [px - 0.004, floorTop + 2.35, 0.21], [px - 0.004, floorTop + 2.35, -0.21], [-1, 0, 0]);
  b.part();
  printed(b, "fire", [px - 0.002, floorTop + 1.98, 1.02], [px - 0.002, floorTop + 1.98, 1.24], [px - 0.002, floorTop + 2.2, 1.24], [px - 0.002, floorTop + 2.2, 1.02], [-1, 0, 0]);
}

/** roundedPanel, standing in the plane of an end wall and facing back down the car. */
function roundedPanel3(b: Batch, x: number, z0: number, z1: number, y0: number, y1: number, radius: number, color: number): void {
  const r = Math.min(radius, (z1 - z0) / 2, (y1 - y0) / 2);
  const cz = (z0 + z1) / 2;
  const cy = (y0 + y1) / 2;
  const points: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [
    [z1 - r, y1 - r, 0],
    [z0 + r, y1 - r, Math.PI / 2],
    [z0 + r, y0 + r, Math.PI],
    [z1 - r, y0 + r, Math.PI * 1.5],
  ];
  for (const [oz, oy, start] of corners) {
    for (let i = 0; i <= 3; i++) {
      const a = start + (i / 3) * (Math.PI / 2);
      points.push([oz + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  }
  for (let i = 0; i < points.length; i++) {
    const [az, ay] = points[i]!;
    const [dz, dy] = points[(i + 1) % points.length]!;
    b.quad([x, cy, cz], [x, ay, az], [x, dy, dz], [x, dy, dz], color, [-1, 0, 0]);
  }
}

/** Everything a passenger would notice, only drawn once someone gets close to the coach. */
function interiorDetail(b: Batch, x0: number, x1: number, options: { wheelchair: boolean; advertOffset: number }): void {
  const inside = INSIDE_HALF;
  const seatY = floorTop + SEAT_HEIGHT;
  // The moulded benches over the plain ones, each seat its own shape.
  for (const side of [-1, 1]) {
    const seatZ0 = side < 0 ? -inside + 0.06 : inside - 0.54;
    const seatZ1 = side < 0 ? -inside + 0.54 : inside - 0.06;
    for (const [u0, u1] of BENCHES) {
      if (u1 < x0 || u0 > x1) continue;
      if (side < 0 && options.wheelchair && u0 === WHEELCHAIR_BAY[0]) continue;
      const from = Math.max(u0, x0);
      const to = Math.min(u1, x1);
      const count = seatCentres(from, to).length;
      const width = (to - from) / count;
      // The cantilever frame that holds the bench off the floor.
      b.part();
      b.box(from + 0.04, floorTop + 0.16, side < 0 ? -inside : inside - 0.3, to - 0.04, seatY - 0.08, side < 0 ? -inside + 0.3 : inside, 0x7f8588);
      for (let i = 0; i < count; i++) {
        const a = from + i * width + 0.012;
        const d = from + (i + 1) * width - 0.012;
        b.part();
        seatPan(b, a, d, seatZ0, seatZ1, seatY + 0.012);
        b.quad([a, seatY - 0.06, seatZ1], [d, seatY - 0.06, seatZ1], [d, seatY + 0.012, seatZ1], [a, seatY + 0.012, seatZ1], 0x8bc465, [0, 0.2, 1]);
        if (side < 0) seatBack(b, a, d, -inside + 0.17, seatY + 0.01, seatY + 0.6, -0.07);
      }
      benchEnd(b, from, side, side < 0);
      benchEnd(b, to, side, side < 0);
      if (from === BENCHES[0]![0] && side < 0) {
        // The seats kept for the old and the pregnant carry a notice on the wall above.
        b.part();
        printed(b, "priority", [from + 0.2, seatY + 0.68, -inside + 0.006], [from + 0.72, seatY + 0.68, -inside + 0.006], [from + 0.72, seatY + 0.94, -inside + 0.006], [from + 0.2, seatY + 0.94, -inside + 0.006], [0, 0, 1]);
      }
    }
  }
  // Poles from floor to the rails at each door, tied across by a bar.
  const railY = floorTop + STRAP_RAIL_HEIGHT;
  for (const center of DOOR_CENTERS) {
    if (center < x0 || center > x1) continue;
    for (const side of [-1, 1]) {
      const z = side * 0.3;
      b.part();
      b.bar([center, floorTop, z], [center, railY + 0.42, z], 0.022, 0.022, STEEL_POLE, 7);
      b.part();
      b.cylinder(center, floorTop, z, 0.05, 0.03, 0.05, 0x9ca0a2, 8);
    }
    b.part();
    b.bar([center, railY, -STRAP_RAIL_Z], [center, railY, STRAP_RAIL_Z], 0.016, 0.016, STEEL_POLE, 5);
    for (const side of [-1, 1]) {
      b.part();
      b.block(center, railY - 0.03, side * 0.3, 0.07, 0.06, 0.07, 0xb6b9b9);
    }
  }
  // Two long rails carrying the ring straps, hung from the ceiling on brackets.
  for (const side of [-1, 1]) {
    const railZ = side * STRAP_RAIL_Z;
    b.part();
    b.bar([x0 + 0.1, railY, railZ], [x1 - 0.1, railY, railZ], 0.016, 0.016, STEEL_POLE, 5);
    for (let u = Math.ceil(x0 / 2) * 2; u < x1 - 0.2; u += 2) {
      b.part();
      b.bar([u, railY, railZ], [u, railY + 0.42, railZ - side * 0.04], 0.012, 0.012, 0xc4c7c7, 4);
    }
    const first = Math.ceil(x0 / STRAP_STEP) * STRAP_STEP;
    for (let u = first; u < x1 - 0.2; u += STRAP_STEP) {
      if (DOOR_CENTERS.some((center) => Math.abs(u - center) < 0.1)) continue;
      b.part();
      b.box(u - 0.014, railY - RING_DROP + 0.06, railZ - 0.008, u + 0.014, railY, railZ + 0.008, c.strap);
      ringStrap(b, u, railY - RING_DROP, railZ);
    }
  }
  farDoors(b, x0, x1);
  farCove(b, x0, x1, (i) => (["advert0", "advert1", "advert2", "advert3"] as const)[(i + options.advertOffset) % 4]!);
  if (options.wheelchair) wheelchairBay(b, x0, x1);
  b.as(Surface.interior, () => endWallInside(b, x1));
}

/** The bulkhead behind the driver, which stays when the car is opened. */
function cabBulkhead(b: Batch, tip: number, d: number): void {
  const wallX = tip - d * CAB_DEPTH;
  const at = (out: number): number => wallX + d * out;
  b.as(Surface.interior, () => {
    b.part();
    archedWall(b, wallX, d, floorTop, INSIDE_HALF, c.wall);
    // The stainless door through to the passengers, hung on the right, with its window high up.
    b.part();
    b.quad([at(0.01), floorTop, -0.42], [at(0.01), floorTop, 0.42], [at(0.01), floorTop + 1.95, 0.42], [at(0.01), floorTop + 1.95, -0.42], 0xb4b8b8, [d, 0, 0]);
    b.part();
    b.quad([at(0.016), floorTop + 1.2, -0.28], [at(0.016), floorTop + 1.2, 0.28], [at(0.016), floorTop + 1.82, 0.28], [at(0.016), floorTop + 1.82, -0.28], GASKET, [d, 0, 0]);
    b.part();
    b.quad([at(0.02), floorTop + 1.23, -0.25], [at(0.02), floorTop + 1.23, 0.25], [at(0.02), floorTop + 1.79, 0.25], [at(0.02), floorTop + 1.79, -0.25], 0xd3dbd2, [d, 0, 0]);
    b.part();
    for (const y of [0.32, 1.62]) b.box(Math.min(at(0), at(0.05)), floorTop + y, 0.4, Math.max(at(0), at(0.05)), floorTop + y + 0.13, 0.5, 0x8a8f90);
    b.part();
    b.box(Math.min(at(0.01), at(0.06)), floorTop + 1, -0.38, Math.max(at(0.01), at(0.06)), floorTop + 1.04, -0.22, 0x54585a);
    // The black board the crew pin their notices to.
    b.part();
    b.box(Math.min(at(0), at(0.03)), floorTop + 0.95, 0.66, Math.max(at(0), at(0.03)), floorTop + 1.72, 1.1, 0x1c1f22);
  });
}

/** The driver's desk: two screens, the master controller, the side console and the seat. */
function cabDetail(b: Batch, tip: number, d: number): void {
  const back = -d;
  const deskX = tip + back * 0.62;
  const deskTop = floorTop + 0.86;
  b.part();
  b.box(deskX - 0.3, floorTop, -1.15, deskX + 0.3, floorTop + 0.8, 0.6, 0xc6c9c7);
  b.part();
  b.box(deskX - 0.34, floorTop + 0.8, -1.2, deskX + 0.34, deskTop, 0.64, 0xe5e6e1);
  // The instrument hood at the back of the desk, facing the driver.
  b.part();
  b.box(deskX + d * 0.3 - 0.1, deskTop, -1.14, deskX + d * 0.3 + 0.1, deskTop + 0.2, 0.58, 0xa4a8a7);
  for (const z of [-0.78, -0.18]) {
    const x = deskX + d * 0.17;
    b.part();
    b.box(x - 0.025, deskTop, z - 0.24, x + 0.025, deskTop + 0.28, z + 0.24, 0x20262a);
    b.part();
    b.quad([x - 0.028, deskTop + 0.03, z - 0.21], [x - 0.028, deskTop + 0.03, z + 0.21], [x - 0.028, deskTop + 0.25, z + 0.21], [x - 0.028, deskTop + 0.25, z - 0.21], 0x63c29b, [-1, 0, 0]);
  }
  // Buttons along the desk.
  for (let z = -1.05; z < 0.5; z += 0.12) {
    b.part();
    b.block(deskX + 0.02, deskTop, z, 0.05, 0.015, 0.05, z < -0.6 ? 0xc23a33 : z < 0 ? 0xe6c94d : 0x3f4446);
  }
  // The master controller, its handle, and the driver's safety button.
  const handX = deskX + back * 0.16;
  b.part();
  b.box(handX - 0.1, deskTop, -0.06, handX + 0.1, deskTop + 0.06, 0.26, 0x2b2f31);
  b.part();
  b.bar([handX, deskTop + 0.06, 0.1], [handX + d * 0.05, deskTop + 0.24, 0.1], 0.016, 0.02, 0x8b8f91, 5);
  b.ellipsoid(handX + d * 0.05, deskTop + 0.26, 0.1, 0.038, 0.032, 0.038, 0xc23a33, 4, 6);
  // Sun visor over the screen, and the side console by the driver's elbow.
  b.part();
  b.box(deskX + d * 0.3 - 0.02, floorTop + 2.35, -1.05, deskX + d * 0.3 + 0.02, floorTop + 2.42, 0.4, 0x3c4042);
  const seatX = tip + back * 1.32;
  b.part();
  b.box(seatX - 0.36, floorTop, 0.82, seatX + 0.36, floorTop + 0.98, 1.3, 0xbcc0be);
  b.part();
  b.box(seatX - 0.3, floorTop + 0.98, 0.86, seatX + 0.3, floorTop + 1.0, 1.26, 0x4c5052);
  // The driver's seat on its pedestal.
  b.part();
  b.cylinder(seatX, floorTop, -0.28, 0.2, 0.06, 0.08, 0x3a3e41, 10);
  b.cylinder(seatX, floorTop + 0.08, -0.28, 0.05, 0.05, 0.3, 0x3a3e41, 8);
  b.part();
  b.box(seatX - 0.25, floorTop + 0.38, -0.52, seatX + 0.25, floorTop + 0.46, -0.04, 0x2f7a5c);
  b.part();
  const rest = seatX + back * 0.26;
  b.box(rest - 0.05, floorTop + 0.46, -0.52, rest + 0.05, floorTop + 1.15, -0.04, 0x2f7a5c);
  b.part();
  b.box(rest - 0.045, floorTop + 1.18, -0.42, rest + 0.045, floorTop + 1.38, -0.14, 0x2f7a5c);
  // Floor plate where the driver's feet go.
  b.part();
  b.quad([deskX + back * 0.32, floorTop + 0.006, 0.5], [seatX, floorTop + 0.006, 0.5], [seatX, floorTop + 0.006, -1], [deskX + back * 0.32, floorTop + 0.006, -1], 0x54585a, [0, 1, 0]);
}

/** Builds a car's three levels of drawing. The local origin is the middle of the car at rail height. */
export function buildCar({ cab, pantograph, women }: CarOptions): CarMeshes {
  const half = CAR_LENGTH / 2;
  const noseAt = cab === "front" ? -NOSE_AT : cab === "rear" ? NOSE_AT : null;
  const direction = cab === "rear" ? 1 : -1;
  const bodyFrom = cab === "front" ? -NOSE_AT + CAB_DEPTH : -half;
  const bodyTo = cab === "rear" ? NOSE_AT - CAB_DEPTH : half;
  const carFrom = cab === "front" ? -NOSE_AT : -half;
  const carTo = cab === "rear" ? NOSE_AT : half;
  const ends: PlainEnds = { from: cab !== "front", to: cab !== "rear" };

  const fixed = new Batch(1 << 14);
  underframe(fixed, carFrom, carTo);
  bogie(fixed, -BOGIE_OFFSET);
  bogie(fixed, BOGIE_OFFSET);
  // Everything in the gap hangs off the coach behind it, and stays when either coach is opened.
  if (ends.from) {
    endWall(fixed, -half, -1);
    bellows(fixed, -half);
    draftGear(fixed, -half, -1);
    coupling(fixed, -half);
  }
  if (ends.to) draftGear(fixed, half, 1);
  fixed.part();
  fixed.quad([carFrom, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [carTo, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [carTo, FLOOR_Y, HALF_WIDTH - 0.04], [carFrom, FLOOR_Y, HALF_WIDTH - 0.04], 0x53585b, [0, 0, 1]);
  const wheelchair = cab !== "rear";
  interiorShell(fixed, bodyFrom, bodyTo, wheelchair);
  if (noseAt !== null) {
    // The cab floor stays with the opened car, keeping the nose's shape in plan.
    const tip = noseAt + -direction * 0.02;
    const shoulder = noseAt + -direction * 0.62;
    const backX = noseAt + -direction * CAB_DEPTH;
    const w = HALF_WIDTH - 0.05;
    fixed.part();
    fixed.prism([[tip, -w * 0.72], [shoulder, -w], [backX, -w], [backX, w], [shoulder, w], [tip, w * 0.72]], FLOOR_Y - 0.3, FLOOR_Y, c.floor);
    fixed.part();
    fixed.box(Math.min(backX, shoulder), FLOOR_Y, w - 0.06, Math.max(backX, shoulder), FLOOR_Y + 0.14, w, c.seatEnd);
    cabBulkhead(fixed, noseAt, direction);
  }

  const shell = new Batch(1 << 15);
  bodySide(shell, bodyFrom, bodyTo, women, ends);
  const flat0 = flatFrom(bodyFrom, ends);
  const flat1 = flatTo(bodyTo, ends);
  shell.part();
  roofSection(shell, flat0, flat1, c.roof);
  if (ends.from) roofEnd(shell, flat0, -1, c.roof);
  if (ends.to) roofEnd(shell, flat1, 1, c.roof);
  roofEquipment(shell, flat0, flat1, pantograph);
  const cabin = cab === "front" ? new Batch(1 << 13) : null;
  if (noseAt !== null) cabNose(cabin ?? shell, noseAt, direction);
  // Near benches' backs belong to the wall behind them, so they leave with it.
  for (const [u0, u1] of BENCHES) {
    if (u1 < bodyFrom || u0 > bodyTo) continue;
    shell.part();
    shell.box(Math.max(u0, bodyFrom), FLOOR_Y + SEAT_HEIGHT, INSIDE_HALF - 0.16, Math.min(u1, bodyTo), FLOOR_Y + SEAT_HEIGHT + 0.55, INSIDE_HALF - 0.06, c.seat);
  }

  return {
    fixed: fixed.finish(),
    shell: shell.finish(),
    cabin: cabin?.finish() ?? null,
    detail: () => {
      const detail = new Batch(1 << 14);
      // Poles, rails and straps go to the line pass, which keeps them bright steel at any zoom.
      detail.lines = true;
      interiorDetail(detail, bodyFrom, bodyTo, { wheelchair, advertOffset: cab === "front" ? 0 : pantograph ? 1 : 2 });
      if (noseAt !== null) cabDetail(detail, noseAt, direction);
      return detail.finish();
    },
  };
}
