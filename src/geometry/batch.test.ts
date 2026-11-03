import { describe, expect, it } from "vitest";
import { Batch } from "./batch";

/** Every wall of a prism, as where its corner sits and which way it says it faces. */
function walls(outline: ReadonlyArray<readonly [number, number]>): Array<{ x: number; z: number; nx: number; nz: number }> {
  const batch = new Batch();
  batch.prism(outline, 0, 3, 0x888888);
  const view = new DataView(batch.finish().vertices);
  const found = [];
  for (let at = 0; at < view.byteLength; at += 24) {
    const ny = view.getInt8(at + 13);
    if (ny === 0) found.push({ x: view.getFloat32(at, true), z: view.getFloat32(at + 8, true), nx: view.getInt8(at + 12), nz: view.getInt8(at + 14) });
  }
  return found;
}

describe("prism", () => {
  const square: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  it.each([
    ["anticlockwise", square],
    ["clockwise", [...square].reverse()],
  ])("faces its walls outwards from an %s outline", (_order, outline) => {
    const found = walls(outline);
    expect(found.length).toBeGreaterThan(0);
    for (const { x, z, nx, nz } of found) expect(x * nx + z * nz).toBeGreaterThan(0);
  });
});
