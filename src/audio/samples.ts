/** The recordings in public/audio, baked by tools/bake-audio.mjs. */
export const SAMPLE_NAMES = ["bed-bridge", "bed-street", "cng", "horn-long", "horn-pass", "bell-1", "bell-2", "bell-3", "crows"] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];
export type Samples = Partial<Record<SampleName, AudioBuffer>>;
