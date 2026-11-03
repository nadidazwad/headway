import type { Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { city } from "../shared/palette";

/** A shallow faceted parasol of leaves: flat planes read as drawing, where smooth balls read as CG. */
function parasol(b: Batch, x: number, y: number, z: number, r: number, h: number, color: number, spin: number): void {
  const sides = 9;
  b.part();
  for (let i = 0; i < sides; i++) {
    const a0 = spin + (i / sides) * Math.PI * 2;
    const a1 = spin + ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    // Upper cone.
    b.quad([x + c0 * r, y, z + s0 * r], [x + c1 * r, y, z + s1 * r], [x, y + h, z], [x, y + h, z], color, [(c0 + c1) * 0.5, 1.2, (s0 + s1) * 0.5]);
    // Rim, dropping a little: the canopy has thickness.
    b.quad([x + c0 * r, y, z + s0 * r], [x + c1 * r, y, z + s1 * r], [x + c1 * r * 0.93, y - h * 0.34, z + s1 * r * 0.93], [x + c0 * r * 0.93, y - h * 0.34, z + s0 * r * 0.93], color, [(c0 + c1) * 0.5, -0.1, (s0 + s1) * 0.5]);
  }
}

/** A wide rain tree or, now and then, a krishnachura: overlapping parasols on a forked trunk. */
export function tree(b: Batch, x: number, z: number, height: number, rng: Rng, detail = true): void {
  const blossom = rng.chance(0.14);
  const leaves = blossom ? [0xc4c4bc, 0xd4d1c8, 0xb8b7af] : [0xaeb2a5, 0x9ca194, 0xbfc2b5];
  b.part();
  const forkY = height * 0.46;
  const forkX = x + rng.range(-0.3, 0.3);
  const forkZ = z + rng.range(-0.3, 0.3);
  b.bar([x, 0, z], [forkX, forkY, forkZ], height * 0.04, height * 0.026, city.bark, 7);
  const spread = height * 0.46;
  const crowns = detail ? rng.int(6, 9) : 3;
  for (let i = 0; i < crowns; i++) {
    const angle = (i / crowns) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const radius = i === 0 ? 0 : spread * rng.range(0.42, 0.68);
    const cx = x + Math.cos(angle) * radius;
    const cz = z + Math.sin(angle) * radius;
    const y = height * (i === 0 ? 0.86 : rng.range(0.66, 0.78));
    if (i > 0 && detail) {
      b.part();
      b.bar([forkX, forkY, forkZ], [cx, y - 0.2, cz], height * 0.018, height * 0.01, city.bark, 5);
    }
    parasol(b, cx, y, cz, spread * rng.range(0.4, 0.56) * (i === 0 ? 1.2 : 1), height * 0.14, leaves[i % leaves.length]!, rng.range(0, 6));
  }
}

/** A fir of stacked cones, for the small park plots. */
export function fir(b: Batch, x: number, z: number, height: number, _rng: Rng): void {
  b.part();
  b.bar([x, 0, z], [x, height * 0.2, z], height * 0.03, height * 0.024, city.bark, 6);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    b.part();
    b.cylinder(x, height * (0.14 + t * 0.66), z, height * (0.26 - t * 0.15), 0.01, height * 0.34, 0xc2c6b8, 9, false);
  }
}

/** A coconut or areca palm: a thin trunk and a burst of drooping fronds. */
export function palm(b: Batch, x: number, z: number, height: number, rng: Rng): void {
  const lean = rng.range(-0.5, 0.5);
  b.part();
  b.bar([x, 0, z], [x + lean, height, z + lean * 0.4], 0.14, 0.09, 0x8a7a63, 6);
  const fronds = 8;
  const topX = x + lean;
  const topZ = z + lean * 0.4;
  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const reach = rng.range(1.5, 2.3);
    const dx = Math.cos(angle) * reach;
    const dz = Math.sin(angle) * reach;
    b.part();
    b.quad([topX, height + 0.1, topZ], [topX + dx * 0.55 - dz * 0.14, height + 0.45, topZ + dz * 0.55 + dx * 0.14], [topX + dx, height - 0.75, topZ + dz], [topX + dx * 0.55 + dz * 0.14, height + 0.45, topZ + dz * 0.55 - dx * 0.14], rng.pick([city.leafDark, city.leaf]), [0, 1, 0]);
  }
}
