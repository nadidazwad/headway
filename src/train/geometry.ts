import { Batch, type MeshData, type Vec3 } from "../geometry";
import { train as c } from "../shared/palette";
import {
  BELT_Y,
  BENCHES,
  CAB_DEPTH,
  CAR_LENGTH,
  DOOR_CENTERS,
  DOOR_HALF,
  DOOR_HEIGHT,
  FLOOR_Y,
  HALF_WIDTH,
  HEAD_Y,
  INSIDE_HALF,
  ROOF_Y,
  SHOULDER_Y,
  STRAP_RAIL_HEIGHT,
  STRAP_RAIL_Z,
  STRAP_STEP,
  WINDOWS,
} from "./layout";

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

const SKIN_OUT = 0.006;
export const WHEEL_RADIUS = 0.42;
export const BOGIE_OFFSET = 5.6;
export const AXLE_OFFSET = 1.05;
export const WHEEL_Z = 0.72;

function bogie(b: Batch, x: number): void {
  b.part();
  b.box(x - 1.32, 0.46, -1.04, x + 1.32, 0.68, 1.04, c.under);
  b.part();
  b.box(x - 0.34, 0.68, -0.55, x + 0.34, 0.98, 0.55, 0x2f3234);
  for (const side of [-1, 1]) {
    for (const dx of [-0.52, 0.52]) {
      b.part();
      b.cylinder(x + dx, 0.68, side * 0.88, 0.17, 0.17, 0.26, 0x1f2224, 10);
    }
    // Brake units and the axle-box springs read as the only moving-looking parts at this height.
    b.part();
    b.box(x - 0.2, 0.3, side * 0.98, x + 0.2, 0.46, side * 1.08, 0x4d5154);
  }
  for (const wheelX of [x - AXLE_OFFSET, x + AXLE_OFFSET]) {
    b.part();
    b.block(wheelX, 0.34, 0.97, 0.38, 0.22, 0.12, 0x5a5e61);
  }
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

/** Underframe boxes: inverters, batteries and compressors hung between the bogies. */
function underframe(b: Batch, x0: number, x1: number): void {
  b.part();
  b.box(x0, FLOOR_Y - 0.26, -HALF_WIDTH + 0.05, x1, FLOOR_Y - 0.03, HALF_WIDTH - 0.05, c.under);
  for (const [x, length, depth] of [[-2.9, 2.1, 0.5], [-0.4, 1.7, 0.44], [2.2, 2.3, 0.52]] as const) {
    b.part();
    b.box(x - length / 2, FLOOR_Y - 0.26 - depth, 0.2, x + length / 2, FLOOR_Y - 0.26, HALF_WIDTH - 0.14, 0x4f5457);
    b.part();
    for (let u = x - length / 2 + 0.15; u < x + length / 2 - 0.1; u += 0.28) {
      b.box(u, FLOOR_Y - 0.26 - depth + 0.06, HALF_WIDTH - 0.14, u + 0.14, FLOOR_Y - 0.32, HALF_WIDTH - 0.13, 0x383c3e);
    }
  }
}

/** The near skin: panels round every window and door, with real openings to see through. */
function bodySide(b: Batch, x0: number, x1: number): void {
  const z = HALF_WIDTH;
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
  // Stainless ribs along the lower body, broken at each door.
  for (let y = FLOOR_Y + 0.1; y < BELT_Y - 0.05; y += 0.12) {
    b.part();
    let from = x0;
    for (const center of DOOR_CENTERS) {
      const a = center - DOOR_HALF - 0.1;
      const d = center + DOOR_HALF + 0.1;
      if (d <= x0 || a >= x1) continue;
      add(from, Math.max(a, from), y, y + 0.03, 0xb8bdbe, SKIN_OUT);
      from = Math.max(from, d);
    }
    add(from, x1, y, y + 0.03, 0xb8bdbe, SKIN_OUT);
  }
  // Window surrounds in dark rubber.
  for (const [u0, u1] of WINDOWS) {
    if (u1 < x0 || u0 > x1) continue;
    const a = Math.max(u0, x0);
    const d = Math.min(u1, x1);
    const t = 0.055;
    b.part();
    b.box(a, BELT_Y, z - 0.03, d, BELT_Y + t, z + 0.012, 0x2e3438);
    b.box(a, HEAD_Y - t, z - 0.03, d, HEAD_Y, z + 0.012, 0x2e3438);
    b.box(a, BELT_Y + t, z - 0.03, a + t, HEAD_Y - t, z + 0.012, 0x2e3438);
    b.box(d - t, BELT_Y + t, z - 0.03, d, HEAD_Y - t, z + 0.012, 0x2e3438);
    // A vertical glazing bar where the long windows divide.
    if (d - a > 2) {
      b.part();
      const m = (a + d) / 2;
      b.box(m - 0.025, BELT_Y + t, z - 0.03, m + 0.025, HEAD_Y - t, z + 0.008, 0x3a4145);
    }
  }
  // Doors: stainless leaves between red posts, with a route indicator above.
  for (const center of DOOR_CENTERS) {
    if (center + DOOR_HALF < x0 || center - DOOR_HALF > x1) continue;
    const top = FLOOR_Y + DOOR_HEIGHT;
    for (const side of [-1, 1]) {
      const leaf0 = center + (side < 0 ? -DOOR_HALF : 0.008);
      const leaf1 = center + (side < 0 ? -0.008 : DOOR_HALF);
      b.part();
      b.quad([leaf0, FLOOR_Y, z - 0.04], [leaf1, FLOOR_Y, z - 0.04], [leaf1, top, z - 0.04], [leaf0, top, z - 0.04], c.door, [0, 0, 1]);
      b.part();
      const g0 = leaf0 + 0.1;
      const g1 = leaf1 - 0.1;
      b.quad([g0, FLOOR_Y + 0.92, z - 0.036], [g1, FLOOR_Y + 0.92, z - 0.036], [g1, top - 0.16, z - 0.036], [g0, top - 0.16, z - 0.036], c.glass, [0, 0, 1]);
      b.part();
      b.quad([leaf0 + 0.05, FLOOR_Y + 0.04, z - 0.036], [leaf1 - 0.05, FLOOR_Y + 0.04, z - 0.036], [leaf1 - 0.05, FLOOR_Y + 0.08, z - 0.036], [leaf0 + 0.05, FLOOR_Y + 0.08, z - 0.036], 0xe6c94d, [0, 0, 1]);
    }
    b.part();
    b.box(center - DOOR_HALF - 0.09, FLOOR_Y, z - 0.04, center - DOOR_HALF, top + 0.08, z + 0.012, c.doorRed);
    b.box(center + DOOR_HALF, FLOOR_Y, z - 0.04, center + DOOR_HALF + 0.09, top + 0.08, z + 0.012, c.doorRed);
    b.box(center - DOOR_HALF - 0.09, top, z - 0.04, center + DOOR_HALF + 0.09, top + 0.08, z + 0.012, c.doorRed);
    b.part();
    b.box(center - 0.3, top + 0.12, z, center + 0.3, top + 0.27, z + 0.012, 0x20262a);
    b.part();
    b.box(center - 0.2, top + 0.17, z + 0.012, center + 0.2, top + 0.22, z + 0.015, 0xe59a2c);
  }
}

const roofProfile = (u: number): number => SHOULDER_Y + (ROOF_Y - SHOULDER_Y) * (1 - Math.abs(u) ** 2.6);

/** A strip of roof across the car, smooth from shoulder to crest. */
function roofSection(b: Batch, x0: number, x1: number, color: number): void {
  const rows = 8;
  const first = roofProfile;
  for (let i = 0; i < rows; i++) {
    const u0 = -1 + (i * 2) / rows;
    const u1 = -1 + ((i + 1) * 2) / rows;
    const z0 = u0 * HALF_WIDTH;
    const z1 = u1 * HALF_WIDTH;
    b.quad([x0, first(u0), z0], [x0, first(u1), z1], [x1, first(u1), z1], [x1, first(u0), z0], color, [0, 1, 0]);
  }
}

function roofEquipment(b: Batch, x0: number, x1: number, pantograph: boolean): void {
  b.part();
  b.box(x0, SHOULDER_Y - 0.03, HALF_WIDTH - 0.03, x1, SHOULDER_Y + 0.03, HALF_WIDTH + 0.02, 0x50565a);
  for (const center of [-4.2, 4.2]) {
    if (center - 1.5 < x0 || center + 1.5 > x1) continue;
    airConditioner(b, center);
  }
  if (pantograph) drawPantograph(b);
  // Roof conduit that ties the units together.
  b.part();
  b.box(Math.max(x0, -2.6), ROOF_Y - 0.02, 0.72, Math.min(x1, 2.6), ROOF_Y + 0.07, 0.82, 0x7b8183);
}

function airConditioner(b: Batch, x: number): void {
  const y = ROOF_Y - 0.04;
  b.part();
  b.box(x - 1.5, y, -0.85, x + 1.5, y + 0.27, 0.85, c.equipment);
  b.part();
  b.box(x - 1.44, y + 0.27, -0.8, x + 1.44, y + 0.33, 0.8, 0x848a8c);
  for (let u = x - 1.24; u < x + 1.24; u += 0.22) {
    b.part();
    b.box(u, y + 0.33, -0.62, u + 0.12, y + 0.355, 0.62, 0x53585a);
  }
  for (let u = x - 1.38; u < x + 1.38; u += 0.12) {
    b.part();
    b.box(u, y + 0.04, 0.85, u + 0.055, y + 0.23, 0.862, 0x4a4f51);
  }
}

function drawPantograph(b: Batch): void {
  const y = ROOF_Y;
  const steel = 0x3f4446;
  b.part();
  b.box(-1, y - 0.03, -0.66, 1, y + 0.12, 0.66, 0x5f6567);
  for (const z of [-0.46, 0.46]) {
    b.part();
    b.bar([-0.86, y + 0.12, z], [0.18, y + 0.66, z * 0.6], 0.03, 0.025, steel, 5);
    b.bar([0.18, y + 0.66, z * 0.6], [-0.3, y + 1.14, 0], 0.025, 0.02, steel, 5);
  }
  b.part();
  b.box(-0.4, y + 1.14, -0.82, -0.31, y + 1.18, 0.82, steel);
  b.box(-0.2, y + 1.14, -0.82, -0.11, y + 1.18, 0.82, steel);
  for (const [ix, iz] of [[-0.82, -0.5], [-0.82, 0.5], [0.82, -0.5], [0.82, 0.5]] as const) {
    b.part();
    b.cylinder(ix, y - 0.1, iz, 0.06, 0.05, 0.25, 0x7b8f7c, 6);
  }
}

/**
 * The Kawasaki cab, from the depot and platform photographs: rounded in plan, a deep-green mask
 * round two dark windscreens, silver below with its paired round lamps, a red line along the sill.
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
      const slope = (planBack(mid + 0.01) - planBack(mid - 0.01)) / (0.02 * HALF_WIDTH);
      b.quad(surface(a, y0, out), surface(e, y0, out), surface(e, y1, out), surface(a, y1, out), color, [d, 0.05, -back * d * slope * d]);
    }
  };

  const lowY = FLOOR_Y - 0.14;
  b.part();
  patch(-1, 1, lowY - 0.36, lowY, 0x3a3e41);
  b.part();
  patch(-1, 1, lowY, lowY + 0.1, c.doorRed);
  b.part();
  patch(-1, 1, lowY + 0.1, BELT_Y, c.silver);
  b.part();
  patch(-1, 1, BELT_Y, TOP, c.cab);
  // Windscreens: the narrow door window and the wide driver's screen, set in the green.
  const screenLow = BELT_Y + 0.14;
  const screenHigh = TOP - 0.3;
  b.part();
  patch(-0.82, -0.42, screenLow, screenHigh, c.glassCab, 0.012);
  b.part();
  patch(-0.34, 0.84, screenLow, screenHigh, c.glassCab, 0.012);
  // Destination panel above the wide screen, with its amber lettering.
  b.part();
  patch(-0.3, 0.42, TOP - 0.25, TOP - 0.06, 0x121416, 0.012);
  b.part();
  patch(-0.2, 0.32, TOP - 0.19, TOP - 0.12, 0xe59a2c, 0.018);
  // The train's white number on the screen's top corner.
  b.part();
  patch(0.6, 0.76, screenHigh - 0.16, screenHigh - 0.05, 0xf1f1ec, 0.02);
  // Wipers parked on the screen.
  b.part();
  const w0 = surface(0.04, screenLow + 0.03, 0.03);
  const w1 = surface(0.28, screenLow + 0.62, 0.03);
  b.bar(w0, w1, 0.008, 0.008, 0x0b0d0e, 3);
  const w2 = surface(0.44, screenLow + 0.03, 0.03);
  const w3 = surface(0.68, screenLow + 0.62, 0.03);
  b.bar(w2, w3, 0.008, 0.008, 0x0b0d0e, 3);
  // Front door seam in the silver, under the narrow window.
  b.part();
  patch(-0.84, -0.82, lowY + 0.1, BELT_Y, 0x8b9193, 0.006);
  patch(-0.42, -0.4, lowY + 0.1, BELT_Y, 0x8b9193, 0.006);
  // Paired lamps, each with a chrome ring.
  for (const u of [-0.7, -0.53, 0.53, 0.7]) lamp(b, surface(u, BELT_Y - 0.33, 0.01), 0.075, d);
  // The line's emblem between them.
  b.part();
  patch(-0.09, 0.09, BELT_Y - 0.46, BELT_Y - 0.24, c.cab, 0.01);
  b.part();
  patch(-0.05, 0.05, BELT_Y - 0.4, BELT_Y - 0.3, c.silver, 0.014);
  // Coupler.
  b.part();
  const cx = tip + back * 0.05;
  b.box(Math.min(cx, cx + back * 0.5), lowY - 0.5, -0.22, Math.max(cx, cx + back * 0.5), lowY - 0.24, 0.22, 0x25282a);

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

  // The cab's near side: silver below, green above, with its own small window and door.
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
  b.quad([a + 0.22, BELT_Y + 0.12, z + SKIN_OUT], [e - 0.16, BELT_Y + 0.12, z + SKIN_OUT], [e - 0.16, HEAD_Y - 0.1, z + SKIN_OUT], [a + 0.22, HEAD_Y - 0.1, z + SKIN_OUT], c.glassCab, [0, 0, 1]);
  b.part();
  b.box(a + 0.1, lowY + 0.05, z, a + 0.15, HEAD_Y, z + SKIN_OUT, 0x8b9193);
  b.box(e - 0.08, lowY + 0.05, z, e - 0.03, HEAD_Y, z + SKIN_OUT, 0x8b9193);
  b.part();
  b.box(a, lowY, z, e, lowY + 0.1, z + SKIN_OUT, c.doorRed);
  // A headlamp-height grab handle by the cab door.
  b.part();
  b.box(e - 0.14, BELT_Y - 0.45, z, e - 0.11, BELT_Y + 0.1, z + 0.03, 0xdfe1e1);
}

function lamp(b: Batch, at: Vec3, r: number, d: number): void {
  const segments = 14;
  for (const [radius, color, push] of [[r * 1.35, 0xb6bbbd, 0], [r, c.light, 0.003]] as const) {
    b.part();
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x = at[0] + d * push;
      b.quad([x, at[1], at[2]], [x, at[1] + Math.sin(a0) * radius, at[2] + Math.cos(a0) * radius], [x, at[1] + Math.sin(a1) * radius, at[2] + Math.cos(a1) * radius], [x, at[1], at[2]], color, [d, 0, 0]);
    }
  }
}

function endWall(b: Batch, x: number, facing: number): void {
  b.part();
  b.quad([x, FLOOR_Y - 0.26, -HALF_WIDTH], [x, FLOOR_Y - 0.26, HALF_WIDTH], [x, ROOF_Y - 0.1, HALF_WIDTH], [x, ROOF_Y - 0.1, -HALF_WIDTH], c.silver, [facing, 0, 0]);
  b.part();
  b.quad([x + facing * 0.01, FLOOR_Y, -0.55], [x + facing * 0.01, FLOOR_Y, 0.55], [x + facing * 0.01, FLOOR_Y + 2, 0.55], [x + facing * 0.01, FLOOR_Y + 2, -0.55], c.silverDark, [facing, 0, 0]);
  b.part();
  b.quad([x + facing * 0.02, FLOOR_Y + 1.05, -0.3], [x + facing * 0.02, FLOOR_Y + 1.05, 0.3], [x + facing * 0.02, FLOOR_Y + 1.85, 0.3], [x + facing * 0.02, FLOOR_Y + 1.85, -0.3], c.glass, [facing, 0, 0]);
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

/** The interior from the photographs: light green benches, white poles, cream walls, ring straps. */
function interior(b: Batch, x0: number, x1: number): void {
  const inside = INSIDE_HALF;
  b.part();
  b.box(x0, FLOOR_Y - 0.02, -inside, x1, FLOOR_Y, inside, c.floor);
  b.part();
  b.quad([x0, FLOOR_Y + 0.003, 0.5], [x1, FLOOR_Y + 0.003, 0.5], [x1, FLOOR_Y + 0.003, -0.5], [x0, FLOOR_Y + 0.003, -0.5], c.aisle, [0, 1, 0]);
  // The far wall's inside face.
  const wallZ = -inside;
  const y0 = FLOOR_Y;
  const y1 = ROOF_Y - 0.26;
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
      // An advert frame over the window, as on the real cars.
      b.part();
      panel(from + 0.05, to - 0.05, HEAD_Y + 0.05, HEAD_Y + 0.3, 0xfaf4e4, 0.012);
      b.part();
    } else {
      panel(from, to, y0 + DOOR_HEIGHT + 0.04, y1, c.wall);
      b.part();
      const mid = (from + to) / 2;
      panel(from, mid - 0.008, y0, y0 + DOOR_HEIGHT, c.door, -0.01);
      panel(mid + 0.008, to, y0, y0 + DOOR_HEIGHT, c.door, -0.01);
      b.part();
      panel(from + 0.14, mid - 0.14, y0 + 0.95, y0 + 1.72, 0xaac8d2, -0.004);
      panel(mid + 0.14, to - 0.14, y0 + 0.95, y0 + 1.72, 0xaac8d2, -0.004);
      // Information screens above the door.
      b.part();
      panel(mid - 0.42, mid + 0.42, y0 + DOOR_HEIGHT + 0.08, y0 + DOOR_HEIGHT + 0.38, 0x20262a, 0.03);
      b.part();
      panel(mid - 0.38, mid + 0.1, y0 + DOOR_HEIGHT + 0.12, y0 + DOOR_HEIGHT + 0.34, 0x4d8f7c, 0.034);
      b.part();
    }
    cursor = to;
  }
  panel(cursor, x1, y0, y1, c.wall);
  // Ceiling lip on the far side, so an opened car still has a top edge.
  b.part();
  b.box(x0, y1, -inside, x1, y1 + 0.05, -inside + 0.3, 0xeee7d2);
  // Benches on both sides.
  for (const side of [-1, 1]) {
    const z = side * (inside - 0.26);
    for (const [u0, u1] of BENCHES) {
      if (u1 < x0 || u0 > x1) continue;
      const from = Math.max(u0, x0);
      const to = Math.min(u1, x1);
      const seatY = FLOOR_Y + 0.44;
      b.part();
      b.box(from, FLOOR_Y + 0.08, z - 0.2, to, seatY - 0.08, z + 0.2, 0x8a9094);
      b.part();
      b.box(from, seatY - 0.08, z - 0.25, to, seatY, z + 0.25, c.seat);
      // Seat divisions.
      for (let u = from + 0.56; u < to - 0.2; u += 0.56) {
        b.box(u - 0.006, seatY, z - 0.25, u + 0.006, seatY + 0.002, z + 0.25, 0x7fb65a);
      }
      if (side < 0) {
        b.part();
        const back = side * inside - side * 0.06;
        b.box(from, seatY, Math.min(back, back - side * 0.1), to, seatY + 0.55, Math.max(back, back - side * 0.1), c.seat);
      }
      const screenTop = side < 0 ? FLOOR_Y + 1.25 : FLOOR_Y + 0.62;
      for (const end of [from, to]) {
        b.part();
        b.box(end - 0.03, FLOOR_Y + 0.05, Math.min(z - 0.28, side * inside), end + 0.03, screenTop, Math.max(z + 0.28, side * inside), c.seatEnd);
      }
      // The curved grab rail that rises from each bench end.
      b.part();
      const riseFrom: Vec3 = [from, screenTop, z + side * 0.2];
      const riseTo: Vec3 = [from, FLOOR_Y + STRAP_RAIL_HEIGHT, side * STRAP_RAIL_Z];
      b.bar(riseFrom, riseTo, 0.02, 0.02, c.pole, 5);
    }
  }
  // Floor-to-ceiling poles at the doors.
  for (const center of DOOR_CENTERS) {
    if (center < x0 || center > x1) continue;
    for (const side of [-1, 1]) {
      b.part();
      b.bar([center, FLOOR_Y, side * 0.42], [center, FLOOR_Y + STRAP_RAIL_HEIGHT + 0.25, side * 0.42], 0.024, 0.024, c.pole, 6);
    }
  }
  // Two rails with ring straps, in a lattice passengers can reach for.
  for (const side of [-1, 1]) {
    const railZ = side * STRAP_RAIL_Z;
    const railY = FLOOR_Y + STRAP_RAIL_HEIGHT;
    b.part();
    b.bar([x0 + 0.1, railY, railZ], [x1 - 0.1, railY, railZ], 0.018, 0.018, c.pole, 5);
    const first = Math.ceil(x0 / STRAP_STEP) * STRAP_STEP;
    for (let u = first; u < x1 - 0.2; u += STRAP_STEP) {
      b.part();
      b.box(u - 0.012, railY - 0.2, railZ - 0.02, u + 0.012, railY, railZ + 0.02, c.strap);
      ringStrap(b, u, railY - 0.27, railZ);
    }
  }
}

function cabInterior(b: Batch, tip: number, d: number): void {
  const back = -d;
  const deskX = tip + back * 0.62;
  b.part();
  b.box(deskX - 0.3, FLOOR_Y, -1.1, deskX + 0.3, FLOOR_Y + 0.8, 0.55, 0xc6c9c7);
  b.part();
  b.box(deskX - 0.34, FLOOR_Y + 0.8, -1.14, deskX + 0.34, FLOOR_Y + 0.86, 0.59, 0xe5e6e1);
  for (const z of [-0.7, -0.15]) {
    b.part();
    b.box(deskX + d * 0.1, FLOOR_Y + 0.86, z - 0.2, deskX + d * 0.06, FLOOR_Y + 1.12, z + 0.2, 0x20262a);
    b.part();
    b.box(deskX + d * 0.06 - 0.012, FLOOR_Y + 0.9, z - 0.17, deskX + d * 0.06 + 0.012, FLOOR_Y + 1.09, z + 0.17, 0x63c29b);
  }
  b.part();
  b.box(deskX + back * 0.12 - 0.09, FLOOR_Y + 0.86, -0.05, deskX + back * 0.12 + 0.09, FLOOR_Y + 0.91, 0.25, 0x2b2f31);
  b.part();
  b.bar([deskX + back * 0.12, FLOOR_Y + 0.91, 0.1], [deskX + back * 0.12, FLOOR_Y + 1.08, 0.1], 0.016, 0.02, 0x8b8f91, 5);
  b.ellipsoid(deskX + back * 0.12, FLOOR_Y + 1.1, 0.1, 0.035, 0.035, 0.035, 0xc23a33, 4, 6);
  // Driver's seat.
  const seatX = tip + back * 1.32;
  b.part();
  b.cylinder(seatX, FLOOR_Y, -0.28, 0.06, 0.05, 0.38, 0x3a3e41, 8);
  b.part();
  b.box(seatX - 0.25, FLOOR_Y + 0.38, -0.52, seatX + 0.25, FLOOR_Y + 0.46, -0.04, 0x2f7a5c);
  b.part();
  b.box(seatX + back * 0.26 - 0.05, FLOOR_Y + 0.46, -0.52, seatX + back * 0.26 + 0.05, FLOOR_Y + 1.15, -0.04, 0x2f7a5c);
  // Bulkhead with its door, between the driver and the passengers.
  const wallX = tip + back * CAB_DEPTH;
  b.part();
  b.quad([wallX, FLOOR_Y, -INSIDE_HALF], [wallX, FLOOR_Y, INSIDE_HALF], [wallX, ROOF_Y - 0.26, INSIDE_HALF], [wallX, ROOF_Y - 0.26, -INSIDE_HALF], c.wall, [d, 0, 0]);
  b.part();
  b.quad([wallX + d * 0.01, FLOOR_Y, -0.42], [wallX + d * 0.01, FLOOR_Y, 0.42], [wallX + d * 0.01, FLOOR_Y + 1.95, 0.42], [wallX + d * 0.01, FLOOR_Y + 1.95, -0.42], c.door, [d, 0, 0]);
  b.part();
  b.quad([wallX + d * 0.02, FLOOR_Y + 1.1, -0.2], [wallX + d * 0.02, FLOOR_Y + 1.1, 0.2], [wallX + d * 0.02, FLOOR_Y + 1.75, 0.2], [wallX + d * 0.02, FLOOR_Y + 1.75, -0.2], c.glass, [d, 0, 0]);
}

/** Builds both halves of a car. The local origin is the middle of the car at rail height. */
export function buildCar({ cab, pantograph }: CarOptions): CarMeshes {
  const half = CAR_LENGTH / 2;
  const noseAt = cab === "front" ? -half : cab === "rear" ? half : null;
  const direction = cab === "rear" ? 1 : -1;
  const bodyFrom = cab === "front" ? -half + CAB_DEPTH : -half;
  const bodyTo = cab === "rear" ? half - CAB_DEPTH : half;

  const fixed = new Batch(1 << 14);
  underframe(fixed, -half, half);
  bogie(fixed, -BOGIE_OFFSET);
  bogie(fixed, BOGIE_OFFSET);
  if (cab !== "front") endWall(fixed, -half, -1);
  fixed.part();
  fixed.quad([-half, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [half, FLOOR_Y - 0.26, HALF_WIDTH - 0.04], [half, FLOOR_Y, HALF_WIDTH - 0.04], [-half, FLOOR_Y, HALF_WIDTH - 0.04], 0x53585b, [0, 0, 1]);
  interior(fixed, bodyFrom, bodyTo);
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
    cabInterior(fixed, noseAt, direction);
  }

  const shell = new Batch(1 << 15);
  bodySide(shell, bodyFrom, bodyTo);
  shell.part();
  roofSection(shell, bodyFrom, bodyTo, c.roof);
  roofEquipment(shell, bodyFrom, bodyTo, pantograph);
  if (noseAt !== null) cabNose(shell, noseAt, direction);
  // Near benches' backs belong to the wall behind them, so they leave with it.
  for (const [u0, u1] of BENCHES) {
    if (u1 < bodyFrom || u0 > bodyTo) continue;
    shell.part();
    shell.box(Math.max(u0, bodyFrom), FLOOR_Y + 0.44, INSIDE_HALF - 0.16, Math.min(u1, bodyTo), FLOOR_Y + 0.99, INSIDE_HALF - 0.06, c.seat);
  }
  if (cab !== "rear") {
    for (let i = 0; i < 5; i++) {
      shell.part();
      const gx = half + i * 0.04;
      shell.box(gx, FLOOR_Y - 0.1, -1.1, gx + 0.026, ROOF_Y - 0.3, 1.1, 0x3f4345);
    }
  }
  return { fixed: fixed.finish(), shell: shell.finish() };
}
