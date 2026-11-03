import { generateChunk } from "./generate";

self.onmessage = (event: MessageEvent<{ seed: number; index: number }>) => {
  const { seed, index } = event.data;
  const chunk = generateChunk(seed, index);
  const transfer = chunk.parts.flatMap((part) => [part.vertices, part.indices.buffer]);
  (self as unknown as Worker).postMessage(chunk, transfer);
};
