import { Surface, type Batch, type SurfaceKind, type Vec3 } from "../geometry";
import { Rng } from "../shared/rng";

/** The trees that line Dhaka's roads, each drawn from photographs of its own shape. */
export type Species = "rain" | "krishnachura" | "mahogany" | "mango" | "coconut";

export interface TreeOptions {
  species?: Species;
  /** For a tree that only ever shows small and hazy: fewer, larger sprays on fewer limbs. */
  far?: boolean;
}

interface Form {
  /** Crown radius and its vertical extent, as fractions of the tree's height. */
  spread: number;
  base: number;
  top: number;
  /** How far down from its top the crown's foliage reaches, in degrees. Under 90 leaves the underside open. */
  reach: number;
  /** Over 1 flattens the top of the crown. */
  flat: number;
  /** Trunk radius and fork height, as fractions of height, and how many limbs leave the fork. */
  trunk: number;
  fork: number;
  limbs: number;
  /** How far a limb sags below the straight line to its clumps, so it runs out before it rises. */
  sag: number;
  /** How crooked each limb is, as a share of its length. */
  crook: number;
  /** How far along the way to its clumps a limb goes before it divides. */
  run: number;
  /** How much a limb divides into lower and upper rather than left and right: high keeps a central leader going up. */
  leader: number;
  bark: number;
  /** Clumps of foliage on the crown, their radius as a fraction of height, and how flat each one is. */
  clumps: number;
  clump: number;
  squash: number;
  /** Leaves on each clump, the size of the top tier's in metres on a nine-metre tree, and how far they hang. */
  leaves: number;
  leaf: { length: number; width: number; droop: number; kind: SurfaceKind };
  /** Sunlit top, middle and the crown's own shade. */
  tones: readonly [number, number, number];
}

const FORMS: Record<Exclude<Species, "coconut">, Form> = {
  // Rain tree: forks low into huge limbs that sweep outwards under a broad, thin, domed shell. Wider than it is tall.
  rain: {
    spread: 0.86, base: 0.5, top: 1, reach: 86, flat: 1.5,
    trunk: 0.056, fork: 0.17, limbs: 3, sag: 0.17, crook: 0.08, run: 0.34, leader: 0.3, bark: 0x5e5044,
    clumps: 34, clump: 0.15, squash: 0.5, leaves: 40,
    leaf: { length: 0.6, width: 0.34, droop: 0.2, kind: Surface.leaf },
    tones: [0xcdd2c4, 0xa9b19f, 0x7a8373],
  },
  // Krishnachura: sinuous dark forks under a shallow, flat-topped umbrella of feathery leaves.
  krishnachura: {
    spread: 0.8, base: 0.66, top: 0.98, reach: 80, flat: 2.2,
    trunk: 0.042, fork: 0.32, limbs: 2, sag: 0.05, crook: 0.17, run: 0.42, leader: 0.3, bark: 0x4e4a44,
    clumps: 34, clump: 0.13, squash: 0.36, leaves: 40,
    leaf: { length: 0.56, width: 0.27, droop: 0.26, kind: Surface.leaf },
    tones: [0xd6dacb, 0xb5bcab, 0x88907e],
  },
  // Mahogany: a clear, pale trunk and an upright oval of separate clumps, with sky between them.
  mahogany: {
    spread: 0.37, base: 0.34, top: 1, reach: 138, flat: 1,
    trunk: 0.032, fork: 0.3, limbs: 1, sag: -0.02, crook: 0.07, run: 0.3, leader: 3, bark: 0x8b8173,
    clumps: 24, clump: 0.125, squash: 0.78, leaves: 50,
    leaf: { length: 0.54, width: 0.3, droop: 0.34, kind: Surface.leaf },
    tones: [0xc3cab9, 0x9ca593, 0x707a69],
  },
  // Mango: crooked dark limbs from a low fork, under a dense, heavy dome that comes down almost to head height.
  mango: {
    spread: 0.56, base: 0.24, top: 1, reach: 122, flat: 1.15,
    trunk: 0.056, fork: 0.17, limbs: 3, sag: 0.1, crook: 0.14, run: 0.36, leader: 0.4, bark: 0x4a4238,
    clumps: 32, clump: 0.165, squash: 0.74, leaves: 46,
    leaf: { length: 0.56, width: 0.27, droop: 0.34, kind: Surface.blade },
    tones: [0xaab2a2, 0x89927f, 0x5e6758],
  },
};

const STREET_MIX: readonly Species[] = ["rain", "rain", "rain", "mahogany", "mahogany", "krishnachura", "krishnachura", "mango", "mango", "coconut"];

/** Limbs thin as water pipes do: what the children carry adds up to what the parent carries. */
const PIPE = 1 / 2.3;
const WHITEWASH = 0xe4e1d6;

interface Clump {
  at: Vec3;
  radius: number;
  /** How high on the crown it sits: 1 at the top, -1 under the rim. */
  up: number;
  /** Set back inside the crown, in its shade. */
  inner: boolean;
}

const lerp = (a: Vec3, c: Vec3, t: number): Vec3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
const unit = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const cross = (a: Vec3, c: Vec3): Vec3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

const mixColor = (a: number, c: number, t: number): number => {
  const channel = (shift: number): number => Math.round(((a >> shift) & 255) + (((c >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

/** Foliage spread over the crown's upper shell, seen from above as evenly as a real canopy. */
function placeClumps(form: Form, x: number, z: number, h: number, rng: Rng, far: boolean): Clump[] {
  const radius = h * form.spread;
  const middle = (h * (form.base + form.top)) / 2;
  const half = (h * (form.top - form.base)) / 2;
  const reach = (form.reach * Math.PI) / 180;
  const count = Math.ceil(form.clumps * (far ? 0.62 : 1));
  const sizing = far ? 1.25 : 1;
  const out: Clump[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // A flat crown is covered evenly in plan; a tall one evenly round its sides.
    const polar = form.reach <= 90 ? Math.asin(Math.sqrt(t)) * (reach / (Math.PI / 2)) : Math.acos(1 - t * (1 - Math.cos(reach)));
    const angle = i * 2.39996 + rng.range(-0.3, 0.3);
    const inner = rng.chance(0.14);
    const depth = inner ? rng.range(0.55, 0.72) : rng.range(0.86, 1.03);
    const c = Math.cos(polar);
    const up = Math.sign(c) * Math.pow(Math.abs(c), 1 / form.flat);
    const out_ = Math.sin(polar) * depth;
    out.push({
      at: [x + Math.cos(angle) * radius * out_, middle + up * half * (inner ? depth : rng.range(0.92, 1.04)), z + Math.sin(angle) * radius * out_],
      radius: h * form.clump * rng.range(0.72, 1.28) * sizing,
      up,
      inner,
    });
  }
  return out;
}

/** Cuts a group of clumps in two across its widest direction, so each branch serves its own side of the crown. */
function divide(tips: Clump[], leader: number, rng: Rng): [Clump[], Clump[]] {
  const angle = rng.range(0, Math.PI);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const centre = tips.reduce((sum, tip) => [sum[0] + tip.at[0] / tips.length, sum[1] + tip.at[1] / tips.length, sum[2] + tip.at[2] / tips.length] as Vec3, [0, 0, 0] as Vec3);
  const along = (tip: Clump): number => (tip.at[0] - centre[0]) * c + (tip.at[2] - centre[2]) * s + (tip.at[1] - centre[1]) * leader;
  const sorted = tips.slice().sort((a, d) => along(a) - along(d));
  const cut = Math.max(1, Math.min(sorted.length - 1, Math.round(sorted.length * rng.range(0.36, 0.64))));
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

/** A curved limb, from one radius to another. A thin one goes to the line pass by itself, so it never shimmers. */
function stem(b: Batch, from: Vec3, to: Vec3, r0: number, r1: number, sag: number, crook: number, color: number, rng: Rng): void {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const middle = lerp(from, to, 0.5);
  const bend: Vec3 = [middle[0] + rng.range(-crook, crook) * length, middle[1] - sag * length + rng.range(-crook, crook) * length * 0.5, middle[2] + rng.range(-crook, crook) * length];
  const segments = r0 > 0.18 ? 3 : r0 > 0.07 ? 2 : 1;
  const sides = r0 > 0.25 ? 7 : r0 > 0.1 ? 5 : 4;
  let previous = from;
  for (let k = 1; k <= segments; k++) {
    const t = k / segments;
    const here: Vec3 = [
      (1 - t) * (1 - t) * from[0] + 2 * t * (1 - t) * bend[0] + t * t * to[0],
      (1 - t) * (1 - t) * from[1] + 2 * t * (1 - t) * bend[1] + t * t * to[1],
      (1 - t) * (1 - t) * from[2] + 2 * t * (1 - t) * bend[2] + t * t * to[2],
    ];
    b.bar(previous, here, r0 + (r1 - r0) * ((k - 1) / segments), r0 + (r1 - r0) * t, color, sides);
    previous = here;
  }
}

/** The whole skeleton: each limb divides until every clump of foliage has a twig that reaches it. */
function growLimbs(b: Batch, form: Form, fork: Vec3, trunkR: number, clumps: Clump[], rng: Rng, far: boolean): void {
  const radiusFor = (count: number): number => trunkR * Math.pow(count / clumps.length, PIPE);
  const branch = (from: Vec3, tips: Clump[], order: number): void => {
    const r0 = radiusFor(tips.length);
    if (tips.length === 1) {
      stem(b, from, tips[0]!.at, Math.min(0.055, r0 * 0.8), 0.014, form.sag * 0.3, form.crook * 0.5, form.bark, rng);
      return;
    }
    const centre = tips.reduce((sum, tip) => [sum[0] + tip.at[0] / tips.length, sum[1] + tip.at[1] / tips.length, sum[2] + tip.at[2] / tips.length] as Vec3, [0, 0, 0] as Vec3);
    const to = lerp(from, centre, order === 1 ? form.run : rng.range(0.45, 0.68));
    const [left, right] = divide(tips, form.leader, rng);
    stem(b, from, to, r0, r0 * 0.82, form.sag * (order === 1 ? 1 : 0.4), form.crook, form.bark, rng);
    b.part();
    branch(to, left, order + 1);
    b.part();
    branch(to, right, order + 1);
  };
  // The limbs leave the fork in a ring, each taking the clumps on its own side of the crown.
  const ring = clumps.slice().sort((a, c) => Math.atan2(a.at[2] - fork[2], a.at[0] - fork[0]) - Math.atan2(c.at[2] - fork[2], c.at[0] - fork[0]));
  const shift = rng.int(0, ring.length - 1);
  const turned = [...ring.slice(shift), ...ring.slice(0, shift)];
  const limbs = Math.min(far ? Math.max(3, form.limbs - 1) : form.limbs, turned.length);
  let start = 0;
  for (let i = 0; i < limbs; i++) {
    const remaining = limbs - i;
    const take = i === limbs - 1 ? turned.length - start : Math.max(1, Math.round(((turned.length - start) / remaining) * rng.range(0.7, 1.3)));
    b.part();
    branch(fork, turned.slice(start, start + take), 1);
    start += take;
  }
}

/** Where the camera usually looks from, across the ground: leaves tip that way, as if turned to the light. */
const TOWARD_VIEW: Vec3 = [-0.57, 0, 0.82];

/**
 * A clump is built like a drawn tuft: big dark leaves at its heart for mass, then smaller, lighter
 * ones laid over them. Pointed all round, so it has no outline of its own to read as a shape.
 */
const TIERS = [
  { share: 0.26, scale: 2.05, wide: 1.5, shell: [0.05, 0.4], height: [-0.7, 0.4], tone: 0.18 },
  { share: 0.34, scale: 1.35, wide: 1.2, shell: [0.35, 0.85], height: [-0.45, 0.75], tone: 0.55 },
  { share: 0.4, scale: 1, wide: 1, shell: [0.6, 1.12], height: [0.05, 1], tone: 1 },
] as const;

/** Every leaf on the crown. */
function drawFoliage(b: Batch, form: Form, x: number, z: number, h: number, clumps: Clump[], rng: Rng, far: boolean): void {
  const size = (h / 9) * (far ? 1.55 : 1);
  const [light, mid, dark] = form.tones;
  const { leaf } = form;
  const count = form.leaves * (far ? 0.42 : 1);
  const middle = (h * (form.base + form.top)) / 2;
  const spreadRadius = h * form.spread;
  const halfHeight = (h * (form.top - form.base)) / 2;
  b.leafPart();
  b.as(leaf.kind, () => {
    for (const clump of clumps) {
      const r = clump.radius;
      for (const tier of TIERS) {
        const leaves = Math.round(count * tier.share);
        for (let i = 0; i < leaves; i++) {
          const a = rng.range(0, Math.PI * 2);
          const cosP = rng.range(tier.height[0], tier.height[1]);
          const sinP = Math.sqrt(1 - cosP * cosP);
          const shell = rng.range(tier.shell[0], tier.shell[1]);
          const p: Vec3 = [clump.at[0] + Math.cos(a) * sinP * r * shell, clump.at[1] + cosP * r * form.squash * shell, clump.at[2] + Math.sin(a) * sinP * r * shell];
          // Light falls across the whole crown first and each clump second: one mass, with lobes.
          const crownNormal = unit((p[0] - x) / spreadRadius, (p[1] - middle) / halfHeight, (p[2] - z) / spreadRadius);
          const clumpNormal = unit(p[0] - clump.at[0], (p[1] - clump.at[1]) / form.squash, p[2] - clump.at[2]);
          const shade = unit(
            crownNormal[0] * 0.6 + clumpNormal[0] * 0.5 + rng.range(-0.12, 0.12),
            crownNormal[1] * 0.6 + clumpNormal[1] * 0.5 + 0.34 + rng.range(-0.12, 0.12),
            crownNormal[2] * 0.6 + clumpNormal[2] * 0.5 + rng.range(-0.12, 0.12),
          );
          // How much sky it sees: the tier first, then how high on the crown, and whether set back inside.
          const sky = Math.max(0, Math.min(1, tier.tone * (0.72 + clump.up * 0.2 + cosP * 0.14) - (clump.inner ? 0.3 : 0) + rng.range(-0.09, 0.09)));
          const color = sky > 0.5 ? mixColor(mid, light, (sky - 0.5) * 2) : mixColor(dark, mid, sky * 2);
          // Leaves point away from the heart of the clump and the middle of the crown, and hang.
          const heading = unit(
            Math.cos(a) * 0.8 + (p[0] - x) / spreadRadius + rng.range(-0.55, 0.55),
            0,
            Math.sin(a) * 0.8 + (p[2] - z) / spreadRadius + rng.range(-0.55, 0.55),
          );
          const length = leaf.length * tier.scale * size * rng.range(0.78, 1.22);
          const rise = rng.range(-0.1, 0.32) - leaf.droop;
          const tip: Vec3 = [p[0] + heading[0] * length, p[1] + rise * length, p[2] + heading[2] * length];
          const normal = unit(TOWARD_VIEW[0] * 0.75 + rng.range(-0.3, 0.3), 0.85, TOWARD_VIEW[2] * 0.75 + rng.range(-0.3, 0.3));
          const wide = unit(normal[1] * heading[2], normal[2] * heading[0] - normal[0] * heading[2], -normal[1] * heading[0]);
          const w = (leaf.width * tier.wide * size * rng.range(0.82, 1.18)) / 2;
          b.leaf([p[0] + wide[0] * w, p[1] + wide[1] * w, p[2] + wide[2] * w], [p[0] - wide[0] * w, p[1] - wide[1] * w, p[2] - wide[2] * w], tip, shade, color);
        }
      }
    }
  });
}

/**
 * A street tree: a flared trunk, limbs that really divide until each clump of leaves has a twig
 * reaching it, and a crown of separate leaf shoots with sky between them. The foot of the trunk is
 * whitewashed, as the city's road trees are. Its own random stream, so a change here moves nothing else.
 */
export function tree(b: Batch, x: number, z: number, height: number, rng: Rng, options: TreeOptions = {}): void {
  const own = new Rng(rng.int(1, 1 << 30));
  const species = options.species ?? own.pick(STREET_MIX);
  const far = options.far ?? false;
  if (species === "coconut") {
    palm(b, x, z, height * 1.15, own, far);
    return;
  }
  const form = FORMS[species];
  const h = height * (species === "mahogany" ? 1.15 : 1);
  // A kerb has no room for a veteran's girth: the walkers' strip starts just behind it.
  const trunkR = Math.min(h * form.trunk, 0.42);
  const lean = own.range(0, Math.PI * 2);
  const fork: Vec3 = [x + Math.cos(lean) * h * 0.035, h * form.fork, z + Math.sin(lean) * h * 0.035];
  const band = Math.min(1.25, h * form.fork * 0.65);

  b.part();
  b.as(Surface.bark, () => {
    // Whitewashed to the height of a hand, flaring out to where the roots lift the paving.
    if (far) b.bar([x, 0, z], [x, band, z], trunkR * 1.3, trunkR * 1.06, WHITEWASH, 6);
    else b.lathe(x, z, [[trunkR * 1.32, 0.17], [trunkR * 1.18, 0.4], [trunkR * 1.09, band * 0.62], [trunkR * 1.06, band]], WHITEWASH, 9);
    b.bar([x, band, z], fork, trunkR * 1.06, trunkR * 0.92, form.bark, 7);
  });
  const clumps = placeClumps(form, x, z, h, own, far);
  b.as(Surface.bark, () => growLimbs(b, form, fork, trunkR, clumps, own, far));
  drawFoliage(b, form, x, z, h, clumps, own, far);
}

/**
 * A coconut palm: a ringed trunk that bends as it climbs, a head of arching fronds each with a comb
 * of drooping leaflets, the oldest hanging low and dark, and a bunch of coconuts in the crown.
 */
export function palm(b: Batch, x: number, z: number, height: number, rng: Rng, far = false): void {
  const bend = rng.range(0, Math.PI * 2);
  const sway = height * rng.range(0.06, 0.2);
  const rings = far ? 5 : 11;
  const trunk: Vec3[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const off = sway * t * t;
    trunk.push([x + Math.cos(bend) * off, height * t, z + Math.sin(bend) * off]);
  }
  b.as(Surface.bark, () => {
    for (let i = 0; i < rings; i++) {
      const t = i / rings;
      const r0 = 0.15 + 0.1 * Math.pow(1 - t, 5) + 0.02 * (1 - t);
      const r1 = 0.15 + 0.1 * Math.pow(1 - (i + 1) / rings, 5) + 0.02 * (1 - (i + 1) / rings);
      b.part();
      // The scars of old fronds ring the trunk, paler and darker turn about.
      b.bar(trunk[i]!, trunk[i + 1]!, r0, r1, i % 2 ? 0x8f8270 : 0x7d7160, 6);
    }
  });
  const top = trunk[rings]!;
  b.part();
  const nuts = far ? 0 : 5;
  for (let i = 0; i < nuts; i++) {
    const a = (i / nuts) * Math.PI * 2 + rng.range(-0.3, 0.3);
    b.ellipsoid(top[0] + Math.cos(a) * 0.2, top[1] - 0.22 + rng.range(-0.05, 0.05), top[2] + Math.sin(a) * 0.2, 0.125, 0.14, 0.125, 0x7f7a52, 3, 5);
  }
  const size = height / 9;
  const fronds = far ? 11 : rng.int(15, 18);
  const leaflets = far ? 7 : 10;
  b.leafPart();
  b.as(Surface.blade, () => {
    for (let i = 0; i < fronds; i++) {
      const angle = i * 2.39996 + rng.range(-0.25, 0.25);
      // Young fronds stand high and the oldest hang low: the crown is a ball, not a parasol.
      const age = i / (fronds - 1);
      const reach = rng.range(2.5, 3.5) * size;
      const lift = (1.5 - age * 2.3) * size;
      const fall = (0.65 + age * 1.1) * size;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const light = 0xa1aa93;
      const dark = 0x687160;
      const point = (t: number): Vec3 => [top[0] + dx * reach * t, top[1] + 0.05 + lift * Math.sin(t * Math.PI * 0.62) - fall * t * t, top[2] + dz * reach * t];
      // The rib: heavy at the crown, and thin enough further out to go to the line pass.
      for (let k = 0; k < 4; k++) b.bar(point(k / 4), point((k + 1) / 4), 0.055 - k * 0.012, 0.043 - k * 0.012, 0x7c8070, 4);
      for (let k = 0; k < leaflets; k++) {
        const t = (k + 0.7) / leaflets;
        const p = point(t);
        const after = point(Math.min(1, t + 0.02));
        const heading = unit(after[0] - p[0], after[1] - p[1], after[2] - p[2]);
        const widest = Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08));
        const length = (0.42 + 0.72 * widest) * size * rng.range(0.82, 1.12) * (far ? 1.1 : 1);
        const width = (far ? 0.42 : 0.32) * size;
        const color = mixColor(dark, light, Math.max(0, Math.min(1, 0.72 - age * 0.45 + rng.range(-0.15, 0.15))));
        const normal = unit(dx * 0.35 * (t - 0.2), 1, dz * 0.35 * (t - 0.2));
        for (const side of [-1, 1]) {
          // Leaflets sweep forward along the rib and droop off it, more towards its end.
          const sx = -dz * side;
          const sz = dx * side;
          const out = unit(sx + heading[0] * 0.75, -0.42 - t * 0.55, sz + heading[2] * 0.75);
          const tip: Vec3 = [p[0] + out[0] * length, p[1] + out[1] * length, p[2] + out[2] * length];
          const wide = cross(normal, out);
          const w = width / 2;
          b.leaf([p[0] + wide[0] * w, p[1] + wide[1] * w, p[2] + wide[2] * w], [p[0] - wide[0] * w, p[1] - wide[1] * w, p[2] - wide[2] * w], tip, normal, color);
        }
      }
    }
  });
}
