import { describe, expect, it } from "vitest";
import { AXLES, RAIL_LENGTH, railHits } from "./rails";

describe("rail joints", () => {
  it("come from the distance travelled, however the journey is cut into frames", () => {
    const start = 4000;
    const whole = railHits(start, start + 500);
    // Every axle meets a joint once per rail length, and nothing else.
    expect(whole.length).toBeGreaterThanOrEqual(AXLES.length * Math.floor(500 / RAIL_LENGTH));
    expect(whole.length).toBeLessThanOrEqual(AXLES.length * Math.ceil(500 / RAIL_LENGTH));

    // Uneven frames, as a browser gives them, make exactly the same hits.
    const sliced = [];
    let at = start;
    for (let i = 0; at < start + 500; i++) {
      const next = Math.min(start + 500, at + [0.17, 0.35, 0.09, 1.6][i % 4]!);
      sliced.push(...railHits(at, next));
      at = next;
    }
    expect(sliced.map((hit) => hit.at)).toEqual(whole.map((hit) => hit.at));

    // A train that has not moved hits nothing.
    expect(railHits(start, start)).toEqual([]);
  });
});
