import { createEngine, type Hearing } from "../audio/engine";
import { SAMPLE_NAMES, type Samples } from "../audio/samples";
import { TRAIN_LENGTH } from "../train/layout";

/** Dev: renders one state of the soundscape offline, frame by frame as the page would drive it, and hands back a WAV. */
interface Job {
  seconds: number;
  seed: number;
  solo?: "beds" | "train";
  /** Fixed, or a list of [time, width, inside] keyframes to glide between. */
  view: Array<[number, number, number]>;
  alone?: boolean;
  speed?: number;
  interfaceSounds?: Array<[number, "hover" | "open" | "close" | "thought"]>;
}

const RATE = 44100;
const STEP = 0.05;
const CRUISE = 10.5;

function viewAt(view: Job["view"], t: number): { viewWidth: number; inside: number } {
  let i = 0;
  while (i + 1 < view.length && view[i + 1]![0] <= t) i++;
  const a = view[i]!;
  const c = view[i + 1] ?? a;
  const f = c[0] > a[0] ? Math.min(1, (t - a[0]) / (c[0] - a[0])) : 0;
  return { viewWidth: a[1] + (c[1] - a[1]) * f, inside: a[2] + (c[2] - a[2]) * f };
}

function toWav(buffer: AudioBuffer): string {
  const frames = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + frames * 8));
  const text = (at: number, s: string): void => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); out.setUint32(4, 36 + frames * 8, true); text(8, "WAVEfmt "); out.setUint32(16, 16, true);
  out.setUint16(20, 3, true); out.setUint16(22, 2, true); out.setUint32(24, RATE, true); out.setUint32(28, RATE * 8, true);
  out.setUint16(32, 8, true); out.setUint16(34, 32, true); text(36, "data"); out.setUint32(40, frames * 8, true);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  for (let i = 0; i < frames; i++) { out.setFloat32(44 + i * 8, l[i]!, true); out.setFloat32(48 + i * 8, r[i]!, true); }
  const bytes = new Uint8Array(out.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

let files: Map<string, ArrayBuffer> | null = null;

async function render(job: Job): Promise<string> {
  const ctx = new OfflineAudioContext(2, Math.round(job.seconds * RATE), RATE);
  files ??= new Map(await Promise.all(SAMPLE_NAMES.map(async (name) => [name, await (await fetch(`/audio/${name}.mp3`)).arrayBuffer()] as const)));
  const samples: Samples = {};
  for (const name of SAMPLE_NAMES) samples[name] = await ctx.decodeAudioData(files.get(name)!.slice(0));
  const engine = createEngine(ctx, { seed: job.seed, samples, solo: job.solo });
  let distance = 4000;
  const hearing = (t: number): Hearing => ({ ...viewAt(job.view, t), distance, at: TRAIN_LENGTH / 2, alone: job.alone ?? false });
  engine.update(hearing(0));
  const steps = Math.floor(job.seconds / STEP);
  for (let i = 1; i < steps; i++) {
    const t = i * STEP;
    void ctx.suspend(t).then(() => {
      distance += (job.speed ?? CRUISE) * STEP;
      engine.update(hearing(t));
      for (const [at, sound] of job.interfaceSounds ?? []) if (at > t - STEP && at <= t) engine[sound]();
      void ctx.resume();
    });
  }
  return toWav(await ctx.startRendering());
}

Object.assign(window, { __render: render, __ready: true });
