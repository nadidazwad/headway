import { describe, expect, it } from "vitest";
import type { Assets, PersonPose } from "../assets";
import { Rng } from "../shared/rng";
import { CAR_THEMES } from "../train/train";
import { nextThought, operatorFor, rosterFor, type Passenger } from "./roster";

const OUTFITS = ["burka", "shalwar", "shari", "kurta", "top", "shirt", "tshirt", "panjabi", "suit"];
const assets = { avatars: OUTFITS.map((outfit) => ({ outfit })), top: () => 1.5 } as unknown as Assets;
const SEATED = new Set<PersonPose>(["sit", "sitrest", "sitphone"]);
const seated = (person: Passenger): boolean => SEATED.has(person.pose);
const coaches = (seed: number): Passenger[][] => CAR_THEMES.map((theme, index) => rosterFor(assets, seed, index, theme, -8, 8));

function expectToSuit(person: Passenger, thought: NonNullable<Passenger["thought"]>): void {
  expect(thought.female).toBe(person.female);
  if (seated(person)) expect(["standing", "strap", "loose"]).not.toContain(thought.fits);
  else expect(["seated", "seatedphone"]).not.toContain(thought.fits);
  if (person.pose === "music") expect(thought.fits).not.toBe("nomusic");
  if (thought.fits === "phone") expect(["phone", "sitphone"]).toContain(person.pose);
  if (thought.fits === "strap") expect(person.pose).toBe("strap");
  if (thought.fits === "loose") expect(person.pose).not.toBe("strap");
  if (thought.fits === "music") expect(person.pose).toBe("music");
}

/** A line about someone has to be true of the one it is about, from where the thinker is. */
function expectToBeSeen(person: Passenger, thought: NonNullable<Passenger["thought"]>, crew: Passenger[]): void {
  const sees = thought.sees ?? "";
  const subject = crew.find((other) => other.id === thought.about);
  if (!/^(beside|facing|near)/.test(sees)) return expect(subject).toBeUndefined();
  expect(subject).toBeDefined();
  expect(subject).not.toBe(person);
  const gap = Math.hypot(subject!.x - person.x, subject!.z - person.z);
  expect(gap).toBeLessThan(sees.startsWith("near") ? 2.6 : 1.5);
  if (sees.startsWith("beside")) expect(seated(subject!)).toBe(seated(person));
  if (sees.startsWith("facing")) expect(seated(subject!)).not.toBe(seated(person));
  if (sees.includes("asleep")) expect(subject!.asleep).toBe(true);
  if (sees.includes("awake")) expect(subject!.asleep).toBe(false);
  if (sees.includes("woman")) expect(subject!.female).toBe(true);
  if (/\bman\b/.test(sees)) expect(subject!.female).toBe(false);
  if (sees.includes("phone")) expect(["phone", "sitphone"]).toContain(subject!.pose);
  if (sees.includes("shari")) expect(subject!.outfit).toBe("shari");
}

describe("what passengers think", () => {
  it("suits their sex, how they are riding and who is really beside them, now and when they move on, with no two alike in a coach", () => {
    const seen = { women: 0, men: 0, aboutSomeone: 0, all: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      coaches(seed).forEach((crew, index) => {
        const speakers = crew.filter((person) => person.thought);
        expect(speakers.length).toBeGreaterThan(0);
        expect(new Set(speakers.map((person) => person.thought!.bn)).size).toBe(speakers.length);
        for (const person of speakers) {
          expect(person.asleep).toBe(false);
          seen[person.female ? "women" : "men"]++;
          seen.all++;
          if (person.thought!.about) seen.aboutSomeone++;
          expectToSuit(person, person.thought!);
          expectToBeSeen(person, person.thought!, crew);
          const before = person.thought!.bn;
          const next = nextThought(CAR_THEMES[index]!, person, crew, new Rng(seed));
          expectToSuit(person, next);
          expectToBeSeen(person, next, crew);
          expect(next.bn).not.toBe(before);
        }
      });
    }
    expect(seen.women).toBeGreaterThan(0);
    expect(seen.men).toBeGreaterThan(0);
    // The people round you are most of what there is to think about on a train.
    expect(seen.aboutSomeone / seen.all).toBeGreaterThan(0.4);
  });

  it("fills each coach the way its name says: women only in the first, a crush on its feet, a coach of sleepers", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const [women, crush, , sleep, late] = coaches(seed);
      expect(women!.every((person) => person.female)).toBe(true);
      const standing = (crew: Passenger[]): number => crew.filter((person) => !seated(person)).length;
      expect(standing(crush!)).toBeGreaterThan(standing(sleep!) + 4);
      expect(sleep!.filter((person) => person.asleep).length).toBeGreaterThan(late!.filter((person) => person.asleep).length);
    }
  });

  it("gives everyone a place of their own", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const crew of coaches(seed)) {
        for (const a of crew) for (const b of crew) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.4);
      }
    }
  });

  it("gives the operator something an operator would think, whichever sex is driving", () => {
    for (const seed of [2, 3]) {
      const operator = operatorFor(assets, seed);
      expect(operator.thought?.female).toBe(operator.female);
    }
    expect(operatorFor(assets, 2).female).not.toBe(operatorFor(assets, 3).female);
  });
});
