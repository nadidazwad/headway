import { Surface, type Batch, type Vec3 } from "../geometry";
import type { Rng } from "../shared/rng";
import { city } from "../shared/palette";

/** The trees that line Dhaka's roads, each by the shape of its crown. */
type Species = "rain" | "mahogany" | "krishnachura" | "mango";

interface Form {
  /** Crown radius and its vertical extent, as fractions of the tree's height. */
  spread: number;
  bottom: number;
  top: number;
  /** Clump size as a fraction of height, and how flat each clump is. */
  clump: number;
  squash: number;
  clumps: number;
  /** How high the trunk forks. */
  fork: number;
  limbs: number;
  leaves: readonly number[];
}

const FORMS: Record<Species, Form> = {
  // Rain tree: forks low into heavy limbs under a broad, flat-topped dome.
  rain: { spread: 0.7, bottom: 0.5, top: 1.0, clump: 0.11, squash: 0.8, clumps: 52, fork: 0.34, limbs: 4, leaves: [0x9aa391, 0x8c9683, 0xa7af9d] },
  // Mahogany: a dense, upright oval.
  mahogany: { spread: 0.36, bottom: 0.38, top: 1.0, clump: 0.095, squash: 0.9, clumps: 40, fork: 0.4, limbs: 3, leaves: [0x87917e, 0x7d8774, 0x939c89] },
  // Krishnachura: a wide, shallow umbrella of feathery leaves.
  krishnachura: { spread: 0.76, bottom: 0.6, top: 0.92, clump: 0.1, squash: 0.62, clumps: 56, fork: 0.45, limbs: 4, leaves: [0xa9b09f, 0x9aa290, 0xb6b4a6] },
  // Mango: a round, heavy crown down almost to head height.
  mango: { spread: 0.5, bottom: 0.3, top: 0.98, clump: 0.11, squash: 0.85, clumps: 44, fork: 0.3, limbs: 3, leaves: [0x7f8a76, 0x76816d, 0x8b9580] },
};

/** A limb that bends on its way up: two bars with a knee between them. */
function limb(b: Batch, from: Vec3, to: Vec3, r0: number, r1: number, rng: Rng): void {
  const knee: Vec3 = [
    from[0] + (to[0] - from[0]) * 0.45 + rng.range(-0.25, 0.25),
    from[1] + (to[1] - from[1]) * 0.62,
    from[2] + (to[2] - from[2]) * 0.45 + rng.range(-0.25, 0.25),
  ];
  const mid = (r0 + r1) / 2;
  b.bar(from, knee, r0, mid, city.bark, 6);
  b.bar(knee, to, mid, r1, city.bark, 5);
}

/**
 * A street tree: a trunk that forks into limbs, and a crown of leaf clumps around their ends.
 * Each clump is its own part, so the ink pass outlines it the way a pen would. The foot of the
 * trunk is whitewashed, as the city's road trees are.
 */
export function tree(b: Batch, x: number, z: number, height: number, rng: Rng, detail = true): void {
  const species = rng.pick<Species>(["rain", "rain", "mahogany", "krishnachura", "mango"]);
  const form = FORMS[species];
  const h = height * (species === "mahogany" ? 1.15 : 1);
  const radius = h * form.spread;
  const trunkR = h * 0.035;
  const forkY = h * form.fork;
  const lean = rng.range(0, Math.PI * 2);
  const fork: Vec3 = [x + Math.cos(lean) * h * 0.04, forkY, z + Math.sin(lean) * h * 0.04];

  b.part();
  b.as(Surface.bark, () => {
    b.bar([x, 0, z], [x, Math.min(1.3, forkY * 0.6), z], trunkR * 1.25, trunkR * 1.12, 0xe4e1d6, 7);
    b.bar([x, Math.min(1.3, forkY * 0.6), z], fork, trunkR * 1.12, trunkR * 0.9, city.bark, 7);
  });

  // The crown is a dome: a dark core, and clumps of leaves set over its shell, so the outline
  // is bumpy all round and nothing shows through.
  const crownY = h * (form.bottom + form.top) / 2;
  const crownH = h * (form.top - form.bottom) / 2;
  const count = detail ? form.clumps + rng.int(-6, 6) : Math.ceil(form.clumps / 3);
  const centres: Array<{ at: Vec3; up: number }> = [];
  for (let i = 0; i < count; i++) {
    // Even cover of the upper part of a sphere: a golden-angle spiral down from the crown.
    const t = (i + 0.5) / count;
    const polar = Math.acos(1 - t * 1.55);
    const angle = i * 2.39996 + rng.range(-0.2, 0.2);
    const out = Math.sin(polar) * rng.range(0.86, 1.02);
    const up = Math.cos(polar);
    centres.push({ at: [x + Math.cos(angle) * radius * out, crownY + up * crownH * rng.range(0.9, 1.05), z + Math.sin(angle) * radius * out], up });
  }

  // Limbs from the fork out to the crown's rim, thinning as they go.
  b.part();
  b.as(Surface.bark, () => {
    for (let i = 0; i < form.limbs; i++) {
      const angle = lean + (i / form.limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const target: Vec3 = [x + Math.cos(angle) * radius * 0.62, crownY - crownH * 0.35, z + Math.sin(angle) * radius * 0.62];
      limb(b, fork, target, trunkR * 0.62, trunkR * 0.24, rng);
    }
  });

  const [light, mid, dark] = [form.leaves[2]!, form.leaves[0]!, form.leaves[1]!];
  b.as(Surface.foliage, () => {
    b.leafPart();
    b.blob(x, crownY - crownH * 0.1, z, radius * 0.9, crownH * 0.92, radius * 0.9, dark, 0.45, rng.int(1, 1 << 30), 1);
    for (const { at, up } of centres) {
      const r = h * form.clump * rng.range(0.7, 1.4);
      // Sunlit clumps on top are lighter; those under the rim are in the crown's own shade.
      const color = up > 0.45 ? light : up > -0.1 ? mid : dark;
      // One part for the whole crown: overlapping clumps are inked by depth, not each outlined.
      b.blob(at[0], at[1], at[2], r, r * form.squash, r, color, 0.95, rng.int(1, 1 << 30), 1);
    }
  });
}

/** A fir of stacked cones, for the small park plots. */
export function fir(b: Batch, x: number, z: number, height: number, _rng: Rng): void {
  b.part();
  b.bar([x, 0, z], [x, height * 0.2, z], height * 0.03, height * 0.024, city.bark, 6);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    b.part();
    b.as(Surface.foliage, () => b.cylinder(x, height * (0.14 + t * 0.66), z, height * (0.26 - t * 0.15), 0.01, height * 0.34, 0xc2c6b8, 9, false));
  }
}

/**
 * A coconut palm: a ringed, curving trunk and a head of arching fronds, each a midrib with its
 * leaflets hanging either side, and a bunch of coconuts under the crown.
 */
export function palm(b: Batch, x: number, z: number, height: number, rng: Rng): void {
  const bend = rng.range(0, Math.PI * 2);
  const sway = rng.range(0.4, 1.2);
  const trunk: Vec3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const off = sway * t * t;
    trunk.push([x + Math.cos(bend) * off, height * t, z + Math.sin(bend) * off]);
  }
  b.as(Surface.bark, () => {
    for (let i = 0; i < 5; i++) {
      b.part();
      b.bar(trunk[i]!, trunk[i + 1]!, 0.17 - i * 0.012, 0.165 - (i + 1) * 0.012, 0x9a8b74, 6);
    }
  });
  const top = trunk[5]!;
  // Coconuts.
  b.part();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.ellipsoid(top[0] + Math.cos(a) * 0.16, top[1] - 0.25, top[2] + Math.sin(a) * 0.16, 0.12, 0.13, 0.12, 0x8f8a5c, 4, 6);
  }
  const fronds = rng.int(10, 13);
  b.as(Surface.foliage, () => {
    for (let i = 0; i < fronds; i++) {
      const angle = (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const reach = rng.range(2.4, 3.3);
      const lift = rng.range(-0.2, 0.7);
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const color = rng.pick([0x95a087, 0x88937b, 0xa1aa93]);
      b.part();
      // The midrib arches out and droops; leaflets hang from it on both sides.
      let prev: Vec3 = [top[0], top[1] + 0.05, top[2]];
      for (let k = 1; k <= 4; k++) {
        const t = k / 4;
        const out = reach * t;
        const y = top[1] + 0.05 + lift * Math.sin(t * Math.PI * 0.8) - t * t * 1.3;
        const here: Vec3 = [top[0] + dx * out, y, top[2] + dz * out];
        const width = 0.55 * Math.sin(Math.PI * (t - 0.12)) + 0.08;
        const droop = 0.42 * width + 0.05;
        for (const side of [-1, 1]) {
          const sx = -dz * side * width;
          const sz = dx * side * width;
          b.quad(prev, here, [here[0] + sx, here[1] - droop, here[2] + sz], [prev[0] + sx * 0.8, prev[1] - droop * 0.8, prev[2] + sz * 0.8], color, [0, 1, 0]);
        }
        prev = here;
      }
    }
  });
}
