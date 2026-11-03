import { describe, expect, it } from "vitest";
import type { Assets, PersonPose } from "../assets";
import { Rng } from "../shared/rng";
import { CAR_THEMES } from "../train/train";
import { nextThought, operatorFor, rosterFor, type Passenger } from "./roster";

const OUTFITS = ["burka", "shalwar", "shari", "kurta", "top", "shirt", "tshirt", "panjabi", "suit"];
const assets = { avatars: OUTFITS.map((outfit) => ({ outfit })), top: () => 1.5 } as unknown as Assets;
const SEATED = new Set<PersonPose>(["sit", "sitrest", "sitphone"]);

function expectToSuit(person: Passenger, thought: NonNullable<Passenger["thought"]>): void {
  expect(thought.female).toBe(person.female);
  if (SEATED.has(person.pose)) expect(["standing", "strap"]).not.toContain(thought.fits);
  else expect(thought.fits).not.toBe("seated");
  if (person.pose === "music") expect(thought.fits).not.toBe("nomusic");
  if (thought.fits === "phone") expect(["phone", "sitphone"]).toContain(person.pose);
  if (thought.fits === "strap") expect(person.pose).toBe("strap");
  if (thought.fits === "music") expect(person.pose).toBe("music");
}

describe("what passengers think", () => {
  it("suits their sex and how they are riding, now and when they move on, with no two alike in a coach", () => {
    const seen = { women: 0, men: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      CAR_THEMES.forEach((theme, index) => {
        const speakers = rosterFor(assets, seed, index, theme, -8, 8).filter((person) => person.thought);
        expect(new Set(speakers.map((person) => person.thought!.bn)).size).toBe(speakers.length);
        for (const person of speakers) {
          seen[person.female ? "women" : "men"]++;
          expectToSuit(person, person.thought!);
          const next = nextThought(theme, person, new Rng(seed));
          expectToSuit(person, next);
          expect(next.bn).not.toBe(person.thought!.bn);
        }
      });
    }
    expect(seen.women).toBeGreaterThan(0);
    expect(seen.men).toBeGreaterThan(0);
  });

  it("fills the women's coach with women", () => {
    const roster = rosterFor(assets, 7, 0, "women", -8, 8);
    expect(roster.length).toBeGreaterThan(0);
    expect(roster.every((person) => person.female)).toBe(true);
  });

  it("gives the operator something an operator would think, whichever sex is driving", () => {
    for (const seed of [2, 3]) {
      const operator = operatorFor(assets, seed);
      expect(operator.thought?.female).toBe(operator.female);
    }
    expect(operatorFor(assets, 2).female).not.toBe(operatorFor(assets, 3).female);
  });
});
