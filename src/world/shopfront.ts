import type { Assets, PersonPose } from "../assets";
import type { Batch } from "../geometry";
import type { Rng } from "../shared/rng";
import { awnings, city, shutters } from "../shared/palette";
import { posterUv, shopUv, signOf, type ShopKind } from "../signs/regions";

/**
 * Dhaka's street frontages: a ground floor of narrow shops, often with another floor of tenants
 * above it, reached by a stair door between the shutters. Everything is drawn in the frame of the
 * facade: u runs along it, y up, +z out over the pavement.
 */
export interface Frontage {
  width: number;
  /** Height of the ground floor. */
  height: number;
  trim: number;
  lod: number;
  assets: Assets;
  rng: Rng;
}

type Dresser = (b: Batch, u0: number, u1: number, height: number, f: Frontage) => void;

const INSIDE = 0x4a4f50;
const STEP = 0.16;

const GROUND_KINDS: readonly ShopKind[] = ["hotel", "hotel", "breakfast", "breakfast", "shoe", "shoe", "grocery", "grocery", "clothes", "clothes", "pharmacy", "mobile", "mobile", "electronics", "sweets", "tailor", "bank"];
const UPPER_KINDS: readonly ShopKind[] = ["coaching", "coaching", "clinic", "clinic", "parlour", "gym", "chinese", "office", "office"];

/** Somebody at the shop: `lo` everywhere, since nobody sees a shopkeeper up close. */
function person(b: Batch, f: Frontage, x: number, y: number, z: number, facing: number, pose: PersonPose, tone = 1): void {
  const avatar = f.rng.int(0, f.assets.avatars.length - 1);
  b.at(x, y, z, () => b.stamp(f.assets.person(avatar, pose, "far"), tone), facing);
}

function stool(b: Batch, x: number, z: number, color: number): void {
  b.part();
  b.cylinder(x, STEP * 0 + 0.02, z, 0.15, 0.12, 0.4, color, 7);
}

/** The griddle out front that a breakfast hotel works from, its dough and stacked parotas on the counter. */
function griddleCounter(b: Batch, cx: number, f: Frontage, kettle: boolean): void {
  const z0 = 0.62;
  const z1 = 1.28;
  b.part();
  b.box(cx - 0.75, 0, z0, cx + 0.75, 0.84, z1, 0xa4a29a);
  b.part();
  b.box(cx - 0.8, 0.84, z0 - 0.04, cx + 0.8, 0.89, z1 + 0.04, 0xeeece4);
  b.part();
  b.cylinder(cx - 0.28, 0.89, (z0 + z1) / 2, 0.3, 0.3, 0.025, 0x35373a, 14);
  // Parotas stacked on a tray, and the bowl of dough.
  b.part();
  b.box(cx + 0.14, 0.89, z0 + 0.1, cx + 0.62, 0.91, z1 - 0.1, 0xc2c4c2);
  for (let i = 0; i < 2; i++) {
    b.part();
    b.cylinder(cx + 0.28 + i * 0.2, 0.91, (z0 + z1) / 2, 0.09, 0.09, 0.05 + f.rng.next() * 0.09, 0xe6dcc0, 8);
  }
  if (kettle) {
    b.part();
    b.lathe(cx + 0.62, z0 + 0.1, [[0.09, 0.91], [0.13, 0.96], [0.1, 1.1], [0.03, 1.14]], 0xb4b6b4, 8);
  }
  // The gas cylinder that feeds it.
  b.part();
  b.cylinder(cx - 0.58, 0, z1 + 0.22, 0.16, 0.16, 0.62, 0x5c5e60, 9);
}

/** A hotel's front: griddle on the pavement, plastic stools, a table or two seen inside. */
const hotel: Dresser = (b, u0, u1, height, f) => {
  const width = u1 - u0;
  griddleCounter(b, u0 + 0.95, f, f.rng.chance(0.5));
  person(b, f, u0 + 0.95, 0.02, 0.32, 0, "stand");
  // Tables inside, under a strip light.
  for (let t = u0 + 2.1; t < u1 - 0.6; t += 1.25) {
    b.part();
    b.box(t - 0.42, STEP + 0.6, 0.05, t + 0.42, STEP + 0.65, 0.5, 0xd6d4cc);
    b.box(t - 0.36, STEP, 0.26, t - 0.32, STEP + 0.6, 0.3, 0x5a5c5c);
    b.box(t + 0.32, STEP, 0.26, t + 0.36, STEP + 0.6, 0.3, 0x5a5c5c);
  }
  b.part();
  b.box(u0 + 0.25, height - 1.35, 0.03, u1 - 0.25, height - 1.31, 0.07, 0xf7f6ef);
  const stools = f.rng.int(1, 3);
  for (let i = 0; i < stools; i++) stool(b, u0 + 1.9 + i * 0.5, 0.95 + f.rng.next() * 0.35, f.rng.pick(awnings));
  if (f.rng.chance(0.55) && width > 3) person(b, f, u0 + 2.2, 0.02, 1.18, 0.5 + f.rng.next(), "sit", 1.05);
};

/** The sloping shoe rack that fills the mouth of every shoe shop, and boxes stacked to the ceiling. */
const shoe: Dresser = (b, u0, u1, height, f) => {
  const tiers = 4;
  const left = u0 + 0.25;
  const right = u1 - 0.25;
  for (let tier = 0; tier < tiers; tier++) {
    const y = 0.3 + tier * 0.34;
    const z = 0.82 - tier * 0.16;
    b.part();
    b.box(left, y - 0.04, z - 0.16, right, y, z + 0.16, 0xb6b4ac);
    for (let u = left + 0.1; u < right - 0.26; u += 0.34) {
      const tone = f.rng.pick([0x303234, 0x56585a, 0x8c8e8c, 0xdcdcd4, 0x42444a]);
      b.part();
      b.box(u, y, z - 0.11, u + 0.1, y + 0.1, z + 0.12, tone);
      b.box(u + 0.12, y, z - 0.11, u + 0.22, y + 0.1, z + 0.12, tone);
    }
  }
  b.part();
  b.box(left, 0, 0.5, left + 0.05, 0.3, 0.98, 0x8c8a84);
  b.box(right - 0.05, 0, 0.5, right, 0.3, 0.98, 0x8c8a84);
  // Boxes up the back wall.
  for (let u = left; u < right - 0.34; u += 0.34) {
    for (let y = 1.7; y < height - 1.3; y += 0.14) {
      b.part();
      b.box(u, y, 0.02, u + 0.32, y + 0.13, 0.26, f.rng.pick([0xd0cec6, 0xb6b4ac, 0xe6e4dc, 0x9c9a94]));
    }
  }
};

/** Sacks on the pavement, tins on shelves, and strips of sachets hanging across the front. */
const grocery: Dresser = (b, u0, u1, height, f) => {
  for (let s = 0; s < 3; s++) {
    const y = 0.55 + s * 0.6;
    b.part();
    b.box(u0 + 0.2, y, 0.02, u1 - 0.2, y + 0.05, 0.28, 0x8c8a84);
    for (let u = u0 + 0.24; u < u1 - 0.34; u += f.rng.range(0.13, 0.24)) {
      b.box(u, y + 0.05, 0.05, u + 0.1, y + f.rng.range(0.18, 0.4), 0.2, f.rng.pick(awnings));
    }
  }
  const sacks = f.rng.int(2, 4);
  for (let i = 0; i < sacks; i++) {
    b.part();
    b.ellipsoid(u0 + 0.5 + i * 0.62, 0.3, 0.75, 0.28, 0.32, 0.22, f.rng.pick([0xdcd8c8, 0xc8c4b4, 0xe6e4d8]), 4, 8);
  }
  // Strips of shampoo and snack sachets, the first thing anyone sees of a corner shop.
  for (let u = u0 + 0.3; u < u1 - 0.2; u += f.rng.range(0.2, 0.42)) {
    const drop = f.rng.range(0.5, 1.1);
    b.part();
    b.box(u, height - 1.25 - drop, 0.32, u + 0.12, height - 1.25, 0.335, f.rng.pick(awnings));
  }
  b.part();
  b.box(u0 + 0.15, height - 1.27, 0.3, u1 - 0.15, height - 1.24, 0.35, 0x6e7072);
  person(b, f, u0 + (u1 - u0) * 0.68, 0.02, 0.4, 0, "stand");
};

/** Clothes on a rail across the front, and a shop-window dummy. */
const clothes: Dresser = (b, u0, u1, height, f) => {
  const railY = height - 1.3;
  b.part();
  b.box(u0 + 0.12, railY, 0.42, u1 - 0.12, railY + 0.03, 0.45, 0x6e7072);
  for (let u = u0 + 0.28; u < u1 - 0.3; u += f.rng.range(0.34, 0.62)) {
    const drop = f.rng.range(0.9, 1.35);
    const w = f.rng.range(0.16, 0.26);
    const tone = f.rng.pick(awnings);
    b.part();
    // A hanging kurta: shoulders, then a skirt that widens.
    b.quad([u - w, railY - drop, 0.44], [u + w, railY - drop, 0.44], [u + w * 0.72, railY - 0.1, 0.44], [u - w * 0.72, railY - 0.1, 0.44], tone, [0, 0, 1]);
    b.quad([u - w * 0.72, railY - 0.1, 0.44], [u + w * 0.72, railY - 0.1, 0.44], [u + 0.02, railY, 0.44], [u - 0.02, railY, 0.44], tone, [0, 0, 1]);
  }
  for (const y of [0.6, 1.2]) {
    b.part();
    b.box(u0 + 0.2, y, 0.02, u1 - 0.2, y + 0.05, 0.28, 0xa4a29a);
    for (let u = u0 + 0.24; u < u1 - 0.42; u += 0.38) b.box(u, y + 0.05, 0.05, u + 0.32, y + f.rng.range(0.14, 0.32), 0.26, f.rng.pick(awnings));
  }
  person(b, f, u0 + 0.65, STEP, 0.58, 0.2, "stand", 1.4);
};

/** White shelves of boxes behind glass, and the green cross every pharmacy hangs out. */
const pharmacy: Dresser = (b, u0, u1, height) => {
  for (let s = 0; s < 5; s++) {
    const y = 0.45 + s * 0.42;
    b.part();
    b.box(u0 + 0.2, y, 0.02, u1 - 0.2, y + 0.03, 0.2, 0xeeece4);
    for (let u = u0 + 0.22; u < u1 - 0.3; u += 0.17) b.box(u, y + 0.03, 0.04, u + 0.13, y + 0.26 + ((u * 7) % 1) * 0.08, 0.14, 0xe6e4dc - (Math.floor(u * 13) % 5) * 0x0a0a0a);
  }
  b.part();
  b.box(u0 + 0.3, 0, 0.5, u1 - 0.3, 0.92, 0.95, 0xdcdad2);
  b.part();
  b.box(u0 + 0.28, 0.92, 0.48, u1 - 0.28, 0.96, 0.97, 0xf2f1ea);
  // The cross, on a bracket out from the pilaster.
  b.part();
  b.box(u1 - 0.08, height - 1.7, 0.1, u1 - 0.04, height - 1.65, 0.8, 0x7c7e7c);
  b.box(u1 - 0.1, height - 2.05, 0.46, u1 - 0.02, height - 1.45, 0.66, 0x303234);
  b.box(u1 - 0.1, height - 1.85, 0.26, u1 - 0.02, height - 1.65, 0.86, 0x303234);
};

/** Posters in the window, a glass counter of phones, an agent's sign out on the pavement. */
const mobile: Dresser = (b, u0, u1, height, f) => {
  b.part();
  b.box(u0 + 0.25, 0, 0.3, u1 - 0.25, 0.9, 0.72, 0xbcc2c0);
  b.part();
  b.box(u0 + 0.22, 0.9, 0.28, u1 - 0.22, 0.94, 0.74, 0xeeeee6);
  for (let u = u0 + 0.4; u < u1 - 0.5; u += 0.34) {
    b.part();
    b.box(u, 0.94, 0.42, u + 0.09, 1.08, 0.46, 0x232527);
  }
  for (let u = u0 + 0.28; u < u1 - 0.5; u += 0.62) {
    b.part();
    b.panel(u, height - 2.25, u + 0.42, height - 1.67, 0.03, 0xffffff, posterUv(f.rng.int(0, 5)));
  }
  // The A-board on the pavement.
  b.part();
  b.quad([u0 + 0.5, 0, 1.28], [u0 + 1.2, 0, 1.28], [u0 + 1.2, 0.86, 1.08], [u0 + 0.5, 0.86, 1.08], 0xe6e4dc, [0, 0.2, 1]);
  person(b, f, u0 + (u1 - u0) * 0.6, 0.02, 0.2, 0, f.rng.chance(0.5) ? "phone" : "stand");
};

/** Fridges and cartons crowding the doorway, a wall of televisions behind. */
const electronics: Dresser = (b, u0, u1, height, f) => {
  for (let u = u0 + 0.35; u < u1 - 0.7; u += 0.82) {
    const tall = f.rng.range(1.35, 1.8);
    b.part();
    b.box(u, 0, 0.42, u + 0.68, tall, 1.02, 0xdedcd4);
    b.part();
    b.box(u + 0.02, tall * 0.68, 1.02, u + 0.66, tall * 0.69, 1.03, 0x8c8e8c);
    b.box(u + 0.57, tall * 0.42, 1.02, u + 0.6, tall * 0.62, 1.05, 0x7c7e7c);
  }
  for (let u = u0 + 0.3; u < u1 - 0.8; u += 0.86) {
    b.part();
    b.box(u, height - 2.0, 0.03, u + 0.76, height - 1.5, 0.08, 0x232527);
  }
};

/** A long glass counter of trays, with the scales on top. */
const sweets: Dresser = (b, u0, u1, height, f) => {
  b.part();
  b.box(u0 + 0.2, 0, 0.42, u1 - 0.2, 0.62, 0.95, 0xcfcdc5);
  b.part();
  b.box(u0 + 0.2, 0.62, 0.42, u1 - 0.2, 1.18, 0.95, 0xdfe5e4);
  for (let y = 0.72; y < 1.1; y += 0.2) {
    for (let u = u0 + 0.28; u < u1 - 0.6; u += 0.46) {
      b.part();
      b.box(u, y, 0.52, u + 0.38, y + 0.05, 0.86, f.rng.pick([0xf2f1e6, 0xe6dcc0, 0xcfc8ae, 0xf7f3e0]));
    }
  }
  b.part();
  b.box(u0 + 0.18, 1.18, 0.4, u1 - 0.18, 1.21, 0.97, 0x7c7e7c);
  person(b, f, u0 + (u1 - u0) * 0.45, STEP, 0.2, 0, "stand");
  void height;
};

/** A tailor's or barber's: a mirror, a chair, a sewing table in the doorway. */
const tailor: Dresser = (b, u0, u1, height, f) => {
  b.part();
  b.panel(u0 + 0.35, 0.8, u1 - 0.35, height - 1.55, 0.03, 0xc6d0d0);
  const table = u0 + 0.8;
  b.part();
  b.box(table - 0.5, 0.72, 0.42, table + 0.5, 0.77, 1.02, 0x8c7f6c);
  b.box(table - 0.46, 0, 0.46, table - 0.42, 0.72, 0.5, 0x4c4e50);
  b.box(table + 0.42, 0, 0.46, table + 0.46, 0.72, 0.5, 0x4c4e50);
  b.part();
  b.box(table - 0.15, 0.77, 0.6, table + 0.2, 0.98, 0.76, 0x35373a);
  stool(b, table, 1.28, 0x7c7e7c);
  if (f.rng.chance(0.6)) person(b, f, table, 0.02, 1.32, Math.PI, "sit");
};

/** A cash machine behind glass, the only shopfront on the street kept spotless. */
const bank: Dresser = (b, u0, u1, height) => {
  b.part();
  b.panel(u0 + 0.14, 0.05, u1 - 0.14, height - 1.12, 0.03, 0xccd6d6);
  const mid = (u0 + u1) / 2;
  b.part();
  b.box(mid - 0.02, 0.05, 0.03, mid + 0.02, height - 1.12, 0.05, 0x6e7072);
  b.part();
  b.box(mid + 0.25, 0, 0.05, mid + 0.9, 1.65, 0.45, 0x6c6e70);
  b.part();
  b.box(mid + 0.32, 1.1, 0.45, mid + 0.83, 1.48, 0.46, 0xd8dede);
};

const DRESSERS: Record<ShopKind, Dresser | null> = {
  hotel,
  breakfast: hotel,
  shoe,
  grocery,
  clothes,
  pharmacy,
  mobile,
  electronics,
  sweets,
  tailor,
  bank,
  coaching: null,
  clinic: null,
  parlour: null,
  gym: null,
  chinese: null,
  office: null,
};

function shutter(b: Batch, u0: number, u1: number, top: number, f: Frontage): void {
  const color = f.rng.pick(shutters);
  b.part();
  b.panel(u0, 0.05, u1, top, 0.04, color);
  if (f.lod > 0) return;
  // Ribs of the roller, close enough to read as corrugation up close, and they fade when far.
  const dark = (color >> 1) & 0x7f7f7f;
  for (let y = 0.25; y < top - 0.1; y += 0.22) b.box(u0, y, 0.04, u1, y + 0.02, 0.046, dark);
  b.part();
  b.box((u0 + u1) / 2 - 0.05, 0.42, 0.04, (u0 + u1) / 2 + 0.05, 0.56, 0.1, 0x35373a);
  const posters = f.rng.int(0, 2);
  for (let i = 0; i < posters; i++) {
    const u = f.rng.range(u0 + 0.2, u1 - 0.6);
    const y = f.rng.range(0.7, Math.max(0.8, top - 0.8));
    b.part();
    b.panel(u, y, u + 0.42, y + 0.56, 0.05, 0xffffff, posterUv(f.rng.int(0, 5)));
  }
}

function fasciaSign(b: Batch, u0: number, u1: number, y0: number, y1: number, kind: ShopKind, f: Frontage): void {
  b.part();
  b.box(u0, y0, 0.02, u1, y1, 0.13, 0x8c8e8c);
  b.part();
  b.panel(u0 + 0.02, y0 + 0.02, u1 - 0.02, y1 - 0.02, 0.132, 0xffffff, shopUv(signOf(kind, f.rng.next())));
}

/** The door beside the shutters that leads up to the first floor, with a board of who is up there. */
function stairDoor(b: Batch, u0: number, u1: number, f: Frontage, tenants: readonly ShopKind[]): void {
  const { height } = f;
  b.part();
  b.panel(u0 + 0.08, 0.05, u1 - 0.08, height - 0.55, 0.02, 0x3c3f42);
  if (f.lod > 0) return;
  // Stairs seen going up inside, and the folding gate pushed to one side.
  for (let i = 0; i < 8; i++) {
    b.part();
    b.panel(u0 + 0.14, 0.14 + i * 0.26, u1 - 0.14, 0.2 + i * 0.26, 0.025, 0x8c8e8c);
  }
  for (let g = 0; g < 4; g++) b.box(u0 + 0.1 + g * 0.05, 0.08, 0.03, u0 + 0.115 + g * 0.05, height - 0.7, 0.045, 0x7c7e7c);
  // A signboard for each tenant, stacked on the pier over the door.
  tenants.slice(0, 2).forEach((kind, i) => {
    const y = height - 0.5 + i * 0.002;
    b.part();
    b.panel(u0 + 0.05, y - 0.02, u1 - 0.05, y + 0.3, 0.04, 0xffffff, shopUv(signOf(kind, f.rng.next())));
  });
}

/** A row of ground-floor shops. `tenants` are the businesses upstairs, if any, that a stair must reach. */
export function groundShops(b: Batch, f: Frontage, tenants: readonly ShopKind[] = []): void {
  const { width, height, trim, lod, rng } = f;
  if (lod >= 2) return;
  // Bays run left to right, narrow and uneven, with a stair door dropped in if anyone lives upstairs.
  const bays: Array<{ u0: number; u1: number; stair: boolean }> = [];
  const stairAt = tenants.length ? rng.range(width * 0.2, width * 0.8) : Infinity;
  let cursor = 0;
  let stairDone = !tenants.length;
  while (cursor < width - 0.5) {
    if (!stairDone && cursor >= stairAt - 2) {
      bays.push({ u0: cursor, u1: Math.min(width, cursor + 1.45), stair: true });
      cursor += 1.45;
      stairDone = true;
      continue;
    }
    let bay = rng.range(2.9, 4.8);
    if (width - cursor - bay < 2.2) bay = width - cursor;
    bays.push({ u0: cursor, u1: cursor + bay, stair: false });
    cursor += bay;
  }

  b.part();
  b.box(0, height - 0.26, 0, width, height, 0.3, trim);
  for (const bay of bays) {
    const u0 = bay.u0 + 0.1;
    const u1 = bay.u1 - 0.1;
    // A plastered pier between neighbours.
    b.part();
    b.box(bay.u0 - 0.1, 0, 0, bay.u0 + 0.1, height - 0.26, 0.2, trim);
    if (bay.stair) {
      stairDoor(b, u0, u1, f, tenants);
      continue;
    }
    const kind = rng.pick(GROUND_KINDS);
    const signed = height - 1.08;
    if (lod === 0 && rng.chance(0.24)) {
      shutter(b, u0, u1, signed, f);
    } else {
      b.part();
      b.panel(u0, 0.05, u1, signed, 0.02, INSIDE);
      if (lod === 0) {
        // The rolled-up shutter's box, and a tiled step to walk up.
        b.part();
        b.box(u0, signed - 0.16, 0.02, u1, signed, 0.16, 0x6e7072);
        b.part();
        b.box(u0, 0, 0.02, u1, STEP, 0.4, 0xc4c2ba);
        DRESSERS[kind]?.(b, u0, u1, height, f);
      }
    }
    fasciaSign(b, bay.u0 + 0.06, bay.u1 - 0.06, signed + 0.02, height - 0.34, kind, f);
    if (lod > 0) continue;
    // A tin or canvas awning over about half of them, on thin angled brackets.
    if (rng.chance(0.5)) {
      const tin = rng.chance(0.5) ? city.tin : rng.pick(awnings);
      const out = rng.range(0.8, 1.35);
      const y = signed + 0.01;
      b.part();
      b.quad([u0, y, 0.14], [u1, y, 0.14], [u1, y - 0.36, out], [u0, y - 0.36, out], tin, [0, 1, 0.2]);
      b.box(u0, y - 0.48, out - 0.02, u1, y - 0.36, out, tin);
      b.part();
      b.bar([u0 + 0.06, y - 0.55, 0.05], [u0 + 0.06, y - 0.36, out], 0.012, 0.012, 0x6e7072, 3);
      b.bar([u1 - 0.06, y - 0.55, 0.05], [u1 - 0.06, y - 0.36, out], 0.012, 0.012, 0x6e7072, 3);
    }
    if (rng.chance(0.3)) bladeSign(b, bay.u1 - 0.02, signed - 0.05, kind, f);
  }
  // The bunch of cables every street front carries along its fascia.
  if (lod === 0) {
    b.part();
    for (const y of [height - 0.2, height - 0.14, height - 0.08]) b.box(0, y, 0.33, width, y + 0.015, 0.345, 0x404244);
  }
}

/** A small sign on a bracket, sticking out from the wall to catch people walking along the pavement. */
function bladeSign(b: Batch, u: number, y: number, kind: ShopKind, f: Frontage): void {
  const out = 1.0;
  b.part();
  b.box(u - 0.03, y + 0.46, 0.05, u + 0.03, y + 0.5, out + 0.05, 0x6e7072);
  b.part();
  b.quad([u, y, 0.14], [u, y, out], [u, y + 0.4, out], [u, y + 0.4, 0.14], 0xffffff, [-1, 0, 0], shopUv(signOf(kind, f.rng.next())));
  b.box(u, y - 0.02, 0.12, u + 0.04, y, out + 0.02, 0x8c8e8c);
}

/** The first-floor tenants' businesses for a frontage this wide, left to right. */
export function chooseTenants(width: number, rng: Rng): ShopKind[] {
  const count = Math.max(1, Math.round(width / rng.range(5.2, 8.5)));
  return Array.from({ length: count }, () => rng.pick(UPPER_KINDS));
}

/**
 * A commercial first floor. A coaching centre or diagnostic shows a wall of tinted glass, a banner
 * in vinyl across the spandrel and a board along the top, and its air conditioners on brackets.
 */
export function upperShops(b: Batch, f: Frontage, baseY: number, floor: number, tenants: readonly ShopKind[]): void {
  const { width, trim, lod, rng } = f;
  if (lod >= 2) return;
  const bay = width / tenants.length;
  // A concrete sunshade between the two floors of business.
  b.part();
  b.box(-0.04, baseY - 0.02, 0, width + 0.04, baseY + 0.12, 0.5, trim);
  tenants.forEach((kind, i) => {
    const u0 = i * bay + 0.1;
    const u1 = (i + 1) * bay - 0.1;
    const signY = baseY + floor - 0.82;
    const glassBottom = baseY + 0.72;
    b.part();
    b.box(i * bay - 0.08, baseY + 0.12, 0, i * bay + 0.08, baseY + floor, 0.14, trim);
    // Tinted glazing in aluminium, with its transom.
    b.part();
    b.panel(u0, glassBottom, u1, signY - 0.04, 0.02, rng.chance(0.5) ? 0x7f8e92 : 0x6e7c80);
    if (lod === 0) {
      b.part();
      const panes = Math.max(2, Math.round((u1 - u0) / 1.15));
      for (let p = 0; p <= panes; p++) {
        const u = u0 + ((u1 - u0) * p) / panes;
        b.box(u - 0.03, glassBottom, 0.02, u + 0.03, signY - 0.04, 0.06, 0xbfc2c0);
      }
      b.box(u0, glassBottom + 0.72, 0.02, u1, glassBottom + 0.77, 0.06, 0xbfc2c0);
      // Shop posters stuck inside the glass.
      const posters = rng.int(0, 3);
      for (let k = 0; k < posters; k++) {
        const u = rng.range(u0 + 0.1, u1 - 0.55);
        b.part();
        b.panel(u, glassBottom + 0.1, u + 0.42, glassBottom + 0.66, 0.025, 0xffffff, posterUv(rng.int(0, 5)));
      }
    }
    // The big vinyl across the spandrel, and the name board over the glass.
    b.part();
    b.panel(u0, baseY + 0.14, u1, glassBottom - 0.02, 0.02, 0xffffff, shopUv(signOf(kind, rng.next())));
    fasciaSign(b, u0 - 0.04, u1 + 0.04, signY, baseY + floor - 0.08, kind, f);
    if (lod > 0) return;
    if (rng.chance(0.65)) {
      // A split air-conditioner on the ledge, its pipe taped up the wall.
      const u = rng.range(u0 + 0.2, u1 - 1);
      b.part();
      b.box(u, baseY + 0.12, 0.08, u + 0.82, baseY + 0.68, 0.42, 0xe6e4da);
      b.part();
      b.cylinder(u + 0.33, baseY + 0.4, 0.42, 0.2, 0.2, 0.002, 0x7c7e7c, 10);
      b.bar([u + 0.76, baseY + 0.68, 0.14], [u + 0.76, signY, 0.04], 0.018, 0.018, 0xc4c4bc, 4);
    }
    if (rng.chance(0.3)) bladeSign(b, (i + 1) * bay - 0.02, baseY + 1.1, kind, f);
  });
}
