import { Rng, hashSeed } from "../shared/rng";
import { NAMES_F, NAMES_M, OPERATOR_THOUGHTS, THOUGHTS, type Thought, type Theme } from "./corpus";

export type Outfit = "shirt" | "tshirt" | "panjabi" | "lungi" | "salwar" | "saree" | "burqa" | "school";
export type Pose = "seated" | "strap" | "standing" | "phone";

export interface Passenger {
  id: string;
  name: { bn: string; en: string };
  female: boolean;
  outfit: Outfit;
  pose: Pose;
  hijab: boolean;
  backpack: boolean;
  /** Position in the car, in metres from the middle of the car. */
  x: number;
  z: number;
  /** Radians. Zero faces the viewer (+Z). */
  facing: number;
  tone: number;
  palette: [number, number];
  hair: number;
  thought: Thought | null;
  /** Height of the top of the head over the floor. */
  headTop: number;
}

const SKIN = [0xb88a63, 0xa97a54, 0xc99d76, 0x8f6443, 0xbf9068] as const;
const HAIR = [0x1d1a18, 0x2a2320, 0x14110f, 0x3a2d24] as const;
const WOMENS = [0xc8413a, 0xe07a2f, 0x2f8f6b, 0x6d5aa8, 0xd86a9a, 0x2f6fb0, 0xeab33a, 0x1f8fa8, 0xa13a6d, 0xf0e3c8] as const;
const MENS = [0xf1eee4, 0x8fb1cf, 0x5d7f9e, 0x455a64, 0xc7b89a, 0x7a9c6b, 0xb9534a, 0x2d3a4a, 0xe3d7ba] as const;
const LOWERS = [0x2d3a4a, 0x39424a, 0x5a5346, 0x1f2a36, 0x6b6456] as const;

const benches: ReadonlyArray<readonly [number, number]> = [[-6.3, -3.1], [-1.75, 1.75], [3.1, 6.3]];
const doorZones = [-7.05, -2.35, 2.35, 7.05] as const;

const INSIDE = 2.95 / 2 - 0.08;

/** Seats for one car, chosen so that nobody shares a place and nobody blocks the near door. */
function seatPlaces(rng: Rng, count: number): Array<{ x: number; z: number; facing: number; seated: boolean }> {
  const places: Array<{ x: number; z: number; facing: number; seated: boolean }> = [];
  for (const [a, d] of benches) {
    for (let u = a + 0.32; u < d - 0.2; u += 0.62) {
      places.push({ x: u, z: -(INSIDE - 0.36), facing: 0, seated: true });
      places.push({ x: u, z: INSIDE - 0.36, facing: Math.PI, seated: true });
    }
  }
  const taken = rng.shuffled(places).filter((place) => place.z < 0 || rng.chance(0.45));
  const standing = rng.shuffled(doorZones).flatMap((center) => [
    { x: center - 0.52, z: rng.range(-0.25, 0.25), facing: rng.range(-0.7, 0.7), seated: false },
    { x: center + 0.52, z: rng.range(-0.25, 0.25), facing: rng.range(-0.7, 0.7), seated: false },
  ]);
  const out = taken.slice(0, Math.ceil(count * 0.6));
  out.push(...standing.slice(0, count - out.length));
  return out;
}

export function rosterFor(seed: number, carIndex: number, theme: Theme, stopIndex: number, xMin: number): Passenger[] {
  const rng = new Rng(hashSeed(seed, carIndex, stopIndex, 91));
  const womenOnly = theme === "women";
  const count = rng.int(7, 11);
  const places = seatPlaces(rng, count).filter((place) => place.x > xMin);
  const thoughts = rng.shuffled(THOUGHTS[theme]);
  const speakers = Math.min(places.length, rng.int(3, 4));
  const order = rng.shuffled(places.map((_, i) => i));
  const speakingPlaces = new Set(
    // Prefer people whose faces the camera can see: the far bench and those standing.
    order.filter((i) => places[i]!.z < 0.5).slice(0, speakers),
  );
  const usedNames = new Set<string>();
  return places.map((place, index) => {
    const female = womenOnly || rng.chance(0.48);
    const pool: ReadonlyArray<readonly [string, string]> = female ? NAMES_F : NAMES_M;
    let pair = rng.pick(pool);
    for (let tries = 0; tries < 6 && usedNames.has(pair[1]); tries++) pair = rng.pick(pool);
    usedNames.add(pair[1]);
    const outfit: Outfit = female
      ? rng.pick(["salwar", "salwar", "saree", "burqa", "tshirt", "school", "salwar"] as const)
      : rng.pick(["shirt", "shirt", "panjabi", "tshirt", "shirt", "lungi", "school"] as const);
    const pose: Pose = place.seated ? "seated" : rng.chance(0.55) ? "strap" : rng.chance(0.5) ? "phone" : "standing";
    const upper = female ? rng.pick(WOMENS) : rng.pick(MENS);
    const lower = female && outfit === "salwar" ? rng.pick(WOMENS) : rng.pick(LOWERS);
    const thought = speakingPlaces.has(index) ? thoughts[index % thoughts.length]! : null;
    return {
      id: `${carIndex}-${stopIndex}-${index}`,
      name: { bn: pair[0], en: pair[1] },
      female,
      outfit,
      pose,
      hijab: female && (outfit === "burqa" || rng.chance(0.42)),
      backpack: !place.seated && (outfit === "school" || outfit === "tshirt" || rng.chance(0.16)),
      x: place.x,
      z: place.z,
      facing: place.facing,
      tone: rng.pick(SKIN),
      palette: [upper, lower],
      hair: rng.pick(HAIR),
      thought,
      headTop: place.seated ? 1.32 : 1.68,
    };
  });
}

export function operatorFor(stopIndex: number): Passenger {
  const female = stopIndex % 4 === 3;
  return {
    id: `operator-${stopIndex}`,
    name: female ? { bn: "চালক সুমাইয়া", en: "OPERATOR SUMAIYA" } : { bn: "চালক আজিজ", en: "OPERATOR AZIZ" },
    female,
    outfit: "shirt",
    pose: "seated",
    hijab: false,
    backpack: false,
    x: -9.9 + 1.6,
    z: -0.28,
    facing: -Math.PI / 2,
    tone: SKIN[0],
    palette: [0xe7ecef, 0x1f2a36],
    hair: HAIR[0],
    thought: OPERATOR_THOUGHTS[stopIndex % OPERATOR_THOUGHTS.length]!,
    headTop: 1.34,
  };
}
