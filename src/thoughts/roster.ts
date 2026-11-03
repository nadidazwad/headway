import type { Assets, Outfit, PersonPose } from "../assets";
import { Rng, hashSeed } from "../shared/rng";
import { BENCHES, DOOR_CENTERS, INSIDE_HALF, NOSE_AT, STRAP_RAIL_Z, STRAP_STEP, WHEELCHAIR_BAY, seatCentres } from "../train/layout";
import { NAMES_F, NAMES_M, OPERATOR_THOUGHTS, THOUGHTS, type Thought, type Theme } from "./corpus";

export interface Passenger {
  id: string;
  name: { bn: string; en: string };
  female: boolean;
  /** Index into the baked cast. */
  avatar: number;
  pose: PersonPose;
  /** Position in the car, in metres from the middle of the car. */
  x: number;
  z: number;
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
  seated: boolean;
  strap: boolean;
}

/** Seats and standing spots for one car, so nobody shares a place or blocks a doorway. */
function placesInCar(rng: Rng, count: number): Place[] {
  const places: Place[] = [];
  for (const [a, d] of BENCHES) {
    for (const u of seatCentres(a, d)) {
      if (a !== WHEELCHAIR_BAY[0]) places.push({ x: u, z: -(INSIDE_HALF - 0.34), facing: 0, seated: true, strap: false });
      places.push({ x: u, z: INSIDE_HALF - 0.34, facing: Math.PI, seated: true, strap: false });
    }
  }
  const seats = rng.shuffled(places).filter((place) => place.z < 0 || rng.chance(0.5));
  const standing: Place[] = rng.shuffled(DOOR_CENTERS).flatMap((center) => {
    const ring = Math.round((center + 1.1) / STRAP_STEP) * STRAP_STEP;
    return [
      // The right hand is up in the ring, so the body stands a shoulder's width along from it.
      { x: ring + 0.17, z: -STRAP_RAIL_Z - 0.08, facing: 0, seated: false, strap: true },
      { x: center + rng.range(0.5, 0.9), z: rng.range(0.05, 0.5), facing: rng.range(-1.2, 1.2), seated: false, strap: false },
      { x: center - rng.range(0.5, 0.9), z: rng.range(-0.3, 0.3), facing: rng.range(-1.2, 1.2), seated: false, strap: false },
    ];
  });
  const out = seats.slice(0, Math.ceil(count * 0.58));
  out.push(...rng.shuffled(standing).slice(0, count - out.length));
  return out;
}

/** What people wear on the train: more burkas and shalwar kameez in the women's coach than anywhere. */
const WOMEN: Readonly<Partial<Record<Outfit, number>>> = { burka: 2, shalwar: 4, shari: 1.2, kurta: 1.6, top: 1.2 };
const WOMENS_COACH: Readonly<Partial<Record<Outfit, number>>> = { burka: 4, shalwar: 4.6, shari: 1, kurta: 0.8, top: 0.6 };
const MEN: Readonly<Partial<Record<Outfit, number>>> = { shirt: 4.5, tshirt: 2.5, panjabi: 2, suit: 1 };

export function rosterFor(assets: Assets, seed: number, carIndex: number, theme: Theme, xMin: number, xMax: number): Passenger[] {
  const rng = new Rng(hashSeed(seed, carIndex, 91));
  const womenOnly = theme === "women";
  const count = rng.int(9, 13);
  const places = placesInCar(rng, count).filter((place) => place.x > xMin && place.x < xMax);
  const thoughts = rng.shuffled(THOUGHTS[theme]);
  const speakers = Math.min(places.length, rng.int(3, 5));
  const order = rng.shuffled(places.map((_, i) => i));
  // Prefer people whose faces the camera can see: the far bench and those standing.
  const speaking = new Set(order.filter((i) => places[i]!.z < 0.6).slice(0, speakers));
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
  return places.map((place, index) => {
    const female = womenOnly || rng.chance(0.48);
    const pool: ReadonlyArray<readonly [string, string]> = female ? NAMES_F : NAMES_M;
    let pair = rng.pick(pool);
    for (let tries = 0; tries < 6 && usedNames.has(pair[1]); tries++) pair = rng.pick(pool);
    usedNames.add(pair[1]);
    const avatar = dress(womenOnly ? WOMENS_COACH : female ? WOMEN : MEN);
    const pose: PersonPose = place.seated
      ? rng.pick(["sit", "sit", "sitrest", "sitphone"] as const)
      : place.strap
        ? "strap"
        : rng.pick(["stand", "phone", "music", "bag", "look"] as const);
    return {
      id: `${carIndex}-${index}`,
      name: { bn: pair[0], en: pair[1] },
      female,
      avatar,
      pose,
      x: place.x,
      z: place.z,
      facing: place.facing,
      thought: speaking.has(index) ? thoughts[index % thoughts.length]! : null,
      headTop: assets.top(avatar, pose === "strap" ? "stand" : pose),
    };
  });
}

/** The next thing on this passenger's mind, so a coach you return to has moved on. */
export function nextThought(theme: Theme | "cab", previous: Thought | null, rng: Rng): Thought {
  const pool = theme === "cab" ? OPERATOR_THOUGHTS : THOUGHTS[theme];
  let thought = rng.pick(pool);
  for (let tries = 0; tries < 4 && thought === previous; tries++) thought = rng.pick(pool);
  return thought;
}

export function operatorFor(assets: Assets, seed: number): Passenger {
  const avatar = assets.avatars.findIndex((a) => a.name === "Male_Adult_08");
  return {
    id: "operator",
    name: { bn: "চালক আজিজ", en: "OPERATOR AZIZ" },
    female: false,
    avatar: Math.max(0, avatar),
    pose: "sit",
    x: -NOSE_AT + 1.32,
    z: -0.28,
    facing: -Math.PI / 2,
    thought: OPERATOR_THOUGHTS[seed % OPERATOR_THOUGHTS.length]!,
    headTop: assets.top(Math.max(0, avatar), "sit"),
  };
}
