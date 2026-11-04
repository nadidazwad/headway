import { Rng } from "../shared/rng";

/**
 * Short sounds rendered once into buffers when the engine starts: every rail joint and interface
 * sound after that is only a playback, so none of them costs anything on the main thread.
 */
export interface Voices {
  noise: AudioBuffer;
  clacks: AudioBuffer[];
  tick: AudioBuffer;
  doorOpen: AudioBuffer;
  doorClose: AudioBuffer;
  thought: AudioBuffer;
}

function render(ctx: BaseAudioContext, seconds: number, sample: (t: number, i: number) => number): AudioBuffer {
  const length = Math.ceil(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = sample(i / ctx.sampleRate, i);
  // A last few milliseconds of fade, so that no voice can ever end on a click.
  const tail = Math.min(length, Math.round(ctx.sampleRate * 0.004));
  for (let i = 0; i < tail; i++) data[length - 1 - i]! *= i / tail;
  return buffer;
}

/** Noise through a resonance that can move: a state-variable filter, one sample at a time. */
function resonator(ctx: BaseAudioContext, q: number): (input: number, hertz: number) => number {
  let low = 0;
  let band = 0;
  const damping = 1 / q;
  return (input, hertz) => {
    const f = 2 * Math.sin((Math.PI * Math.min(hertz, ctx.sampleRate / 6)) / ctx.sampleRate);
    low += f * band;
    const high = input - low - damping * band;
    band += f * high;
    return band;
  };
}

/** Steel on steel: a sharp tick off the rail head, and the thud of the bogie taking the step. */
function clack(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const ring = resonator(ctx, 2.2);
  const pitch = rng.range(760, 1150);
  const thud = rng.range(72, 96);
  const random = new Rng(rng.int(1, 1 << 30));
  return render(ctx, 0.2, (t) => {
    const steel = ring(random.next() * 2 - 1, pitch) * Math.exp(-t / 0.014) * 1.1;
    const body = Math.sin(2 * Math.PI * (thud * t - 2.4 * t * t * thud * 0.5)) * Math.exp(-t / 0.04) * 0.42;
    return steel + body * Math.min(1, t / 0.002);
  });
}

export function createVoices(ctx: BaseAudioContext, seed: number): Voices {
  const rng = new Rng(seed);
  const random = new Rng(rng.int(1, 1 << 30));
  // White noise has no continuity to break, so a long loop of it has no seam to hear.
  const noiseLength = ctx.sampleRate * 11;
  const noise = ctx.createBuffer(2, noiseLength, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = noise.getChannelData(channel);
    for (let i = 0; i < noiseLength; i++) data[i] = random.next() * 2 - 1;
  }

  const hissOpen = resonator(ctx, 0.9);
  const hissClose = resonator(ctx, 0.9);
  return {
    noise,
    clacks: [clack(ctx, rng), clack(ctx, rng), clack(ctx, rng)],
    tick: render(ctx, 0.05, (t) => Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t / 0.007) * Math.min(1, t / 0.0006)),
    // Doors: air let out of a cylinder falling in pitch, and the leaves coming to rest.
    doorOpen: render(ctx, 0.85, (t) => {
      const air = hissOpen(random.next() * 2 - 1, 3400 - 2600 * Math.min(1, t / 0.62)) * Math.sin(Math.PI * Math.min(1, t / 0.66)) * 0.5;
      const rest = t > 0.6 ? Math.sin(2 * Math.PI * 88 * (t - 0.6)) * Math.exp(-(t - 0.6) / 0.05) * 0.6 : 0;
      return air + rest;
    }),
    doorClose: render(ctx, 0.7, (t) => {
      const air = hissClose(random.next() * 2 - 1, 1200 + 1500 * Math.min(1, t / 0.4)) * Math.sin(Math.PI * Math.min(1, t / 0.42)) * 0.36;
      const shut = t > 0.4 ? Math.sin(2 * Math.PI * 104 * (t - 0.4)) * Math.exp(-(t - 0.4) / 0.04) * 0.85 : 0;
      return air + shut;
    }),
    // A small rising note: something coming to mind, not an alert.
    thought: render(ctx, 0.42, (t) => {
      const swell = Math.min(1, t / 0.02) * Math.exp(-t / 0.12);
      const note = Math.sin(2 * Math.PI * (560 * t + 360 * Math.min(t, 0.09) * Math.min(t, 0.09) * 5.5));
      return (note + Math.sin(4 * Math.PI * (560 * t + 360 * Math.min(t, 0.09) * Math.min(t, 0.09) * 5.5)) * 0.18) * swell * 0.7;
    }),
  };
}
