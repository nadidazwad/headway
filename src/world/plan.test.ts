import { describe, expect, it } from "vitest";
import { SPAN } from "./layout";
import { BRIDGE_HALF, PIER_CLEAR, STAIR_RUN, chunkPlan } from "./plan";

const distanceToPier = (d: number): number => {
  const r = ((d % SPAN) + SPAN) % SPAN;
  return Math.min(r, SPAN - r);
};

describe("street plan", () => {
  it("keeps every foot bridge and junction clear of the piers, and every stair clear of the junction", () => {
    let bridges = 0;
    for (const seed of [7, 11, 90210]) {
      for (let index = -50; index < 1500; index++) {
        const { sideStreet, footBridge } = chunkPlan(seed, index);
        if (sideStreet) expect(distanceToPier(sideStreet.centre) - sideStreet.half).toBeGreaterThanOrEqual(PIER_CLEAR - 1e-9);
        if (!footBridge) continue;
        bridges++;
        expect(distanceToPier(footBridge.centre)).toBeCloseTo(SPAN / 2);
        for (const direction of footBridge.stairs) {
          const a = footBridge.centre + direction * BRIDGE_HALF;
          const b = a + direction * STAIR_RUN;
          // The stair stays inside its own chunk...
          expect(Math.min(a, b)).toBeGreaterThanOrEqual(index * 60);
          expect(Math.max(a, b)).toBeLessThanOrEqual((index + 1) * 60);
          // ...and lands short of the side street.
          if (sideStreet) {
            const overlaps = Math.max(a, b) > sideStreet.centre - sideStreet.half && Math.min(a, b) < sideStreet.centre + sideStreet.half;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
    expect(bridges).toBeGreaterThan(300);
  });

  it("is the same plan for the same seed and chunk, wherever it is asked", () => {
    expect(chunkPlan(3, 41)).toEqual(chunkPlan(3, 41));
  });
});
