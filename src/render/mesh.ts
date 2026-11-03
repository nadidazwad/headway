import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Uint16BufferAttribute } from "three";
import { STRIDE, type MeshData } from "../geometry";

/** Wraps interleaved worker output as a geometry, without copying the bytes. */
export function toBufferGeometry({ vertices, indices, lineStart }: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  const floats = new InterleavedBuffer(new Float32Array(vertices), STRIDE / 4);
  const signed = new InterleavedBuffer(new Int8Array(vertices), STRIDE);
  const bytes = new InterleavedBuffer(new Uint8Array(vertices), STRIDE);
  const shorts = new InterleavedBuffer(new Uint16Array(vertices), STRIDE / 2);
  geometry.setAttribute("position", new InterleavedBufferAttribute(floats, 3, 0));
  geometry.setAttribute("normal", new InterleavedBufferAttribute(signed, 3, 12, true));
  geometry.setAttribute("colorPart", new InterleavedBufferAttribute(bytes, 4, 16, true));
  geometry.setAttribute("surface", new InterleavedBufferAttribute(bytes, 1, 15, false));
  geometry.setAttribute("uv", new InterleavedBufferAttribute(shorts, 2, 10, true));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, lineStart);
  return geometry;
}

/** The lines of a mesh already wrapped by `toBufferGeometry`, sharing its buffers. Null if it has none. */
export function toLineGeometry(solid: BufferGeometry, { indices, lineStart }: MeshData): BufferGeometry | null {
  if (lineStart >= indices.length) return null;
  const geometry = new BufferGeometry();
  for (const name of ["position", "normal", "colorPart", "surface", "uv"]) geometry.setAttribute(name, solid.getAttribute(name));
  geometry.setIndex(solid.getIndex());
  geometry.setDrawRange(lineStart, indices.length - lineStart);
  return geometry;
}

export { Uint16BufferAttribute };
