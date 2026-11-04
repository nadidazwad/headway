import { describe, expect, it } from "vitest";
import { Rng } from "../shared/rng";
import { placeTanks } from "./buildings";

describe("water tanks on a roof", () => {
  it("stand wholly on their slab, each on a stand wider than itself, and never touch", () => {
    const rng = new Rng(4);
    let placed = 0;
    let several = 0;
    for (let n = 0; n < 5000; n++) {
      const width = rng.range(1.2, 3.8);
      const depth = rng.range(1.2, 3.4);
      const tanks = placeTanks(width, depth, rng);
      placed += tanks.length;
      if (tanks.length > 1) several++;
      for (const [i, tank] of tanks.entries()) {
        expect(tank.stand).toBeGreaterThan(tank.r);
        expect(tank.x - tank.stand).toBeGreaterThanOrEqual(0);
        expect(tank.z - tank.stand).toBeGreaterThanOrEqual(0);
        expect(tank.x + tank.stand).toBeLessThanOrEqual(width);
        expect(tank.z + tank.stand).toBeLessThanOrEqual(depth);
        for (const other of tanks.slice(i + 1)) {
          const apart = Math.max(Math.abs(tank.x - other.x) - tank.stand - other.stand, Math.abs(tank.z - other.z) - tank.stand - other.stand);
          expect(apart).toBeGreaterThan(0);
        }
      }
    }
    // Still a roof full of tanks, not a rule that passes by placing none.
    expect(placed).toBeGreaterThan(5000);
    expect(several).toBeGreaterThan(800);
  });
});
