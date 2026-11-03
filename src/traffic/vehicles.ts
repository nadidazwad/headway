import { Batch, type MeshData } from "../geometry";

const TIRE = 0x24262a;
const GLASS = 0x37474f;
const CHROME = 0xc4c8c9;

function tire(b: Batch, x: number, y: number, z: number, r: number, width: number): void {
  b.part();
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = x + Math.cos(a0) * r, y0 = y + Math.sin(a0) * r;
    const x1 = x + Math.cos(a1) * r, y1 = y + Math.sin(a1) * r;
    b.quad([x0, y0, z - width], [x1, y1, z - width], [x1, y1, z + width], [x0, y0, z + width], TIRE, [Math.cos(a0), Math.sin(a0), 0]);
    b.quad([x, y, z + width], [x0, y0, z + width], [x1, y1, z + width], [x, y, z + width], TIRE, [0, 0, 1]);
    b.quad([x, y, z - width], [x0, y0, z - width], [x1, y1, z - width], [x, y, z - width], TIRE, [0, 0, -1]);
  }
  b.part();
  for (const side of [-1, 1]) {
    const hub = r * 0.5;
    const zz = z + side * (width + 0.002);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      b.quad([x, y, zz], [x + Math.cos(a0) * hub, y + Math.sin(a0) * hub, zz], [x + Math.cos(a1) * hub, y + Math.sin(a1) * hub, zz], [x, y, zz], CHROME, [0, 0, side]);
    }
  }
}

function spokedWheel(b: Batch, x: number, y: number, z: number, r: number): void {
  b.part();
  const segments = 14;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.bar([x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.018, 0.018, TIRE, 3);
  }
  b.part();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI;
    b.bar([x + Math.cos(a) * r, y + Math.sin(a) * r, z], [x - Math.cos(a) * r, y - Math.sin(a) * r, z], 0.004, 0.004, 0x9aa0a2, 3);
  }
}

/** Every vehicle is built facing -X, the direction the near lanes run. Body paint is left white so an instance colour can tint it. */
function car(): MeshData {
  const b = new Batch(1024);
  b.cull = false;
  const h = 0.32;
  b.part();
  b.box(-2.15, h, -0.86, 2.15, h + 0.48, 0.86, 0xffffff);
  b.part();
  // Cabin, tapering towards the roof.
  const y0 = h + 0.48;
  const y1 = h + 0.98;
  b.quad([-0.95, y0, 0.84], [1.55, y0, 0.84], [1.15, y1, 0.68], [-0.45, y1, 0.68], GLASS, [0, 0.3, 1]);
  b.quad([-0.95, y0, -0.84], [1.55, y0, -0.84], [1.15, y1, -0.68], [-0.45, y1, -0.68], GLASS, [0, 0.3, -1]);
  b.quad([-0.95, y0, -0.84], [-0.95, y0, 0.84], [-0.45, y1, 0.68], [-0.45, y1, -0.68], GLASS, [-1, 1, 0]);
  b.quad([1.55, y0, 0.84], [1.55, y0, -0.84], [1.15, y1, -0.68], [1.15, y1, 0.68], GLASS, [1, 1, 0]);
  b.part();
  b.quad([-0.45, y1, -0.68], [-0.45, y1, 0.68], [1.15, y1, 0.68], [1.15, y1, -0.68], 0xffffff, [0, 1, 0]);
  b.part();
  b.box(0.27, y0, 0.84, 0.33, y1 - 0.08, 0.86, 0xffffff);
  b.box(0.27, y0, -0.86, 0.33, y1 - 0.08, -0.84, 0xffffff);
  b.part();
  b.box(-2.17, h + 0.22, 0.4, -2.14, h + 0.38, 0.76, 0xf4f1d0);
  b.box(-2.17, h + 0.22, -0.76, -2.14, h + 0.38, -0.4, 0xf4f1d0);
  b.part();
  b.box(2.14, h + 0.26, 0.45, 2.17, h + 0.42, 0.78, 0xc23a33);
  b.box(2.14, h + 0.26, -0.78, 2.17, h + 0.42, -0.45, 0xc23a33);
  b.part();
  b.box(-2.19, h - 0.04, -0.86, -2.13, h + 0.1, 0.86, 0x34383b);
  b.box(2.13, h - 0.04, -0.86, 2.19, h + 0.1, 0.86, 0x34383b);
  tire(b, -1.35, 0.32, 0.8, 0.32, 0.1);
  tire(b, -1.35, 0.32, -0.8, 0.32, 0.1);
  tire(b, 1.35, 0.32, 0.8, 0.32, 0.1);
  tire(b, 1.35, 0.32, -0.8, 0.32, 0.1);
  return b.finish();
}

/** The green CNG auto-rickshaw: the colour of Dhaka's traffic. */
function cng(): MeshData {
  const b = new Batch(1024);
  b.cull = false;
  const GREEN = 0xffffff;
  const y = 0.3;
  b.part();
  b.box(-1.3, y, -0.62, 1.2, y + 0.42, 0.62, GREEN);
  b.part();
  // The front cowl, narrowing to one wheel.
  b.quad([-1.3, y + 0.42, -0.62], [-1.3, y + 0.42, 0.62], [-1.62, y + 0.1, 0.32], [-1.62, y + 0.1, -0.32], GREEN, [-1, 1, 0]);
  b.quad([-1.3, y, 0.62], [-1.62, y + 0.1, 0.32], [-1.62, y + 0.1, 0.32], [-1.3, y + 0.42, 0.62], GREEN, [-0.6, 0, 1]);
  b.quad([-1.3, y, -0.62], [-1.62, y + 0.1, -0.32], [-1.62, y + 0.1, -0.32], [-1.3, y + 0.42, -0.62], GREEN, [-0.6, 0, -1]);
  // Cabin frame, with the iron mesh doors CNGs have had since 2004.
  const top = y + 1.42;
  for (const px of [-1.25, 1.15]) {
    for (const pz of [-0.6, 0.6]) {
      b.part();
      b.bar([px, y + 0.42, pz], [px + (px < 0 ? 0.25 : -0.05), top, pz * 0.95], 0.03, 0.03, 0x1e2b20, 4);
    }
  }
  b.part();
  b.quad([-1.05, top, -0.6], [-1.05, top, 0.6], [1.15, top, 0.6], [1.15, top, -0.6], 0x171a1c, [0, 1, 0]);
  b.part();
  b.quad([-1.25, y + 0.5, -0.56], [-1.25, y + 0.5, 0.56], [-1.04, top - 0.08, 0.56], [-1.04, top - 0.08, -0.56], GLASS, [-1, 0.3, 0]);
  b.part();
  for (const side of [-1, 1]) {
    const z = side * 0.62;
    for (let u = -0.9; u < 1.1; u += 0.22) {
      b.bar([u, y + 0.42, z], [u, top - 0.04, z], 0.006, 0.006, 0x223326, 3);
    }
    for (let v = y + 0.58; v < top; v += 0.22) {
      b.bar([-1.05, v, z], [1.15, v, z], 0.006, 0.006, 0x223326, 3);
    }
  }
  b.part();
  b.box(1.1, y + 0.42, -0.62, 1.2, top - 0.04, 0.62, GREEN);
  tire(b, -1.46, 0.22, 0, 0.22, 0.07);
  tire(b, 0.82, 0.22, 0.6, 0.22, 0.07);
  tire(b, 0.82, 0.22, -0.6, 0.22, 0.07);
  return b.finish();
}

/** A pedal rickshaw with its painted hood and rear art panel, and its puller. */
function rickshaw(): MeshData {
  const b = new Batch(1024);
  b.cull = false;
  const FRAME = 0x2e3a34;
  const ART = 0xffffff;
  spokedWheel(b, 0.95, 0.34, 0.54, 0.34);
  spokedWheel(b, 0.95, 0.34, -0.54, 0.34);
  spokedWheel(b, -1.2, 0.34, 0, 0.34);
  b.part();
  b.bar([0.95, 0.34, -0.54], [0.95, 0.34, 0.54], 0.02, 0.02, FRAME, 4);
  b.bar([-1.2, 0.34, 0], [-0.55, 0.92, 0], 0.024, 0.024, FRAME, 4);
  b.bar([-0.55, 0.92, 0], [0.6, 0.66, 0], 0.024, 0.024, FRAME, 4);
  b.bar([-0.55, 0.92, 0], [-1.12, 1.1, 0], 0.02, 0.02, FRAME, 4);
  b.bar([-1.12, 1.1, -0.26], [-1.12, 1.1, 0.26], 0.015, 0.015, FRAME, 4);
  b.part();
  // Passenger bench.
  b.box(0.45, 0.66, -0.5, 1.2, 0.78, 0.5, 0xc23a33);
  b.part();
  b.box(1.1, 0.78, -0.5, 1.2, 1.25, 0.5, 0xd9b53a);
  b.part();
  // Painted rear panel: the rickshaw's whole personality.
  b.box(1.2, 0.3, -0.5, 1.23, 0.9, 0.5, ART);
  b.part();
  b.box(1.235, 0.42, -0.34, 1.24, 0.78, 0.34, 0xe5447a);
  b.part();
  b.box(1.24, 0.5, -0.17, 1.245, 0.7, 0.17, 0xfff1a8);
  // The folding hood, ribbed in vinyl and tinsel.
  const hood: Array<[number, number]> = [[1.22, 1.15], [1.18, 1.65], [0.95, 1.9], [0.62, 1.95], [0.32, 1.72]];
  for (let i = 0; i + 1 < hood.length; i++) {
    const [ax, ay] = hood[i]!;
    const [dx, dy] = hood[i + 1]!;
    b.part();
    b.quad([ax, ay, -0.55], [ax, ay, 0.55], [dx, dy, 0.55], [dx, dy, -0.55], i % 2 ? ART : 0xeb4d4b, [0.4, 1, 0]);
    b.quad([ax, ay, 0.55], [dx, dy, 0.55], [dx, dy, 0.55], [ax, ay, 0.55], ART, [0, 0, 1]);
  }
  b.part();
  b.quad([1.22, 1.15, 0.55], [0.32, 1.72, 0.55], [0.62, 1.95, 0.55], [1.18, 1.65, 0.55], ART, [0, 0, 1]);
  b.quad([1.22, 1.15, -0.55], [0.32, 1.72, -0.55], [0.62, 1.95, -0.55], [1.18, 1.65, -0.55], ART, [0, 0, -1]);
  // Puller, standing on the pedals: a thin lungi and a shirt.
  b.part();
  b.bar([-0.55, 0.96, 0.1], [-0.72, 0.5, 0.1], 0.04, 0.03, 0x8f6443, 5);
  b.bar([-0.55, 0.96, -0.1], [-0.5, 0.5, -0.1], 0.04, 0.03, 0x8f6443, 5);
  b.part();
  b.ellipsoid(-0.55, 0.99, 0, 0.13, 0.1, 0.12, 0x3f6f9e, 4, 7);
  b.part();
  b.bar([-0.55, 1.02, 0], [-0.82, 1.42, 0], 0.11, 0.1, 0xe9e4d6, 6);
  b.part();
  b.bar([-0.82, 1.38, 0.14], [-1.1, 1.12, 0.22], 0.03, 0.025, 0x8f6443, 4);
  b.bar([-0.82, 1.38, -0.14], [-1.1, 1.12, -0.22], 0.03, 0.025, 0x8f6443, 4);
  b.part();
  b.ellipsoid(-0.88, 1.6, 0, 0.09, 0.105, 0.09, 0x8f6443, 5, 8);
  b.part();
  b.ellipsoid(-0.86, 1.65, 0, 0.09, 0.07, 0.09, 0xf1eee4, 4, 7);
  return b.finish();
}

/** A city bus: dented, painted and overloaded; or, with a tint, a red BRTC. */
function bus(): MeshData {
  const b = new Batch(1024);
  b.cull = false;
  const L = 4.9;
  const y0 = 0.52;
  const y1 = 3.05;
  const beltY = y0 + 1.05;
  const headY = y1 - 0.42;
  b.part();
  b.box(-L, y0, -1.2, L, beltY, 1.2, 0xffffff);
  b.part();
  b.box(-L, headY, -1.2, L, y1, 1.2, 0xffffff);
  b.part();
  b.box(-L + 0.02, y1, -1.1, L - 0.02, y1 + 0.1, 1.1, 0xe2e2da);
  for (const side of [-1, 1]) {
    const z = side * 1.205;
    b.part();
    b.quad([-L, beltY, z], [L, beltY, z], [L, headY, z], [-L, headY, z], GLASS, [0, 0, side]);
    for (let u = -L + 0.9; u < L; u += 1.2) {
      b.part();
      b.box(u - 0.05, beltY, z - 0.012, u + 0.05, headY, z + 0.012, 0xffffff);
    }
    // Hand-painted stripe, as on every local bus.
    b.part();
    b.box(-L, y0 + 0.42, z - 0.008, L, y0 + 0.62, z + 0.008, 0xf1d24a);
    b.part();
    b.box(-L, y0 + 0.64, z - 0.008, L, y0 + 0.71, z + 0.008, 0x34393c);
    // Door.
    b.part();
    b.quad([-L + 0.5, y0 + 0.02, z + 0.012 * side], [-L + 1.45, y0 + 0.02, z + 0.012 * side], [-L + 1.45, headY, z + 0.012 * side], [-L + 0.5, headY, z + 0.012 * side], 0x2e3a42, [0, 0, side]);
  }
  b.part();
  b.quad([-L - 0.01, beltY - 0.1, -1.15], [-L - 0.01, beltY - 0.1, 1.15], [-L - 0.01, y1 - 0.25, 1.15], [-L - 0.01, y1 - 0.25, -1.15], GLASS, [-1, 0, 0]);
  b.part();
  b.quad([L + 0.01, beltY, -1.1], [L + 0.01, beltY, 1.1], [L + 0.01, y1 - 0.3, 1.1], [L + 0.01, y1 - 0.3, -1.1], GLASS, [1, 0, 0]);
  b.part();
  b.box(L, y0, -1.2, L + 0.04, y0 + 0.14, 1.2, 0x34393c);
  b.box(-L - 0.04, y0, -1.2, -L, y0 + 0.14, 1.2, 0x34393c);
  tire(b, -3, 0.5, 1.12, 0.5, 0.14);
  tire(b, -3, 0.5, -1.12, 0.5, 0.14);
  tire(b, 3, 0.5, 1.12, 0.5, 0.14);
  tire(b, 3, 0.5, -1.12, 0.5, 0.14);
  return b.finish();
}

/** A motorbike with its rider, helmeted. */
function motorbike(): MeshData {
  const b = new Batch(512);
  b.cull = false;
  tire(b, -0.72, 0.3, 0, 0.3, 0.05);
  tire(b, 0.72, 0.3, 0, 0.3, 0.05);
  b.part();
  b.ellipsoid(-0.05, 0.68, 0, 0.5, 0.17, 0.14, 0xffffff, 4, 8);
  b.part();
  b.box(0.1, 0.72, -0.14, 0.72, 0.84, 0.14, 0x1f2224);
  b.part();
  b.bar([-0.72, 0.3, 0], [-0.46, 0.92, 0], 0.03, 0.03, 0x62686a, 4);
  b.bar([-0.46, 0.96, -0.28], [-0.46, 0.96, 0.28], 0.016, 0.016, 0x20242a, 4);
  b.part();
  b.bar([0.15, 0.82, 0.13], [-0.1, 0.42, 0.18], 0.06, 0.045, 0x2d3a4a, 6);
  b.bar([0.15, 0.82, -0.13], [-0.1, 0.42, -0.18], 0.06, 0.045, 0x2d3a4a, 6);
  b.part();
  b.bar([0.2, 0.86, 0], [0.02, 1.34, 0], 0.15, 0.13, 0x5d7f9e, 7);
  b.part();
  b.bar([0.03, 1.3, 0.16], [-0.42, 0.98, 0.25], 0.04, 0.032, 0x5d7f9e, 5);
  b.bar([0.03, 1.3, -0.16], [-0.42, 0.98, -0.25], 0.04, 0.032, 0x5d7f9e, 5);
  b.part();
  b.ellipsoid(-0.02, 1.53, 0, 0.13, 0.135, 0.13, 0xc23a33, 6, 9);
  b.part();
  b.quad([-0.14, 1.47, -0.08], [-0.14, 1.47, 0.08], [-0.13, 1.56, 0.08], [-0.13, 1.56, -0.08], 0x1b1f22, [-1, 0, 0]);
  return b.finish();
}

export type VehicleKind = "car" | "cng" | "rickshaw" | "bus" | "bike";

export const VEHICLE_LENGTH: Record<VehicleKind, number> = { car: 4.5, cng: 3.2, rickshaw: 2.6, bus: 10, bike: 1.9 };

export function buildVehicles(): Record<VehicleKind, MeshData> {
  return { car: car(), cng: cng(), rickshaw: rickshaw(), bus: bus(), bike: motorbike() };
}
