import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadAssets, type Assets } from "./library";

let assets: Assets;

beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    const bytes = await readFile(join("public", url));
    return new Response(bytes);
  });
  assets = await loadAssets("/");
});

/** The turn about the vertical that best carries one frame of a walk onto another, in degrees. */
function turnBetween(avatar: number, a: number, b: number): number {
  const from = assets.walkFrame(avatar, a).pos;
  const to = assets.walkFrame(avatar, b).pos;
  let sine = 0;
  let cosine = 0;
  for (let i = 0; i < from.length; i += 3) {
    sine += from[i + 2]! * to[i]! - from[i]! * to[i + 2]!;
    cosine += from[i]! * to[i]! + from[i + 2]! * to[i + 2]!;
  }
  return (Math.atan2(sine, cosine) * 180) / Math.PI;
}

describe("the walk cycle", () => {
  it("never turns the body between one frame and the next", () => {
    for (let avatar = 0; avatar < assets.avatars.length; avatar++) {
      for (let frame = 0; frame < assets.walkFrames; frame++) {
        const turn = turnBetween(avatar, frame, (frame + 1) % assets.walkFrames);
        expect(Math.abs(turn), `${assets.avatars[avatar]!.name} frame ${frame}`).toBeLessThan(15);
      }
    }
  });
});
