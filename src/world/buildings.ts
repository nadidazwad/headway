import type { Assets } from "../assets";
import { Surface, type Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { city, stucco } from "../shared/palette";
import { billboardUv } from "../signs/regions";
import { chooseTenants, groundShops, upperShops, type Frontage } from "./shopfront";

export interface Plot {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** 0 close to the line, 1 middle distance, 2 far enough that only the massing reads. */
  lod: 0 | 1 | 2;
  maxHeight: number;
  /** Whether the +Z face looks onto the main road. */
  streetFront: boolean;
  /** Whether the -X face looks onto a side street. */
  sideFront: boolean;
  assets: Assets;
}

/** Draws a street-facing storey or two of shops. Returns how many floors of flats they replaced. */
function shopfronts(b: Batch, plot: Plot, width: number, height: number, floors: number, trim: number, rng: Rng): number {
  const f: Frontage = { width, height, trim, lod: plot.lod, assets: plot.assets, rng };
  // A commercial block lets its first floor too, and needs two storeys of front for it.
  const tenants = floors >= 2 && rng.chance(0.72) ? chooseTenants(width, rng) : [];
  groundShops(b, f, tenants);
  if (!tenants.length) return 0;
  upperShops(b, f, height, FLOOR, tenants);
  return 1;
}

const FLOOR = 3.1;
const FACE_X = -Math.PI / 2;

interface Bay {
  kind: "window" | "wide" | "balcony" | "blank" | "slit";
}

interface Style {
  wall: number;
  trim: number;
  bays: Bay["kind"][];
  bayWidth: number;
  grilles: boolean;
  frame: number;
  glass: number;
}

/** A window with its dark reveal, mullion and sill. Detail falls away with distance. */
function drawWindow(b: Batch, u: number, y: number, w: number, h: number, style: Style, lod: number, panes: number, rng: Rng): void {
  if (lod >= 2) {
    b.panel(u, y, u + w, y + h, 0.015, style.glass);
    return;
  }
  b.part();
  if (lod === 1) {
    b.panel(u - 0.07, y - 0.07, u + w + 0.07, y + h + 0.07, 0.015, style.frame);
    b.panel(u, y, u + w, y + h, 0.025, style.glass);
    for (let i = 1; i < panes; i++) {
      const m = u + (w * i) / panes;
      b.panel(m - 0.03, y, m + 0.03, y + h, 0.03, style.frame);
    }
    return;
  }
  const f = 0.09;
  const out = 0.08;
  b.box(u - f, y - f, 0, u + w + f, y, out, style.frame);
  b.box(u - f, y + h, 0, u + w + f, y + h + f, out, style.frame);
  b.box(u - f, y, 0, u, y + h, out, style.frame);
  b.box(u + w, y, 0, u + w + f, y + h, out, style.frame);
  b.part();
  b.panel(u, y, u + w, y + h, 0.02, style.glass);
  b.part();
  for (let i = 1; i < panes; i++) {
    const m = u + (w * i) / panes;
    b.box(m - 0.03, y, 0.02, m + 0.03, y + h, 0.05, style.frame);
  }
  b.box(u, y + h * 0.62, 0.02, u + w, y + h * 0.62 + 0.05, 0.05, style.frame);
  b.part();
  b.box(u - 0.14, y - f - 0.08, 0, u + w + 0.14, y - f, 0.18, city.sill);
  if (style.grilles) {
    // Burglar grilles: almost every Dhaka window has them.
    b.part();
    const bars = Math.max(2, Math.round(w / 0.42));
    for (let i = 1; i < bars; i++) {
      const m = u + (w * i) / bars;
      b.box(m - 0.012, y, 0.09, m + 0.012, y + h, 0.115, city.iron);
    }
    b.box(u, y + h * 0.33, 0.09, u + w, y + h * 0.33 + 0.028, 0.115, city.iron);
    b.box(u, y + h * 0.66, 0.09, u + w, y + h * 0.66 + 0.028, 0.115, city.iron);
  }
  if (rng.chance(0.14)) {
    // A window air conditioner, the unit every middle-class flat ends up with.
    b.part();
    const unitW = Math.min(0.72, w * 0.7);
    const ux = u + (w - unitW) / 2;
    b.box(ux, y - 0.14, 0.02, ux + unitW, y + 0.3, 0.46, 0xe6e4da);
    b.part();
    for (let i = 0; i < 5; i++) {
      const m = ux + 0.08 + (i * (unitW - 0.16)) / 4;
      b.box(m - 0.012, y - 0.08, 0.46, m + 0.012, y + 0.24, 0.47, 0x8b8d8a);
    }
  }
}

/** A balcony: slab, parapet, grille and a door behind. Laundry shows up on some of them. */
function drawBalcony(b: Batch, u: number, y: number, w: number, style: Style, lod: number, rng: Rng): void {
  const depth = lod === 0 ? 1.05 : 0.8;
  b.part();
  drawWindow(b, u + 0.18, y + 0.2, w - 0.36, FLOOR - 0.75, style, lod, 2, rng);
  b.part();
  b.box(u - 0.06, y - 0.06, 0, u + w + 0.06, y + 0.06, depth, style.trim);
  if (lod >= 1) {
    b.part();
    b.box(u, y + 0.06, depth - 0.05, u + w, y + 1.02, depth, style.wall);
    return;
  }
  b.part();
  // Low solid wall, then iron grille up to the slab above: the Dhaka balcony.
  b.box(u, y + 0.06, depth - 0.08, u + w, y + 0.78, depth, style.wall);
  b.box(u - 0.01, y + 0.06, 0, u + 0.07, y + 0.78, depth, style.wall);
  b.part();
  b.box(u, y + 0.78, depth - 0.09, u + w, y + 0.84, depth + 0.01, style.trim);
  const grilled = rng.chance(0.38);
  if (grilled) {
    b.part();
    const bars = Math.round(w / 0.36);
    for (let i = 0; i <= bars; i++) {
      const m = u + (w * i) / bars;
      b.box(m - 0.012, y + 0.84, depth - 0.05, m + 0.012, y + FLOOR - 0.08, depth - 0.025, city.iron);
    }
    b.box(u, y + 1.75, depth - 0.05, u + w, y + 1.78, depth - 0.025, city.iron);
    b.box(u, y + FLOOR - 0.1, depth - 0.05, u + w, y + FLOOR - 0.06, depth - 0.025, city.iron);
  }
  if (rng.chance(0.24)) {
    // Washing on a line across the balcony.
    b.part();
    let cursor = u + 0.2;
    const lineY = y + 1.95;
    b.bar([u + 0.05, lineY, depth - 0.3], [u + w - 0.05, lineY, depth - 0.3], 0.006, 0.006, 0x4c4c4c, 3);
    const clothes = [0xc8413a, 0x2f6fb0, 0xe2a22d, 0xf4f1e7, 0x2f8f6b, 0xd86a9a, 0x6d5aa8];
    while (cursor < u + w - 0.45) {
      const width = rng.range(0.26, 0.5);
      const drop = rng.range(0.5, 0.95);
      b.part();
      b.box(cursor, lineY - drop, depth - 0.31, cursor + width, lineY, depth - 0.29, rng.pick(clothes));
      cursor += width + rng.range(0.05, 0.22);
    }
  }
  if (rng.chance(0.3)) {
    // A pot plant on the balcony wall.
    b.part();
    const px = u + rng.range(0.25, w - 0.25);
    b.cylinder(px, y + 0.84, depth - 0.05, 0.1, 0.13, 0.18, 0xb0683f, 7);
    b.part();
    b.ellipsoid(px, y + 1.17, depth - 0.05, 0.2, 0.2, 0.2, city.leaf, 3, 6);
  }
}

function drawFacade(b: Batch, width: number, floors: number, baseY: number, style: Style, lod: number, rng: Rng): void {
  const count = Math.max(1, Math.round(width / style.bayWidth));
  const bay = width / count;
  const pattern = style.bays;
  for (let floor = 0; floor < floors; floor++) {
    const y = baseY + floor * FLOOR;
    if (lod <= 1) {
      b.part();
      b.box(-0.02, y - 0.1, 0, width + 0.02, y + 0.06, 0.1, style.trim);
    }
    for (let i = 0; i < count; i++) {
      const kind = pattern[i % pattern.length]!;
      const u = i * bay;
      if (kind === "blank") continue;
      if (kind === "balcony") {
        drawBalcony(b, u + 0.14, y + 0.1, bay - 0.28, style, lod, rng);
      } else if (kind === "slit") {
        const w = Math.min(bay * 0.34, 0.8);
        drawWindow(b, u + (bay - w) / 2, y + 1.2, w, 0.8, { ...style, grilles: false }, lod, 1, rng);
      } else {
        const margin = kind === "wide" ? 0.34 : Math.max(0.5, bay * 0.22);
        const w = bay - margin * 2;
        const panes = kind === "wide" ? (w > 2.6 ? 4 : 3) : 2;
        drawWindow(b, u + margin, y + 0.95, w, 1.55, style, lod, panes, rng);
      }
    }
  }
}

function drawParapet(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: number, trim: number): void {
  const t = 0.18;
  b.part();
  b.box(x0, y, z1 - t, x1, y + h, z1, color);
  b.box(x0, y, z0, x1, y + h, z0 + t, color);
  b.box(x0, y, z0 + t, x0 + t, y + h, z1 - t, color);
  b.box(x1 - t, y, z0 + t, x1, y + h, z1 - t, color);
  b.part();
  b.box(x0 - 0.05, y + h, z1 - t - 0.04, x1 + 0.05, y + h + 0.07, z1 + 0.05, trim);
  b.box(x0 - 0.05, y + h, z0 - 0.05, x1 + 0.05, y + h + 0.07, z0 + t + 0.04, trim);
  b.box(x0 - 0.05, y + h, z0 + t, x0 + t + 0.04, y + h + 0.07, z1 - t, trim);
  b.box(x1 - t - 0.04, y + h, z0 + t, x1 + 0.05, y + h + 0.07, z1 - t, trim);
}

/** Waterproofing joints and a floor drain: the faint grid that stops a roof reading as blank paper. */
function roofJoints(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, rng: Rng): void {
  const step = rng.range(3.4, 4.6);
  const color = 0xd9d7cc;
  const top = y + 0.045;
  for (let u = x0 + step; u < x1 - 0.5; u += step) {
    b.quad([u - 0.02, top, z1 - 0.2], [u + 0.02, top, z1 - 0.2], [u + 0.02, top, z0 + 0.2], [u - 0.02, top, z0 + 0.2], color, [0, 1, 0]);
  }
  for (let v = z0 + step; v < z1 - 0.5; v += step) {
    b.quad([x0 + 0.2, top, v + 0.02], [x1 - 0.2, top, v + 0.02], [x1 - 0.2, top, v - 0.02], [x0 + 0.2, top, v - 0.02], color, [0, 1, 0]);
  }
  b.part();
  const dx = x1 - 0.9;
  const dz = z1 - 0.9;
  b.quad([dx - 0.14, top + 0.004, dz + 0.14], [dx + 0.14, top + 0.004, dz + 0.14], [dx + 0.14, top + 0.004, dz - 0.14], [dx - 0.14, top + 0.004, dz - 0.14], 0x8f918c, [0, 1, 0]);
  b.part();
}

export interface Tank {
  /** Centre, measured from the corner of the slab it stands on. */
  x: number;
  z: number;
  r: number;
  /** Half the width of its square stand: always wider than the tank. */
  stand: number;
}

/**
 * Water tanks in a row along a slab's x: a row running into the view would look like tanks standing
 * in one another even with clear space between them. Every stand lies on the slab and no two touch;
 * whatever will not fit is left off, and a slab too small for any tank has none. A roof's tanks are
 * bought together, so they are near enough the same size.
 */
export function placeTanks(width: number, depth: number, rng: Rng): Tank[] {
  const EDGE = 0.1;
  const GAP = 0.22;
  const STAND = 1.12;
  const largest = Math.min(0.75, (depth / 2 - EDGE) / STAND, (width / 2 - EDGE) / STAND);
  if (largest < 0.34) return [];
  const size = Math.min(largest, rng.range(0.55, 0.75));
  const radii = Array.from({ length: rng.int(1, 3) }, () => size * rng.range(0.92, 1));
  const rowLength = (): number => radii.reduce((sum, r) => sum + r * STAND * 2, GAP * (radii.length - 1));
  while (radii.length > 1 && rowLength() > width - EDGE * 2) radii.pop();
  let cursor = (width - rowLength()) / 2;
  return radii.map((r) => {
    const stand = r * STAND;
    const x = cursor + stand;
    cursor += stand * 2 + GAP;
    return { x, z: depth / 2, r, stand };
  });
}

/** Chillers with round fans, tilted skylights, a ladder up the stair-head, and the pipes that feed it all. */
function roofKit(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, sx: number, sz: number, stairW: number, stairD: number, rng: Rng): void {
  const width = x1 - x0;
  const depth = z1 - z0;
  const clearOfStairs = (ax: number, az: number, cx: number, cz: number): boolean => cx < sx - 0.2 || ax > sx + stairW + 0.2 || cz < sz - 0.2 || az > sz + stairD + 0.2;
  const onRoof = (ax: number, az: number, cx: number, cz: number): boolean => ax > x0 + 0.4 && cx < x1 - 0.4 && az > z0 + 0.4 && cz < z1 - 0.4;
  const fits = (ax: number, az: number, cx: number, cz: number): boolean => onRoof(ax, az, cx, cz) && clearOfStairs(ax, az, cx, cz);
  // Twin chillers, each a slatted box with a fan on top.
  const chillerX = x0 + width * rng.range(0.58, 0.72);
  const chillerZ = z0 + depth * rng.range(0.45, 0.68);
  if (rng.chance(0.62) && fits(chillerX, chillerZ, chillerX + 3.35, chillerZ + 1.2)) {
    const cx = chillerX;
    const cz = chillerZ;
    for (const offset of [0, 1.75]) {
      b.part();
      b.box(cx + offset, y, cz, cx + offset + 1.6, y + 0.82, cz + 1.2, 0xdcdad0);
      for (let u = cx + offset + 0.12; u < cx + offset + 1.5; u += 0.15) {
        b.part();
        b.box(u, y + 0.1, cz + 1.2, u + 0.055, y + 0.72, cz + 1.21, 0x8e908b);
      }
      b.part();
      b.cylinder(cx + offset + 0.8, y + 0.82, cz + 0.6, 0.44, 0.44, 0.07, 0xc9c8bf, 18);
      b.part();
      b.cylinder(cx + offset + 0.8, y + 0.89, cz + 0.6, 0.28, 0.28, 0.012, 0x50524f, 14);
    }
  }
  // Skylights: three tilted panels in a row, as on the roofs in the film.
  const skylightX = x0 + width * rng.range(0.12, 0.3);
  const skylightZ = z1 - depth * rng.range(0.26, 0.38);
  if (rng.chance(0.42) && fits(skylightX, skylightZ, skylightX + 4.5, skylightZ + 0.9)) {
    const px = skylightX;
    const pz = skylightZ;
    for (let i = 0; i < 3; i++) {
      const u = px + i * 1.55;
      b.part();
      b.quad([u, y + 0.18, pz + 0.9], [u + 1.4, y + 0.18, pz + 0.9], [u + 1.4, y + 0.52, pz], [u, y + 0.52, pz], 0xf5f4ee, [0, 1, 0.3]);
      b.quad([u, y, pz + 0.9], [u + 1.4, y, pz + 0.9], [u + 1.4, y + 0.18, pz + 0.9], [u, y + 0.18, pz + 0.9], 0xc5c4bb, [0, 0, 1]);
    }
  }
  if (rng.chance(0.58)) {
    // Ladder and twin riser pipes up the stair-head.
    const lx = sx + stairW * 0.7;
    const lz = sz + stairD + 0.06;
    const top = y + 3.5;
    b.part();
    b.box(lx, y, lz, lx + 0.05, top, lz + 0.05, 0x7f8280);
    b.box(lx + 0.5, y, lz, lx + 0.55, top, lz + 0.05, 0x7f8280);
    for (let r = y + 0.3; r < top; r += 0.32) {
      b.box(lx, r, lz + 0.01, lx + 0.55, r + 0.035, lz + 0.04, 0x8d908e);
    }
    b.part();
    b.bar([sx + 0.3, y, sz + stairD + 0.08], [sx + 0.3, y + 3.1, sz + stairD + 0.08], 0.06, 0.06, 0xb9b9b1, 8);
    b.bar([sx + 0.56, y, sz + stairD + 0.08], [sx + 0.56, y + 3.1, sz + stairD + 0.08], 0.06, 0.06, 0xb9b9b1, 8);
    b.part();
    b.bar([sx + 0.3, y + 3.1, sz + stairD + 0.08], [sx + 0.3, y + 3.1, z1 - 0.3], 0.05, 0.05, 0xb9b9b1, 6);
  }
  if (rng.chance(0.3)) {
    // A vent stack with a little cap.
    const vx = x0 + rng.range(1, width - 1);
    const vz = z0 + rng.range(1, depth * 0.4);
    b.part();
    b.cylinder(vx, y, vz, 0.2, 0.2, 1.2, 0xc4c4bb, 10);
    b.part();
    b.cylinder(vx, y + 1.2, vz, 0.28, 0.06, 0.18, 0xb0b0a8, 10);
  }
}

/** Roof life: tanks, stair-head, rebar left for the next floor, garden pots, dish, washing. */
function drawRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, lod: number, style: Style, rng: Rng): void {
  const width = x1 - x0;
  const depth = z1 - z0;
  if (lod >= 2) {
    b.part();
    b.block(x0 + width * 0.3, y, z0 + depth * 0.45, Math.min(3.4, width * 0.3), 2.6, Math.min(3.4, depth * 0.3), style.wall);
    return;
  }
  const inset = 0.6;
  // Stair-head and lift room.
  const stairW = Math.min(3.8, width * 0.36);
  const stairD = Math.min(3.4, depth * 0.34);
  const sx = x0 + rng.range(inset, Math.max(inset, width - stairW - inset));
  const sz = z0 + rng.range(inset, Math.max(inset, depth * 0.55 - stairD));
  b.part();
  b.as(Surface.plaster, () => b.box(sx, y, sz, sx + stairW, y + 2.6, sz + stairD, style.wall));
  b.part();
  b.box(sx - 0.1, y + 2.6, sz - 0.1, sx + stairW + 0.1, y + 2.72, sz + stairD + 0.1, style.trim);
  if (lod === 0) {
    b.part();
    b.box(sx + 0.3, y + 0.02, sz + stairD, sx + 1.25, y + 2.05, sz + stairD + 0.05, 0x7b5d43);
  }
  // Water tanks: black or blue polythene on a low stand, on the stair-head's roof.
  const tankBlue = rng.chance(0.3);
  const standTop = y + 2.72 + (lod === 0 ? 0.14 : 0);
  for (const { x, z, r, stand } of placeTanks(stairW, stairD, rng)) {
    const tx = sx + x;
    const tz = sz + z;
    if (lod === 0) {
      b.part();
      b.box(tx - stand, y + 2.72, tz - stand, tx + stand, standTop, tz + stand, 0x8f8a7e);
    }
    b.part();
    const color = tankBlue ? city.tankBlue : city.tankBlack;
    const base = standTop;
    const profile: Array<[number, number]> = [[r * 0.92, base], [r, base + 0.1], [r, base + 1.15], [r * 0.82, base + 1.38], [r * 0.3, base + 1.5], [r * 0.3, base + 1.6], [0.01, base + 1.6]];
    b.lathe(tx, tz, profile, color, lod === 0 ? 12 : 8);
  }
  roofKit(b, x0, z0, x1, z1, y, sx, sz, stairW, stairD, rng);
  if (lod >= 1) return;
  roofJoints(b, x0, z0, x1, z1, y, rng);
  // Rebar left poking out of the columns, ready for the next floor that may never come.
  if (rng.chance(0.55)) {
    const corners: Array<[number, number]> = [[x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5], [x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5]];
    for (const [cx, cz] of corners) {
      b.part();
      b.block(cx, y, cz, 0.42, rng.range(0.5, 1.1), 0.42, 0xb5b0a4);
      for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
        b.bar([cx + dx, y + 0.4, cz + dz], [cx + dx, y + 2.1, cz + dz], 0.016, 0.016, 0x6d4a35, 3);
      }
    }
  }
  // Rooftop garden tubs: a Dhaka habit.
  if (rng.chance(0.55)) {
    const tubs = rng.int(3, 8);
    for (let i = 0; i < tubs; i++) {
      const px = x0 + rng.range(0.9, width - 0.9);
      const pz = z1 - rng.range(0.9, 2.2);
      b.part();
      b.cylinder(px, y, pz, 0.22, 0.3, 0.36, rng.pick([0xb0683f, 0xc8c2b3, 0x7f8c8d]), 8);
      b.part();
      const r = rng.range(0.32, 0.6);
      b.ellipsoid(px, y + 0.36 + r * 0.85, pz, r, r, r, rng.pick([city.leaf, city.leafDark, city.leafLight]), 4, 7);
    }
  }
  // A satellite dish or a thin aerial.
  if (rng.chance(0.4)) {
    const px = x0 + rng.range(1, width - 1);
    const pz = z0 + rng.range(1, depth - 1);
    b.part();
    b.bar([px, y, pz], [px, y + 1.1, pz], 0.03, 0.03, city.iron, 4);
    b.part();
    b.ellipsoid(px - 0.14, y + 1.25, pz + 0.14, 0.34, 0.34, 0.09, 0xece9df, 4, 8);
  }
  if (rng.chance(0.5)) {
    // Clothes line across the roof.
    b.part();
    const lz = z0 + depth * rng.range(0.5, 0.85);
    const lineY = y + 1.8;
    b.bar([x0 + 0.5, y, lz], [x0 + 0.5, lineY, lz], 0.025, 0.025, city.iron, 4);
    b.bar([x1 - 0.5, y, lz], [x1 - 0.5, lineY, lz], 0.025, 0.025, city.iron, 4);
    b.bar([x0 + 0.5, lineY, lz], [x1 - 0.5, lineY, lz], 0.007, 0.007, 0x444444, 3);
    const clothes = [0xc8413a, 0x2f6fb0, 0xe2a22d, 0xf4f1e7, 0x2f8f6b, 0xd86a9a, 0x6d5aa8];
    for (let c = x0 + 0.8; c < x1 - 1; c += rng.range(0.6, 1.1)) {
      b.part();
      const clothW = rng.range(0.35, 0.8);
      b.box(c, lineY - rng.range(0.6, 1.2), lz - 0.01, c + clothW, lineY, lz + 0.01, rng.pick(clothes));
    }
  }
}

function pickStyle(rng: Rng, lod: number): Style {
  const wall = rng.pick(stucco);
  const layouts: Array<Bay["kind"][]> = [
    ["window", "window", "balcony", "window"],
    ["window", "window", "window"],
    ["balcony", "window", "window"],
    ["wide", "window"],
    ["window", "window", "blank"],
    ["balcony", "balcony", "slit"],
    ["wide", "balcony", "wide"],
  ];
  const glass = rng.chance(0.5) ? 0xd2dad9 : 0xc1cbca;
  return {
    wall,
    trim: rng.chance(0.5) ? 0xf4f0e4 : mixHex(wall, 0xffffff, 0.45),
    bays: rng.pick(layouts),
    bayWidth: rng.range(2.9, 4.2),
    grilles: lod === 0 && rng.chance(0.32),
    frame: rng.chance(0.7) ? city.frame : rng.chance(0.5) ? 0x6e5c4c : 0xf0ece0,
    glass,
  };
}

export function mixHex(a: number, b: number, t: number): number {
  const channel = (shift: number): number => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** A typical Dhaka apartment block: pastel stucco, grilles, balconies, shops at the bottom. */
export function apartmentBlock(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1, lod } = plot;
  const width = x1 - x0;
  const depth = z1 - z0;
  const style = pickStyle(rng, lod);
  const maxFloors = Math.max(2, Math.floor((plot.maxHeight - 3.6) / FLOOR));
  const floors = Math.min(maxFloors, rng.int(4, lod === 0 ? 9 : 11));
  const groundH = plot.streetFront ? 3.6 : 3.1;
  const height = groundH + floors * FLOOR;

  b.part();
  b.as(Surface.plaster, () => b.box(x0, 0, z0, x1, height, z1, style.wall));
  // Roof slab, a shade lighter and a little stained.
  b.part();
  b.as(Surface.roof, () => b.box(x0 + 0.14, height - 0.01, z0 + 0.14, x1 - 0.14, height + 0.03, z1 - 0.14, rng.pick([0xe9e5da, 0xe2ddcf, 0xeeeade, 0xdedad0])));

  b.at(x0, 0, z1, () => {
    const taken = plot.streetFront ? shopfronts(b, plot, width, groundH, floors, style.trim, rng) : 0;
    drawFacade(b, width, floors - taken, groundH + taken * FLOOR, style, lod, rng);
    if (!plot.streetFront && lod <= 1) {
      b.part();
      b.box(0, groundH - 0.14, 0, width, groundH, 0.1, style.trim);
    }
  });
  b.at(x0, 0, z0, () => {
    const taken = plot.sideFront ? shopfronts(b, plot, depth, groundH, floors, style.trim, rng) : 0;
    drawFacade(b, depth, floors - taken, groundH + taken * FLOOR, style, lod, rng);
    if (lod === 0 && rng.chance(0.6)) wallRisers(b, depth, height, rng);
    if (!plot.sideFront && lod <= 1) {
      b.part();
      b.box(0, groundH - 0.14, 0, depth, groundH, 0.1, style.trim);
      b.part();
      // The gate and boundary wall into the block's car park.
      if (lod === 0) {
        b.box(1.2, 0, 0, 3.8, 2.4, 0.05, 0x5e6a6d);
        for (let u = 1.34; u < 3.8; u += 0.22) b.box(u, 0.1, 0.05, u + 0.03, 2.3, 0.07, 0x3f474a);
      }
    }
  }, FACE_X);

  b.as(Surface.plaster, () => drawParapet(b, x0, z0, x1, z1, height, 0.95, style.wall, style.trim));
  drawRoof(b, x0, z0, x1, z1, height, lod, style, rng);
}

/** Service risers and a cat ladder up a building's flank: the film's most repeated detail. */
function wallRisers(b: Batch, faceWidth: number, height: number, rng: Rng): void {
  const u = rng.range(faceWidth * 0.5, faceWidth - 1);
  b.part();
  for (const offset of [0, 0.22]) {
    b.bar([u + offset, 0.2, 0.1], [u + offset, height, 0.1], 0.055, 0.055, 0xb4b5ad, 7);
  }
  for (let y = 2; y < height; y += 3.1) {
    b.part();
    b.box(u - 0.1, y, 0, u + 0.32, y + 0.07, 0.17, 0x8d8f8a);
  }
  if (rng.chance(0.55)) {
    const lx = u + 0.5;
    b.part();
    b.box(lx, 3.2, 0.03, lx + 0.045, height + 0.9, 0.08, 0x858886);
    b.box(lx + 0.46, 3.2, 0.03, lx + 0.505, height + 0.9, 0.08, 0x858886);
    for (let r = 3.4; r < height + 0.9; r += 0.34) b.box(lx, r, 0.04, lx + 0.5, r + 0.035, 0.07, 0x949795);
  }
}

/** A block that steps out at each terrace level, with fins and glass rails: the film's big stacked forms. */
export function stackedBlock(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1, lod } = plot;
  const style = pickStyle(rng, lod);
  const tiers = Math.min(4, Math.max(2, Math.floor(plot.maxHeight / 9)));
  let y = 0;
  const pale = mixHex(style.wall, 0xffffff, 0.25);
  for (let tier = 0; tier < tiers; tier++) {
    const inset = tier % 2 === 0 ? 1.2 : 0;
    const h = 3.1 * rng.int(2, 3);
    const ax0 = x0 + inset, ax1 = x1 - inset, az0 = z0 + inset, az1 = z1 - inset;
    b.part();
    b.as(Surface.plaster, () => b.box(ax0, y, az0, ax1, y + h, az1, tier % 2 === 0 ? style.wall : pale));
    const floors = Math.round(h / 3.1);
    b.at(ax0, y, az1, () => {
      // The podium is where a stacked block keeps its shops, reaching the street on a shallower step.
      const taken = tier === 0 && plot.streetFront ? shopfronts(b, plot, ax1 - ax0, 3.1, floors, style.trim, rng) + 1 : 0;
      drawFacade(b, ax1 - ax0, floors - taken, taken * 3.1, style, lod, rng);
    });
    b.at(ax0, y, az0, () => {
      const taken = tier === 0 && plot.sideFront ? shopfronts(b, plot, az1 - az0, 3.1, floors, style.trim, rng) + 1 : 0;
      drawFacade(b, az1 - az0, floors - taken, taken * 3.1, style, lod, rng);
    }, FACE_X);
    y += h;
    // A terrace slab, wider than the storey below, with fins and a glass rail.
    b.part();
    b.as(Surface.concrete, () => b.box(x0 - 0.5, y, z0 - 0.5, x1 + 0.5, y + 0.28, z1 + 0.5, 0xf2f1e9));
    y += 0.28;
    if (lod === 0 && tier < tiers - 1) {
      for (let u = x0 + 0.4; u < x1; u += 3.2) {
        b.part();
        b.box(u, y, z1 + 0.24, u + 0.14, y + 1.05, z1 + 0.44, 0x9c9e99);
      }
      for (let u = z0 + 0.4; u < z1; u += 3.2) {
        b.part();
        b.box(x0 - 0.44, y, u, x0 - 0.24, y + 1.05, u + 0.14, 0x9c9e99);
      }
      b.part();
      b.box(x0 - 0.42, y + 0.98, z1 + 0.28, x1 + 0.3, y + 1.04, z1 + 0.34, 0xb0b2ad);
    }
  }
  b.as(Surface.plaster, () => drawParapet(b, x0, z0, x1, z1, y, 0.8, style.wall, style.trim));
  drawRoof(b, x0, z0, x1, z1, y, lod, style, rng);
}

/** A glass-fronted office or bank tower, like those around Karwan Bazar and Motijheel. */
export function glassTower(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1, lod } = plot;
  const width = x1 - x0;
  const depth = z1 - z0;
  const floors = Math.min(Math.floor(plot.maxHeight / 3.6), rng.int(10, 24));
  const podium = 7.5;
  const height = podium + floors * 3.6;
  const curtain = rng.pick([0xc9cec9, 0xd2d6d2, 0xc1c6c2, 0xd8dbd6]);
  const spandrel = mixHex(curtain, 0xffffff, 0.35);
  const inset = Math.min(1.4, width * 0.08);
  b.part();
  b.as(Surface.concrete, () => b.box(x0, 0, z0, x1, podium, z1, 0xd5d0c3));
  b.part();
  b.box(x0 + inset, podium, z0 + inset, x1 - inset, height, z1 - inset, curtain);
  const towerW = width - inset * 2;
  const towerD = depth - inset * 2;
  const faces: Array<[number, number, number, number]> = [
    [x0 + inset, z1 - inset, 0, towerW],
    [x0 + inset, z0 + inset, FACE_X, towerD],
  ];
  for (const [fx, fz, rotation, faceW] of faces) {
    b.at(fx, podium, fz, () => {
      if (lod <= 1) {
        for (let f = 0; f <= floors; f++) {
          b.part();
          b.box(0, f * 3.6 - 0.28, 0, faceW, f * 3.6, 0.04, spandrel);
        }
        const mullions = Math.round(faceW / 1.55);
        if (lod === 0) {
          for (let m = 0; m <= mullions; m++) {
            const u = (faceW * m) / mullions;
            b.box(u - 0.035, 0, 0.02, u + 0.035, floors * 3.6, 0.07, 0x8a8f8c);
          }
        }
      } else {
        for (let f = 0; f <= floors; f += 2) b.panel(0, f * 3.6 - 0.3, faceW, f * 3.6, 0.02, spandrel);
      }
    }, rotation);
  }
  b.at(x0, 0, z1, () => {
    if (lod <= 1) {
      b.part();
      b.panel(0.8, 0.1, width - 0.8, 4.2, 0.02, 0x8c918e);
      b.part();
      b.box(0, 4.3, 0, width, 4.7, 1.6, 0xe7e2d5);
    }
  });
  drawParapet(b, x0 + inset, z0 + inset, x1 - inset, z1 - inset, height, 0.9, curtain, 0xe7e2d5);
  b.part();
  b.block((x0 + x1) / 2, height, (z0 + z1) / 2, towerW * 0.4, 3, towerD * 0.4, 0xc7c2b5);
  if (lod === 0 && rng.chance(0.6)) {
    // Rooftop billboard frame.
    b.part();
    const boardX0 = x0 + inset + 1;
    const boardX1 = x1 - inset - 1;
    const boardZ = z1 - inset - 0.3;
    for (const postX of [boardX0 + 0.6, (boardX0 + boardX1) / 2, boardX1 - 0.6]) {
      b.box(postX - 0.05, height + 0.8, boardZ - 0.26, postX + 0.05, height + 4.6, boardZ - 0.16, city.iron);
    }
    b.part();
    b.box(boardX0, height + 1.2, boardZ - 0.16, boardX1, height + 5.2, boardZ, 0xf2efe5);
    b.part();
    b.panel(boardX0 + 0.1, height + 1.3, boardX1 - 0.1, height + 5.1, boardZ + 0.005, 0xffffff, billboardUv(rng.int(0, 5)));
  }
}

/** An older low block in exposed red brick, with green shutters and a tin lean-to. */
export function brickBlock(b: Batch, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1, lod } = plot;
  const width = x1 - x0;
  const depth = z1 - z0;
  const floors = Math.min(Math.floor((plot.maxHeight - 3) / FLOOR), rng.int(2, 5));
  const groundH = 3.3;
  const height = groundH + floors * FLOOR;
  const style: Style = {
    wall: rng.chance(0.75) ? city.brick : city.brickDark,
    trim: 0xe7e2d5,
    bays: rng.pick([["window"], ["window", "window", "blank"], ["wide"]]),
    bayWidth: rng.range(2.6, 3.4),
    grilles: lod === 0,
    frame: 0x2f5a4c,
    glass: 0x4a6068,
  };
  // The brick courses themselves come from the shader's brick surface.
  b.part();
  b.as(Surface.brick, () => b.box(x0, 0, z0, x1, height, z1, style.wall));
  b.part();
  b.as(Surface.roof, () => b.box(x0 + 0.1, height - 0.01, z0 + 0.1, x1 - 0.1, height + 0.03, z1 - 0.1, 0xbcb3a3));
  b.at(x0, 0, z1, () => {
    const taken = plot.streetFront ? shopfronts(b, plot, width, groundH, floors, 0xe7e2d5, rng) : 0;
    drawFacade(b, width, floors - taken, groundH + taken * FLOOR, style, lod, rng);
  });
  b.at(x0, 0, z0, () => {
    const taken = plot.sideFront ? shopfronts(b, plot, depth, groundH, floors, 0xe7e2d5, rng) : 0;
    drawFacade(b, depth, floors - taken, groundH + taken * FLOOR, style, lod, rng);
  }, FACE_X);
  b.as(Surface.brick, () => drawParapet(b, x0, z0, x1, z1, height, 0.7, style.wall, 0xdcd6c8));
  drawRoof(b, x0, z0, x1, z1, height, lod, style, rng);
}
