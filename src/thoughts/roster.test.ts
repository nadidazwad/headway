import { describe, expect, it } from "vitest";
import type { Assets } from "../assets";
import { Rng } from "../shared/rng";
import { CAR_THEMES } from "../train/train";
import { nextThought, operatorFor, rosterFor } from "./roster";

const OUTFITS = ["burka", "shalwar", "shari", "kurta", "top", "shirt", "tshirt", "panjabi", "suit"];
const assets = { avatars: OUTFITS.map((outfit) => ({ outfit })), top: () => 1.5 } as unknown as Assets;

describe("what passengers think", () => {
  it("is only ever what someone of their own sex really said, now and when they move on", () => {
    let women = 0;
    let men = 0;
    for (let seed = 1; seed <= 40; seed++) {
      CAR_THEMES.forEach((theme, index) => {
        for (const person of rosterFor(assets, seed, index, theme, -8, 8)) {
          if (!person.thought) continue;
          if (person.female) women++;
          else men++;
          expect(person.thought.female).toBe(person.female);
          expect(nextThought(theme, person.female, person.thought, new Rng(seed)).female).toBe(person.female);
          expect(person.thought.source).toMatch(/^https:\/\//);
        }
      });
    }
    expect(women).toBeGreaterThan(0);
    expect(men).toBeGreaterThan(0);
  });

  it("fills the women's coach with women", () => {
    const roster = rosterFor(assets, 7, 0, "women", -8, 8);
    expect(roster.length).toBeGreaterThan(0);
    expect(roster.every((person) => person.female)).toBe(true);
  });

  it("gives the operator an operator's own words", () => {
    const operator = operatorFor(assets, 3);
    expect(operator.female).toBe(true);
    expect(operator.thought?.source).toMatch(/^https:\/\//);
  });
});
