import type { Outfit, PersonPose } from "../assets";
import { BENCHES, DOOR_CENTERS, INSIDE_HALF, WHEELCHAIR_BAY, seatCentres } from "../train/layout";

/** What a line can ask of the person it is about. */
export type Trait = "woman" | "man" | "asleep" | "awake" | "phone" | "music" | "bag" | "seated" | "standing" | Outfit;

/**
 * Who a line is about, by where they are from the thinker: on the next seat or at their elbow,
 * across the knees (one seated, one standing over them), or just within sight.
 */
export type Relation = "beside" | "facing" | "near";

/**
 * What has to be there for a line to be thought. With a relation, it names someone; `self` is about
 * the thinker's own clothes; the rest are about the space: an empty seat next to mine, a free seat
 * I could reach, a crush round me, a door at my shoulder.
 */
export type Sight =
  | Relation
  | `${Relation}:${Trait}`
  | `${Relation}:${Trait},${Trait}`
  | `self:${Trait}`
  | "empty"
  | "freeseat"
  | "packed"
  | "door";

/** As much of a passenger as it takes to say what is around them. */
export interface Placed {
  id: string;
  female: boolean;
  pose: PersonPose;
  outfit: Outfit;
  asleep: boolean;
  x: number;
  z: number;
}

const SEATED: ReadonlySet<PersonPose> = new Set(["sit", "sitrest", "sitphone"]);
export const isSeated = (person: Pick<Placed, "pose">): boolean => SEATED.has(person.pose);

/** Where the seats are across the coach: the far bench and the near one. */
export const SEAT_Z = INSIDE_HALF - 0.34;

const HAS: Record<Exclude<Trait, Outfit>, (person: Placed) => boolean> = {
  woman: (person) => person.female,
  man: (person) => !person.female,
  asleep: (person) => person.asleep,
  awake: (person) => !person.asleep,
  phone: (person) => person.pose === "phone" || person.pose === "sitphone",
  music: (person) => person.pose === "music",
  bag: (person) => person.pose === "bag",
  seated: isSeated,
  standing: (person) => !isSeated(person),
};

const has = (person: Placed, trait: Trait): boolean => (trait in HAS ? HAS[trait as keyof typeof HAS](person) : person.outfit === trait);

const apart = (a: Placed, b: Placed): number => Math.hypot(a.x - b.x, a.z - b.z);

const RELATED: Record<Relation, (me: Placed, other: Placed) => boolean> = {
  // Shoulder to shoulder: the next seat along the same bench, or standing within an elbow's reach.
  beside: (me, other) =>
    isSeated(me) === isSeated(other) && (isSeated(me) ? Math.sign(me.z) === Math.sign(other.z) && Math.abs(me.x - other.x) < 0.6 : apart(me, other) < 0.95),
  // Knees to knees: one of the two is seated and the other stands over them.
  facing: (me, other) => isSeated(me) !== isSeated(other) && Math.abs(me.x - other.x) < 0.7 && apart(me, other) < 1.5,
  near: (me, other) => apart(me, other) < 2.6,
};

/** Every seat in a coach, as [x, z]. */
export function seatsOfCoach(): Array<readonly [number, number]> {
  const seats: Array<readonly [number, number]> = [];
  for (const [from, to] of BENCHES) {
    for (const x of seatCentres(from, to)) {
      if (from !== WHEELCHAIR_BAY[0]) seats.push([x, -SEAT_Z]);
      seats.push([x, SEAT_Z]);
    }
  }
  return seats;
}

const SEATS = seatsOfCoach();
const taken = (crew: readonly Placed[], [x, z]: readonly [number, number]): boolean =>
  crew.some((person) => Math.abs(person.x - x) < 0.3 && Math.abs(person.z - z) < 0.5);
const freeSeats = (crew: readonly Placed[]): Array<readonly [number, number]> => SEATS.filter((seat) => !taken(crew, seat));

const SPACE: Record<"empty" | "freeseat" | "packed" | "door", (me: Placed, crew: readonly Placed[]) => boolean> = {
  empty: (me, crew) => isSeated(me) && freeSeats(crew).some(([x, z]) => Math.sign(z) === Math.sign(me.z) && Math.abs(x - me.x) > 0.3 && Math.abs(x - me.x) < 0.6),
  freeseat: (me, crew) => !isSeated(me) && freeSeats(crew).some(([x, z]) => Math.abs(x - me.x) < 2.2 && z < 0),
  packed: (me, crew) => crew.filter((other) => other !== me && !isSeated(other) && apart(me, other) < 1.05).length >= 2,
  door: (me) => !isSeated(me) && DOOR_CENTERS.some((centre) => Math.abs(me.x - centre) < 0.85) && Math.abs(me.z) > 0.45,
};

/**
 * Whether this passenger can see what a line needs, in this coach as it is filled. Returns the one
 * the line is about, `true` when it is about no one in particular, or null when it does not hold.
 */
export function witness<P extends Placed>(sight: Sight, me: P, crew: readonly P[]): P | true | null {
  if (sight in SPACE) return SPACE[sight as keyof typeof SPACE](me, crew) || null;
  const [relation, wanted = ""] = sight.split(":") as [Relation | "self", string?];
  const traits = wanted.split(",").filter(Boolean) as Trait[];
  if (relation === "self") return traits.every((trait) => has(me, trait)) || null;
  let found: P | null = null;
  for (const other of crew) {
    if (other === me || !RELATED[relation](me, other) || !traits.every((trait) => has(other, trait))) continue;
    if (!found || apart(me, other) < apart(me, found)) found = other;
  }
  return found;
}
