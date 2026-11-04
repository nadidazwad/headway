import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { loadAssets, type Assets } from "../assets/library";
import { Batch, STRIDE } from "../geometry";
import { Rng } from "../shared/rng";
import { ROAD_HALF } from "./layout";
import { furnishPavements } from "./pavement";

/** A shade nothing else in the city is drawn in, so the parked models can be picked out afterwards. */
const MARK = 3;

it("never parks a rickshaw or a motorbike across the kerb", async () => {
  vi.stubGlobal("fetch", async (url: string) => new Response(await readFile(join("public", url))));
  const real = await loadAssets("/");
  const assets: Assets = {
    ...real,
    prop(key, lod) {
      const mesh = real.prop(key, lod);
      return key === "bike_park" || key === "rickshaw_park" ? { ...mesh, grey: new Uint8Array(mesh.count).fill(MARK) } : mesh;
    },
  };
  let parked = 0;
  let nearest = Infinity;
  for (let chunk = 0; chunk < 400; chunk++) {
    const b = new Batch(1 << 16);
    b.cull = false;
    furnishPavements({ at: () => b }, assets, new Rng(chunk + 1), () => true);
    const { vertices } = b.finish();
    const floats = new Float32Array(vertices);
    const bytes = new Uint8Array(vertices);
    for (let v = 0; v * STRIDE < vertices.byteLength; v++) {
      if (bytes[v * STRIDE + 16]! > MARK) continue;
      parked++;
      nearest = Math.min(nearest, Math.abs(floats[(v * STRIDE) / 4 + 2]!));
    }
  }
  expect(parked).toBeGreaterThan(10000);
  // The far edge of the kerb's top: every corner of every parked vehicle is beyond it.
  expect(nearest).toBeGreaterThan(ROAD_HALF + 0.14);
}, 30000);
