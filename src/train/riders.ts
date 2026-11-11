import { Group, Mesh, Vector3, type BufferGeometry, type ShaderMaterial } from "three";
import type { Assets, PersonPose } from "../assets";
import { Batch, type Stampable } from "../geometry";
import { toBufferGeometry } from "../render";
import { Rng, hashSeed } from "../shared/rng";
import type { Passenger } from "../thoughts";
import { bodyOf, headOf, type Head } from "./head";
import { CAB_DEPTH, CAR_LENGTH } from "./layout";
import type { TrainCar } from "./train";

export interface Riders {
  /** The light crew for looking in through the windows, or the detailed, moving one for an open coach. */
  show(detailed: boolean): void;
  /** Builds the detailed crew ahead of the click that needs it, so opening a coach never hitches. */
  warm(): void;
  /** Moves the detailed crew: the sway of the standing, the walkers in the aisle, every head. */
  update(time: number, dt: number): void;
  /**
   * Whose thought is being read. They look at whoever it is about, who may feel it and look back;
   * with nobody in mind they glance up, as people do when a thought arrives.
   */
  attend(passenger: Passenger | null): void;
  /**
   * The person a world-space ray passes through, nearest first. `passenger` is null for someone
   * with nothing to say, such as a walker; `hit` says whether anyone was there at all.
   */
  pick(origin: Vector3, direction: Vector3): { hit: boolean; passenger: Passenger | null };
}

const STANDING: ReadonlySet<PersonPose> = new Set(["stand", "look", "phone", "music", "bag", "strap"]);
const ON_PHONE: ReadonlySet<PersonPose> = new Set(["phone", "sitphone"]);
const PICK_RADIUS = 0.32;
/** As far as a neck turns before the shoulders have to follow. */
const NECK = 1.15;

interface Figure {
  person: Passenger;
  /** Where the body stands; the head rides in it. Null for the seated and still, who share one mesh. */
  holder: Group;
  /** The meshes that turn with this figure: its head, and its body unless that is seated and still. */
  parts: Mesh[];
  head: Head | null;
  standing: boolean;
  phase: number;
  /** The head now, where it is heading, and how briskly. */
  yaw: number;
  pitch: number;
  roll: number;
  goalYaw: number;
  goalPitch: number;
  goalRoll: number;
  brisk: number;
  drawn: [number, number, number];
  /** Seconds until this head next finds something of its own to do. */
  idle: number;
  /** Someone to look at, from a moment after it begins until it ends. */
  watch: { who: { x: number; z: number; low: boolean }; from: number; until: number } | null;
  /** Whether this passenger bothers to look up at whoever is walking past. */
  curious: boolean;
  /** A sleeper's sideways lean: which way, in its own frame, and the droop it is part-way through. */
  lean: number;
  droop: number;
  /** Weight shifts of the standing: where the body is heading and how far it has got. */
  goalX: number;
  goalZ: number;
  goalTurn: number;
  turn: number;
  shift: number;
}

interface Walker {
  object: Mesh;
  frames: BufferGeometry[];
  /** Standing, for the pause at the end of a stretch: never frozen mid-step. */
  still: BufferGeometry;
  stride: number;
  z: number;
  x: number;
  from: number;
  to: number;
  speed: number;
  heading: 1 | -1;
  facing: number;
  pause: number;
  /** Seconds before the end of a pause at which the turn begins. */
  turnAfter: number;
  walked: number;
}

/** Distance from a ray to a vertical segment, and how far along the ray it comes closest. */
function rayToUpright(origin: Vector3, direction: Vector3, base: Vector3, height: number): { distance: number; along: number } {
  // Closest points between the line origin + t d and the segment base + s (0, 1, 0), s in [0, height].
  const wx = origin.x - base.x, wy = origin.y - base.y, wz = origin.z - base.z;
  const b = direction.y;
  const d = direction.x * wx + direction.y * wy + direction.z * wz;
  const e = wy;
  const denominator = 1 - b * b;
  let s = denominator > 1e-6 ? (e - b * d) / denominator : 0;
  s = Math.max(0, Math.min(height, s));
  const t = s * b - d;
  const px = origin.x + direction.x * t - base.x;
  const py = origin.y + direction.y * t - base.y - s;
  const pz = origin.z + direction.z * t - base.z;
  return { distance: Math.hypot(px, py, pz), along: t };
}

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

/** @param hasWalkers whether anyone paces the aisle: a coach has one, a driving cab does not */
export function createRiders(car: TrainCar, crew: Passenger[], assets: Assets, { solid: material, moving }: { solid: ShaderMaterial; moving: ShaderMaterial }, seed: number, hasWalkers = true): Riders {
  const stampOne = (stamp: Stampable): BufferGeometry => {
    const b = new Batch(1 << 11);
    b.cull = false;
    b.stamp(stamp);
    return toBufferGeometry(b.finish());
  };
  const meshOf = (geometry: BufferGeometry): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  };

  // Seen from outside: everyone in one mesh.
  const lo = (() => {
    const batch = new Batch(1 << 13);
    for (const person of crew) batch.at(person.x, 0, person.z, () => batch.stamp(assets.person(person.avatar, person.pose, "far")), person.facing);
    const mesh = meshOf(toBufferGeometry(batch.finish()));
    car.riders.add(mesh);
    return mesh;
  })();

  let detailed: Group | null = null;
  const figures: Figure[] = [];
  const byId = new Map<string, Figure>();
  const walkers: Walker[] = [];
  const rng = new Rng(hashSeed(seed, car.index, 313));
  let attending: Figure | null = null;
  let clock = 0;

  const build = (): Group => {
    const group = new Group();
    group.visible = false;
    // The seated and awake never move below the neck: their bodies go into one mesh.
    const still = new Batch(1 << 14);
    still.cull = false;
    let anyStill = false;
    for (const person of crew) {
      const whole = assets.person(person.avatar, person.pose, "hi");
      const head = headOf(whole);
      const body = (head && bodyOf(whole)) || whole;
      const standing = STANDING.has(person.pose);
      const holder = new Group();
      holder.position.set(person.x, 0, person.z);
      holder.rotation.y = person.facing;
      group.add(holder);
      const parts: Mesh[] = [];
      if (standing || person.asleep) parts.push(meshOf(stampOne(body)));
      else {
        still.at(person.x, 0, person.z, () => still.stamp(body), person.facing);
        anyStill = true;
      }
      if (head) parts.push(meshOf(head.geometry));
      holder.add(...parts);

      // A sleeper sinks towards whoever is on the next seat, and towards the one minding it most of all.
      const beside = crew
        .filter((other) => other !== person && !STANDING.has(other.pose) && Math.sign(other.z) === Math.sign(person.z) && Math.abs(other.x - person.x) < 0.6)
        .sort((a, b) => Number(b.thought?.about === person.id) - Number(a.thought?.about === person.id))[0];
      const towards = beside ? Math.sign(beside.x - person.x) * Math.cos(person.facing) : rng.chance(0.5) ? 1 : -1;
      const figure: Figure = {
        person,
        holder,
        parts,
        head,
        standing,
        phase: rng.range(0, 10),
        yaw: 0,
        pitch: 0,
        roll: 0,
        goalYaw: 0,
        goalPitch: 0,
        goalRoll: 0,
        brisk: 4,
        drawn: [0, 0, 0],
        idle: rng.range(0.5, 5),
        watch: null,
        curious: rng.chance(0.5),
        lean: person.asleep ? (towards >= 0 ? 1 : -1) * (beside ? 1 : 0.5) : 0,
        droop: rng.range(0, 1),
        goalX: person.x,
        goalZ: person.z,
        goalTurn: 0,
        turn: 0,
        shift: rng.range(1, 5),
      };
      figures.push(figure);
      byId.set(person.id, figure);
    }
    if (anyStill) group.add(meshOf(toBufferGeometry(still.finish())));

    // One or two people walking the aisle, between whoever stands in it.
    const aisle = rng.range(-0.15, 0.25);
    const blockers = crew.filter((p) => STANDING.has(p.pose) && Math.abs(p.z - aisle) < 0.55).map((p) => p.x).sort((a, b) => a - b);
    const start = car.index === 0 ? -CAR_LENGTH / 2 + CAB_DEPTH + 0.6 : -CAR_LENGTH / 2 + 0.7;
    const end = CAR_LENGTH / 2 - 0.7;
    const stops = [start - 0.45, ...blockers, end + 0.45];
    const stretches: Array<[number, number]> = [];
    for (let i = 0; i + 1 < stops.length; i++) {
      const from = stops[i]! + 0.45;
      const to = stops[i + 1]! - 0.45;
      // Long enough to read as going somewhere, not as a person pacing on the spot.
      if (to - from > 3.6) stretches.push([from, to]);
    }
    const count = hasWalkers ? Math.min(stretches.length, rng.int(1, 2)) : 0;
    const cast = assets.avatars.map((_, i) => i).filter((i) => car.theme !== "women" || assets.avatars[i]!.female);
    for (const [from, to] of rng.shuffled(stretches).slice(0, count)) {
      const avatar = rng.pick(cast);
      const frames = Array.from({ length: assets.walkFrames }, (_, f) => stampOne(assets.walkFrame(avatar, f)));
      const stillFrame = stampOne(assets.person(avatar, "stand", "lo"));
      const object = meshOf(frames[0]!);
      object.material = moving;
      group.add(object);
      const x = rng.range(from, to);
      const heading = rng.chance(0.5) ? 1 : -1;
      walkers.push({ object, frames, still: stillFrame, stride: assets.avatars[avatar]!.walkStride, z: aisle, x, from, to, speed: rng.range(0.75, 1.05), heading, facing: (heading * Math.PI) / 2, pause: 0, turnAfter: 1.4, walked: rng.range(0, 3) });
    }
    car.riders.add(group);
    return group;
  };

  /** Turns a head, and the shoulders too where a neck alone would not get there, towards a point in the coach. */
  const lookAt = (figure: Figure, x: number, z: number, low: boolean): void => {
    const { person } = figure;
    const wanted = wrap(Math.atan2(x - figure.holder.position.x, z - figure.holder.position.z) - person.facing);
    if (figure.standing && person.pose !== "strap") figure.goalTurn = clamp(wanted * 0.45, 0.8);
    figure.goalYaw = clamp(wanted - (figure.standing ? figure.goalTurn : 0), NECK);
    // Down at someone seated from standing, up at someone standing from a seat.
    figure.goalPitch = figure.standing === !low ? 0 : figure.standing ? 0.3 : -0.26;
    figure.goalRoll = 0;
    figure.brisk = 5;
  };

  /** What a head does left to itself: sleepers sink and start awake, phones hold the eye, the rest look about. */
  const idle = (figure: Figure, dt: number): void => {
    const { person } = figure;
    if (person.asleep) {
      // Down by degrees, then up with a start, then down again.
      figure.droop += dt / (figure.droop < 1 ? 7 + (figure.phase % 4) : 0.9);
      if (figure.droop > 2) figure.droop = 0;
      const sunk = figure.droop < 1 ? figure.droop : 0;
      figure.goalPitch = 0.14 + 0.36 * sunk;
      figure.goalRoll = -figure.lean * (0.06 + 0.2 * sunk);
      figure.goalYaw = figure.lean * 0.12 * sunk;
      figure.brisk = figure.droop < 1 ? 1.2 : 8;
      return;
    }
    figure.idle -= dt;
    if (figure.idle > 0) return;
    figure.brisk = 3.5;
    figure.goalRoll = 0;
    if (ON_PHONE.has(person.pose)) {
      // Mostly the screen; now and then up, to see which station this is.
      const up = rng.chance(0.3);
      figure.goalYaw = up ? rng.range(-0.7, 0.7) : rng.range(-0.06, 0.06);
      figure.goalPitch = up ? -0.3 : 0;
      figure.idle = up ? rng.range(1.2, 2.2) : rng.range(4, 10);
      return;
    }
    const roll = rng.next();
    if (roll < 0.45) {
      figure.goalYaw = rng.range(-0.12, 0.12);
      figure.goalPitch = 0;
    } else if (roll < 0.85) {
      figure.goalYaw = (rng.chance(0.5) ? 1 : -1) * rng.range(0.3, 0.85);
      figure.goalPitch = rng.range(-0.12, 0.08);
    } else {
      figure.goalYaw = rng.range(-0.2, 0.2);
      figure.goalPitch = 0.26;
    }
    if (figure.standing && person.pose !== "strap") figure.goalTurn = rng.range(-0.45, 0.45);
    figure.idle = rng.range(2.2, 6.5);
  };

  const base = new Vector3();

  return {
    show(on) {
      if (on && !detailed) detailed = build();
      lo.visible = !on;
      if (detailed) detailed.visible = on;
    },
    warm() {
      detailed ??= build();
    },
    attend(passenger) {
      const figure = passenger ? (byId.get(passenger.id) ?? null) : null;
      if (figure === attending) return;
      if (attending) {
        attending.watch = null;
        attending.idle = 0.4;
      }
      attending = figure;
      if (!figure) return;
      const subject = passenger?.thought?.about ? byId.get(passenger.thought.about) : undefined;
      if (!subject) {
        // Nobody in mind: the eyes go up and away for a moment, as they do when a thought lands.
        figure.goalPitch = -0.14;
        figure.goalYaw = clamp(figure.goalYaw + (rng.chance(0.5) ? 0.3 : -0.3), 0.6);
        figure.brisk = 4;
        figure.idle = 2.2;
        return;
      }
      figure.watch = { who: { x: subject.person.x, z: subject.person.z, low: !subject.standing }, from: clock + 0.15, until: Infinity };
      // Being looked at is felt. Not by the sleeping, nor by anyone lost in a phone.
      if (!subject.person.asleep && !ON_PHONE.has(subject.person.pose) && rng.chance(0.75)) {
        subject.watch = { who: { x: figure.person.x, z: figure.person.z, low: !figure.standing }, from: clock + rng.range(1.1, 2), until: clock + rng.range(3, 4.2) };
      }
    },
    update(time, dt) {
      if (!detailed || !detailed.visible) return;
      clock += dt;
      for (const w of walkers) {
        if (w.pause > 0) {
          w.pause -= dt;
          // Stops first, then turns round unhurriedly, then sets off back.
          if (w.pause < w.turnAfter) w.facing += ((w.heading * Math.PI) / 2 - w.facing) * (1 - Math.exp(-dt * 3.5));
          w.object.geometry = w.still;
        } else {
          w.facing = (w.heading * Math.PI) / 2;
          const step = w.speed * dt;
          w.x += w.heading * step;
          w.walked += step;
          if ((w.heading > 0 && w.x >= w.to) || (w.heading < 0 && w.x <= w.from)) {
            w.x = Math.max(w.from, Math.min(w.to, w.x));
            w.heading = w.heading > 0 ? -1 : 1;
            w.pause = rng.range(2.5, 6);
            w.turnAfter = 1.4;
          }
          const frame = Math.floor((w.walked / w.stride) * w.frames.length) % w.frames.length;
          w.object.geometry = w.frames[frame]!;
        }
        w.object.position.set(w.x, 0, w.z);
        w.object.rotation.y = w.facing;
      }

      for (const f of figures) {
        const { person, holder } = f;
        const holding = person.pose === "strap";
        const passing = person.asleep ? undefined : walkers.find((w) => w.pause <= 0 && Math.abs(w.x - person.x) < 1.7);
        if (!passing) f.curious = rng.chance(0.5);
        if (f.watch && clock > f.watch.until) {
          f.watch = null;
          f.idle = 0.2;
        }
        if (f.watch && clock >= f.watch.from) lookAt(f, f.watch.who.x, f.watch.who.z, f.watch.who.low);
        else if (passing && f.curious && !ON_PHONE.has(person.pose) && !f.watch) {
          lookAt(f, passing.x, passing.z, false);
          f.idle = 0.6;
        } else if (dt > 0) idle(f, dt);

        if (f.standing) {
          // The coach's own sway, felt more by whoever is not holding on.
          const give = holding ? 0.5 : 1;
          holder.rotation.x = Math.sin(time * 1.3 + f.phase) * 0.018 * give;
          holder.rotation.z = Math.sin(time * 0.8 + f.phase * 1.7) * 0.014 * give;
          f.shift -= dt;
          if (f.shift <= 0) {
            f.shift = rng.range(2.5, 7);
            f.goalX = person.x + (holding ? rng.range(-0.04, 0.04) : rng.range(-0.1, 0.1));
          }
          // Whoever stands in the walker's way gives a little ground.
          f.goalZ = person.z + (passing && !holding && Math.abs(passing.x - person.x) < 0.9 ? Math.sign(person.z - passing.z || 1) * 0.09 : 0);
          const ease = 1 - Math.exp(-dt * 1.6);
          holder.position.x += (f.goalX - holder.position.x) * ease;
          holder.position.z += (f.goalZ - holder.position.z) * ease;
          f.turn += (f.goalTurn - f.turn) * (1 - Math.exp(-dt * 1.4));
          holder.rotation.y = person.facing + f.turn;
        } else if (person.asleep) {
          // The whole body gives with the head, and breathes.
          const sunk = f.droop < 1 ? f.droop : 0;
          const want = -f.lean * (0.02 + 0.055 * sunk);
          holder.rotation.z += (want - holder.rotation.z) * (1 - Math.exp(-dt * (f.droop < 1 ? 1 : 6)));
          holder.rotation.x = 0.012 * Math.sin(time * 1.1 + f.phase);
        }

        // While a body or a head is turning it is drawn as a thing in motion, so it leaves no trail; at rest it settles into the picture again.
        const turning = Math.abs(f.goalTurn - f.turn) > 0.06 || Math.abs(f.goalYaw - f.yaw) + Math.abs(f.goalPitch - f.pitch) > 0.05;
        const drawnAs = turning ? moving : material;
        if (f.parts[0] && f.parts[0].material !== drawnAs) for (const part of f.parts) part.material = drawnAs;

        if (!f.head) continue;
        const ease = 1 - Math.exp(-dt * f.brisk);
        f.yaw += (f.goalYaw - f.yaw) * ease;
        f.pitch += (f.goalPitch - f.pitch) * ease;
        f.roll += (f.goalRoll - f.roll) * ease;
        // Music keeps its own small time.
        const nod = person.pose === "music" ? 0.035 * Math.sin(time * 6.2 + f.phase) : 0;
        if (Math.abs(f.yaw - f.drawn[0]) + Math.abs(f.pitch + nod - f.drawn[1]) + Math.abs(f.roll - f.drawn[2]) > 0.004) {
          f.drawn = [f.yaw, f.pitch + nod, f.roll];
          f.head.pose(f.yaw, f.pitch + nod, f.roll);
        }
      }
    },
    pick(origin, direction) {
      let best = Infinity;
      let found: { hit: boolean; passenger: Passenger | null } = { hit: false, passenger: null };
      car.riders.updateMatrixWorld();
      const test = (x: number, z: number, height: number, passenger: Passenger | null): void => {
        base.set(x, 0, z);
        car.riders.localToWorld(base);
        const { distance, along } = rayToUpright(origin, direction, base, height);
        if (distance < PICK_RADIUS && along < best) {
          best = along;
          found = { hit: true, passenger };
        }
      };
      if (detailed) for (const f of figures) test(f.holder.position.x, f.holder.position.z, f.person.headTop, f.person);
      else for (const person of crew) test(person.x, person.z, person.headTop, person);
      for (const w of walkers) test(w.x, w.z, 1.7, null);
      return found;
    },
  };
}
