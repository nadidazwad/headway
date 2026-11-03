import { ShapeUtils, Vector2 } from "three";

export type Vec3 = readonly [number, number, number];

export interface MeshData {
  vertices: ArrayBuffer;
  indices: Uint32Array<ArrayBuffer>;
}

export const STRIDE = 24;

const COS60 = Math.cos(Math.PI / 3);
const SIN60 = Math.sin(Math.PI / 3);
const CAM_A: Vec3 = [0, 0.55, 0.84];
const CAM_B: Vec3 = [-SIN60 * 0.84, 0.55, COS60 * 0.84];

/**
 * The camera only ever looks from above, from the -X/+Z quadrant, so faces that can never
 * be seen are skipped. That removes about half the triangles of the whole city.
 */
function canBeSeen(nx: number, ny: number, nz: number): boolean {
  return (
    nx * CAM_A[0] + ny * CAM_A[1] + nz * CAM_A[2] > -0.02 ||
    nx * CAM_B[0] + ny * CAM_B[1] + nz * CAM_B[2] > -0.02
  );
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

  /** Turn off for parts that move, so a face hidden at rest is still there when it turns. */
  cull = true;

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
    this.f32[f] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
    this.f32[f + 1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
    this.f32[f + 2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
    const byte = index * STRIDE;
    this.i8[byte + 12] = Math.round((m[0]! * nx + m[1]! * ny + m[2]! * nz) * 127);
    this.i8[byte + 13] = Math.round((m[4]! * nx + m[5]! * ny + m[6]! * nz) * 127);
    this.i8[byte + 14] = Math.round((m[8]! * nx + m[9]! * ny + m[10]! * nz) * 127);
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
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
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
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, [0, 1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [-1, 0, 0]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [1, 0, 0]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [0, 0, -1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, [0, -1, 0]);
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
      for (let i = 0; i < segments; i++) {
        const a = first + row * (segments + 1) + i;
        const b = a + segments + 1;
        this.pushIndices(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return this;
  }

  /** A round bar or tapered limb between two points. */
  bar(a: Vec3, b: Vec3, r0: number, r1: number, color: number, sides = 6): this {
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
      const p = first + i * 2;
      this.pushIndices(p, p + 2, p + 1, p + 1, p + 2, p + 3);
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
    return this.indexCount / 3;
  }

  finish(): MeshData {
    return {
      vertices: this.buffer.slice(0, this.vertexCount * STRIDE),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}
