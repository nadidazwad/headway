import { generateChunk } from "./generate";

self.onmessage = (event: MessageEvent<{ seed: number; index: number }>) => {
  const { seed, index } = event.data;
  const chunk = generateChunk(seed, index);
  (self as unknown as Worker).postMessage(chunk, [chunk.mesh.vertices, chunk.mesh.indices.buffer]);
};
