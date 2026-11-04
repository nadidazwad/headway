import { describe, expect, it } from "vitest";
import { spreadFaces, type Box } from "./spread";

const boxAt = (x: number, y: number): Box => ({ left: x - 26, right: x + 26, top: y - 50, bottom: y - 8 });

describe("spreading thought faces", () => {
  it("keeps a packed crowd apart, and leaves alone anyone with room", () => {
    const packed = [{ x: 400, y: 300 }, { x: 412, y: 302 }, { x: 395, y: 298 }, { x: 430, y: 305 }];
    const alone = { x: 900, y: 300 };
    const ys = spreadFaces([...packed, alone], boxAt);
    const boxes = packed.map((p, i) => boxAt(p.x, ys[i]!));
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top).toBe(true);
    }
    expect(ys[4]).toBe(alone.y);
  });
});
