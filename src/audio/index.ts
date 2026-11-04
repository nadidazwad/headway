import { createEngine, type Engine, type Hearing } from "./engine";
import { SAMPLE_NAMES, type SampleName, type Samples } from "./samples";

export type { Hearing };

export interface Soundscape {
  /** Asks for the recordings. Call once the world is up: nothing here may delay it. */
  load(): void;
  /** Starts the sound. Browsers only allow it from inside a click, tap or key press; safe to call again. */
  start(): void;
  /** Once a frame. Does nothing until there is sound. */
  update(hearing: Hearing): void;
  hover(): void;
  open(): void;
  close(): void;
  thought(): void;
  /** "silent" until the first gesture, then whatever the browser says. */
  readonly state: AudioContextState | "silent";
  /** How many recordings have joined in. */
  readonly recordings: number;
}

/** The sound of the line and the city under it. Pauses by itself while the tab is hidden. */
export function createSoundscape(base: string = import.meta.env.BASE_URL): Soundscape {
  let ctx: AudioContext | null = null;
  let engine: Engine | null = null;
  let decoded = 0;
  const files = new Map<SampleName, Promise<ArrayBuffer>>();

  /** Decoding needs a context, so it waits for the first gesture; each recording joins in when it is ready. */
  const decodeAll = (): void => {
    if (!ctx || !engine) return;
    const running = ctx;
    const ready = engine;
    for (const [name, bytes] of files) {
      files.delete(name);
      void bytes
        .then((data) => running.decodeAudioData(data))
        .then((buffer) => {
          ready.addSamples({ [name]: buffer } as Samples);
          decoded++;
        })
        // A recording that fails to arrive leaves the street a little thinner, and is not worth an error.
        .catch(() => undefined);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });

  return {
    load() {
      for (const name of SAMPLE_NAMES) files.set(name, fetch(`${base}audio/${name}.mp3`).then((response) => response.arrayBuffer()));
      decodeAll();
    },
    start() {
      if (ctx) {
        if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
        return;
      }
      ctx = new AudioContext({ latencyHint: "balanced" });
      engine = createEngine(ctx, { seed: Math.floor(Math.random() * 1e9) });
      void ctx.resume();
      decodeAll();
    },
    update(hearing) {
      engine?.update(hearing);
    },
    hover() {
      engine?.hover();
    },
    open() {
      engine?.open();
    },
    close() {
      engine?.close();
    },
    thought() {
      engine?.thought();
    },
    get state() {
      return ctx?.state ?? "silent";
    },
    get recordings() {
      return decoded;
    },
  };
}
