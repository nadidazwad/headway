import { describe, expect, it } from "vitest";
import { Batch, STRIDE } from "../geometry";
import { Rng } from "../shared/rng";
import { buildRoad } from "./street";

describe("a side street's mouth", () => {
  it("has no kerb, pavement or edge line across it", () => {
    const [a, c] = [-34, -26];
    const b = new Batch(1 << 14);
    buildRoad(b, { seed: 1, chunk: 3, start: 180 }, new Rng(1), [[a, c]]);
    const { vertices, indices, lineStart } = b.finish();
    const f = new Float32Array(vertices);
    const stride = STRIDE / 4;
    const across: number[][] = [];
    for (let i = 0; i < lineStart; i += 3) {
      const corners = [indices[i]!, indices[i + 1]!, indices[i + 2]!].map((v) => [f[v * stride]!, f[v * stride + 1]!, f[v * stride + 2]!] as const);
      const x = corners.map((p) => p[0]);
      const y = corners.map((p) => p[1]);
      const z = corners.map((p) => Math.abs(p[2]));
      // Bare road is fine; anything standing on it in the kerb band, inside the mouth, is not.
      const inMouth = Math.max(...x) > a + 0.01 && Math.min(...x) < c - 0.01;
      const inBand = Math.max(...z) > 13.15 && Math.min(...z) < 18;
      if (inMouth && inBand && Math.max(...y) > 0.028) across.push(corners.flat());
    }
    expect(across).toEqual([]);
  });
});
