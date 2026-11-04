import { Rng } from "../shared/rng";
import { mixFor, type Listening } from "./mix";
import { RAIL_LENGTH, railHits } from "./rails";
import type { SampleName, Samples } from "./samples";
import { createVoices } from "./voices";

export interface Hearing extends Listening {
  /** How far along the line the train has come. Rail joints are timed from this, and nothing else. */
  distance: number;
  /** Where the listener is along the train, in metres from its nose. */
  at: number;
  /** In the operator's cabin there is no crowd to hear. */
  alone: boolean;
}

export interface Engine {
  update(hearing: Hearing): void;
  addSamples(samples: Samples): void;
  hover(): void;
  open(): void;
  close(): void;
  thought(): void;
}

export interface EngineOptions {
  seed: number;
  samples?: Samples;
  /** For measuring one part alone: only the recorded beds, with nothing random over them, or only the train. */
  solo?: "beds" | "train";
}

/** Half-life of any change in the mix, in seconds: slow enough that the sound follows the camera. */
const GLIDE = 0.45;
/** The train's cruising speed, which the motor's pitches below are written for. */
const CRUISE = 10.5;
/** How far ahead rail joints are scheduled. A frame can be late; the rhythm should not be. */
const LOOKAHEAD = 0.14;

const equalPower = (rising: boolean): Float32Array<ArrayBuffer> => {
  const curve = new Float32Array(32);
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    curve[i] = rising ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  return curve;
};
const FADE_IN = equalPower(true);
const FADE_OUT = equalPower(false);

/** A room: the short decay off the buildings either side of a road. */
function streetEcho(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const length = Math.round(ctx.sampleRate * 1.3);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (rng.next() * 2 - 1) * Math.exp(-t / 0.28) * 0.5;
    }
  }
  return buffer;
}

/**
 * The whole soundscape as one graph on any audio context, so the same thing runs for real or is
 * rendered offline to be measured. Everything outside the coach passes through the coach's walls,
 * a low-pass that closes as it opens. Interface sounds go round that: they belong to the viewer.
 */
export function createEngine(ctx: BaseAudioContext, options: EngineOptions): Engine {
  const rng = new Rng(options.seed);
  const voices = createVoices(ctx, rng.int(1, 1 << 30));
  const samples: Samples = { ...options.samples };
  const eventsOn = options.solo === undefined;
  const now = (): number => ctx.currentTime;

  const gain = (value: number, to?: AudioNode): GainNode => {
    const node = ctx.createGain();
    node.gain.value = value;
    if (to) node.connect(to);
    return node;
  };
  const filter = (type: BiquadFilterType, hertz: number, q: number, to?: AudioNode): BiquadFilterNode => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = hertz;
    node.Q.value = q;
    if (to) node.connect(to);
    return node;
  };
  const noiseInto = (to: AudioNode): AudioBufferSourceNode => {
    const source = ctx.createBufferSource();
    source.buffer = voices.noise;
    source.loop = true;
    source.connect(to);
    source.start(0, rng.range(0, voices.noise.duration));
    return source;
  };
  const tone = (type: OscillatorType, hertz: number, level: number, to: AudioNode): OscillatorNode => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hertz;
    osc.connect(gain(level, to));
    osc.start();
    return osc;
  };
  /** A slow, small drift on a level, so that nothing steady is ever quite steady. */
  const drift = (param: AudioParam, depth: number, hertz: number): void => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hertz;
    osc.connect(gain(depth)).connect(param);
    osc.start(0);
  };

  // The ends of the graph. The limiter is a net, not a sound: the levels below stay under it.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -5;
  limiter.knee.value = 3;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const master = gain(0.6, limiter);
  limiter.connect(ctx.destination);
  const interface_ = gain(0.5, master);
  const walls = filter("lowpass", 16000, 0.4, master);
  const city = gain(0, walls);
  // Below this a laptop has nothing to play it with, and it would only eat the headroom of what it can.
  const train = gain(0, filter("highpass", 75, 0.7, walls));
  const interior = gain(0, master);

  // The city -------------------------------------------------------------------------------------

  const echo = ctx.createConvolver();
  echo.buffer = streetEcho(ctx, rng);
  echo.connect(gain(0.32, city));
  // Far traffic under everything, so the street never stops even before the recordings arrive.
  noiseInto(filter("lowpass", 340, 0.5, gain(0.1, city)));
  const beds = gain(1, city);

  const layers = [
    { name: "bed-bridge" as SampleName, level: 0.9, until: 0 },
    { name: "bed-street" as SampleName, level: 0.62, until: 0 },
  ];
  /** Long crossfaded lengths from anywhere in each recording, at slightly different speeds: nothing to recognise as a loop. */
  const scheduleBeds = (time: number): void => {
    const FADE = 3.5;
    for (const layer of layers) {
      const buffer = samples[layer.name];
      if (!buffer) continue;
      while (layer.until < time + 1.5) {
        const start = Math.max(time + 0.02, layer.until);
        const rate = rng.range(0.965, 1.035);
        const span = Math.min(rng.range(14, 26), (buffer.duration - 0.5) / rate);
        const offset = rng.range(0.2, Math.max(0.21, buffer.duration - span * rate - 0.2));
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        const fade = gain(0, beds);
        fade.gain.setValueCurveAtTime(FADE_IN, start, FADE);
        fade.gain.setValueCurveAtTime(FADE_OUT, start + span - FADE, FADE);
        const level = gain(layer.level, fade);
        source.connect(level);
        source.start(start, offset, span * rate + 0.05);
        layer.until = start + span - FADE;
      }
    }
  };

  /** One thing heard on the street: placed left or right, further or nearer, and in the buildings' echo. */
  const onStreet = (nearness: number, pan: number, top: number): AudioNode => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(city);
    panner.connect(echo);
    const level = gain(nearness * nearness, panner);
    return filter("lowpass", top * (0.35 + 0.65 * nearness), 0.5, level);
  };

  const playSample = (name: SampleName, when: number, to: AudioNode, rate: number, from = 0, span?: number): void => {
    const buffer = samples[name];
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(to);
    source.start(when, from, span);
  };

  /** An electric horn: two reeds a third or so apart, as every car and CNG has. */
  const carHorn = (when: number, pitch: number, length: number, nearness: number, pan: number): void => {
    const out = onStreet(nearness, pan, 4200);
    const shape = filter("peaking", 1500, 0.8, out);
    shape.gain.value = 5;
    const envelope = gain(0, shape);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(0.17, when + 0.008);
    envelope.gain.setValueAtTime(0.17, when + length);
    envelope.gain.linearRampToValueAtTime(0, when + length + 0.03);
    for (const ratio of [1, 1.26]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = pitch * ratio * (1 + rng.range(-0.004, 0.004));
      osc.connect(envelope);
      osc.start(when);
      osc.stop(when + length + 0.05);
    }
  };

  /** Honking comes in bursts: someone leans on it, and two others answer. */
  const honk = (when: number): void => {
    const pan = rng.range(-0.8, 0.8);
    const nearness = Math.pow(rng.next(), 1.6) * 0.8 + 0.12;
    const pitch = rng.pick([350, 392, 415, 440, 466, 520, 600, 720]) * rng.range(0.97, 1.03);
    const presses = rng.pick([1, 1, 2, 2, 3, 5]);
    let t = when;
    for (let i = 0; i < presses; i++) {
      const length = presses > 2 ? rng.range(0.07, 0.14) : rng.range(0.1, 0.5);
      carHorn(t, pitch, length, nearness, pan);
      t += length + rng.range(0.06, 0.15);
    }
  };

  const busHorn = (when: number): void => {
    const out = onStreet(rng.range(0.32, 0.72), rng.range(-0.7, 0.7), 5200);
    playSample(rng.pick<SampleName>(["horn-long", "horn-pass"]), when, gain(0.5, out), rng.range(0.92, 1.1));
  };

  const bell = (when: number): void => {
    const out = onStreet(rng.range(0.34, 0.8), rng.range(-0.85, 0.85), 11000);
    let t = when;
    const rings = rng.int(1, 3);
    for (let i = 0; i < rings; i++) {
      playSample(rng.pick<SampleName>(["bell-1", "bell-2", "bell-3"]), t, gain(rng.range(0.4, 0.62), out), rng.range(0.94, 1.06));
      t += rng.range(0.22, 0.42);
    }
  };

  /** A CNG going past: its engine comes up, crosses from one side to the other, and goes. */
  const cngPassing = (when: number): void => {
    const buffer = samples.cng;
    if (!buffer) return;
    const span = rng.range(3.5, 6.5);
    const panner = ctx.createStereoPanner();
    const side = rng.chance(0.5) ? 1 : -1;
    panner.pan.setValueAtTime(-side * 0.8, when);
    panner.pan.linearRampToValueAtTime(side * 0.8, when + span);
    panner.connect(city);
    const envelope = gain(0, panner);
    const peak = rng.range(0.1, 0.26);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(peak, when + span * 0.5);
    envelope.gain.linearRampToValueAtTime(0, when + span);
    playSample("cng", when, envelope, rng.range(0.92, 1.18), rng.range(0, Math.max(0, buffer.duration - span - 0.2)), span);
  };

  const events = [
    { every: 2.1, play: honk, next: 0 },
    { every: 23, play: busHorn, next: 0 },
    { every: 6.5, play: bell, next: 0 },
    { every: 9, play: cngPassing, next: 0 },
    {
      every: 47,
      next: 0,
      play: (when: number): void => {
        const out = onStreet(0.62, rng.range(-0.9, 0.9), 7000);
        playSample("crows", when, gain(0.5, out), rng.range(0.96, 1.04), rng.range(0, 6), rng.range(2.5, 5.5));
      },
    },
  ];
  /** Every sound on its own clock, with a Poisson wait between: no rhythm to pick out, and now and then a jam. */
  const scheduleEvents = (time: number): void => {
    for (const event of events) {
      if (event.next === 0) event.next = time + rng.next() * event.every;
      while (event.next < time + 0.25) {
        event.play(Math.max(time + 0.01, event.next));
        event.next += -Math.log(1 - rng.next() * 0.999) * event.every;
      }
    }
  };

  // The train, from outside ---------------------------------------------------------------------

  const motor = gain(0, train);
  const rolling = gain(0, train);
  // Traction motor and gears: their pitches are tied to the wheels, so they follow the speed.
  const motorTones: Array<[OscillatorNode, number]> = (
    [
      ["triangle", 106, 0.1],
      ["sine", 212, 0.075],
      ["sine", 424, 0.055],
      ["sine", 848, 0.03],
      ["sine", 1272, 0.012],
    ] as Array<[OscillatorType, number, number]>
  ).map(([type, hertz, level]) => [tone(type, hertz, level, motor), hertz]);
  drift(motor.gain, 0.05, 0.13);
  // Wheel on rail: a low roar, the ring of the rail above it, and a thin hiss.
  noiseInto(filter("lowpass", 780, 0.6, gain(0.15, rolling)));
  noiseInto(filter("bandpass", 1450, 1.1, gain(0.075, rolling)));
  noiseInto(filter("bandpass", 3600, 0.8, gain(0.028, rolling)));
  drift(rolling.gain, 0.04, 0.21);
  const clacks = gain(1, train);

  // Inside a coach ------------------------------------------------------------------------------

  // The air conditioning: moving air, and the fan that moves it.
  const conditioning = gain(1, interior);
  noiseInto(filter("lowpass", 2600, 0.4, gain(0.06, conditioning)));
  noiseInto(filter("bandpass", 520, 0.8, gain(0.12, conditioning)));
  drift(conditioning.gain, 0.03, 0.09);
  tone("sawtooth", 96, 0.014, filter("lowpass", 340, 0.7, conditioning));
  tone("sine", 192, 0.01, conditioning);
  // What reaches the floor through the bogies.
  const floor = gain(0, interior);
  noiseInto(filter("lowpass", 150, 0.7, gain(0.12, floor)));
  const floorThuds = filter("lowpass", 240, 0.7, gain(0.8, interior));

  // Murmur: voices with no words, each a buzz through two moving vowels, in phrases with pauses.
  const crowd = gain(0, filter("lowpass", 1900, 0.5, gain(8, interior)));
  const talkers = [132, 158, 176, 205, 222].map((pitch) => {
    const envelope = gain(0, crowd);
    const first = filter("bandpass", 560, 2.6, envelope);
    const second = filter("bandpass", 1500, 3.2, envelope);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = pitch;
    osc.connect(first);
    osc.connect(gain(0.6, second));
    osc.start();
    return { pitch, osc, envelope, first, second, next: rng.range(0, 3) };
  });
  const scheduleMurmur = (time: number): void => {
    for (const talker of talkers) {
      while (talker.next < time + 0.25) {
        const start = Math.max(time, talker.next);
        const syllables = rng.int(4, 16);
        let t = start;
        for (let i = 0; i < syllables; i++) {
          const length = rng.range(0.09, 0.26);
          const loud = rng.range(0.012, 0.03);
          talker.envelope.gain.setTargetAtTime(loud, t, 0.022);
          talker.envelope.gain.setTargetAtTime(loud * 0.14, t + length * 0.7, 0.028);
          talker.first.frequency.setTargetAtTime(rng.range(380, 780), t, 0.05);
          talker.second.frequency.setTargetAtTime(rng.range(1050, 2000), t, 0.05);
          talker.osc.frequency.setTargetAtTime(talker.pitch * rng.range(0.9, 1.14), t, 0.08);
          t += length;
        }
        talker.envelope.gain.setTargetAtTime(0, t, 0.06);
        talker.next = t + rng.range(0.7, 5.5);
      }
    }
  };

  // Each frame ----------------------------------------------------------------------------------

  const glide = (param: AudioParam, value: number, time: number, seconds = GLIDE): void => {
    param.setTargetAtTime(value, time, seconds / 3);
  };
  const clackFor = (hit: { axle: number }, hearing: Hearing, when: number, inside: number): void => {
    // Only the axles nearby make the rhythm. Hear all 24 and they land a metre apart: a roll, not a da-dum.
    const reach = 4.5 + (1 - inside) * 4.5;
    const off = (hit.axle - hearing.at) / reach;
    const loud = 1 / (1 + off * off);
    if (loud < 0.12) return;
    const source = ctx.createBufferSource();
    source.buffer = rng.pick(voices.clacks);
    source.playbackRate.value = rng.range(0.94, 1.06);
    source.connect(gain(0.5 * loud, clacks));
    source.connect(gain(0.3 * loud * inside, floorThuds));
    source.start(when);
  };

  let scheduledTo: number | null = null;
  // Speed over half a second, not a frame: frame times jitter, and the motor's pitch would flutter with them.
  let paceFrom: { distance: number; time: number } | null = null;
  let speed = 0;
  let lastMix = -1;

  return {
    update(hearing) {
      const time = now();
      if (!paceFrom) paceFrom = { distance: hearing.distance, time };
      if (time - paceFrom.time >= 0.5) {
        speed = (hearing.distance - paceFrom.distance) / (time - paceFrom.time);
        paceFrom = { distance: hearing.distance, time };
      }
      const pace = Math.max(0, speed / CRUISE);

      // Fifty changes a second is more than an ear can follow, and each one is work for the audio thread.
      if (time - lastMix > 0.05) {
        lastMix = time;
        const mix = mixFor(hearing);
        glide(city.gain, options.solo === "train" ? 0 : mix.city, time);
        glide(train.gain, mix.train, time);
        glide(interior.gain, mix.interior * 0.75, time);
        glide(walls.frequency, mix.cutoff, time);
        glide(motor.gain, 0.9 * Math.min(1.3, pace), time);
        glide(rolling.gain, Math.min(1.4, Math.pow(pace, 1.5)), time);
        glide(floor.gain, 0.5 * Math.min(1.3, pace), time);
        glide(crowd.gain, hearing.alone ? 0 : 1, time);
        for (const [osc, hertz] of motorTones) glide(osc.frequency, Math.max(1, hertz * pace), time, 0.3);
      }

      scheduleBeds(time);
      if (eventsOn) scheduleEvents(time);
      if (mixFor(hearing).interior > 0.02 && !hearing.alone) scheduleMurmur(time);

      // Rail joints, from how far the train has really come.
      if (speed > 0.2) {
        const until = hearing.distance + speed * LOOKAHEAD;
        // After a jump along the line there are no joints to catch up on: the train did not ride them.
        if (scheduledTo === null || hearing.distance - scheduledTo > RAIL_LENGTH) scheduledTo = hearing.distance;
        if (options.solo !== "beds") {
          const inside = hearing.inside;
          for (const hit of railHits(scheduledTo, until)) clackFor(hit, hearing, Math.max(time, time + (hit.at - hearing.distance) / speed), inside);
        }
        scheduledTo = Math.max(scheduledTo, until);
      } else {
        scheduledTo = null;
      }
    },
    addSamples(more) {
      Object.assign(samples, more);
    },
    hover() {
      playInterface(voices.tick, 0.16);
    },
    open() {
      playInterface(voices.doorOpen, 0.42);
    },
    close() {
      playInterface(voices.doorClose, 0.42);
    },
    thought() {
      playInterface(voices.thought, 0.22);
    },
  };

  function playInterface(buffer: AudioBuffer, level: number): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain(level, interface_));
    source.start();
  }
}
