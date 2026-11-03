import { Rng, hashSeed } from "../shared/rng";
import { CHUNK_LENGTH, ROAD_HALF, SPAN } from "./layout";

/**
 * Where the street is interrupted along one chunk: by a side street with its junction, or by a
 * foot-over-bridge. A pure function of seed and chunk, so the workers that build the city and the
 * main thread that drives the traffic agree on every junction without talking to each other.
 * Every position is a distance along the line.
 */
export interface SideStreet {
  centre: number;
  half: number;
  zebra: boolean;
  /** Whether a light controls it. Smaller side streets have none: their traffic noses out into gaps. */
  signal: boolean;
  /** Seconds into the signal cycle at time zero, so neighbouring junctions are out of step. */
  phase: number;
  humps: Humps;
}

/**
 * The speed breakers around a junction, or null where it has none. `near` and `far` are distances
 * along the line on the main road's approach to it, each carriageway's own. `nearStreet` and
 * `farStreet` are z positions on the side street, either side of the road.
 */
export interface Humps {
  near: number | null;
  far: number | null;
  nearStreet: number | null;
  farStreet: number | null;
}

export interface FootBridge {
  centre: number;
  /** Which way each stair runs down along the pavement, near side then far side: +1 or -1. */
  stairs: readonly [1 | -1, 1 | -1];
}

export interface ChunkPlan {
  sideStreet: SideStreet | null;
  footBridge: FootBridge | null;
}

/** Half-width of a pier footing plus room for a kerb: nothing that crosses the median comes closer. */
export const PIER_CLEAR = 2.6;
export const BRIDGE_HALF = 1.3;
/** Length of a bridge's stair along the pavement, landing included. */
export const STAIR_RUN = 12.8;
/** One full turn of a junction's signal: the main road's green, its amber, then the cross street. */
export const SIGNAL_CYCLE = 34;
export const MAIN_GREEN = 17;
export const AMBER = 2.5;
/** Both ways red for a moment, so the junction empties before the other street moves. */
export const ALL_RED = 2;

/** A speed breaker's half-length along the road and its height, in metres. */
export const HUMP_HALF = 0.75;
export const HUMP_HEIGHT = 0.085;

/** Height of the road above its level at this distance from a breaker's crest. */
export function humpHeight(offset: number): number {
  const u = Math.abs(offset) / HUMP_HALF;
  if (u >= 1) return 0;
  const c = Math.cos((u * Math.PI) / 2);
  return HUMP_HEIGHT * c * c;
}

const SPANS = CHUNK_LENGTH / SPAN;

/** From its own random stream, so adding breakers never moves anything else in the city. */
function humpsFor(seed: number, index: number): Humps {
  const rng = new Rng(hashSeed(seed, index, 0xb4ea));
  const back = (): number => rng.range(6, 10);
  const out = (): number => ROAD_HALF + rng.range(7, 12);
  return {
    near: rng.chance(0.62) ? back() : null,
    far: rng.chance(0.62) ? back() : null,
    nearStreet: rng.chance(0.72) ? out() : null,
    farStreet: rng.chance(0.72) ? -out() : null,
  };
}

export function chunkPlan(seed: number, index: number): ChunkPlan {
  const rng = new Rng(hashSeed(seed, index, 0x51de));
  const start = index * CHUNK_LENGTH;
  let sideStreet: SideStreet | null = null;
  let streetSpan = -1;
  if (rng.chance(0.45)) {
    streetSpan = rng.int(0, SPANS - 1);
    const half = rng.range(6.5, 9) / 2;
    const room = SPAN / 2 - half - PIER_CLEAR;
    sideStreet = {
      centre: start + streetSpan * SPAN + SPAN / 2 + rng.range(-room, room),
      half,
      zebra: rng.chance(0.75),
      signal: rng.chance(half > 3.9 ? 0.55 : 0.25),
      phase: rng.range(0, SIGNAL_CYCLE),
      humps: humpsFor(seed, index),
    };
    // The approach humps are measured from where the junction really is.
    const { centre } = sideStreet;
    const { near, far } = sideStreet.humps;
    if (near !== null) sideStreet.humps.near = centre - half - near;
    if (far !== null) sideStreet.humps.far = centre + half + far;
  }

  let footBridge: FootBridge | null = null;
  if (rng.chance(0.32)) {
    const spans = [0, 1, 2].filter((span) => span !== streetSpan);
    const span = rng.pick(spans);
    const centre = start + span * SPAN + SPAN / 2;
    // A stair runs inwards from the chunk's end spans, so it never reaches into a neighbour.
    const choices: Array<1 | -1> = span === 0 ? [1] : span === SPANS - 1 ? [-1] : [1, -1];
    const fits = (direction: 1 | -1): boolean => {
      if (!sideStreet) return true;
      const a = centre + direction * BRIDGE_HALF;
      const b = a + direction * STAIR_RUN;
      const low = Math.min(a, b) - 2;
      const high = Math.max(a, b) + 2;
      return high < sideStreet.centre - sideStreet.half || low > sideStreet.centre + sideStreet.half;
    };
    const usable = choices.filter(fits);
    if (usable.length) footBridge = { centre, stairs: [rng.pick(usable), rng.pick(usable)] };
  }
  return { sideStreet, footBridge };
}

/** Every junction whose centre lies between two distances along the line, in order. */
export function junctionsBetween(seed: number, from: number, to: number): SideStreet[] {
  const out: SideStreet[] = [];
  for (let index = Math.floor(from / CHUNK_LENGTH); index <= Math.floor(to / CHUNK_LENGTH); index++) {
    const street = chunkPlan(seed, index).sideStreet;
    if (street && street.centre >= from && street.centre <= to) out.push(street);
  }
  return out;
}

export type SignalState = "green" | "amber" | "red";

/** What the main road's light shows at a junction at this moment. The cross street gets the rest. */
export function mainSignal(street: SideStreet, time: number): SignalState {
  if (!street.signal) return "green";
  const t = (((time + street.phase) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (t < MAIN_GREEN) return "green";
  if (t < MAIN_GREEN + AMBER) return "amber";
  return "red";
}

/** Whether the cross street may go: after the main road's amber and an all-red, until the cycle ends. */
export function crossGreen(street: SideStreet, time: number): boolean {
  if (!street.signal) return false;
  const t = (((time + street.phase) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  return t >= MAIN_GREEN + AMBER + ALL_RED && t < SIGNAL_CYCLE - ALL_RED;
}
