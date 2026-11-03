import { Rng, hashSeed } from "../shared/rng";
import { HUMP_HALF, crossGreen, humpHeight, mainSignal, type SideStreet } from "../world/plan";

/**
 * The road as a simulation, with no drawing in it. Every vehicle follows the one ahead with the
 * intelligent driver model, so speed differences become braking, bunching and queues on their
 * own. Junctions have signals: the main road stops at its line on red while the cross street
 * goes. Slow vehicles hold up fast ones, which look for a gap in the next lane and take it.
 * Buses, CNGs and rickshaws stop at the kerb for fares. Everything lives in a window that rides
 * with the train; whatever leaves it comes back in at the other end.
 *
 * Positions are distances along the line (`s`). Lanes are numbered from the median outward, so
 * slot 3 is the kerb lane. Bangladesh drives on the left: direction +1 runs with the train on the
 * near side (z > 0), direction -1 against it on the far side.
 */
export type Kind = "sedan" | "suv" | "hatch" | "taxi" | "van" | "truck" | "delivery" | "cng" | "rickshaw_fan" | "rickshaw_cycle" | "bus_town" | "bike";

interface Spec {
  length: number;
  /** Free speed range, metres a second. */
  speed: readonly [number, number];
  accel: number;
  brake: number;
  headway: number;
  standstill: number;
  slots: readonly number[];
  /** How far it drifts about inside its lane. */
  weave: number;
  /** Acceleration it must gain before it bothers to change lanes. */
  eagerness: number;
  /** Chance, at each look around, that it pulls up at the kerb. */
  halts: number;
  /** How far past the stop line it dares to edge on red. */
  creep: number;
  /** How fast it dares go over a speed breaker. */
  hump: number;
}

const CAR: Omit<Spec, "length"> = { speed: [8.5, 12.5], accel: 1.6, brake: 2.8, headway: 1.0, standstill: 1.6, slots: [0, 1, 2], weave: 0.06, eagerness: 0.45, halts: 0, creep: 0.3, hump: 2.4 };

export const SPECS: Record<Kind, Spec> = {
  sedan: { ...CAR, length: 4.4 },
  suv: { ...CAR, length: 4.7 },
  hatch: { ...CAR, length: 4 },
  taxi: { ...CAR, length: 4.4, slots: [0, 1, 2, 3], halts: 0.02 },
  van: { ...CAR, length: 5, speed: [8, 11], slots: [0, 1, 2, 3] },
  truck: { ...CAR, length: 7, speed: [6.5, 9], accel: 0.9, brake: 2.2, headway: 1.4, standstill: 2, eagerness: 0.9, hump: 1.7 },
  delivery: { ...CAR, length: 6, speed: [7.5, 10], accel: 1.1, slots: [1, 2, 3], eagerness: 0.8 },
  bus_town: { ...CAR, length: 10.5, speed: [7.5, 10.5], accel: 1.0, brake: 2.5, headway: 1.2, standstill: 2, slots: [1, 2, 3], eagerness: 0.7, halts: 0.07, hump: 1.6 },
  cng: { length: 2.9, speed: [7, 10], accel: 1.4, brake: 3, headway: 0.7, standstill: 1.0, slots: [0, 1, 2, 3], weave: 0.22, eagerness: 0.12, halts: 0.03, creep: 1.6, hump: 2.6 },
  bike: { length: 1.9, speed: [10, 14], accel: 2.5, brake: 4, headway: 0.5, standstill: 0.8, slots: [0, 1, 2, 3], weave: 0.32, eagerness: 0.05, halts: 0, creep: 2.4, hump: 3.2 },
  rickshaw_fan: { length: 2.7, speed: [2.8, 4.2], accel: 0.5, brake: 2, headway: 0.9, standstill: 0.9, slots: [2, 3], weave: 0.18, eagerness: 0.25, halts: 0.05, creep: 1.2, hump: 1.5 },
  rickshaw_cycle: { length: 2.7, speed: [2.8, 4.2], accel: 0.5, brake: 2, headway: 0.9, standstill: 0.9, slots: [2, 3], weave: 0.18, eagerness: 0.25, halts: 0.05, creep: 1.2, hump: 1.5 },
};

export const LANE_Z = [3.4, 6.4, 9.4, 12.1] as const;
/** Where a stopped front bumper rests, back from the junction's edge, before any creeping. */
const STOP_BACK = 1.4;
/** How hard a driver brakes for a speed breaker they have seen coming, metres a second squared. */
const HUMP_BRAKE = 1.3;
/** Distance between axles as a share of a vehicle's length. */
const WHEELBASE = 0.6;
/** Main-road traffic eases off this close to a junction, signal or not. */
const JUNCTION_SLOW = 9;
/** The most a vehicle turns its nose while changing lanes or pulling in, radians. */
const MAX_YAW = 0.28;

export interface Vehicle {
  kind: Kind;
  direction: 1 | -1;
  slot: number;
  s: number;
  v: number;
  /** Drawn sideways position and heading. */
  z: number;
  yaw: number;
  readonly length: number;
  desired: number;
  /** Lane centre it is moving away from, while a lane change lasts. */
  zFrom: number;
  change: number;
  changeTime: number;
  wobble: number;
  halt: number;
  /** How far it has pulled over towards the kerb, eased. */
  pull: number;
  dawdle: number;
  think: number;
  creep: number;
  /** Rise over a speed breaker, and how far the nose is up: sprung, so it nods as it comes off. */
  lift: number;
  pitch: number;
  pitchRate: number;
}

/** A vehicle crossing the main road along a side street, between the two kerbs and beyond. */
export interface Crosser {
  kind: Kind;
  junction: number;
  /** Which way it is heading along z: +1 towards the viewer. */
  heading: 1 | -1;
  s: number;
  z: number;
  v: number;
  desired: number;
  readonly length: number;
  wobble: number;
  lift: number;
  pitch: number;
  pitchRate: number;
}

interface Body {
  lift: number;
  pitch: number;
  pitchRate: number;
}

/** Rides a body over any breakers: each axle follows the road, and the springs follow the axles. */
function ride(body: Body, along: number, heading: number, length: number, crests: ReadonlyArray<number | null>, dt: number): void {
  const reach = (WHEELBASE * length) / 2;
  let front = 0;
  let rear = 0;
  for (const crest of crests) {
    if (crest === null) continue;
    front += humpHeight(along + heading * reach - crest);
    rear += humpHeight(along - heading * reach - crest);
  }
  body.lift = (front + rear) / 2;
  const target = Math.atan2(front - rear, reach * 2);
  const step = Math.min(dt, 0.05);
  body.pitchRate += (70 * (target - body.pitch) - 8 * body.pitchRate) * step;
  body.pitch += body.pitchRate * step;
}

/** The fastest a driver would be going this far short of a breaker they mean to cross at `over`. */
const humpLimit = (ahead: number, over: number): number => (ahead <= 0 ? over : Math.sqrt(over * over + 2 * HUMP_BRAKE * ahead));

export interface Flow {
  readonly vehicles: readonly Vehicle[];
  readonly crossers: readonly Crosser[];
  step(dt: number, time: number, from: number, to: number): void;
}

export interface FlowOptions {
  seed: number;
  junctionsBetween(from: number, to: number): SideStreet[];
  from: number;
  to: number;
  /** Vehicles per lane slot, near side and far side alike. */
  mix?: readonly (readonly Kind[])[];
  density?: number;
}

const DEFAULT_MIX: readonly (readonly Kind[])[] = [
  ["sedan", "sedan", "suv", "bike", "cng", "hatch", "taxi", "sedan", "bus_town", "bike", "suv"],
  ["sedan", "cng", "cng", "bike", "suv", "cng", "bus_town", "van", "cng", "truck", "delivery", "hatch"],
  ["cng", "cng", "bus_town", "hatch", "cng", "bike", "van", "rickshaw_cycle", "taxi", "delivery"],
  ["rickshaw_fan", "rickshaw_cycle", "rickshaw_fan", "cng", "rickshaw_cycle", "cng", "bus_town", "rickshaw_fan"],
];
export const CROSS_MIX: readonly Kind[] = ["rickshaw_fan", "cng", "rickshaw_cycle", "bike", "cng", "sedan", "rickshaw_fan", "hatch", "cng", "bike"];
/** How many crossers one junction keeps at most: a side street's worth each way. */
export const CROSSERS_PER_JUNCTION = 10;
const CROSS_REACH = 72;
/** Front bumper of a waiting crosser, just short of the main road's kerb. */
const CROSS_STOP = 14.6;

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The intelligent driver model: how hard to accelerate given the free road and the gap ahead. */
function idm(spec: Spec, v: number, desired: number, gap: number, closing: number): number {
  const free = desired > 0.05 ? 1 - Math.pow(v / desired, 4) : -1;
  if (gap === Infinity) return spec.accel * free;
  const wanted = spec.standstill + Math.max(0, v * spec.headway + (v * closing) / (2 * Math.sqrt(spec.accel * spec.brake)));
  const g = Math.max(gap, 0.05);
  return spec.accel * (free - (wanted / g) * (wanted / g));
}

export function createFlow(options: FlowOptions): Flow {
  const rng = new Rng(hashSeed(options.seed, 919));
  const mix = options.mix ?? DEFAULT_MIX;
  const density = options.density ?? 1.15;
  const vehicles: Vehicle[] = [];
  const crossers: Crosser[] = [];
  const lanes: Vehicle[][] = Array.from({ length: 8 }, () => []);
  const laneOf = (direction: number, slot: number): number => (direction > 0 ? 0 : 4) + slot;
  const zOf = (direction: number, slot: number): number => direction * LANE_Z[slot]!;

  const makeVehicle = (kind: Kind, direction: 1 | -1, slot: number, s: number): Vehicle => {
    const spec = SPECS[kind];
    const desired = rng.range(spec.speed[0], spec.speed[1]);
    const z = zOf(direction, slot) + rng.range(-0.25, 0.25);
    return { kind, direction, slot, s, v: desired * rng.range(0.6, 1), z, yaw: 0, length: spec.length, desired, zFrom: z, change: 1, changeTime: 1, wobble: rng.range(0, 100), halt: 0, pull: 0, dawdle: 0, think: rng.range(0, 2), creep: rng.range(0, spec.creep), lift: 0, pitch: 0, pitchRate: 0 };
  };

  for (const direction of [1, -1] as const) {
    for (let slot = 0; slot < 4; slot++) {
      let cursor = options.from + rng.range(0, 10);
      while (cursor < options.to - 6) {
        const kind = rng.pick(mix[slot]!);
        const spec = SPECS[kind];
        if (!spec.slots.includes(slot)) continue;
        vehicles.push(makeVehicle(kind, direction, slot, cursor + spec.length / 2));
        cursor += spec.length + rng.range(4, 26) / density;
      }
    }
  }

  let junctions: SideStreet[] = [];
  const crestsHere: Array<number | null> = [];
  let junctionsFrom = Infinity;
  let junctionsTo = -Infinity;
  const crossTimers = new Map<number, [number, number]>();
  const crossersAt = new Map<number, Crosser[]>();

  /** The junction this vehicle meets next, if one is ahead of it in the window. */
  const nextJunction = (vehicle: Vehicle): SideStreet | null => {
    const front = vehicle.s + vehicle.direction * vehicle.length * 0.5;
    let best: SideStreet | null = null;
    let bestDistance = Infinity;
    for (const j of junctions) {
      const line = j.centre - vehicle.direction * (j.half + STOP_BACK);
      const ahead = vehicle.direction * (line - front);
      if (ahead > -j.half * 2 - 2 && ahead < bestDistance) {
        bestDistance = ahead;
        best = j;
      }
    }
    return best;
  };

  /** Gap and closing speed to whatever this vehicle must not run into. */
  const obstacle = (vehicle: Vehicle, leader: Vehicle | undefined, time: number): { gap: number; closing: number } => {
    let gap = Infinity;
    let closing = 0;
    if (leader) {
      gap = vehicle.direction * (leader.s - vehicle.s) - (leader.length + vehicle.length) / 2;
      closing = vehicle.v - leader.v;
    }
    const j = nextJunction(vehicle);
    if (j) {
      const signal = mainSignal(j, time);
      const front = vehicle.s + vehicle.direction * vehicle.length * 0.5;
      const line = j.centre - vehicle.direction * (j.half + STOP_BACK - vehicle.creep);
      const toLine = vehicle.direction * (line - front);
      // On amber, whoever cannot stop comfortably goes through; on red, everyone short of the line stops.
      const canStop = toLine > (vehicle.v * vehicle.v) / (2 * SPECS[vehicle.kind].brake) - 0.5;
      const stopForSignal = signal === "red" || (signal === "amber" && canStop);
      // And nobody drives through a rickshaw still crossing, whatever the light says.
      const crossing = (crossersAt.get(j.centre) ?? []).some((c) => Math.abs(c.z) < CROSS_STOP - 0.1 && c.heading * (vehicle.z - c.z) > -2.4);
      if ((stopForSignal || crossing) && toLine > -0.3 && toLine < gap) {
        gap = Math.max(0, toLine);
        closing = vehicle.v;
      }
    }
    return { gap, closing };
  };

  /** The breaker this carriageway meets on its way into a junction, if it has one. */
  const crestOn = (j: SideStreet, direction: number): number | null => (direction > 0 ? j.humps.near : j.humps.far);

  const desiredNow = (vehicle: Vehicle): number => {
    if (vehicle.halt > 0) return 0;
    let desired = vehicle.desired;
    if (vehicle.dawdle > 0) desired *= 0.45;
    for (const j of junctions) {
      if (Math.abs(vehicle.s - j.centre) < j.half + JUNCTION_SLOW) {
        desired *= 0.58;
        break;
      }
    }
    const front = vehicle.s + (vehicle.direction * vehicle.length) / 2;
    for (const j of junctions) {
      const crest = crestOn(j, vehicle.direction);
      if (crest === null) continue;
      const ahead = vehicle.direction * (crest - front);
      if (ahead > -vehicle.length - HUMP_HALF && ahead < 45) desired = Math.min(desired, humpLimit(ahead, SPECS[vehicle.kind].hump));
    }
    return desired;
  };

  const nearJunction = (s: number, margin: number): boolean => junctions.some((j) => Math.abs(s - j.centre) < j.half + margin);

  /** Leader and follower a vehicle would have in another lane. */
  const neighbours = (lane: Vehicle[], vehicle: Vehicle): { leader?: Vehicle; follower?: Vehicle } => {
    let leader: Vehicle | undefined;
    let follower: Vehicle | undefined;
    const mine = vehicle.direction * vehicle.s;
    for (const other of lane) {
      const theirs = vehicle.direction * other.s;
      if (theirs >= mine) {
        if (!leader || theirs < vehicle.direction * leader.s) leader = other;
      } else if (!follower || theirs > vehicle.direction * follower.s) follower = other;
    }
    return { leader, follower };
  };

  const considerLaneChange = (vehicle: Vehicle, leader: Vehicle | undefined, time: number): void => {
    const spec = SPECS[vehicle.kind];
    if (vehicle.change < 1 || vehicle.halt > 0 || nearJunction(vehicle.s, 4)) return;
    // Only a bike threads sideways out of a standstill; everything else needs to be rolling.
    if (vehicle.v < (vehicle.kind === "bike" ? 0.4 : 1.6)) return;
    const desired = desiredNow(vehicle);
    const here = obstacle(vehicle, leader, time);
    const current = idm(spec, vehicle.v, desired, here.gap, here.closing);
    let best = -1;
    let bestGain = spec.eagerness;
    for (const slot of [vehicle.slot - 1, vehicle.slot + 1]) {
      if (!spec.slots.includes(slot)) continue;
      const lane = lanes[laneOf(vehicle.direction, slot)]!;
      const { leader: newLeader, follower } = neighbours(lane, vehicle);
      if (follower) {
        const gapBehind = vehicle.direction * (vehicle.s - follower.s) - (vehicle.length + follower.length) / 2;
        const followerSpec = SPECS[follower.kind];
        const forced = idm(followerSpec, follower.v, follower.desired, gapBehind, follower.v - vehicle.v);
        if (gapBehind < followerSpec.standstill * 0.8 || forced < -followerSpec.brake * 1.3) continue;
      }
      const there = obstacle(vehicle, newLeader, time);
      if (there.gap < spec.standstill) continue;
      // Slow vehicles drift to the kerb, fast ones away from it, as on any road.
      const bias = (slot - vehicle.slot) * (vehicle.desired < 6 || vehicle.kind === "bus_town" ? 0.25 : -0.12);
      const gain = idm(spec, vehicle.v, desired, there.gap, there.closing) - current + bias;
      if (gain > bestGain) {
        bestGain = gain;
        best = slot;
      }
    }
    if (best < 0) return;
    // zFrom still holds the old lane's centre: the change eases from there to the new one.
    vehicle.slot = best;
    vehicle.change = 0;
    vehicle.changeTime = vehicle.kind === "bike" ? rng.range(0.9, 1.4) : rng.range(1.6, 2.6);
  };

  /** Brings back a vehicle that has left the window at the far end, behind whatever is already there. */
  const recycle = (vehicle: Vehicle, from: number, to: number): void => {
    const spec = SPECS[vehicle.kind];
    const outFront = vehicle.s > to;
    const slot = rng.pick(spec.slots);
    const lane = lanes[laneOf(vehicle.direction, slot)]!;
    let s: number;
    if (outFront) {
      // Gone ahead of the window: bring it back in from behind.
      let low = from - rng.range(0, 8);
      for (const other of lane) if (other !== vehicle) low = Math.min(low, other.s - (other.length + vehicle.length) / 2 - spec.standstill - rng.range(2, 14));
      s = low;
    } else {
      let high = to + rng.range(0, 8);
      for (const other of lane) if (other !== vehicle) high = Math.max(high, other.s + (other.length + vehicle.length) / 2 + spec.standstill + rng.range(2, 14) / density);
      s = high;
    }
    vehicle.slot = slot;
    vehicle.s = s;
    vehicle.desired = rng.range(spec.speed[0], spec.speed[1]);
    vehicle.v = vehicle.desired * 0.85;
    vehicle.z = vehicle.zFrom = zOf(vehicle.direction, slot);
    vehicle.change = 1;
    vehicle.halt = 0;
    vehicle.pull = 0;
    vehicle.dawdle = 0;
    vehicle.creep = rng.range(0, spec.creep);
  };

  const refreshJunctions = (from: number, to: number): void => {
    if (from >= junctionsFrom && to <= junctionsTo) return;
    junctionsFrom = from - 120;
    junctionsTo = to + 120;
    junctions = options.junctionsBetween(junctionsFrom, junctionsTo);
    const live = new Set(junctions.map((j) => j.centre));
    for (let i = crossers.length - 1; i >= 0; i--) if (!live.has(crossers[i]!.junction)) crossers.splice(i, 1);
    for (const key of [...crossTimers.keys()]) if (!live.has(key)) crossTimers.delete(key);
  };

  /**
   * At a junction without a light, a crosser noses out when nothing on the main road is about to
   * reach it, and once it is out the main road waits for it.
   */
  const gates = new Map<number, { shut: number; left: number }>();
  const gapAt = (j: SideStreet, time: number): boolean => {
    const gate = gates.get(j.centre);
    if (gate && time < gate.shut) return false;
    for (const v of vehicles) {
      const front = v.s + v.direction * v.length * 0.5;
      const toBox = v.direction * (j.centre - v.direction * j.half - front);
      if (toBox < -j.half * 2 - v.length || toBox > 26) continue;
      if (toBox < 0 || v.v * 2.2 > toBox) return false;
    }
    return true;
  };

  const stepCrossers = (dt: number, time: number, from: number, to: number): void => {
    for (const j of junctions) {
      if (j.centre < from || j.centre > to) continue;
      const timers = crossTimers.get(j.centre) ?? [rng.range(0, 3), rng.range(0, 3)];
      crossTimers.set(j.centre, timers);
      ([1, -1] as const).forEach((heading, i) => {
        timers[i]! -= dt;
        if (timers[i]! > 0) return;
        timers[i] = rng.range(1.2, 4.5);
        const own = crossers.filter((c) => c.junction === j.centre && c.heading === heading);
        if (own.length >= CROSSERS_PER_JUNCTION / 2) return;
        const startZ = -heading * CROSS_REACH;
        const last = own.reduce<Crosser | null>((m, c) => (!m || heading * c.z < heading * m.z ? c : m), null);
        if (last && heading * (last.z - startZ) < last.length + 3) return;
        const kind = rng.pick(CROSS_MIX);
        const spec = SPECS[kind];
        const desired = rng.range(spec.speed[0], spec.speed[1]) * 0.7;
        crossers.push({ kind, junction: j.centre, heading, s: j.centre - heading * Math.min(1.8, j.half * 0.45), z: startZ, v: desired, desired, length: spec.length, wobble: rng.range(0, 100), lift: 0, pitch: 0, pitchRate: 0 });
      });
    }
    const go = new Map(junctions.map((j) => [j.centre, j.signal ? crossGreen(j, time) : gapAt(j, time)]));
    for (const c of crossers) {
      const spec = SPECS[c.kind];
      let gap = Infinity;
      let closing = 0;
      for (const other of crossers) {
        if (other === c || other.junction !== c.junction || other.heading !== c.heading) continue;
        const ahead = c.heading * (other.z - c.z);
        if (ahead <= 0) continue;
        const g = ahead - (other.length + c.length) / 2;
        if (g < gap) {
          gap = g;
          closing = c.v - other.v;
        }
      }
      const front = c.z + (c.heading * c.length) / 2;
      const toLine = c.heading * (-c.heading * CROSS_STOP - front);
      if (!go.get(c.junction) && toLine > -0.3 && toLine < gap) {
        gap = Math.max(0, toLine);
        closing = c.v;
      }
      const own = junctions.find((k) => k.centre === c.junction);
      let wanted = c.desired;
      const crests = own ? [own.humps.nearStreet, own.humps.farStreet] : [];
      for (const crest of crests) {
        if (crest === null) continue;
        const ahead = c.heading * (crest - front);
        if (ahead > -c.length - HUMP_HALF && ahead < 30) wanted = Math.min(wanted, humpLimit(ahead, spec.hump));
      }
      const a = idm(spec, c.v, wanted, gap, closing);
      c.v = Math.max(0, c.v + a * dt);
      const move = Math.min(c.v * dt, Math.max(0, gap - 0.15));
      c.z += c.heading * move;
      ride(c, c.z, c.heading, c.length, crests, dt);
      // Without a light, a few go at once and then the main road gets its turn.
      const j = junctions.find((k) => k.centre === c.junction);
      if (j && !j.signal && toLine > 0 && toLine - move <= 0) {
        const gate = gates.get(j.centre) ?? { shut: 0, left: rng.int(1, 3) };
        gate.left -= 1;
        if (gate.left <= 0) {
          gate.shut = time + rng.range(5, 10);
          gate.left = rng.int(1, 3);
        }
        gates.set(j.centre, gate);
      }
    }
    for (let i = crossers.length - 1; i >= 0; i--) if (crossers[i]!.heading * crossers[i]!.z > CROSS_REACH) crossers.splice(i, 1);
  };

  return {
    vehicles,
    crossers,
    step(dt, time, from, to) {
      if (dt <= 0) return;
      refreshJunctions(from, to);
      crossersAt.clear();
      for (const c of crossers) {
        const list = crossersAt.get(c.junction);
        if (list) list.push(c);
        else crossersAt.set(c.junction, [c]);
      }
      for (const lane of lanes) lane.length = 0;
      for (const vehicle of vehicles) lanes[laneOf(vehicle.direction, vehicle.slot)]!.push(vehicle);
      // Front of each lane first, in its own direction of travel.
      for (const lane of lanes) lane.sort((a, c) => c.direction * c.s - a.direction * a.s);

      for (const lane of lanes) {
        for (let i = 0; i < lane.length; i++) {
          const vehicle = lane[i]!;
          const leader = i > 0 ? lane[i - 1] : undefined;
          const spec = SPECS[vehicle.kind];
          vehicle.think -= dt;
          vehicle.halt = Math.max(0, vehicle.halt - dt);
          vehicle.dawdle = Math.max(0, vehicle.dawdle - dt);
          if (vehicle.think <= 0) {
            vehicle.think = rng.range(0.4, 1.4);
            if (vehicle.slot === 3 && spec.halts > 0 && vehicle.halt === 0 && !nearJunction(vehicle.s, 14) && rng.chance(spec.halts)) {
              vehicle.halt = vehicle.kind === "bus_town" ? rng.range(6, 14) : rng.range(3, 9);
            } else if (rng.chance(0.035)) {
              vehicle.dawdle = rng.range(0.6, 1.6);
            }
            considerLaneChange(vehicle, leader, time);
          }
          const { gap, closing } = obstacle(vehicle, leader, time);
          const a = Math.max(-9, idm(spec, vehicle.v, desiredNow(vehicle), gap, closing));
          vehicle.v = Math.max(0, vehicle.v + a * dt);
          // Never step into the vehicle ahead, whatever the integration says.
          const move = Math.min(vehicle.v * dt, Math.max(0, gap - 0.1));
          if (move < vehicle.v * dt) vehicle.v = move / dt;
          vehicle.s += vehicle.direction * move;
        }
      }

      for (const vehicle of vehicles) {
        const spec = SPECS[vehicle.kind];
        const before = vehicle.z;
        // A lane change moves sideways only as the vehicle moves forward: nothing crabs.
        vehicle.change = Math.min(1, vehicle.change + (dt / vehicle.changeTime) * Math.min(1, vehicle.v / 4));
        const lane = zOf(vehicle.direction, vehicle.slot);
        vehicle.pull += ((vehicle.halt > 0 ? 0.75 : 0) - vehicle.pull) * Math.min(1, dt * 1.4);
        const settle = vehicle.zFrom + (lane - vehicle.zFrom) * smoothstep(vehicle.change) + vehicle.direction * vehicle.pull;
        const sway = spec.weave * Math.sin(vehicle.wobble + time * (0.35 + spec.weave)) * Math.min(1, vehicle.v / 3);
        vehicle.z = settle + sway;
        if (vehicle.change >= 1) vehicle.zFrom = lane;
        const lateral = (vehicle.z - before) / dt;
        // A long vehicle turns its nose less for the same sideways shift.
        const limit = MAX_YAW * Math.min(1, 4 / vehicle.length);
        const target = Math.max(-limit, Math.min(limit, Math.atan2(lateral, Math.max(vehicle.v, 2)))) * vehicle.direction;
        vehicle.yaw += (target - vehicle.yaw) * Math.min(1, dt * 5);
        crestsHere.length = 0;
        for (const j of junctions) crestsHere.push(crestOn(j, vehicle.direction));
        ride(vehicle, vehicle.s, vehicle.direction, vehicle.length, crestsHere, dt);
        if (vehicle.s < from - 6 || vehicle.s > to + 40) {
          recycle(vehicle, from, to);
          vehicle.yaw = 0;
        }
      }
      stepCrossers(dt, time, from, to);
    },
  };
}
