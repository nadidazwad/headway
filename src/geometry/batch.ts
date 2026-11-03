import { ShapeUtils, Vector2 } from "three";

export type Vec3 = readonly [number, number, number];

export interface MeshData {
  vertices: ArrayBuffer;
  indices: Uint32Array<ArrayBuffer>;
  /** Tight bounds of everything drawn, so a piece of city off screen costs nothing. */
  min: Vec3;
  max: Vec3;
  /** Where the solids end in `indices` and the lines begin. */
  lineStart: number;
}

/** A bar thinner than this, or a box thinner than `SLENDER` both ways, is drawn as a line. */
const LINE_RADIUS = 0.06;
const SLENDER = 0.07;
/** Line radii are stored as a fraction of this, in 16 bits. */
export const LINE_RADIUS_RANGE = 0.25;

export const STRIDE = 24;

/**
 * What a face is made of, carried in the spare byte after the normal. The shader gives each its
 * own weathering: tar for roads, monsoon streaks for plaster, formwork lines for concrete.
 */
export const Surface = {
  plain: 0,
  foliage: 1,
  asphalt: 2,
  concrete: 3,
  plaster: 4,
  paving: 5,
  soil: 6,
  roof: 7,
  brick: 8,
  tin: 9,
  bark: 10,
  /** People: their dark clothes and hair stay dark, where the city is lifted towards the paper. */
  figure: 11,
} as const;
export type SurfaceKind = (typeof Surface)[keyof typeof Surface];

/** A baked mesh from the asset library, ready to be copied into a batch. */
export interface Stampable {
  count: number;
  pos: Float32Array;
  nor: Int8Array;
  grey: Uint8Array;
  part: Uint8Array;
  index: Uint16Array | Uint32Array;
  surface?: SurfaceKind;
}

/** The camera's whole allowed range, the drag limits included. See camera/limits. */
const cameraDirection = (azimuth: number, elevation: number): Vec3 => {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
};
const CORNERS: readonly Vec3[] = [cameraDirection(4, 12), cameraDirection(4, 50), cameraDirection(66, 12), cameraDirection(66, 50)];

/**
 * The camera only ever looks from above, from the -X/+Z quadrant, so faces that can never
 * be seen are skipped. That removes about half the triangles of the whole city.
 */
function canBeSeen(nx: number, ny: number, nz: number): boolean {
  return CORNERS.some((d) => nx * d[0] + ny * d[1] + nz * d[2] > -0.02);
}


/** An icosphere's unit vertices and faces, built once per subdivision level. */
const icospheres = new Map<number, { points: number[][]; faces: number[][] }>();
function icosphere(level: number): { points: number[][]; faces: number[][] } {
  const cached = icospheres.get(level);
  if (cached) return cached;
  const t = (1 + Math.sqrt(5)) / 2;
  const points: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x!, y!, z!);
    return [x! / l, y! / l, z! / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const middle = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let index = middle.get(key);
      if (index === undefined) {
        const [ax, ay, az] = points[a]!;
        const [bx, by, bz] = points[b]!;
        const x = ax! + bx!, y = ay! + by!, z = az! + bz!;
        const len = Math.hypot(x, y, z);
        index = points.length;
        points.push([x / len, y / len, z / len]);
        middle.set(key, index);
      }
      return index;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a!, b!), bc = mid(b!, c!), ca = mid(c!, a!);
      next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const result = { points, faces };
  icospheres.set(level, result);
  return result;
}

type Mat = number[];
const identity = (): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** Grows one interleaved mesh out of solids. Runs in the world worker, so it stays free of WebGL. */
export class Batch {
  private buffer: ArrayBuffer;
  private f32: Float32Array;
  private i8: Int8Array;
  private u8: Uint8Array;
  private u16: Uint16Array;
  private indices: Uint32Array<ArrayBuffer>;
  private vertexCount = 0;
  private indexCount = 0;
  private matrix: Mat = identity();
  private stack: Mat[] = [];
  private partId = 1;
  private surfaceId: number = Surface.plain;
  private readonly lo: [number, number, number] = [Infinity, Infinity, Infinity];
  private readonly hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  /** Turn off for parts that move, so a face hidden at rest is still there when it turns. */
  cull = true;

  /**
   * Turn on for the city: anything thinner than a pixel at the wide view shimmers as it slides, so
   * wires, rods and railings go to the line pass instead of the solid one. See `rod`.
   */
  lines = false;
  private lineIndices: number[] = [];

  constructor(initialVertices = 4096) {
    this.buffer = new ArrayBuffer(initialVertices * STRIDE);
    this.f32 = new Float32Array(this.buffer);
    this.i8 = new Int8Array(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
    this.u16 = new Uint16Array(this.buffer);
    this.indices = new Uint32Array(initialVertices * 2);
  }

  /** Starts a new part. The ink pass draws a line wherever two parts meet. */
  part(): this {
    this.partId = (this.partId + 37) % 250 || 1;
    return this;
  }

  /** Starts a crown of leaves: the ink pass keeps its lines faint until it meets something else. */
  leafPart(): this {
    this.partId = 255;
    return this;
  }

  /** Draws whatever `draw` adds as made of `kind`, then goes back to what it was before. */
  as(kind: SurfaceKind, draw: () => void): this {
    const before = this.surfaceId;
    this.surfaceId = kind;
    draw();
    this.surfaceId = before;
    return this;
  }

  push(): this {
    this.stack.push(this.matrix.slice());
    return this;
  }

  pop(): this {
    this.matrix = this.stack.pop() ?? identity();
    return this;
  }

  translate(x: number, y: number, z: number): this {
    const m = this.matrix;
    m[3]! += m[0]! * x + m[1]! * y + m[2]! * z;
    m[7]! += m[4]! * x + m[5]! * y + m[6]! * z;
    m[11]! += m[8]! * x + m[9]! * y + m[10]! * z;
    return this;
  }

  rotateY(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.matrix;
    for (let row = 0; row < 3; row++) {
      const a = m[row * 4]!;
      const b = m[row * 4 + 2]!;
      m[row * 4] = a * c - b * s;
      m[row * 4 + 2] = a * s + b * c;
    }
    return this;
  }

  rotateX(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.matrix;
    for (let row = 0; row < 3; row++) {
      const a = m[row * 4 + 1]!;
      const b = m[row * 4 + 2]!;
      m[row * 4 + 1] = a * c + b * s;
      m[row * 4 + 2] = -a * s + b * c;
    }
    return this;
  }

  rotateZ(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.matrix;
    for (let row = 0; row < 3; row++) {
      const a = m[row * 4]!;
      const b = m[row * 4 + 1]!;
      m[row * 4] = a * c + b * s;
      m[row * 4 + 1] = -a * s + b * c;
    }
    return this;
  }

  /** Runs `draw` in a local frame, then restores the previous one. */
  at(x: number, y: number, z: number, draw: () => void, rotationY = 0): this {
    this.push();
    this.translate(x, y, z);
    if (rotationY) this.rotateY(rotationY);
    draw();
    return this.pop();
  }

  private growVertices(extra: number): void {
    const needed = (this.vertexCount + extra) * STRIDE;
    if (needed <= this.buffer.byteLength) return;
    let size = this.buffer.byteLength * 2;
    while (size < needed) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.u8);
    this.buffer = next;
    this.f32 = new Float32Array(next);
    this.i8 = new Int8Array(next);
    this.u8 = new Uint8Array(next);
    this.u16 = new Uint16Array(next);
  }

  private growIndices(extra: number): void {
    if (this.indexCount + extra <= this.indices.length) return;
    const next = new Uint32Array(Math.max(this.indices.length * 2, this.indexCount + extra));
    next.set(this.indices);
    this.indices = next;
  }

  /** Writes one vertex given in local coordinates. */
  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: number, u = 0, v = 0): number {
    const m = this.matrix;
    const index = this.vertexCount++;
    const f = index * 6;
    const wx = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
    const wy = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
    const wz = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
    this.f32[f] = wx;
    this.f32[f + 1] = wy;
    this.f32[f + 2] = wz;
    if (wx < this.lo[0]) this.lo[0] = wx;
    if (wy < this.lo[1]) this.lo[1] = wy;
    if (wz < this.lo[2]) this.lo[2] = wz;
    if (wx > this.hi[0]) this.hi[0] = wx;
    if (wy > this.hi[1]) this.hi[1] = wy;
    if (wz > this.hi[2]) this.hi[2] = wz;
    const byte = index * STRIDE;
    this.i8[byte + 12] = Math.round((m[0]! * nx + m[1]! * ny + m[2]! * nz) * 127);
    this.i8[byte + 13] = Math.round((m[4]! * nx + m[5]! * ny + m[6]! * nz) * 127);
    this.i8[byte + 14] = Math.round((m[8]! * nx + m[9]! * ny + m[10]! * nz) * 127);
    this.u8[byte + 15] = this.surfaceId;
    this.u8[byte + 16] = (color >> 16) & 255;
    this.u8[byte + 17] = (color >> 8) & 255;
    this.u8[byte + 18] = color & 255;
    this.u8[byte + 19] = this.partId;
    const half = index * 12;
    this.u16[half + 10] = Math.round(u * 65535);
    this.u16[half + 11] = Math.round(v * 65535);
    return index;
  }

  private worldNormal(nx: number, ny: number, nz: number): Vec3 {
    const m = this.matrix;
    return [
      m[0]! * nx + m[1]! * ny + m[2]! * nz,
      m[4]! * nx + m[5]! * ny + m[6]! * nz,
      m[8]! * nx + m[9]! * ny + m[10]! * nz,
    ];
  }

  private isHidden(nx: number, ny: number, nz: number): boolean {
    if (!this.cull) return false;
    const [wx, wy, wz] = this.worldNormal(nx, ny, nz);
    return !canBeSeen(wx, wy, wz);
  }

  /** A flat quad, wound to face the side its corners imply unless `facing` overrides it. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: number, facing?: Vec3, uv?: readonly [number, number, number, number]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    // Use the far corner for the second edge, so a quad with two equal corners is still a triangle.
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    const flip = facing ? nx * facing[0] + ny * facing[1] + nz * facing[2] < 0 : false;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    if (this.isHidden(nx, ny, nz)) return;
    this.growVertices(4);
    this.growIndices(6);
    const i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz, color, uv ? uv[0] : 0, uv ? uv[3] : 0);
    const i1 = this.vertex(b[0], b[1], b[2], nx, ny, nz, color, uv ? uv[2] : 0, uv ? uv[3] : 0);
    const i2 = this.vertex(c[0], c[1], c[2], nx, ny, nz, color, uv ? uv[2] : 0, uv ? uv[1] : 0);
    const i3 = this.vertex(d[0], d[1], d[2], nx, ny, nz, color, uv ? uv[0] : 0, uv ? uv[1] : 0);
    if (flip) this.pushIndices(i0, i2, i1, i0, i3, i2);
    else this.pushIndices(i0, i1, i2, i0, i2, i3);
  }

  private pushIndices(...values: number[]): void {
    for (const value of values) this.indices[this.indexCount++] = value;
  }

  /** A box between two corners, drawing only the faces the camera can reach. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): this {
    if (this.lines && this.slenderBox(x0, y0, z0, x1, y1, z1, color)) return this;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, [0, 1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [-1, 0, 0]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [1, 0, 0]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [0, 0, -1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, [0, -1, 0]);
    return this;
  }

  /** Draws a box as a line if it is one: long, and thin both ways across. */
  private slenderBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): boolean {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), dz = Math.abs(z1 - z0);
    const longest = Math.max(dx, dy, dz);
    const across = dx + dy + dz - longest;
    const wider = Math.max(Math.min(dx, dy), Math.min(dy, dz), Math.min(dx, dz));
    if (wider >= SLENDER || longest < wider * 3) return false;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
    const r = across / 4;
    if (longest === dx) this.rod([x0, my, mz], [x1, my, mz], r, r, color);
    else if (longest === dy) this.rod([mx, y0, mz], [mx, y1, mz], r, r, color);
    else this.rod([mx, my, z0], [mx, my, z1], r, r, color);
    return true;
  }

  /**
   * A thin straight part, as a ribbon the line pass turns to face the camera: never narrower than
   * about a pixel, with a real soft edge, and paler in proportion when it is truly thinner.
   */
  rod(a: Vec3, b: Vec3, r0: number, r1: number, color: number): this {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-5) return this;
    const tx = dx / length, ty = dy / length, tz = dz / length;
    this.growVertices(4);
    const before = this.surfaceId;
    const corner = (p: Vec3, r: number, end: number, side: number): number => {
      this.surfaceId = end as SurfaceKind;
      return this.vertex(p[0], p[1], p[2], tx, ty, tz, color, Math.min(1, r / LINE_RADIUS_RANGE), side);
    };
    const i0 = corner(a, r0, 0, 0);
    const i1 = corner(a, r0, 0, 1);
    const i2 = corner(b, r1, 1, 1);
    const i3 = corner(b, r1, 1, 0);
    this.surfaceId = before;
    this.lineIndices.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  /** A box centred on x and z, standing on y. */
  block(cx: number, y: number, cz: number, width: number, height: number, depth: number, color: number): this {
    return this.box(cx - width / 2, y, cz - depth / 2, cx + width / 2, y + height, cz + depth / 2, color);
  }

  /** A flat rectangle facing +Z in the current frame, optionally showing an atlas region. */
  panel(u0: number, y0: number, u1: number, y1: number, z: number, color: number, uv?: readonly [number, number, number, number]): this {
    this.quad([u0, y0, z], [u1, y0, z], [u1, y1, z], [u0, y1, z], color, [0, 0, 1], uv);
    return this;
  }

  /** A vertical cylinder or cone from radius r0 at y to r1 at y + height, with smooth sides. */
  cylinder(x: number, y: number, z: number, r0: number, r1: number, height: number, color: number, segments = 10, capTop = true): this {
    this.growVertices(segments * 2 + 2 + segments + 1);
    this.growIndices(segments * 9);
    const slope = (r0 - r1) / (height || 1);
    const normalScale = 1 / Math.hypot(1, slope);
    const first = this.vertexCount;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const nx = c * normalScale, ny = slope * normalScale, nz = s * normalScale;
      this.vertex(x + c * r0, y, z + s * r0, nx, ny, nz, color);
      this.vertex(x + c * r1, y + height, z + s * r1, nx, ny, nz, color);
    }
    for (let i = 0; i < segments; i++) {
      const mid = ((i + 0.5) / segments) * Math.PI * 2;
      if (this.isHidden(Math.cos(mid) * normalScale, slope * normalScale, Math.sin(mid) * normalScale)) continue;
      const a = first + i * 2;
      this.pushIndices(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (capTop && r1 > 0.001) {
      const center = this.vertex(x, y + height, z, 0, 1, 0, color);
      const rim = this.vertexCount;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        this.vertex(x + Math.cos(angle) * r1, y + height, z + Math.sin(angle) * r1, 0, 1, 0, color);
      }
      for (let i = 0; i < segments; i++) {
        this.pushIndices(center, rim + (i + 1) % segments, rim + i);
      }
    }
    return this;
  }

  /** Turns a profile of [radius, y] points around the vertical axis, with smooth shading. */
  lathe(x: number, z: number, profile: ReadonlyArray<readonly [number, number]>, color: number, segments = 12): this {
    const rows = profile.length;
    this.growVertices(rows * (segments + 1));
    this.growIndices((rows - 1) * segments * 6);
    const first = this.vertexCount;
    for (let row = 0; row < rows; row++) {
      const [r, y] = profile[row]!;
      const [pr, py] = profile[Math.max(row - 1, 0)]!;
      const [qr, qy] = profile[Math.min(row + 1, rows - 1)]!;
      let nr = qy - py;
      let ny = pr - qr;
      const l = Math.hypot(nr, ny) || 1;
      nr /= l; ny /= l;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        this.vertex(x + c * r, y, z + s * r, c * nr, ny, s * nr, color);
      }
    }
    for (let row = 0; row < rows - 1; row++) {
      for (let i = 0; i < segments; i++) {
        const a = first + row * (segments + 1) + i;
        const b = a + segments + 1;
        this.pushIndices(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return this;
  }

  /** An ellipsoid with smooth shading. */
  ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, rows = 6, segments = 10): this {
    this.growVertices((rows + 1) * (segments + 1));
    this.growIndices(rows * segments * 6);
    const first = this.vertexCount;
    for (let row = 0; row <= rows; row++) {
      const phi = (row / rows) * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const nx = sinPhi * Math.cos(theta), ny = cosPhi, nz = sinPhi * Math.sin(theta);
        const gx = nx / rx, gy = ny / ry, gz = nz / rz;
        const l = Math.hypot(gx, gy, gz) || 1;
        this.vertex(x + nx * rx, y + ny * ry, z + nz * rz, gx / l, gy / l, gz / l, color);
      }
    }
    for (let row = 0; row < rows; row++) {
      const midPhi = ((row + 0.5) / rows) * Math.PI;
      for (let i = 0; i < segments; i++) {
        const midTheta = ((i + 0.5) / segments) * Math.PI * 2;
        if (this.isHidden(Math.sin(midPhi) * Math.cos(midTheta), Math.cos(midPhi), Math.sin(midPhi) * Math.sin(midTheta))) continue;
        const a = first + row * (segments + 1) + i;
        const b = a + segments + 1;
        this.pushIndices(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return this;
  }

  /**
   * A lumpy round clump with smooth shading, flattened underneath: a cluster of leaves. Waves in
   * random directions push the surface in and out, so every clump has its own outline.
   */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, bump: number, seed: number, level = 1): this {
    const { points, faces } = icosphere(level);
    let state = (seed * 2654435761) >>> 0;
    const random = (): number => {
      state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      return state / 4294967296;
    };
    // Broad lobes, then finer ones: the outline of a clump of leaves rather than a stone.
    const waves = Array.from({ length: 7 }, (_, i) => {
      const a = random() * Math.PI * 2;
      const b = Math.acos(random() * 2 - 1);
      const fine = i >= 3;
      return { d: [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)], f: fine ? 6 + random() * 4 : 2 + random() * 2.5, p: random() * 6.283, w: fine ? 0.35 : 0.8 };
    });
    const placed = points.map(([px, py, pz]) => {
      let lump = 0;
      for (const w of waves) lump += w.w * Math.sin((px! * w.d[0]! + py! * w.d[1]! + pz! * w.d[2]!) * w.f + w.p);
      const r = 1 + bump * lump * 0.22;
      const under = py! < 0 ? 0.8 : 1;
      return [x + px! * rx * r, y + py! * ry * r * under, z + pz! * rz * r];
    });
    const normals = placed.map(() => [0, 0, 0]);
    for (const [a, b, c] of faces) {
      const pa = placed[a!]!, pb = placed[b!]!, pc = placed[c!]!;
      const ux = pb[0]! - pa[0]!, uy = pb[1]! - pa[1]!, uz = pb[2]! - pa[2]!;
      const vx = pc[0]! - pa[0]!, vy = pc[1]! - pa[1]!, vz = pc[2]! - pa[2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a!, b!, c!]) {
        normals[i]![0]! += nx;
        normals[i]![1]! += ny;
        normals[i]![2]! += nz;
      }
    }
    this.growVertices(placed.length);
    this.growIndices(faces.length * 3);
    const first = this.vertexCount;
    placed.forEach((p, i) => {
      const n = normals[i]!;
      const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      this.vertex(p[0]!, p[1]!, p[2]!, n[0]! / l, n[1]! / l, n[2]! / l, color);
    });
    for (const [a, b, c] of faces) {
      const n = normals[a!]!;
      const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      if (this.isHidden(n[0]! / l, n[1]! / l, n[2]! / l)) continue;
      this.pushIndices(first + a!, first + b!, first + c!);
    }
    return this;
  }

  /** A round bar or tapered limb between two points. */
  bar(a: Vec3, b: Vec3, r0: number, r1: number, color: number, sides = 6): this {
    if (this.lines && Math.max(r0, r1) < LINE_RADIUS) return this.rod(a, b, r0, r1, color);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-5) return this;
    const tx = dx / length, ty = dy / length, tz = dz / length;
    const refX = Math.abs(ty) > 0.9 ? 1 : 0;
    const refY = Math.abs(ty) > 0.9 ? 0 : 1;
    let ux = refY * tz, uy = -refX * tz, uz = refX * ty - refY * tx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    this.growVertices((sides + 1) * 2);
    this.growIndices(sides * 6);
    const first = this.vertexCount;
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const nx = ux * c + vx * s, ny = uy * c + vy * s, nz = uz * c + vz * s;
      this.vertex(a[0] + nx * r0, a[1] + ny * r0, a[2] + nz * r0, nx, ny, nz, color);
      this.vertex(b[0] + nx * r1, b[1] + ny * r1, b[2] + nz * r1, nx, ny, nz, color);
    }
    for (let i = 0; i < sides; i++) {
      const mid = ((i + 0.5) / sides) * Math.PI * 2;
      const c = Math.cos(mid);
      const s = Math.sin(mid);
      if (this.isHidden(ux * c + vx * s, uy * c + vy * s, uz * c + vz * s)) continue;
      const p = first + i * 2;
      this.pushIndices(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
    return this;
  }

  /** Copies a baked mesh in at the current transform, its grey scaled by `tone`. */
  stamp(mesh: Stampable, tone = 1): this {
    this.growVertices(mesh.count);
    this.growIndices(mesh.index.length);
    const first = this.vertexCount;
    const base = this.partId;
    const surfaceBefore = this.surfaceId;
    if (mesh.surface !== undefined) this.surfaceId = mesh.surface;
    for (let i = 0; i < mesh.count; i++) {
      const g = Math.min(255, Math.round(mesh.grey[i]! * tone));
      this.partId = ((base + mesh.part[i]! * 37) % 250) || 1;
      this.vertex(mesh.pos[i * 3]!, mesh.pos[i * 3 + 1]!, mesh.pos[i * 3 + 2]!, mesh.nor[i * 3]! / 127, mesh.nor[i * 3 + 1]! / 127, mesh.nor[i * 3 + 2]! / 127, (g << 16) | (g << 8) | g);
    }
    this.partId = base;
    this.surfaceId = surfaceBefore;
    this.part();
    for (let i = 0; i < mesh.index.length; i += 3) {
      const a = mesh.index[i]!;
      if (this.isHidden(mesh.nor[a * 3]! / 127, mesh.nor[a * 3 + 1]! / 127, mesh.nor[a * 3 + 2]! / 127)) continue;
      this.indices[this.indexCount++] = first + a;
      this.indices[this.indexCount++] = first + mesh.index[i + 1]!;
      this.indices[this.indexCount++] = first + mesh.index[i + 2]!;
    }
    return this;
  }

  /** A polyline of round bars, such as a sagging cable. */
  cable(points: readonly Vec3[], radius: number, color: number, sides = 4): this {
    for (let i = 0; i + 1 < points.length; i++) this.bar(points[i]!, points[i + 1]!, radius, radius, color, sides);
    return this;
  }

  /** Extrudes a plan outline (x, z points) from y0 to y1, with a capped top. */
  prism(outline: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, color: number): this {
    const count = outline.length;
    const area = ShapeUtils.area(outline.map(([x, z]) => new Vector2(x, z)));
    const direction = area > 0 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const [ax, az] = outline[i]!;
      const [bx, bz] = outline[(i + 1) % count]!;
      const nx = (bz - az) * direction, nz = -(bx - ax) * direction;
      const length = Math.hypot(nx, nz) || 1;
      this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], color, [-nx / length, 0, -nz / length]);
    }
    const triangles = ShapeUtils.triangulateShape(outline.map(([x, z]) => new Vector2(x, z)), []);
    this.growVertices(count);
    this.growIndices(triangles.length * 3);
    const first = this.vertexCount;
    for (const [x, z] of outline) this.vertex(x, y1, z, 0, 1, 0, color);
    for (const [a, b, c] of triangles) {
      const [ax, az] = outline[a!]!;
      const [bx, bz] = outline[b!]!;
      const [cx, cz] = outline[c!]!;
      const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
      if (up) this.pushIndices(first + a!, first + b!, first + c!);
      else this.pushIndices(first + a!, first + c!, first + b!);
    }
    return this;
  }

  get triangles(): number {
    return (this.indexCount + this.lineIndices.length) / 3;
  }

  private finishedIndices(): Uint32Array<ArrayBuffer> {
    const out = new Uint32Array(this.indexCount + this.lineIndices.length);
    out.set(this.indices.subarray(0, this.indexCount));
    out.set(this.lineIndices, this.indexCount);
    return out;
  }

  finish(): MeshData {
    return {
      vertices: this.buffer.slice(0, this.vertexCount * STRIDE),
      indices: this.finishedIndices(),
      lineStart: this.indexCount,
      min: [this.lo[0], this.lo[1], this.lo[2]],
      max: [this.hi[0], this.hi[1], this.hi[2]],
    };
  }
}
