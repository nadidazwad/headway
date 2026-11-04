// Clothes built around the Rocketbox skeleton, fresh for every pose, so they follow it through
// sitting, standing, holding a strap and walking with no skinning to get wrong. Each piece is a loft
// of rings with the same topology in every pose: the bake stores one index list and many positions.
import { Quaternion, Vector3 } from "three";

const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const lerp = (a, b, t) => a.clone().lerp(b, t);
const sub = (a, b) => a.clone().sub(b);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** How much cloth each level of detail can afford. */
const DETAIL = {
  hi: { seg: 14, arm: 8, leg: 9, rows: 1, ribbon: 3, face: true, fold: true, mitten: 0 },
  lo: { seg: 8, arm: 5, leg: 6, rows: 0.5, ribbon: 1, face: true, fold: false, mitten: 5 },
  far: { seg: 5, arm: 3, leg: 4, rows: 0.25, ribbon: 0, face: false, fold: false, mitten: 4 },
};

/** Everything a garment needs to know about the current pose, in the avatar's raw units. */
export function readSkeleton(bones, metre, headRest) {
  const p = (bone) => bone.getWorldPosition(V());
  const s = {
    metre,
    pelvis: p(bones.pelvis),
    spine: p(bones.spine),
    spine1: p(bones.spine1),
    spine2: p(bones.spine2),
    neck: p(bones.neck),
    head: p(bones.head),
    eyes: lerp(p(bones.leye), p(bones.reye), 0.5),
    claL: p(bones.claL),
    claR: p(bones.claR),
    upL: p(bones.upL),
    upR: p(bones.upR),
    foreL: p(bones.foreL),
    foreR: p(bones.foreR),
    handL: p(bones.handL),
    handR: p(bones.handR),
    thighL: p(bones.thighL),
    thighR: p(bones.thighR),
    calfL: p(bones.calfL),
    calfR: p(bones.calfR),
    footL: p(bones.footL),
    footR: p(bones.footR),
  };
  s.up = sub(s.neck, s.pelvis).normalize();
  s.side = sub(s.upL, s.upR);
  s.side.addScaledVector(s.up, -s.side.dot(s.up)).normalize();
  s.fwd = V().crossVectors(s.side, s.up).normalize();
  s.sw = s.upL.distanceTo(s.upR) / 2;
  s.hipSide = sub(s.thighL, s.thighR).normalize();
  // The head turns on its own: its axes come from how far it has rotated since the rest pose.
  const turn = bones.head.getWorldQuaternion(new Quaternion()).multiply(headRest.clone().invert());
  s.headUp = V(0, 1, 0).applyQuaternion(turn);
  s.headFwd = V(0, 0, 1).applyQuaternion(turn);
  s.headSide = V().crossVectors(s.headUp, s.headFwd).normalize();
  return s;
}

const armPath = (s, side) => (side > 0 ? [s.upL, s.foreL, s.handL] : [s.upR, s.foreR, s.handR]);
const legPath = (s, side) => (side > 0 ? [s.thighL, s.calfL, s.footL] : [s.thighR, s.calfR, s.footR]);

/** A point along a chain of bones, t from 0 to 1 by length. */
function along(chain, t) {
  const a = chain[0].distanceTo(chain[1]);
  const b = chain[1].distanceTo(chain[2]);
  const d = t * (a + b);
  if (d <= a) return lerp(chain[0], chain[1], d / a);
  return lerp(chain[1], chain[2], clamp((d - a) / b, 0, 1));
}

/** Records index data the first time it runs, and only positions after that. */
class Cloth {
  constructor() {
    this.positions = [];
    this.greys = [];
    this.parts = [];
    this.indices = [];
    this.recording = true;
    this.nextPart = 3;
  }

  start() {
    this.positions.length = 0;
    this.nextPart = 3;
  }

  stop() {
    this.recording = false;
  }

  /** A skin of `rings`, each the same length. `closed` joins each ring's end to its start. */
  loft(rings, { grey, skip, closed = true, centre, part }) {
    const first = this.positions.length / 3;
    const rows = rings.length;
    const columns = rings[0].length;
    const partId = part ?? this.nextPart++;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const q = rings[i][j];
        this.positions.push(q.x, q.y, q.z);
        if (this.recording) {
          this.greys.push(Math.round(typeof grey === "function" ? grey(i, j) : grey));
          this.parts.push(partId);
        }
      }
    }
    if (!this.recording) return;
    // Which way round: the side of the skin facing away from its own middle is the outside.
    const mid = rings[Math.floor(rows / 2)];
    const m0 = mid[0];
    const m1 = mid[1 % columns];
    const below = rings[Math.min(rows - 1, Math.floor(rows / 2) + 1)][0];
    const above = rings[Math.max(0, Math.floor(rows / 2) - 1)][0];
    const across = sub(m1, m0);
    const downward = sub(below, above);
    const normal = V().crossVectors(across, downward);
    const middle = centre ?? mid.reduce((sum, q) => sum.add(q), V()).multiplyScalar(1 / columns);
    const outward = normal.dot(sub(m0, middle)) > 0;
    const span = closed ? columns : columns - 1;
    for (let i = 0; i + 1 < rows; i++) {
      for (let j = 0; j < span; j++) {
        if (skip?.(i, j)) continue;
        const a = first + i * columns + j;
        const b = first + i * columns + (j + 1) % columns;
        const c = first + (i + 1) * columns + j;
        const d = first + (i + 1) * columns + (j + 1) % columns;
        if (outward) this.indices.push(a, b, c, b, d, c);
        else this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  /** A small solid, held at a point when `visible` is false so its topology never changes. */
  box(centre, ax, ay, az, grey, visible) {
    // Always full size while the topology is recorded, since that is when its winding is decided.
    const scale = visible || this.recording ? 1 : 0;
    const corner = (x, y, z) => centre.clone().addScaledVector(ax, x * scale).addScaledVector(ay, y * scale).addScaledVector(az, z * scale);
    const rows = [
      [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)],
      [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
    ];
    this.loft(rows, { grey, centre });
  }
}

const ringAt = (c, side, fwd, a, b, seg, phase = 0, bulge = null) => {
  const out = [];
  for (let j = 0; j < seg; j++) {
    const th = phase + (j / seg) * Math.PI * 2;
    const scale = bulge ? bulge(th) : 1;
    out.push(c.clone().addScaledVector(side, Math.cos(th) * a * scale).addScaledVector(fwd, Math.sin(th) * b * scale));
  }
  return out;
};

/** Rings down a chain of joints, kept from twisting by carrying each ring's axis on to the next. */
function tubeRings(chain, t0, t1, rows, seg, radius, ref, roundStart = 0) {
  const rings = [];
  let n1 = ref.clone();
  if (roundStart > 0) {
    // A rounded end, so a shoulder is a shoulder rather than the open mouth of a pipe.
    const tangent = sub(along(chain, t0 + 0.04), along(chain, t0)).normalize();
    n1.addScaledVector(tangent, -n1.dot(tangent)).normalize();
    const n2 = V().crossVectors(tangent, n1);
    const start = along(chain, t0);
    const r = radius(t0);
    rings.push(ringAt(start.clone().addScaledVector(tangent, -roundStart * 1.25), n1, n2, r * 0.2, r * 0.2, seg));
    rings.push(ringAt(start.clone().addScaledVector(tangent, -roundStart * 0.7), n1, n2, r * 0.82, r * 0.82, seg));
  }
  for (let i = 0; i <= rows; i++) {
    const t = t0 + ((t1 - t0) * i) / rows;
    const at = along(chain, t);
    const ahead = along(chain, Math.min(1, t + 0.04));
    const back = along(chain, Math.max(0, t - 0.04));
    const tangent = sub(ahead, back).normalize();
    n1.addScaledVector(tangent, -n1.dot(tangent));
    if (n1.lengthSq() < 1e-6) n1 = V(1, 0, 0).addScaledVector(tangent, -tangent.x);
    n1.normalize();
    const n2 = V().crossVectors(tangent, n1);
    rings.push(ringAt(at, n1, n2, radius(t), radius(t), seg));
  }
  return rings;
}

/**
 * A skirt. Each ring is the outline round both legs at one height of them, so it drops straight
 * from the hip when standing, lies over the lap when sitting, and swings with a stride.
 */
function skirtRings(s, { t0, t1, rows, seg, radius, swing = 0.82, fold = null, liftHem = null }) {
  const left = legPath(s, 1);
  const right = legPath(s, -1);
  const legLength = left[0].distanceTo(left[1]) + left[1].distanceTo(left[2]);
  const point = (chain, t) => (t >= 0 ? along(chain, t) : chain[0].clone().addScaledVector(s.up, -t * legLength));
  const rings = [];
  for (let i = 0; i <= rows; i++) {
    const t = t0 + ((t1 - t0) * i) / rows;
    const near = Math.max(t, 0);
    const L = point(left, t);
    const R = point(right, t);
    const mid = lerp(L, R, 0.5);
    const tangent = sub(lerp(point(left, near + 0.05), point(right, near + 0.05), 0.5), lerp(point(left, Math.max(near - 0.05, 0)), point(right, Math.max(near - 0.05, 0)), 0.5));
    if (tangent.lengthSq() < 1e-6) tangent.copy(s.up).negate();
    tangent.normalize();
    // Above the hip the skirt closes round the body rather than round two separate legs.
    const close = t < 0 ? smooth(0, -0.1, t) * 0.6 : 0;
    const half = sub(L, R).multiplyScalar(0.5 * swing * (1 - close) * (0.74 + 0.26 * smooth(-0.05, 0.16, t)));
    const halfLength = half.length();
    const halfDirection = halfLength > 1e-5 ? half.clone().multiplyScalar(1 / halfLength) : s.hipSide.clone();
    const n1 = s.hipSide.clone().addScaledVector(tangent, -s.hipSide.dot(tangent)).normalize();
    const n2 = V().crossVectors(tangent, n1).normalize();
    if (n2.dot(s.fwd) < 0 && t < 0.2) n2.negate();
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const dir = n1.clone().multiplyScalar(Math.cos(th)).addScaledVector(n2, Math.sin(th));
      const reach = clamp(dir.dot(halfDirection) * 2.4, -1, 1);
      const r = radius(t) * (0.9 + 0.1 * smooth(-0.05, 0.12, t)) * (fold ? fold(th, t) : 1);
      const q = mid.clone().addScaledVector(half, reach).addScaledVector(dir, r);
      if (liftHem && i === rows) q.addScaledVector(tangent, -liftHem(th));
      ring.push(q);
    }
    rings.push(ring);
  }
  return rings;
}

const BODICE = {
  chest: (s) => ({ c: s.spine2.clone().addScaledVector(s.up, -0.035 * s.metre), a: s.female ? 1.02 : 1.06, b: s.female ? 0.72 : 0.68, f: s.female ? 0.14 : 0.08 }),
  ribs: (s) => ({ c: lerp(s.spine1, s.spine2, 0.42), a: s.female ? 0.92 : 1.02, b: s.female ? 0.6 : 0.64, f: s.female ? 0.07 : 0.06 }),
  waist: (s) => ({ c: s.spine1, a: s.female ? 0.8 : 0.96, b: s.female ? 0.54 : 0.62, f: 0.03 }),
  belly: (s) => ({ c: lerp(s.spine, s.spine1, 0.25), a: s.female ? 0.86 : 0.94, b: 0.6, f: 0.02 }),
  hip: (s) => ({ c: lerp(s.spine, s.pelvis, 0.55), a: s.female ? 1.04 : 0.94, b: s.female ? 0.72 : 0.62, f: 0 }),
};

/** A point on the bodice's surface: `x` across in shoulder widths, front or back. */
function onBodice(s, level, x, back = false, stand = 0.03) {
  const { c, a, b, f } = BODICE[level](s);
  const depth = b * Math.sqrt(Math.max(0.04, 1 - (x / a) ** 2)) + stand;
  return c.clone().addScaledVector(s.side, x * s.sw).addScaledVector(s.fwd, (f + (back ? -depth : depth)) * s.sw);
}

/** A bodice from the collar down to the waist, or down over the hips and closed under them. */
function torsoRings(s, seg, to, _female, detail) {
  const { up, side, fwd, sw, metre } = s;
  const levels = [];
  const add = (c, a, b, forward = 0) => levels.push({ c: c.clone().addScaledVector(fwd, forward * sw), a: a * sw, b: b * sw });
  const named = (level) => {
    const { c, a, b, f } = BODICE[level](s);
    add(c, a, b, f);
  };
  const shoulders = lerp(s.claL, s.claR, 0.5);
  add(shoulders.clone().lerp(s.neck, 0.75).addScaledVector(up, 0.012 * metre), 0.36, 0.36, 0.02);
  add(shoulders.clone().lerp(s.neck, 0.18), 0.7, 0.5);
  add(lerp(s.upL, s.upR, 0.5).addScaledVector(up, -0.015 * metre), 1.04, 0.58, 0.04);
  named("chest");
  if (detail >= 1) named("ribs");
  named("waist");
  if (to === "open") {
    // Nothing closes underneath: whatever comes next carries on from this ring.
    if (detail >= 1) named("belly");
    return levels.map(({ c, a, b }) => ringAt(c, side, fwd, a, b, seg));
  }
  if (to !== "waist") {
    if (detail >= 1) named("belly");
    named("hip");
    // The seat of the garment: sat on, it is what shows above the bench.
    const { a, b } = BODICE.hip(s);
    add(s.pelvis.clone().addScaledVector(up, -0.05 * metre), a * 0.94, b * 1.02);
    add(s.pelvis.clone().addScaledVector(up, -0.12 * metre), a * 0.42, b * 0.5);
  }
  return levels.map(({ c, a, b }) => ringAt(c, side, fwd, a, b, seg));
}

/**
 * A garment cut in one piece from the shoulders down. Body and skirt are one surface: built apart
 * they cross at the hip, and two faceted surfaces crossing leave a jagged line wherever they do.
 */
function oneCloth(s, d, skirt, cloth, grey, above = null) {
  const body = torsoRings(s, d.seg, "open", false, d.rows);
  const below = skirtRings(s, { ...skirt, seg: d.seg });
  if (above !== null) {
    // Two cloths that meet: they share a ring, so the join is a clean hem and still nothing crosses.
    cloth.loft(body, { grey: above });
    cloth.loft([body[body.length - 1], ...below], { grey });
    return;
  }
  cloth.loft([...body, ...below], { grey: typeof grey === "function" ? (i, j) => grey(i - body.length, j) : grey });
}

/**
 * Hands for when real ones cannot be afforded. A simplifier left a few triangles for all those
 * fingers collapses them into spikes; a small rounded mitten off the wrist has nothing to collapse.
 */
function mittens(cloth, s, sides, skin) {
  const m = s.metre;
  for (const side of [1, -1]) {
    const [, fore, hand] = armPath(s, side);
    const reach = sub(hand, fore).normalize();
    const start = hand.clone().addScaledVector(reach, -0.01 * m);
    const palm = hand.clone().addScaledVector(reach, 0.05 * m);
    const tip = hand.clone().addScaledVector(reach, 0.11 * m);
    const width = [0.024, 0.036, 0.04, 0.03, 0.008];
    cloth.loft(tubeRings([start, palm, tip], 0, 1, width.length - 1, sides, (t) => width[Math.round(t * (width.length - 1))] * m, s.fwd), { grey: skin });
  }
}

/** A strip of cloth laid over the body along `path`, curved between its points and never twisting. */
function ribbon(cloth, s, path, widths, { grey, border = null, steps = 3 }) {
  const curve = [];
  const at = (i) => path[clamp(i, 0, path.length - 1)];
  for (let i = 0; i + 1 < path.length; i++) {
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const q = V();
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      q.addScaledVector(p0, -0.5 * t + t * t - 0.5 * t * t * t);
      q.addScaledVector(p1, 1 - 2.5 * t * t + 1.5 * t * t * t);
      q.addScaledVector(p2, 0.5 * t + 2 * t * t - 1.5 * t * t * t);
      q.addScaledVector(p3, -0.5 * t * t + 0.5 * t * t * t);
      curve.push(q);
    }
  }
  curve.push(path[path.length - 1].clone());
  // Which way across the strip is decided once, where it starts, and carried along.
  let across = null;
  const rows = curve.map((q, i) => {
    const tangent = sub(curve[Math.min(curve.length - 1, i + 1)], curve[Math.max(0, i - 1)]).normalize();
    if (!across) {
      const axis = lerp(s.pelvis, s.neck, clamp(sub(q, s.pelvis).dot(s.up) / s.pelvis.distanceTo(s.neck), 0, 1));
      across = V().crossVectors(tangent, sub(q, axis)).normalize();
    }
    across.addScaledVector(tangent, -across.dot(tangent)).normalize();
    const w = widths(i / (curve.length - 1)) * s.metre;
    return [q.clone().addScaledVector(across, -w), q.clone().addScaledVector(across, -w * 0.74), q.clone().addScaledVector(across, w * 0.74), q.clone().addScaledVector(across, w)];
  });
  cloth.loft(rows, {
    closed: false,
    centre: s.spine1,
    grey: (_, j) => (border !== null && (j === 0 || j === 3) ? border : grey),
  });
}

const interpolate = (values) => (t) => {
  const x = clamp(t, 0, 1) * (values.length - 1);
  const i = Math.min(values.length - 2, Math.floor(x));
  return values[i] + (values[i + 1] - values[i]) * (x - i);
};

const near = (s, base, sideways, forwards, upwards = 0) =>
  base.clone().addScaledVector(s.side, sideways * s.sw).addScaledVector(s.fwd, forwards * s.sw).addScaledVector(s.up, upwards * s.metre);

/** A scarf round a head and down over the shoulders, leaving the face. */
function hijab(cloth, s, { seg, rows: rowScale, face }, grey, skin, female, drape) {
  const { headUp: U, headFwd: F, headSide: S, metre: m } = s;
  const centre = s.eyes.clone().addScaledVector(U, -0.01 * m).addScaledVector(F, -0.042 * m);
  const ax = 0.094 * m;
  const ay = 0.124 * m;
  const az = 0.104 * m;
  const phase = Math.PI / 2 - Math.PI / seg;
  const rings = [];
  const angles = rowScale >= 1 ? [0.5, 28, 50, 72, 94, 112] : rowScale >= 0.5 ? [0.5, 42, 76, 110] : [0.5, 60, 110];
  for (const a of angles) {
    const phi = (a * Math.PI) / 180;
    rings.push(ringAt(centre.clone().addScaledVector(U, Math.cos(phi) * ay), S, F, Math.sin(phi) * ax, Math.sin(phi) * az, seg, phase));
  }
  const headRows = rings.length;
  // Under the chin, round the neck, then out over the shoulders and down the chest.
  const chin = lerp(s.head, s.neck, 0.45).addScaledVector(F, 0.015 * m);
  rings.push(ringAt(chin, S, F, 0.078 * m, 0.082 * m, seg, phase));
  const collar = lerp(s.claL, s.claR, 0.5).lerp(s.neck, 0.45);
  rings.push(ringAt(collar, s.side, s.fwd, 0.72 * s.sw, 0.62 * s.sw, seg, phase));
  // Standing well off the front: the bust must never come through the cape.
  const shoulder = lerp(s.upL, s.upR, 0.5).addScaledVector(s.up, -0.01 * m).addScaledVector(s.fwd, 0.16 * s.sw);
  rings.push(ringAt(shoulder, s.side, s.fwd, 1.18 * s.sw, 0.98 * s.sw, seg, phase));
  const chest = shoulder.clone().addScaledVector(s.up, -drape * m).addScaledVector(s.fwd, 0.1 * s.sw);
  const hem = ringAt(chest, s.side, s.fwd, 1.2 * s.sw, 1.16 * s.sw, seg, phase);
  // Longer at the front and back than over the arms.
  hem.forEach((q, j) => {
    const th = phase + (j / seg) * Math.PI * 2;
    q.addScaledVector(s.up, -0.05 * m * Math.sin(th) ** 2);
  });
  rings.push(hem);
  const frontColumn = (j) => {
    const th = phase + ((j + 0.5) / seg) * Math.PI * 2;
    return Math.abs(((th - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < (seg >= 8 ? 0.95 : 0.7);
  };
  const faceRows = (i) => i >= headRows - 3 && i < headRows;
  const isFace = (i, j) => faceRows(i) && frontColumn(j);
  if (face) {
    // A dark lining behind the opening, so the face has something behind its edges.
    const lining = rowScale >= 1 ? [14, 50, 86, 120, 160] : [20, 80, 160];
    const liningCentre = centre.clone().addScaledVector(F, -0.03 * m);
    const inner = lining.map((a) => {
      const phi = (a * Math.PI) / 180;
      return ringAt(liningCentre.clone().addScaledVector(U, Math.cos(phi) * ay * 0.9), S, F, Math.sin(phi) * ax * 0.84, Math.sin(phi) * 0.062 * m, seg);
    });
    cloth.loft(inner, { grey: Math.max(20, grey * 0.5), centre });
    cloth.loft(rings, { grey, skip: isFace, centre });
  } else {
    // Far away no face is modelled: the opening is simply the colour of skin.
    cloth.loft(rings, { grey: (i, j) => (isFace(Math.max(0, i), j) || isFace(i - 1, j) ? skin : grey), centre });
  }
  void female;
}

/** A tupi, the round prayer cap, fitted to the top of the head. */
function tupi(cloth, s, seg, grey) {
  const { headUp: U, headFwd: F, headSide: S, metre: m } = s;
  const centre = s.eyes.clone().addScaledVector(U, 0.046 * m).addScaledVector(F, -0.04 * m);
  const rings = [
    ringAt(centre, S, F, 0.082 * m, 0.094 * m, seg),
    ringAt(centre.clone().addScaledVector(U, 0.046 * m), S, F, 0.08 * m, 0.092 * m, seg),
    ringAt(centre.clone().addScaledVector(U, 0.058 * m), S, F, 0.05 * m, 0.058 * m, seg),
    ringAt(centre.clone().addScaledVector(U, 0.062 * m), S, F, 0.002 * m, 0.002 * m, seg),
  ];
  cloth.loft(rings, { grey, centre: centre.clone().addScaledVector(U, -0.02 * m) });
}

function sleeves(cloth, s, { arm, rows }, reachTo, grey) {
  const m = s.metre;
  const count = rows >= 1 ? 5 : rows >= 0.5 ? 3 : 2;
  for (const side of [1, -1]) {
    const radius = (t) => (0.054 - 0.022 * t) * m;
    cloth.loft(tubeRings(armPath(s, side), 0, reachTo, count, arm, radius, s.fwd, 0.02 * m), { grey });
  }
}

/** Bare forearms below a short sleeve, for a blouse or T-shirt. */
function bareArms(cloth, s, { arm, rows }, from, skin) {
  const m = s.metre;
  const count = rows >= 1 ? 4 : 2;
  for (const side of [1, -1]) {
    const radius = (t) => (0.044 - 0.016 * t) * m;
    cloth.loft(tubeRings(armPath(s, side), from - 0.02, 1, count, arm, radius, s.fwd), { grey: skin });
  }
}

function trouserLegs(cloth, s, { leg, rows }, from, radius, grey, hemGrey = null) {
  const count = rows >= 1 ? 7 : rows >= 0.5 ? 4 : 2;
  for (const side of [1, -1]) {
    cloth.loft(tubeRings(legPath(s, side), from, 1, count, leg, radius, s.fwd), {
      grey: hemGrey === null ? grey : (i) => (i === count ? hemGrey : grey),
    });
  }
}

/** Soft vertical folds, deeper towards the hem and, on a shari, gathered into pleats at the front. */
const folds = (depth, count, phase, pleats = 0) => (th, t) => {
  const down = clamp(t, 0, 1);
  const front = Math.max(0, Math.sin(th)) ** 6;
  return 1 + depth * down * Math.sin(th * count + phase) + pleats * front * Math.sin(th * 18 + phase);
};

const PIECES = {
  /** Shalwar kameez: a knee-length tunic with side slits over gathered trousers, an orna over it. */
  shalwar(cloth, s, d, o) {
    const m = s.metre;
    trouserLegs(cloth, s, d, 0.3, (t) => (t < 0.62 ? 0.088 : 0.088 - (t - 0.62) * 0.11) * m, o.lower, Math.max(10, o.lower - 26));
    sleeves(cloth, s, d, 0.84, o.upper);
    bareArms(cloth, s, d, 0.84, o.skin);
    const rows = d.rows >= 1 ? 6 : d.rows >= 0.5 ? 3 : 2;
    oneCloth(
      s,
      d,
      {
        t0: -0.05,
        t1: 0.56,
        rows,
        radius: (t) => (0.118 + 0.05 * Math.max(t, 0)) * m,
        swing: 1,
        fold: d.fold ? folds(0.09, 5, 1.2) : null,
        liftHem: (th) => 0.11 * m * Math.abs(Math.cos(th)) ** 6,
      },
      cloth,
      (i) => (i === rows ? Math.max(10, o.upper - 34) : o.upper),
    );
  },
  /** A shari: a blouse, a pleated skirt to the ankle, and the pallu across the chest and over the left shoulder. */
  shari(cloth, s, d, o) {
    const m = s.metre;
    cloth.loft(torsoRings(s, d.seg, "waist", true, d.rows), { grey: o.lower });
    // The bare midriff between blouse and skirt, under the fall of the pallu.
    const midriff = (level, scale) => {
      const { c, a, b, f } = BODICE[level](s);
      return ringAt(c.clone().addScaledVector(s.fwd, f * s.sw), s.side, s.fwd, a * scale * s.sw, b * scale * s.sw, d.seg);
    };
    cloth.loft([midriff("ribs", 0.97), midriff("waist", 0.98), midriff("belly", 0.98), midriff("hip", 0.96)], { grey: o.skin });
    sleeves(cloth, s, d, 0.2, o.lower);
    bareArms(cloth, s, d, 0.2, o.skin);
    const rows = d.rows >= 1 ? 8 : d.rows >= 0.5 ? 4 : 2;
    cloth.loft(
      skirtRings(s, {
        t0: -0.11,
        t1: 0.98,
        rows,
        seg: d.seg,
        radius: (t) => (0.118 + 0.052 * Math.max(t, 0)) * m,
        swing: 0.62,
        fold: d.fold ? folds(0.06, 4, 0.4, 0.12) : null,
      }),
      { grey: (i) => (i >= rows - (d.rows >= 1 ? 1 : 0) ? o.border : o.upper) },
    );
    if (d.ribbon) {
      // The pallu: pleated narrow over the left shoulder, wide across the chest and down the back.
      ribbon(
        cloth,
        s,
        [
          onBodice(s, "hip", -0.74, false, 0.08),
          onBodice(s, "waist", -0.36, false, 0.06),
          onBodice(s, "chest", 0.26, false, 0.05),
          near(s, s.claL, 0.16, 0.26, 0.05),
          near(s, s.claL, 0.16, -0.34, 0.035),
          onBodice(s, "chest", 0.34, true, 0.06),
          onBodice(s, "waist", 0.4, true, 0.08),
          onBodice(s, "hip", 0.42, true, 0.1),
          onBodice(s, "hip", 0.44, true, 0.14).addScaledVector(s.up, -0.3 * m),
        ],
        interpolate([0.1, 0.12, 0.09, 0.042, 0.06, 0.12, 0.15, 0.17, 0.18]),
        { grey: o.upper, border: o.border, steps: d.ribbon },
      );
    }
  },
  /** A knee-less kurta over jeans. */
  kurta(cloth, s, d, o) {
    const m = s.metre;
    trouserLegs(cloth, s, d, 0.2, (t) => (0.08 - 0.03 * t) * m, o.lower);
    sleeves(cloth, s, d, 0.72, o.upper);
    bareArms(cloth, s, d, 0.72, o.skin);
    oneCloth(
      s,
      d,
      {
        t0: -0.05,
        t1: 0.36,
        rows: d.rows >= 1 ? 4 : 2,
        radius: (t) => (0.118 + 0.03 * Math.max(t, 0)) * m,
        swing: 1,
        fold: d.fold ? folds(0.05, 4, 2) : null,
        liftHem: (th) => 0.08 * m * Math.abs(Math.cos(th)) ** 6,
      },
      cloth,
      o.upper,
    );
  },
  /** A burka: one long robe from the shoulders to the ankle, sleeves to the wrist, a scarf over it. */
  burka(cloth, s, d, o) {
    const m = s.metre;
    sleeves(cloth, s, d, 1, o.upper);
    oneCloth(
      s,
      d,
      {
        t0: -0.05,
        t1: 0.98,
        rows: d.rows >= 1 ? 7 : d.rows >= 0.5 ? 4 : 2,
        radius: (t) => (0.122 + 0.07 * Math.max(t, 0)) * m,
        swing: 0.66,
        fold: d.fold ? folds(0.06, 5, 0.8) : null,
      },
      cloth,
      o.upper,
    );
  },
  /** A panjabi: a long collared tunic to the knee, over pale trousers. */
  panjabi(cloth, s, d, o) {
    const m = s.metre;
    trouserLegs(cloth, s, d, 0.3, (t) => (0.088 - 0.028 * t) * m, o.lower);
    sleeves(cloth, s, d, 1, o.upper);
    oneCloth(
      s,
      d,
      {
        t0: -0.05,
        t1: 0.58,
        rows: d.rows >= 1 ? 5 : d.rows >= 0.5 ? 3 : 2,
        radius: (t) => (0.118 + 0.032 * Math.max(t, 0)) * m,
        swing: 1,
        fold: d.fold ? folds(0.05, 4, 1.8) : null,
        liftHem: (th) => 0.12 * m * Math.abs(Math.cos(th)) ** 6,
      },
      cloth,
      o.upper,
    );
    if (d.ribbon) {
      // The collar band and the buttoned opening down the chest.
      const collar = lerp(s.claL, s.claR, 0.5).lerp(s.neck, 0.75);
      cloth.loft([ringAt(collar.clone().addScaledVector(s.up, 0.012 * m), s.side, s.fwd, 0.37 * s.sw, 0.37 * s.sw, d.seg), ringAt(collar.clone().addScaledVector(s.up, 0.04 * m), s.side, s.fwd, 0.34 * s.sw, 0.34 * s.sw, d.seg)], { grey: Math.max(10, o.upper - 26) });
      ribbon(cloth, s, [near(s, collar, 0, 0.36, -0.005), onBodice(s, "chest", 0, false, 0.02).addScaledVector(s.up, 0.09 * m), onBodice(s, "chest", 0, false, 0.02), onBodice(s, "ribs", 0, false, 0.02)], () => 0.016, { grey: Math.max(10, o.upper - 46), steps: 1 });
    }
  },
  /** A lungi, knotted at the waist and worn nearly to the ankle, under a thin T-shirt. */
  lungi(cloth, s, d, o) {
    const m = s.metre;
    // The bare ankles it leaves showing, and more of them when it swings with a stride.
    trouserLegs(cloth, s, d, 0.74, () => 0.04 * m, o.skin);
    sleeves(cloth, s, d, 0.2, o.upper);
    bareArms(cloth, s, d, 0.2, o.skin);
    const rows = d.rows >= 1 ? 7 : d.rows >= 0.5 ? 4 : 2;
    // The shirt is worn untucked, its hem where the lungi is knotted.
    oneCloth(
      s,
      d,
      {
        t0: -0.06,
        t1: 0.92,
        rows,
        radius: (t) => (0.118 + 0.02 * Math.max(t, 0)) * m,
        swing: 0.66,
      },
      cloth,
      (i, j) => (d.rows >= 1 && (i + j) % 4 < 2 ? o.lower : Math.min(255, o.lower + 34)),
      o.upper,
    );
  },
  /** A suit: a dark jacket to the hip, a white shirt and tie in its V. */
  suit(cloth, s, d, o) {
    const m = s.metre;
    trouserLegs(cloth, s, d, 0.02, (t) => (0.082 - 0.024 * t) * m, o.lower);
    sleeves(cloth, s, d, 1, o.upper);
    oneCloth(s, d, { t0: -0.05, t1: 0.16, rows: d.rows >= 1 ? 3 : 1, radius: (t) => (0.118 + 0.02 * Math.max(t, 0)) * m, swing: 1 }, cloth, o.upper);
    if (d.ribbon) {
      const collar = lerp(s.claL, s.claR, 0.5).lerp(s.neck, 0.75);
      const shirt = [near(s, collar, 0, 0.36, -0.005), onBodice(s, "chest", 0, false, 0.02).addScaledVector(s.up, 0.1 * m), onBodice(s, "chest", 0, false, 0.02), onBodice(s, "ribs", 0, false, 0.02)];
      ribbon(cloth, s, shirt, (t) => 0.058 * (1 - t) + 0.005, { grey: 236, steps: 1 });
      ribbon(cloth, s, shirt.map((q) => q.clone().addScaledVector(s.fwd, 0.005 * m)), () => 0.012, { grey: 44, steps: 1 });
    }
  },
};

/** What someone is dressed in, for one level of detail. `build` runs once per pose. */
export function tailor(outfit, lod, skinGrey, female) {
  const detail = DETAIL[lod];
  const cloth = new Cloth();
  const options = { ...outfit, skin: skinGrey };
  return {
    cloth,
    /** False if this level draws the face into the scarf rather than modelling it. */
    keepsFace: !outfit.hijab || detail.face,
    build(skeleton, pose) {
      const s = Object.assign(Object.create(skeleton), { female });
      cloth.start();
      if (outfit.piece) PIECES[outfit.piece](cloth, s, detail, options);
      if (detail.mitten) mittens(cloth, s, detail.mitten, skinGrey);
      if (outfit.hijab) hijab(cloth, s, detail, outfit.scarf, skinGrey, female, outfit.drape ?? 0.09);
      if (outfit.cap) tupi(cloth, s, detail.seg, outfit.cap);
      if (outfit.orna && detail.ribbon) {
        // An orna: across the chest in a shallow U, its two ends thrown back over the shoulders.
        ribbon(
          cloth,
          s,
          [
            onBodice(s, "waist", 0.56, true, 0.07),
            onBodice(s, "chest", 0.6, true, 0.06),
            near(s, s.claL, 0.28, -0.3, 0.04),
            near(s, s.claL, 0.28, 0.3, 0.04),
            onBodice(s, "chest", 0.46, false, 0.06),
            onBodice(s, "ribs", 0, false, 0.08),
            onBodice(s, "chest", -0.46, false, 0.06),
            near(s, s.claR, -0.28, 0.3, 0.04),
            near(s, s.claR, -0.28, -0.3, 0.04),
            onBodice(s, "chest", -0.6, true, 0.06),
            onBodice(s, "waist", -0.56, true, 0.07),
          ],
          interpolate([0.09, 0.08, 0.05, 0.05, 0.06, 0.07, 0.06, 0.05, 0.05, 0.08, 0.09]),
          { grey: outfit.orna, steps: detail.ribbon },
        );
      }
      if (lod === "hi" || lod === "lo") {
        const hand = s.handR.clone();
        const palm = sub(s.handR, s.foreR).normalize();
        const across = V().crossVectors(palm, s.up).normalize();
        const facing = V().crossVectors(across, palm).normalize();
        if (lod === "hi") {
          // A phone in the hand that is holding one.
          cloth.box(hand.clone().addScaledVector(palm, 0.05 * s.metre), palm.clone().multiplyScalar(0.075 * s.metre), across.clone().multiplyScalar(0.036 * s.metre), facing.clone().multiplyScalar(0.006 * s.metre), 30, pose === "phone" || pose === "sitphone");
        }
        // The office bag that the "bag" pose has been holding all along.
        cloth.box(hand.clone().addScaledVector(s.up, -0.17 * s.metre), s.fwd.clone().multiplyScalar(0.15 * s.metre), s.up.clone().multiplyScalar(0.12 * s.metre), s.side.clone().multiplyScalar(0.05 * s.metre), female ? 96 : 62, pose === "bag");
      }
      cloth.stop();
      return cloth;
    },
  };
}
