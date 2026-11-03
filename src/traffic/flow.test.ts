import { describe, expect, it } from "vitest";
import { MAIN_GREEN, SIGNAL_CYCLE, mainSignal, type SideStreet } from "../world/plan";
import { SPECS, createFlow, type Flow, type Vehicle } from "./flow";

const FROM = 0;
const TO = 520;
/** One junction in the middle of the window, its main-road light turning red at time zero. */
const junction: SideStreet = { centre: 300, half: 4, zebra: true, signal: true, phase: MAIN_GREEN };

function run(flow: Flow, seconds: number, start: number, each: (time: number) => void): void {
  for (let i = 0; i < seconds * 20; i++) {
    const time = start + i / 20;
    flow.step(0.05, time, FROM, TO);
    each(time);
  }
}

const gapsAhead = (vehicles: readonly Vehicle[]): number[] => {
  const gaps: number[] = [];
  for (const direction of [1, -1]) {
    for (let slot = 0; slot < 4; slot++) {
      const lane = vehicles.filter((v) => v.direction === direction && v.slot === slot && v.change >= 1).sort((a, b) => b.direction * b.s - a.direction * a.s);
      for (let i = 1; i < lane.length; i++) gaps.push(direction * (lane[i - 1]!.s - lane[i]!.s) - (lane[i - 1]!.length + lane[i]!.length) / 2);
    }
  }
  return gaps;
};

describe("traffic flow", () => {
  it("queues at a red light without anyone overlapping or running it, then moves off on green", () => {
    const flow = createFlow({ seed: 5, junctionsBetween: () => [junction], from: FROM, to: TO, density: 1.6 });
    // Drive for a while before the light turns, so the road is in motion.
    run(flow, 40, -SIGNAL_CYCLE * 2, () => {});
    expect(mainSignal(junction, 0)).toBe("amber");

    const stopLine = (v: Vehicle): number => v.direction * (junction.centre - v.direction * (junction.half + 1.4 - SPECS[v.kind].creep) - v.s) - v.length / 2;
    const waiting = new Set(flow.vehicles.filter((v) => stopLine(v) > 6));
    let queued = 0;
    run(flow, 12, 3, (time) => {
      expect(mainSignal(junction, time)).toBe("red");
      for (const gap of gapsAhead(flow.vehicles)) expect(gap).toBeGreaterThan(-0.05);
      for (const v of waiting) expect(stopLine(v)).toBeGreaterThan(-0.35);
    });
    for (const v of waiting) if (stopLine(v) < 40 && v.v < 0.3) queued++;
    // A queue in every lane, both ways.
    expect(queued).toBeGreaterThan(16);

    // Back to green: the first in each lane's queue gets through the junction.
    const heads: Vehicle[] = [];
    for (const direction of [1, -1]) {
      for (let slot = 0; slot < 4; slot++) {
        const short = flow.vehicles.filter((v) => v.direction === direction && v.slot === slot && stopLine(v) > -0.35 && v.v < 0.3);
        short.sort((a, b) => stopLine(a) - stopLine(b));
        if (short[0]) heads.push(short[0]);
      }
    }
    expect(heads.length).toBeGreaterThan(5);
    run(flow, 14, 15, () => {
      for (const gap of gapsAhead(flow.vehicles)) expect(gap).toBeGreaterThan(-0.05);
    });
    const through = heads.filter((v) => v.direction * (v.s - junction.centre) > junction.half);
    expect(through.length).toBeGreaterThanOrEqual(heads.length - 2);
  });
});
