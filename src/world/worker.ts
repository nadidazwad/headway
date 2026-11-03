import { loadAssets } from "../assets";
import { generateChunk } from "./generate";

self.onmessage = async (event: MessageEvent<{ seed: number; index: number }>) => {
  const { seed, index } = event.data;
  const assets = await loadAssets();
  const chunk = generateChunk(seed, index, assets);
  const transfer = chunk.parts.flatMap((part) => [part.vertices, part.indices.buffer]);
  (self as unknown as Worker).postMessage(chunk, transfer);
};
