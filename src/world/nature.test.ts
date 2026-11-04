import { describe, expect, it } from "vitest";
import { Batch } from "../geometry";
import { Rng } from "../shared/rng";
import { tree, type Species } from "./nature";

const SPECIES: Species[] = ["rain", "krishnachura", "mahogany", "mango", "coconut"];

const averageTriangles = (species: Species, far: boolean): number => {
  let total = 0;
  for (let i = 1; i <= 20; i++) {
    const b = new Batch(1 << 12);
    b.lines = true;
    tree(b, 0, 14, 9, new Rng(i), { species, far });
    total += b.triangles;
  }
  return total / 20;
};

describe("a street tree", () => {
  // Trees fill wide views, so these numbers are the budget that keeps the Intel GPU at 60 fps.
  it.each(SPECIES)("pays for its detail: %s", (species) => {
    expect(averageTriangles(species, false)).toBeLessThan(2500);
    expect(averageTriangles(species, true)).toBeLessThan(1000);
  });
});
