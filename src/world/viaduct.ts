import { Surface, type Batch, type Vec3 } from "../geometry";
import { concrete, city } from "../shared/palette";
import { pierPlateUv, posterUv } from "../signs/regions";
import { CHUNK_LENGTH, DECK_HALF, DECK_Y, RAIL_Y, SPAN, TRACK_Z, latticeIn, localX, type Context } from "./layout";

const SEGMENT = 3;
const PIER_TOP = RAIL_Y - 4.4;
const GIRDER_BOTTOM = RAIL_Y - 2.9;

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

/** A steel handrail on the near parapet: the crisp line the reference's deck is known by. */
function handrail(b: Batch, context: Context): void {
  const z = DECK_HALF - 0.06;
  const y0 = DECK_Y + 0.86;
  const steel = 0x8d918f;
  for (const distance of latticeIn(context, 2.4)) {
    const x = localX(context, distance);
    b.part();
    b.box(x - 0.025, y0, z - 0.025, x + 0.025, y0 + 1.02, z + 0.025, steel);
  }
  b.part();
  b.box(-CHUNK_LENGTH, y0 + 1, z - 0.03, 0, y0 + 1.05, z + 0.03, 0xa6aaa8);
  b.box(-CHUNK_LENGTH, y0 + 0.55, z - 0.016, 0, y0 + 0.58, z + 0.016, steel);
  b.box(-CHUNK_LENGTH, y0 + 0.24, z - 0.016, 0, y0 + 0.27, z + 0.016, steel);
}

/** Bolted plates and junction boxes along the girder face, every few metres. */
function girderFittings(b: Batch, context: Context): void {
  const z = DECK_HALF + 0.02;
  const top = DECK_Y - 0.1;
  for (const distance of latticeIn(context, 6)) {
    const x = localX(context, distance);
    b.part();
    b.box(x - 0.24, top - 0.42, z - 0.02, x + 0.24, top - 0.05, z + 0.2, 0xdedbd0);
    b.part();
    b.box(x - 0.16, top - 0.34, z + 0.2, x + 0.16, top - 0.13, z + 0.205, 0xc2bfb4);
  }
  for (const distance of latticeIn(context, 1.5, 0.75)) {
    const x = localX(context, distance);
    b.part();
    b.box(x - 0.035, top - 0.3, z, x + 0.035, top - 0.23, z + 0.012, 0x7e7f7b);
  }
}

function parapet(b: Batch, x0: number, x1: number, z: number, outward: number): void {
  const y0 = DECK_Y;
  const y1 = DECK_Y + 1.05;
  const inner = z - outward * 0.22;
  // A precast upstand, one panel to a girder segment, with a drip groove along its face.
  b.part();
  b.box(x0, y0, Math.min(z, inner), x1, y1, Math.max(z, inner), concrete.deck);
  b.box(x0, y1, Math.min(z, inner) - 0.02, x1, y1 + 0.05, Math.max(z, inner) + 0.02, 0xdcd7cb);
  b.part();
  b.quad([x0, y0 + 0.02, Math.max(z, inner) + 0.003], [x1, y0 + 0.02, Math.max(z, inner) + 0.003], [x1, y0 + 0.05, Math.max(z, inner) + 0.003], [x0, y0 + 0.05, Math.max(z, inner) + 0.003], 0xb4afa3, [0, 0, 1]);
}

/** Things on the deck: lidded cable troughs, trackside boxes, and the drain at each span. */
function deckFittings(b: Batch, context: Context): void {
  // Trough lids, one every metre and a half, along both walkways.
  for (const z of [3.8, -3.8]) {
    for (const distance of latticeIn(context, 1.5)) {
      const x = localX(context, distance);
      b.part();
      b.box(x - 1.49, DECK_Y + 0.2, z - 0.28, x - 0.01, DECK_Y + 0.225, z + 0.28, 0xc9c5b9);
    }
  }
  // A trackside equipment box and its cable, every other span.
  for (const distance of latticeIn(context, SPAN * 2, 7)) {
    const x = localX(context, distance);
    b.part();
    b.box(x - 0.4, DECK_Y + 0.225, 3.56, x + 0.4, DECK_Y + 0.95, 4.04, 0xa4a8a6);
    b.part();
    b.box(x - 0.36, DECK_Y + 0.28, 4.04, x + 0.36, DECK_Y + 0.9, 4.05, 0xb6bab8);
    b.box(x + 0.25, DECK_Y + 0.55, 4.05, x + 0.3, DECK_Y + 0.65, 4.07, 0x4c4f52);
  }
  // Scuppers through the parapet's foot, feeding the downpipe on each pier.
  for (const distance of latticeIn(context, SPAN)) {
    const x = localX(context, distance);
    b.part();
    b.box(x - 0.1, DECK_Y - 0.02, DECK_HALF - 0.42, x + 0.1, DECK_Y + 0.008, DECK_HALF - 0.24, 0x55575a);
  }
}

/** Must match RIB in the fluted surface's shader: 90 ribs to a span puts one on every pier's centre line. */
const FLUTE_PITCH = SPAN / 90;

function pier(b: Batch, x: number, number: number): void {
  const w = 1.75;
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
  // The ribbed band each real pier carries on its faces. The ribs are drawn by the shader, because
  // modelled ones come out thinner than a pixel at the default view, and shimmer as the city slides.
  const panelTop = PIER_TOP - 3.1;
  const band = FLUTE_PITCH * 4;
  const proud = 0.01;
  b.as(Surface.fluted, () => {
    b.quad([x - band, 1, w + proud], [x + band, 1, w + proud], [x + band, panelTop, w + proud], [x - band, panelTop, w + proud], shaftColor, [0, 0, 1]);
    b.quad([x - w - proud, 1, -band], [x - w - proud, 1, band], [x - w - proud, panelTop, band], [x - w - proud, panelTop, -band], shaftColor, [-1, 0, 0]);
  });
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
  b.at(x - 0.34, panelTop + 0.12, w + 0.002, () => {
    b.panel(0, 0, 0.68, 0.25, 0.02, 0xffffff, pierPlateUv(number));
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

function trackRun(b: Batch, x0: number, x1: number, z: number, context: Context): void {
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
  const MAST = SPAN * 2;
  const steel = 0x8b9396;
  const dark = 0x4f5356;
  const wireTop = RAIL_Y + 6.3;
  const contact = RAIL_Y + 5.25;
  for (const distance of latticeIn(context, MAST)) {
    const x = localX(context, distance);
    for (const side of [1, -1]) {
      const z = side * (DECK_HALF - 0.32);
      const track = side * TRACK_Z;
      // The base plate, bolted through the parapet.
      b.part();
      b.block(x, DECK_Y + 1.05, z, 0.46, 0.05, 0.46, 0x7c8285);
      b.part();
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]] as const) b.block(x + dx, DECK_Y + 1.1, z + dz, 0.05, 0.03, 0.05, 0x4c4f52);
      // A steel tube mast whose head curves over towards the track, as along the real line.
      const shoulder = wireTop - 0.5;
      const reach = (track - z) * 0.5;
      const swan: Vec3[] = [[x, DECK_Y + 1.1, z], [x, shoulder, z]];
      for (let i = 1; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        swan.push([x, shoulder + Math.sin(a) * 0.72, z + (1 - Math.cos(a)) * reach]);
      }
      b.part();
      b.cable(swan, 0.085, steel, 8);
      const head = swan[swan.length - 1]!;
      // The stay tube out from the swan-neck to the wire, with its string of insulators.
      const hanger: Vec3 = [x, wireTop + 0.18, track];
      b.part();
      b.bar(head, hanger, 0.035, 0.03, steel, 5);
      b.bar([x, shoulder - 0.7, z], [x, contact + 0.18, track - side * 0.34], 0.03, 0.028, steel, 5);
      b.part();
      for (let i = 0; i < 4; i++) {
        const t = 0.32 + i * 0.09;
        const px = head[0];
        const py = head[1] + (hanger[1] - head[1]) * t;
        const pz = head[2] + (hanger[2] - head[2]) * t;
        b.ellipsoid(px, py, pz, 0.075, 0.075, 0.03, 0x5f6f66, 3, 7);
      }
      // The steady arm that holds the contact wire, and its clamp.
      b.part();
      b.bar([x, contact + 0.18, track - side * 0.34], [x, contact + 0.02, track], 0.016, 0.014, dark, 4);
      b.bar(hanger, [x, contact + 0.18, track - side * 0.34], 0.012, 0.012, dark, 3);
      b.block(x, contact - 0.02, track, 0.1, 0.06, 0.16, dark);
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
      const phase = (distance / MAST) % 1;
      const t = phase < 0 ? phase + 1 : phase;
      const y = wireTop + 0.2 - 4 * t * (1 - t) * 0.8;
      const here: Vec3 = [x, y, z];
      if (previous) b.bar(previous, here, 0.014, 0.014, dark, 3);
      previous = here;
    }
    for (const distance of latticeIn(context, 5)) {
      const x = localX(context, distance);
      const phase = (distance / MAST) % 1;
      const t = phase < 0 ? phase + 1 : phase;
      const y = wireTop + 0.2 - 4 * t * (1 - t) * 0.8;
      b.bar([x, contact, z], [x, y, z], 0.008, 0.008, dark, 3);
    }
  }
}

/** The plain line between stations: girder, parapets, double track, overhead wires and piers. */
export function buildViaduct(b: Batch, context: Context): void {
  b.as(Surface.concrete, () => {
    for (const distance of latticeIn(context, SPAN)) {
      pier(b, localX(context, distance), Math.round(distance / SPAN));
    }
    for (const distance of latticeIn(context, SEGMENT)) {
      const x1 = localX(context, distance);
      const x0 = Math.max(x1 - SEGMENT, -CHUNK_LENGTH);
      girderSegment(b, x0, Math.min(x1, 0));
      parapet(b, x0, Math.min(x1, 0), DECK_HALF, 1);
    }
  });
  const x0 = -CHUNK_LENGTH;
  const x1 = 0;
  {
    b.part();
    b.as(Surface.concrete, () => b.box(x0, DECK_Y - 0.04, -DECK_HALF, x1, DECK_Y, DECK_HALF, 0xb4afa3));
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
  overhead(b, context);
  handrail(b, context);
  girderFittings(b, context);
  deckFittings(b, context);
}
