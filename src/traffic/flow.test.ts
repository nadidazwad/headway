import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadAssets } from "../assets/library";
import { Batch } from "../geometry";
import { Rng } from "../shared/rng";
import { KERB_FACE, MEDIAN_HALF } from "../world/layout";
import { MAIN_GREEN, SIGNAL_CYCLE, junctionsBetween, mainSignal, type SideStreet } from "../world/plan";
import { SPECS, createFlow, type Flow, type Kind, type Vehicle } from "./flow";
import { drawVehicle } from "./vehicles";

const FROM = 0;
const TO = 520;
/** One junction in the middle of the window, its main-road light turning red at time zero. */
const NO_HUMPS = { near: null, far: null, nearStreet: null, farStreet: null };
const junction: SideStreet = { centre: 300, half: 4, zebra: true, signal: true, phase: MAIN_GREEN, humps: NO_HUMPS };

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
  it("slows for a speed breaker, tips its nose up going over, and gets back up to speed after", () => {
    const crest = 292;
    const street: SideStreet = { centre: 300, half: 4, zebra: false, signal: false, phase: 0, humps: { ...NO_HUMPS, near: crest } };
    const flow = createFlow({ seed: 8, junctionsBetween: () => [street], from: FROM, to: TO, density: 0.5 });
    let start = -40;
    run(flow, 40, start, () => {});
    start = 0;
    let over = 0;
    let noseUp = 0;
    const approach: number[] = [];
    run(flow, 40, start, () => {
      for (const v of flow.vehicles) {
        if (v.direction !== 1) continue;
        const offset = v.s - crest;
        if (Math.abs(offset) < 0.2) {
          over++;
          expect(v.v, v.kind).toBeLessThan(SPECS[v.kind].hump + 1.2);
        }
        if (v.pitch > 0.008) noseUp++;
        if (offset < -60 && offset > -70 && v.kind === "sedan") approach.push(v.v);
      }
    });
    expect(over).toBeGreaterThan(10);
    expect(noseUp).toBeGreaterThan(0);
    // Free of the breaker, cars are well above what they cross it at.
    expect(Math.max(...approach)).toBeGreaterThan(SPECS.sedan.hump * 2);
  });

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

  it("simulates every vehicle at least as big as it is drawn, riders included", async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(await readFile(join("public", url))));
    const assets = await loadAssets("/");
    for (const kind of Object.keys(SPECS) as Kind[]) {
      for (let seed = 1; seed <= 40; seed++) {
        const b = new Batch(1 << 12);
        b.cull = false;
        drawVehicle(b, kind, assets, new Rng(seed));
        const { min, max } = b.finish();
        expect(Math.max(-min[2], max[2]) * 2, `${kind} width`).toBeLessThanOrEqual(SPECS[kind].width + 0.01);
        expect(Math.max(-min[0], max[0]) * 2, `${kind} length`).toBeLessThanOrEqual(SPECS[kind].length + 0.01);
      }
    }
  });

  it("never lets a corner of anything on wheels cross a kerb, whatever it is doing", () => {
    const overshoot = new Map<string, number>();
    const worst = (what: string, by: number): void => {
      if (by > (overshoot.get(what) ?? 0)) overshoot.set(what, by);
    };
    const seen = { laneChange: 0, halted: 0, breaker: 0, crossing: 0, kinds: new Set<Kind>() };
    for (let seed = 1; seed <= 8; seed++) {
      let distance = 4000 + seed * 137;
      const streets = new Map<number, SideStreet>();
      const flow = createFlow({ seed, junctionsBetween: (from, to) => junctionsBetween(seed, from, to), from: distance - 300, to: distance + 220 });
      for (let step = 0; step < 4000; step++) {
        const dt = step % 3 === 0 ? 0.1 : 0.033;
        distance += 10.5 * dt;
        flow.step(dt, step * 0.05, distance - 300, distance + 220);
        for (const v of flow.vehicles) {
          const { length, width } = SPECS[v.kind];
          // The furthest any corner reaches sideways from the middle of the vehicle, at this heading.
          const reach = (length / 2) * Math.abs(Math.sin(v.yaw)) + (width / 2) * Math.abs(Math.cos(v.yaw));
          const across = v.direction * v.z;
          worst(`${v.kind} over the kerb`, across + reach - KERB_FACE);
          worst(`${v.kind} on the median`, MEDIAN_HALF - (across - reach));
          seen.kinds.add(v.kind);
          if (v.change < 1) seen.laneChange++;
          if (v.halt > 0) seen.halted++;
          if (v.lift > 0.01) seen.breaker++;
        }
        for (const c of flow.crossers) {
          if (!streets.has(c.junction)) streets.set(c.junction, junctionsBetween(seed, c.junction - 1, c.junction + 1)[0]!);
          const street = streets.get(c.junction)!;
          const { length, width } = SPECS[c.kind];
          seen.crossing++;
          // Off the carriageway it must keep between the corners of its side street.
          if (Math.abs(c.z) + length / 2 > KERB_FACE) worst(`${c.kind} on the corner of a side street`, Math.abs(c.s - c.junction) + width / 2 - street.half);
        }
      }
    }
    // Every situation the road can get into really happened, or this proves nothing.
    expect(seen.kinds.size).toBe(Object.keys(SPECS).length);
    for (const count of [seen.laneChange, seen.halted, seen.breaker, seen.crossing]) expect(count).toBeGreaterThan(500);
    expect([...overshoot].map(([what, by]) => `${what} by ${by.toFixed(2)} m`)).toEqual([]);
  }, 30000);
});
