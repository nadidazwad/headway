import type { Assets } from "../assets";
import { Surface, type Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { city } from "../shared/palette";
import { posterUv } from "../signs/regions";
import type { Plot } from "./buildings";
import { bystander } from "./landmarks";
import { palm, tree } from "./nature";

/**
 * Nobody in Dhaka leaves land open. An empty plot is walled in brick or plastered block, often
 * topped with broken glass or wire, with a steel gate on the road side and a board saying whose
 * it is. A playing field gets a low wall and a grille instead, so you can see the game.
 */
type Enclosure = "brick" | "plaster" | "grille";

const WALL = 0.24;

/** A run of wall from (x0, z0) to (x1, z1), along x or along z, with pillars and coping. */
function wallRun(b: Batch, x0: number, z0: number, x1: number, z1: number, kind: Enclosure, rng: Rng): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const length = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (length < 0.3) return;
  const lo = (a: number, c: number): number => Math.min(a, c);
  const half = WALL / 2;
  const box = (u0: number, u1: number, y0: number, y1: number, grow: number, color: number): void => {
    if (alongX) b.box(lo(x0, x1) + u0, y0, z0 - half - grow, lo(x0, x1) + u1, y1, z0 + half + grow, color);
    else b.box(x0 - half - grow, y0, lo(z0, z1) + u0, x0 + half + grow, y1, lo(z0, z1) + u1, color);
  };
  const height = kind === "grille" ? 0.65 : rng.range(1.9, 2.4);
  const surface = kind === "brick" ? Surface.brick : Surface.plaster;
  const color = kind === "brick" ? (rng.chance(0.7) ? city.brick : city.brickDark) : rng.pick([0xe6e1d4, 0xd9d3c4, 0xcfd6c8, 0xe9dcc0]);
  b.part();
  b.as(surface, () => box(0, length, 0, height, 0, color));
  // Pillars every few metres, a little proud of the wall and taller than it.
  const bays = Math.max(1, Math.round(length / 3));
  for (let i = 0; i <= bays; i++) {
    const u = (length * i) / bays;
    b.part();
    b.as(surface, () => box(Math.max(0, u - 0.2), Math.min(length, u + 0.2), 0, height + 0.12, 0.06, color));
  }
  b.part();
  b.as(Surface.concrete, () => box(0, length, height, height + 0.07, 0.04, 0xd6d1c3));
  if (kind === "grille") {
    // A grille of square bars on the low wall, the kind round every school ground.
    const top = height + 1.55;
    b.part();
    for (let u = 0.1; u < length; u += 0.22) box(u - 0.012, u + 0.012, height + 0.07, top, -half + 0.012, 0x4f7f73);
    box(0, length, top - 0.05, top, -half + 0.02, 0x4f7f73);
    box(0, length, height + 0.75, height + 0.79, -half + 0.02, 0x4f7f73);
  } else if (rng.chance(0.55)) {
    // Broken glass set in the coping, or a strand of barbed wire on angle brackets.
    b.part();
    if (rng.chance(0.5)) {
      for (let u = 0.05; u < length; u += rng.range(0.07, 0.16)) box(u, u + 0.04, height + 0.07, height + 0.07 + rng.range(0.05, 0.14), -half + 0.06, 0xc9d2cc);
    } else {
      for (let u = 0.2; u < length; u += 1.5) box(u - 0.015, u + 0.015, height + 0.07, height + 0.5, -half + 0.1, 0x6a6f70);
      for (const y of [height + 0.25, height + 0.45]) box(0, length, y, y + 0.012, -half + 0.11, 0x5a5c5c);
    }
  }
}

/** A double steel gate between two pillars, painted, with its padlocked bar. */
function gate(b: Batch, x0: number, x1: number, z: number, kind: Enclosure, rng: Rng): void {
  const paint = rng.pick([0x2f6f5a, 0x5e6a6d, 0x7a3a2a, 0x2f4f8a]);
  const h = kind === "grille" ? 2.1 : 2.3;
  for (const x of [x0, x1]) {
    b.part();
    b.box(x - 0.24, 0, z - 0.24, x + 0.24, h + 0.25, z + 0.24, 0xd6d1c3);
  }
  b.part();
  b.box(x0 + 0.24, 0.05, z - 0.03, x1 - 0.24, h, z + 0.03, paint);
  b.part();
  for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.18) b.box(x - 0.012, 0.1, z + 0.03, x + 0.012, h - 0.05, z + 0.05, 0x3a3e40);
  b.box((x0 + x1) / 2 - 0.02, 0.05, z - 0.05, (x0 + x1) / 2 + 0.02, h, z + 0.06, 0x2a2d2f);
  b.box((x0 + x1) / 2 - 0.15, 1.0, z + 0.04, (x0 + x1) / 2 + 0.15, 1.08, z + 0.08, 0x2a2d2f);
}

/** The board every empty plot carries: whose land it is, and that it is not for sale. */
function ownerBoard(b: Batch, x: number, z: number, side: number, rng: Rng): void {
  // Tall enough to read over the wall from the road.
  b.part();
  b.bar([x - 0.7, 0, z], [x - 0.7, 3.5, z], 0.035, 0.035, 0x6a6f70, 4);
  b.bar([x + 0.7, 0, z], [x + 0.7, 3.5, z], 0.035, 0.035, 0x6a6f70, 4);
  b.part();
  b.box(x - 0.85, 2.5, z - 0.03, x + 0.85, 3.45, z + 0.03, 0xf4f1e7);
  b.quad([x - 0.8, 2.55, z + side * 0.035], [x + 0.8, 2.55, z + side * 0.035], [x + 0.8, 3.4, z + side * 0.035], [x - 0.8, 3.4, z + side * 0.035], 0xffffff, [0, 0, side], posterUv(rng.int(0, 5)));
}

/** An enclosed empty plot: walls round three sides, a gate in the fourth, and what grows inside. */
export function emptyLot(b: Batch, assets: Assets, plot: Plot, rng: Rng): void {
  const { x0, x1, z0, z1 } = plot;
  const width = x1 - x0;
  const depth = z1 - z0;
  const field = width > 14 && depth > 12 && rng.chance(0.45);
  const kind: Enclosure = field ? "grille" : rng.chance(0.55) ? "brick" : "plaster";
  // The gate goes in the side that faces the main road.
  const roadZ = Math.abs(z0) < Math.abs(z1) ? z0 : z1;
  const backZ = roadZ === z0 ? z1 : z0;
  const side = roadZ === z1 ? 1 : -1;
  const gateW = field ? 3.4 : rng.range(2.6, 3.6);
  const gateX = x0 + rng.range(1.5, Math.max(1.6, width - gateW - 1.5));

  b.part();
  b.as(Surface.soil, () => b.quad([x0, 0.015, z1], [x1, 0.015, z1], [x1, 0.015, z0], [x0, 0.015, z0], field ? 0xd9cfae : 0xc9c6b2, [0, 1, 0]));
  wallRun(b, x0, roadZ, gateX - 0.24, roadZ, kind, rng);
  wallRun(b, gateX + gateW + 0.24, roadZ, x1, roadZ, kind, rng);
  gate(b, gateX, gateX + gateW, roadZ, kind, rng);
  wallRun(b, x0, backZ, x1, backZ, kind, rng);
  wallRun(b, x0, z0, x0, z1, kind, rng);
  wallRun(b, x1, z0, x1, z1, kind, rng);
  if (rng.chance(0.75)) ownerBoard(b, x0 + width * rng.range(0.25, 0.75), roadZ - side * 0.9, side, rng);

  if (field) {
    // Goalposts at each end and a game under way.
    for (const gx of [x0 + 1.2, x1 - 1.2]) {
      b.part();
      const mz = (z0 + z1) / 2;
      b.bar([gx, 0, mz - 1.8], [gx, 2.0, mz - 1.8], 0.05, 0.05, 0xf4f1e7, 5);
      b.bar([gx, 0, mz + 1.8], [gx, 2.0, mz + 1.8], 0.05, 0.05, 0xf4f1e7, 5);
      b.bar([gx, 2.0, mz - 1.8], [gx, 2.0, mz + 1.8], 0.05, 0.05, 0xf4f1e7, 5);
    }
    b.part();
    b.as(Surface.soil, () => b.quad([x0 + 3, 0.02, z1 - 2.5], [x1 - 3, 0.02, z1 - 2.5], [x1 - 3, 0.02, z0 + 2.5], [x0 + 3, 0.02, z0 + 2.5], 0xcbbf9c, [0, 1, 0]));
    const players = rng.int(5, 9);
    for (let i = 0; i < players; i++) {
      bystander(b, assets, rng.range(x0 + 2, x1 - 2), 0.02, rng.range(z0 + 2, z1 - 2), rng.range(0, Math.PI * 2), rng);
    }
    b.part();
    b.ellipsoid(rng.range(x0 + 4, x1 - 4), 0.13, rng.range(z0 + 3, z1 - 3), 0.11, 0.11, 0.11, 0xf4f1e7, 4, 6);
    tree(b, x0 + 1.4, backZ - side * 1.4, rng.range(7, 10), rng, { far: plot.lod > 0 });
  } else {
    // Weeds, a heap of builder's rubble, a tree or two, a palm.
    for (let i = 0; i < 14; i++) {
      b.part();
      const r = rng.range(0.25, 0.6);
      b.as(Surface.foliage, () => b.blob(rng.range(x0 + 1, x1 - 1), r * 0.3, rng.range(z0 + 1, z1 - 1), r, r * 0.55, r, rng.pick([0xa7af9d, 0x9aa391, 0xb3b9a8]), 0.6, rng.int(1, 1 << 30), 0));
    }
    if (rng.chance(0.6)) {
      b.part();
      b.as(Surface.soil, () => b.cylinder(rng.range(x0 + 2, x1 - 2), 0, rng.range(z0 + 2, z1 - 2), rng.range(1, 1.8), 0.2, rng.range(0.5, 1), 0xb9b3a2, 8));
    }
    const trees = rng.int(1, 3);
    for (let i = 0; i < trees; i++) {
      const tx = rng.range(x0 + 2.5, x1 - 2.5);
      const tz = rng.range(z0 + 2.5, z1 - 2.5);
      if (rng.chance(0.4)) palm(b, tx, tz, rng.range(7, 11), rng, plot.lod > 0);
      else tree(b, tx, tz, rng.range(7, 12), rng, { far: plot.lod > 0 });
    }
    // Posters pasted on the wall facing the road.
    if (kind === "plaster") {
      for (let i = 0; i < rng.int(2, 6); i++) {
        const px = x0 + rng.range(0.5, width - 1);
        if (px > gateX - 0.6 && px < gateX + gateW + 0.6) continue;
        const pz = roadZ + side * (WALL / 2 + 0.005);
        b.part();
        b.quad([px, 0.7, pz], [px + 0.42, 0.7, pz], [px + 0.42, 1.26, pz], [px, 1.26, pz], 0xffffff, [0, 0, side], posterUv(rng.int(0, 5)));
      }
    }
  }
}
