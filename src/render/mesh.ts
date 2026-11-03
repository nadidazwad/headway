import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Uint16BufferAttribute } from "three";
import { STRIDE, type MeshData } from "../geometry";

/** Wraps interleaved worker output as a geometry, without copying the bytes. */
export function toBufferGeometry({ vertices, indices }: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  const floats = new InterleavedBuffer(new Float32Array(vertices), STRIDE / 4);
  const signed = new InterleavedBuffer(new Int8Array(vertices), STRIDE);
  const bytes = new InterleavedBuffer(new Uint8Array(vertices), STRIDE);
  const shorts = new InterleavedBuffer(new Uint16Array(vertices), STRIDE / 2);
  geometry.setAttribute("position", new InterleavedBufferAttribute(floats, 3, 0));
  geometry.setAttribute("normal", new InterleavedBufferAttribute(signed, 3, 12, true));
  geometry.setAttribute("colorPart", new InterleavedBufferAttribute(bytes, 4, 16, true));
  geometry.setAttribute("uv", new InterleavedBufferAttribute(shorts, 2, 10, true));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

export { Uint16BufferAttribute };
