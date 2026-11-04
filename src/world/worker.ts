import { loadAssets } from "../assets";
import { generateChunk } from "./generate";

self.onmessage = async (event: MessageEvent<{ seed: number; index: number; minimal: boolean }>) => {
  const { seed, index, minimal } = event.data;
  const assets = await loadAssets();
  const chunk = generateChunk(seed, index, assets, minimal);
  const transfer = chunk.parts.flatMap((part) => [part.vertices, part.indices.buffer]);
  (self as unknown as Worker).postMessage(chunk, transfer);
};
