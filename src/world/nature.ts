import type { Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { city } from "../shared/palette";

/** A wide rain tree or, now and then, a krishnachura in flame-red bloom. */
export function tree(b: Batch, x: number, z: number, height: number, rng: Rng, detail = true): void {
  const blossom = rng.chance(0.14);
  const leaves = blossom ? [city.blossom, 0xe5613a, 0xc93f27] : [city.leaf, city.leafDark, city.leafLight];
  b.part();
  b.bar([x, 0, z], [x + rng.range(-0.3, 0.3), height * 0.55, z + rng.range(-0.3, 0.3)], height * 0.035, height * 0.022, city.bark, 6);
  const clusters = detail ? rng.int(14, 22) : 3;
  const spread = height * 0.5;
  // Rain trees spread wide and flat: many small clumps over a broad, shallow dome.
  for (let i = 0; i < clusters; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * spread;
    const r = rng.range(0.2, 0.34) * spread * (detail ? 1 : 2);
    const dome = 1 - (radius / spread) ** 2;
    b.part();
    b.ellipsoid(x + Math.cos(angle) * radius, height * (0.68 + 0.28 * dome), z + Math.sin(angle) * radius, r, r * 0.62, r, rng.pick(leaves), detail ? 3 : 3, detail ? 7 : 6);
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
