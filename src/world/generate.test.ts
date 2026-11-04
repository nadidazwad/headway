import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { loadAssets } from "../assets/library";
import { generateChunk } from "./generate";

it("minimal mode leaves out most of the city, whichever stretch of line it is", async () => {
  vi.stubGlobal("fetch", async (url: string) => new Response(await readFile(join("public", url))));
  const assets = await loadAssets("/");
  let full = 0;
  let minimal = 0;
  for (let index = 60; index < 72; index++) {
    full += generateChunk(7, index, assets).triangles;
    minimal += generateChunk(7, index, assets, true).triangles;
  }
  // The load on a weak GPU is what this mode is for, so a change that quietly brings detail back should fail.
  expect(minimal / full).toBeLessThan(0.3);
}, 30000);
