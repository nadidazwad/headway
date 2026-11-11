import type { Assets, Outfit, PersonPose } from "../assets";
import { Rng, hashSeed } from "../shared/rng";
import { DOOR_CENTERS, NOSE_AT, STRAP_RAIL_Z, STRAP_STEP } from "../train/layout";
import { NAMES_F, NAMES_M, thoughtsOf, type Fits, type Thought, type Theme } from "./corpus";
import { isSeated, seatsOfCoach, witness, type Placed } from "./sights";

export interface Passenger extends Placed {
  name: { bn: string; en: string };
  /** Index into the baked cast. */
  avatar: number;
  /** Radians. Zero faces the viewer (+Z). */
  facing: number;
  thought: Thought | null;
  /** Height of the top of the head over the floor. */
  headTop: number;
}

interface Place {
  x: number;
  z: number;
  facing: number;
  kind: "seat" | "strap" | "door" | "aisle";
}

/** How each coach rides, which is what its name jokes about: how full, how many seated, how many asleep. */
interface Scene {
  riders: readonly [number, number];
  seated: number;
  asleep: number;
  speakers: readonly [number, number];
  /** Shoulder room between two people on their feet, in metres. */
  room: number;
  standing: ReadonlyArray<Exclude<PersonPose, "sit" | "sitrest" | "sitphone" | "strap">>;
}

const SCENES: Record<Theme, Scene> = {
  women: { riders: [12, 15], seated: 0.62, asleep: 0.15, speakers: [4, 5], room: 0.66, standing: ["stand", "phone", "music", "bag", "look"] },
  crush: { riders: [21, 25], seated: 0.42, asleep: 0.1, speakers: [5, 7], room: 0.56, standing: ["stand", "stand", "phone", "music", "bag", "bag", "look"] },
  seat: { riders: [15, 18], seated: 0.7, asleep: 0.22, speakers: [4, 6], room: 0.64, standing: ["stand", "stand", "bag", "look", "phone"] },
  sleep: { riders: [10, 13], seated: 0.8, asleep: 0.6, speakers: [4, 5], room: 0.7, standing: ["stand", "look", "music", "bag"] },
  late: { riders: [10, 13], seated: 0.45, asleep: 0, speakers: [4, 5], room: 0.68, standing: ["phone", "phone", "look", "look", "stand", "bag", "music"] },
  first: { riders: [9, 12], seated: 0.58, asleep: 0.08, speakers: [3, 5], room: 0.7, standing: ["look", "look", "phone", "stand", "music"] },
};

const ringBy = (x: number): number => Math.round(x / STRAP_STEP) * STRAP_STEP;
// The right hand is up in the ring, so the body stands a shoulder's width along from it.
const atRing = (ring: number): Place => ({ x: ring + 0.17, z: -STRAP_RAIL_Z - 0.08, facing: 0, kind: "strap" });

/**
 * Where people stand: at a ring, in a doorway with a shoulder to the glass, or loose in the aisle.
 * Nobody stands closer to anybody than the coach's shoulder room, and a full coach fills the aisle.
 */
function standingPlaces(rng: Rng, count: number, scene: Scene, xMin: number, xMax: number): Place[] {
  const crowded = scene.room < 0.6;
  const wanted: Place[] = [];
  for (const centre of DOOR_CENTERS) {
    const side = rng.chance(0.5) ? 1 : -1;
    wanted.push(atRing(ringBy(centre + 1.1)));
    wanted.push({ x: centre + side * rng.range(0.12, 0.5), z: -rng.range(0.7, 0.98), facing: rng.range(-0.5, 0.5), kind: "door" });
    wanted.push({ x: centre - side * rng.range(0.12, 0.5), z: rng.range(0.6, 0.95), facing: side * rng.range(1.1, 2.1), kind: "door" });
    wanted.push({ x: centre + rng.range(-0.9, 0.9), z: rng.range(-0.3, 0.4), facing: rng.range(-1.2, 1.2), kind: "aisle" });
    if (crowded) wanted.push(atRing(ringBy(centre - 1.6)), atRing(ringBy(centre + 2.6)));
  }
  const order = rng.shuffled(wanted);
  // Whoever is left over finds a gap along the aisle.
  for (let i = 0; i < 80; i++) order.push({ x: rng.range(xMin + 0.6, xMax - 0.6), z: rng.range(-0.36, 0.42), facing: rng.range(-1.2, 1.2), kind: "aisle" });
  const out: Place[] = [];
  for (const place of order) {
    if (out.length >= count) break;
    if (place.x < xMin + 0.5 || place.x > xMax - 0.5) continue;
    if (out.every((other) => Math.hypot(other.x - place.x, other.z - place.z) >= scene.room)) out.push(place);
  }
  return out;
}

/**
 * Which seats are taken. People sit where the camera sees their faces first, and as often as not
 * next to someone already seated, the way a bench fills from a few clumps: a neighbour is what
 * most thoughts on a train are about.
 */
function seatedPlaces(rng: Rng, count: number, standing: readonly Place[], xMin: number, xMax: number): Place[] {
  // A seat under someone holding a ring has their knees in it.
  const open = seatsOfCoach().filter(([x, z]) => x > xMin && x < xMax && !standing.some((place) => place.kind === "strap" && z < 0 && Math.abs(place.x - x) < 0.42));
  const free = { far: rng.shuffled(open.filter(([, z]) => z < 0)), near: rng.shuffled(open.filter(([, z]) => z > 0)) };
  const out: Place[] = [];
  const sit = (side: "far" | "near"): void => {
    const list = free[side];
    const taken = out.filter((place) => Math.sign(place.z) === (side === "far" ? -1 : 1));
    const next = rng.chance(0.6) ? list.findIndex(([x]) => taken.some((place) => Math.abs(place.x - x) < 0.6)) : -1;
    const [seat] = list.splice(Math.max(0, next), 1);
    if (seat) out.push({ x: seat[0], z: seat[1], facing: seat[1] < 0 ? 0 : Math.PI, kind: "seat" });
  };
  for (let i = 0; i < count && free.far.length + free.near.length > 0; i++) {
    sit(free.near.length === 0 || (free.far.length > 0 && rng.chance(0.68)) ? "far" : "near");
  }
  return out;
}

/** What people wear on the train: more burkas and shalwar kameez in the women's coach than anywhere. */
const WOMEN: Readonly<Partial<Record<Outfit, number>>> = { burka: 2, shalwar: 4, shari: 1.2, kurta: 1.6, top: 1.2 };
const WOMENS_COACH: Readonly<Partial<Record<Outfit, number>>> = { burka: 4, shalwar: 4.6, shari: 1, kurta: 0.8, top: 0.6 };
const MEN: Readonly<Partial<Record<Outfit, number>>> = { shirt: 4.5, tshirt: 2.5, panjabi: 2, suit: 1 };

export function rosterFor(assets: Assets, seed: number, carIndex: number, theme: Theme, xMin: number, xMax: number): Passenger[] {
  const rng = new Rng(hashSeed(seed, carIndex, 91));
  const scene = SCENES[theme];
  const womenOnly = theme === "women";
  // A coach that gives part of itself to the cab carries fewer.
  const count = Math.round(rng.int(...scene.riders) * Math.min(1, (xMax - xMin) / 15));
  const standing = standingPlaces(rng, count - Math.round(count * scene.seated), scene, xMin, xMax);
  const places = [...seatedPlaces(rng, count - standing.length, standing, xMin, xMax), ...standing];

  const usedNames = new Set<string>();
  const castOf = new Map<Outfit, number[]>();
  assets.avatars.forEach((avatar, i) => {
    const list = castOf.get(avatar.outfit);
    if (list) list.push(i);
    else castOf.set(avatar.outfit, [i]);
  });
  for (const [outfit, list] of castOf) castOf.set(outfit, rng.shuffled(list));
  const worn = new Map<Outfit, number>();
  const dress = (mix: Readonly<Partial<Record<Outfit, number>>>): number => {
    const options = Object.entries(mix) as Array<[Outfit, number]>;
    let roll = rng.next() * options.reduce((sum, [, weight]) => sum + weight, 0);
    let outfit = options[0]![0];
    for (const [name, weight] of options) {
      roll -= weight;
      if (roll <= 0) {
        outfit = name;
        break;
      }
    }
    const list = castOf.get(outfit)!;
    const turn = worn.get(outfit) ?? 0;
    worn.set(outfit, turn + 1);
    return list[turn % list.length]!;
  };

  const crew: Passenger[] = places.map((place, index) => {
    const female = womenOnly || rng.chance(0.48);
    const pool: ReadonlyArray<readonly [string, string]> = female ? NAMES_F : NAMES_M;
    let pair = rng.pick(pool);
    for (let tries = 0; tries < 6 && usedNames.has(pair[1]); tries++) pair = rng.pick(pool);
    usedNames.add(pair[1]);
    const avatar = dress(womenOnly ? WOMENS_COACH : female ? WOMEN : MEN);
    const asleep = place.kind === "seat" && rng.chance(scene.asleep);
    const pose: PersonPose = asleep ? "sitrest" : place.kind === "seat" ? rng.pick(["sit", "sit", "sitrest", "sitphone"] as const) : place.kind === "strap" ? "strap" : rng.pick(scene.standing);
    return {
      id: `${carIndex}-${index}`,
      name: { bn: pair[0], en: pair[1] },
      female,
      avatar,
      outfit: assets.avatars[avatar]!.outfit,
      pose,
      asleep,
      x: place.x,
      z: place.z,
      facing: place.facing,
      thought: null,
      headTop: assets.top(avatar, pose === "strap" ? "stand" : pose),
    };
  });

  // Those awake whose faces the camera can see have something on their minds, and no two the same thing.
  const thinking = new Set<string>();
  const candidates = rng.shuffled(crew.filter((person) => !person.asleep && person.z < 0.6 && Math.abs(person.facing) < 1.4));
  // Whoever has a neighbour to mind is heard from first: a coach is its people noticing each other.
  const noticing = candidates.filter((person) => possible(theme, person, crew).some((thought) => thought.about));
  const order = [...noticing, ...candidates.filter((person) => !noticing.includes(person))];
  for (const person of order.slice(0, rng.int(...scene.speakers))) person.thought = freshThought(theme, person, crew, thinking, rng);
  return crew;
}

const FITS: Record<Fits, (pose: PersonPose) => boolean> = {
  any: () => true,
  seated: (pose) => isSeated({ pose }),
  standing: (pose) => !isSeated({ pose }),
  strap: (pose) => pose === "strap",
  loose: (pose) => !isSeated({ pose }) && pose !== "strap",
  phone: (pose) => pose === "phone" || pose === "sitphone",
  seatedphone: (pose) => pose === "sitphone",
  music: (pose) => pose === "music",
  nomusic: (pose) => pose !== "music",
};

/** How often what is in front of you wins over your own day, when there is something in front of you. */
const SEEN_FIRST = 0.8;

/**
 * What could cross this person's mind: their own sex's lines, for the way they are riding, and of
 * the lines about someone or something in the coach, only those that are true from where they are.
 */
function possible(theme: Theme | "cab", person: Passenger, crew: readonly Passenger[]): Thought[] {
  const out: Thought[] = [];
  for (const thought of thoughtsOf(theme, person.female)) {
    if (!FITS[thought.fits](person.pose)) continue;
    const seen = thought.sees ? witness(thought.sees, person, crew) : true;
    if (seen) out.push(seen === true ? thought : { ...thought, about: seen.id });
  }
  return out;
}

function freshThought(theme: Theme | "cab", person: Passenger, crew: readonly Passenger[], taken: Set<string>, rng: Rng): Thought {
  const options = possible(theme, person, crew);
  const fresh = options.filter((thought) => !taken.has(thought.bn));
  // With every line spoken for, two may share one, but nobody thinks the same thing twice running.
  const others = options.filter((thought) => thought.bn !== person.thought?.bn);
  const pool = fresh.length ? fresh : others.length ? others : options;
  const seen = pool.filter((thought) => thought.sees);
  const own = pool.filter((thought) => !thought.sees);
  const chosen = rng.pick(seen.length && (own.length === 0 || rng.chance(SEEN_FIRST)) ? seen : own);
  taken.add(chosen.bn);
  return chosen;
}

/** The next thing on this passenger's mind, so a coach you return to has moved on. Nobody takes up a line a neighbour is on. */
export function nextThought(theme: Theme | "cab", person: Passenger, crew: readonly Passenger[], rng: Rng): Thought {
  const taken = new Set(crew.flatMap((other) => (other.thought ? [other.thought.bn] : [])));
  return freshThought(theme, person, crew, taken, rng);
}

/** Line 6 has women and men at the controls, so either may be driving this set. */
export function operatorFor(assets: Assets, seed: number): Passenger {
  const female = seed % 2 === 0;
  const avatar = Math.max(0, assets.avatars.findIndex((a) => (female ? a.outfit === "kurta" : a.name === "Male_Adult_08")));
  const operator: Passenger = {
    id: "operator",
    name: { bn: "চালক", en: "OPERATOR" },
    female,
    avatar,
    outfit: assets.avatars[avatar]!.outfit,
    pose: "sit",
    asleep: false,
    x: -NOSE_AT + 1.32,
    z: -0.28,
    facing: -Math.PI / 2,
    thought: null,
    headTop: assets.top(avatar, "sit"),
  };
  operator.thought = freshThought("cab", operator, [operator], new Set(), new Rng(hashSeed(seed, 77)));
  return operator;
}
