import { Batch, type MeshData } from "../geometry";

const TIRE = 0x24262a;
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

/** A motorbike with its rider, helmeted; or, parked, without. Its nose points along -x. */
export function drawMotorbike(b: Batch, rider: boolean, body = 0xffffff): void {
  tire(b, -0.72, 0.3, 0, 0.3, 0.05);
  tire(b, 0.72, 0.3, 0, 0.3, 0.05);
  b.part();
  b.ellipsoid(-0.05, 0.68, 0, 0.5, 0.17, 0.14, body, 4, 8);
  b.part();
  // Engine block and exhaust under the tank.
  b.box(-0.2, 0.36, -0.12, 0.25, 0.6, 0.12, 0x3a3e40);
  b.bar([0.05, 0.38, 0.14], [0.75, 0.48, 0.16], 0.04, 0.035, CHROME, 5);
  b.part();
  b.box(0.1, 0.72, -0.14, 0.72, 0.84, 0.14, 0x1f2224);
  b.part();
  b.bar([-0.72, 0.3, 0], [-0.46, 0.92, 0], 0.03, 0.03, 0x62686a, 4);
  b.bar([-0.46, 0.96, -0.28], [-0.46, 0.96, 0.28], 0.016, 0.016, 0x20242a, 4);
  if (rider) riderOn(b);
}

function motorbike(rider: boolean): MeshData {
  const b = new Batch(512);
  b.cull = false;
  drawMotorbike(b, rider);
  return b.finish();
}

function riderOn(b: Batch): void {
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
}

/** Motorbikes are the one vehicle still modelled here: nothing downloaded beat it at this size. */
export function buildVehicles(): { bike: MeshData; parkedBike: MeshData } {
  return { bike: motorbike(true), parkedBike: motorbike(false) };
}
