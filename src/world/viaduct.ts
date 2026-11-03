import type { Batch, Vec3 } from "../geometry";
import { concrete, city } from "../shared/palette";
import { posterUv } from "../signs/regions";
import { CHUNK_LENGTH, DECK_HALF, DECK_Y, RAIL_Y, SPAN, TRACK_Z, latticeIn, localX, type Context } from "./layout";

const SEGMENT = 3;
const PIER_TOP = 10.6;
const GIRDER_BOTTOM = 12.1;

/** One precast box-girder segment, seen from outside: its web sloping in under the deck. */
function girderSegment(b: Batch, x0: number, x1: number): void {
  b.part();
  const flange = DECK_HALF - 0.1;
  const soffit = 2.1;
  const top = DECK_Y - 0.55;
  const near = (y: number, z: number): [Vec3, Vec3] => [[x0, y, z], [x1, y, z]];
  const [a0, a1] = near(top, flange);
  const [b0, b1] = near(top - 0.26, flange);
  const [c0, c1] = near(top - 0.62, soffit + 1.25);
  const [d0, d1] = near(GIRDER_BOTTOM, soffit);
  b.quad(b0, b1, a1, a0, concrete.deck, [0, 0, 1]);
  b.quad(c0, c1, b1, b0, concrete.web, [0, -0.5, 0.8]);
  b.quad(d0, d1, c1, c0, concrete.web, [0, -0.35, 0.9]);
  b.quad(a0, a1, [x1, DECK_Y, flange], [x0, DECK_Y, flange], concrete.deck, [0, 0, 1]);
}

function parapet(b: Batch, x0: number, x1: number, z: number, outward: number): void {
  const y0 = DECK_Y;
  const y1 = DECK_Y + 1.05;
  const inner = z - outward * 0.22;
  b.part();
  b.box(x0, y0, Math.min(z, inner), x1, y1, Math.max(z, inner), concrete.deck);
  b.box(x0, y1, Math.min(z, inner) - 0.02, x1, y1 + 0.05, Math.max(z, inner) + 0.02, 0xdcd7cb);
}

function pier(b: Batch, x: number, number: number): void {
  const w = 1.55;
  const shaftColor = concrete.pier;
  b.part();
  b.block(x, 0, 0, w * 2.3, 0.28, w * 2.3, 0xb7b1a2);
  b.part();
  // A rounded shaft, chamfered, with the fluted panel Line 6's piers carry on each face.
  const r = w * 0.34;
  const outline: Array<[number, number]> = [
    [x - w + r, -w], [x + w - r, -w], [x + w, -w + r], [x + w, w - r],
    [x + w - r, w], [x - w + r, w], [x - w, w - r], [x - w, -w + r],
  ];
  b.prism(outline, 0.28, PIER_TOP - 2.7, shaftColor);
  b.part();
  for (let i = 0; i < 6; i++) {
    const u = -0.75 + i * 0.3;
    b.box(x + u - 0.05, 2.4, w, x + u + 0.05, PIER_TOP - 3.1, w + 0.05, concrete.stain);
    b.box(x - w - 0.05, 2.4, u - 0.05, x - w, PIER_TOP - 3.1, u + 0.05, concrete.stain);
  }
  // Flared head under the deck: octagon widening towards the bearing shelf.
  b.part();
  const levels: Array<[number, number, number]> = [
    [PIER_TOP - 2.7, w, w],
    [PIER_TOP - 1.7, w * 1.03, w * 1.2],
    [PIER_TOP - 0.8, w * 1.08, w * 1.62],
    [PIER_TOP, w * 1.12, w * 2.1],
  ];
  for (let i = 0; i + 1 < levels.length; i++) {
    const [y0, wx0, wz0] = levels[i]!;
    const [y1, wx1, wz1] = levels[i + 1]!;
    b.quad([x - wx0, y0, wz0], [x + wx0, y0, wz0], [x + wx1, y1, wz1], [x - wx1, y1, wz1], shaftColor, [0, -0.2, 1]);
    b.quad([x - wx0, y0, -wz0], [x - wx0, y0, wz0], [x - wx1, y1, wz1], [x - wx1, y1, -wz1], shaftColor, [-1, 0, 0]);
  }
  const [, topX, topZ] = levels[levels.length - 1]!;
  b.part();
  b.box(x - topX, PIER_TOP, -topZ, x + topX, PIER_TOP + 0.22, topZ, 0xb7b1a2);
  // Bearing pads carrying the girder.
  b.part();
  b.block(x - 0.5, PIER_TOP + 0.22, 1.5, 0.7, 0.2, 0.7, 0x4f4f4c);
  b.block(x + 0.5, PIER_TOP + 0.22, 1.5, 0.7, 0.2, 0.7, 0x4f4f4c);
  b.part();
  // Girder ends sit on a stub that fills the gap up to the soffit.
  b.box(x - 1.3, PIER_TOP + 0.42, -2.1, x + 1.3, GIRDER_BOTTOM, 2.1, concrete.web);
  // Pier number plate, as stencilled on every real pier.
  b.part();
  b.at(x - 0.32, 3.2, w + 0.05, () => {
    b.box(0, 0, 0, 0.64, 0.26, 0.02, 0xf1efe6);
    b.box(0.08, 0.07, 0.02, 0.56, 0.11, 0.024, 0x34383a);
    b.box(0.08, 0.15, 0.02, 0.42, 0.19, 0.024, 0x34383a);
  });
  // Every pier in Dhaka wears posters.
  for (let i = 0; i < posterCount(number); i++) {
    const poster = (number * 7 + i * 3) % 6;
    const px = -w + 0.3 + ((number * 13 + i * 5) % 19) / 19 * (w * 2 - 1.1);
    const py = 0.75 + ((number + i * 7) % 9) * 0.16;
    b.part();
    b.quad([x + px, py, w + 0.015], [x + px + 0.42, py, w + 0.015], [x + px + 0.42, py + 0.56, w + 0.015], [x + px, py + 0.56, w + 0.015], 0xffffff, [0, 0, 1], posterUv(poster));
  }
  // Rainwater downpipe clamped to the near face.
  b.part();
  const pipeZ = w + 0.14;
  b.bar([x + w - 0.3, 0.3, pipeZ], [x + w - 0.3, PIER_TOP - 2.4, pipeZ], 0.075, 0.075, 0x8d8f8a, 6);
  for (let y = 1.2; y < PIER_TOP - 2.5; y += 1.6) {
    b.part();
    b.box(x + w - 0.42, y, w, x + w - 0.18, y + 0.09, w + 0.24, 0x74767a);
  }
}

const posterCount = (number: number): number => 2 + (number % 4);

export function trackRun(b: Batch, x0: number, x1: number, z: number, context: Context): void {
  const gauge = 1.435 / 2;
  // Ballastless track: plinth on the deck, with fastened rails on it.
  b.part();
  b.box(x0, DECK_Y, z - 1.25, x1, DECK_Y + 0.22, z + 1.25, 0xa8a59c);
  // Sleeper blocks every 0.75 m, in world position so they line up across chunks.
  for (const distance of latticeIn(context, 0.75)) {
    const x = localX(context, distance);
    if (x < x0 || x > x1) continue;
    b.part();
    b.box(x - 0.15, DECK_Y + 0.22, z - 1.02, x + 0.15, DECK_Y + 0.32, z + 1.02, 0xd9d6cc);
    b.box(x - 0.05, DECK_Y + 0.32, z + gauge - 0.14, x + 0.05, DECK_Y + 0.37, z + gauge + 0.14, 0x3c3f42);
    b.box(x - 0.05, DECK_Y + 0.32, z - gauge - 0.14, x + 0.05, DECK_Y + 0.37, z - gauge + 0.14, 0x3c3f42);
  }
  b.part();
  for (const side of [-1, 1]) {
    const rail = z + side * gauge;
    b.box(x0, DECK_Y + 0.37, rail - 0.04, x1, RAIL_Y - 0.08, rail + 0.04, 0x5c5f62);
    b.box(x0, RAIL_Y - 0.08, rail - 0.045, x1, RAIL_Y, rail + 0.045, 0x7f8589);
  }
}

/** Overhead line: masts on both parapets, cantilever arms, messenger and contact wires. */
function overhead(b: Batch, context: Context): void {
  const MAST = SPAN;
  const steel = 0x8b9396;
  const dark = 0x3b3f41;
  const wireTop = RAIL_Y + 5.7;
  const contact = RAIL_Y + 4.65;
  for (const distance of latticeIn(context, MAST, 15)) {
    const x = localX(context, distance);
    for (const side of [1, -1]) {
      const z = side * (DECK_HALF - 0.32);
      const track = side * TRACK_Z;
      b.part();
      b.block(x, DECK_Y + 1.05, z, 0.42, 0.14, 0.42, 0x7c8285);
      b.part();
      b.bar([x, DECK_Y + 1.15, z], [x, RAIL_Y + 6.3, z], 0.095, 0.08, steel, 8);
      b.part();
      // Curved-top cantilever and the stay that holds its tip.
      b.bar([x, wireTop + 0.28, z], [x, wireTop + 0.28, track], 0.04, 0.04, steel, 5);
      b.bar([x, contact + 0.26, z], [x, wireTop + 0.22, track], 0.035, 0.035, steel, 5);
      b.part();
      b.bar([x, contact + 0.05, track - side * 0.3], [x, wireTop + 0.24, track], 0.022, 0.022, dark, 4);
      b.block(x, contact + 0.03, track, 0.09, 0.09, 0.3, dark);
      // Insulators.
      b.part();
      b.bar([x, wireTop + 0.28, z - side * 0.18], [x, wireTop + 0.28, z - side * 0.55], 0.07, 0.07, 0x5f7c66, 6);
    }
  }
  for (const side of [1, -1]) {
    const z = side * TRACK_Z;
    b.part();
    b.box(-CHUNK_LENGTH, contact - 0.02, z - 0.015, 0, contact + 0.02, z + 0.015, dark);
    // Messenger wire sags between masts; droppers tie it to the contact wire.
    let previous: Vec3 | null = null;
    for (let i = 0; i <= 24; i++) {
      const x = -(i / 24) * CHUNK_LENGTH;
      const distance = context.start - x;
      const phase = ((distance - 15) / MAST) % 1;
      const t = phase < 0 ? phase + 1 : phase;
      const y = wireTop + 0.2 - 4 * t * (1 - t) * 0.8;
      const here: Vec3 = [x, y, z];
      if (previous) b.bar(previous, here, 0.014, 0.014, dark, 3);
      previous = here;
    }
    for (const distance of latticeIn(context, 5)) {
      const x = localX(context, distance);
      const phase = ((distance - 15) / MAST) % 1;
      const t = phase < 0 ? phase + 1 : phase;
      const y = wireTop + 0.2 - 4 * t * (1 - t) * 0.8;
      b.bar([x, contact, z], [x, y, z], 0.008, 0.008, dark, 3);
    }
  }
}

/** The plain line between stations: girder, parapets, double track, overhead wires and piers. */
export function buildViaduct(b: Batch, context: Context, skip: (x: number) => boolean): void {
  for (const distance of latticeIn(context, SPAN)) {
    const x = localX(context, distance);
    if (!skip(x)) pier(b, x, Math.round(distance / SPAN));
  }
  for (const distance of latticeIn(context, SEGMENT)) {
    const x1 = localX(context, distance);
    const x0 = Math.max(x1 - SEGMENT, -CHUNK_LENGTH);
    if (skip((x0 + x1) / 2)) continue;
    girderSegment(b, x0, Math.min(x1, 0));
    parapet(b, x0, Math.min(x1, 0), DECK_HALF, 1);
  }
  const segments = stretches(skip);
  for (const [x0, x1] of segments) {
    b.part();
    b.box(x0, DECK_Y - 0.04, -DECK_HALF, x1, DECK_Y, DECK_HALF, 0xb4afa3);
    // Cable troughs along the walkways.
    b.part();
    b.box(x0, DECK_Y, 3.5, x1, DECK_Y + 0.2, 4.1, 0xbdb8ac);
    b.box(x0, DECK_Y, -4.1, x1, DECK_Y + 0.2, -3.5, 0xbdb8ac);
    parapet(b, x0, x1, -DECK_HALF + 0.22, 1);
    trackRun(b, x0, x1, TRACK_Z, context);
    trackRun(b, x0, x1, -TRACK_Z, context);
    // A cable conduit clipped under the near deck edge.
    b.part();
    b.box(x0, DECK_Y - 0.92, DECK_HALF - 0.05, x1, DECK_Y - 0.78, DECK_HALF + 0.06, city.iron);
  }
  if (segments.length) overhead(b, context);
}

function stretches(skip: (x: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (let x = -CHUNK_LENGTH; x <= 0; x += 1) {
    const open = !skip(x);
    if (open && start === null) start = x;
    if (!open && start !== null) {
      out.push([start, x]);
      start = null;
    }
  }
  if (start !== null) out.push([start, 0]);
  return out;
}
