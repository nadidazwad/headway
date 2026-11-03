import { Group, Mesh, Vector3, type BufferGeometry, type ShaderMaterial } from "three";
import type { Assets, PersonPose } from "../assets";
import { Batch } from "../geometry";
import { toBufferGeometry } from "../render";
import { Rng, hashSeed } from "../shared/rng";
import type { Passenger } from "../thoughts";
import { CAB_DEPTH, CAR_LENGTH } from "./layout";
import type { TrainCar } from "./train";

export interface Riders {
  /** The light crew for looking in through the windows, or the detailed, moving one for an open coach. */
  show(detailed: boolean): void;
  /** Moves the detailed crew: the sway of the standing, the walkers in the aisle. */
  update(time: number, dt: number): void;
  /**
   * The person a world-space ray passes through, nearest first. `passenger` is null for someone
   * with nothing to say, such as a walker; `hit` says whether anyone was there at all.
   */
  pick(origin: Vector3, direction: Vector3): { hit: boolean; passenger: Passenger | null };
}

const STANDING: ReadonlySet<PersonPose> = new Set(["stand", "look", "phone", "music", "bag", "strap"]);
const PICK_RADIUS = 0.32;

interface Standing {
  object: Mesh;
  person: Passenger;
  phase: number;
  /** Weight shifts and glances: where the body is heading and how far it has got. */
  goalX: number;
  goalTurn: number;
  turn: number;
  next: number;
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

export function createRiders(car: TrainCar, crew: Passenger[], assets: Assets, material: ShaderMaterial, seed: number): Riders {
  const stampOne = (draw: (b: Batch) => void): BufferGeometry => {
    const b = new Batch(1 << 11);
    b.cull = false;
    draw(b);
    return toBufferGeometry(b.finish());
  };

  // Seen from outside: everyone in one mesh.
  const lo = (() => {
    const batch = new Batch(1 << 13);
    for (const person of crew) batch.at(person.x, 0, person.z, () => batch.stamp(assets.person(person.avatar, person.pose, "lo")), person.facing);
    const mesh = new Mesh(toBufferGeometry(batch.finish()), material);
    mesh.frustumCulled = false;
    car.riders.add(mesh);
    return mesh;
  })();

  let detailed: Group | null = null;
  const standing: Standing[] = [];
  const walkers: Walker[] = [];
  const rng = new Rng(hashSeed(seed, car.index, 313));

  const build = (): Group => {
    const group = new Group();
    for (const person of crew) {
      const object = new Mesh(stampOne((b) => b.stamp(assets.person(person.avatar, person.pose, "hi"))), material);
      object.frustumCulled = false;
      object.position.set(person.x, 0, person.z);
      object.rotation.y = person.facing;
      group.add(object);
      if (STANDING.has(person.pose)) standing.push({ object, person, phase: rng.range(0, 10), goalX: person.x, goalTurn: 0, turn: 0, next: rng.range(1, 5) });
    }

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
    const count = Math.min(stretches.length, rng.int(1, 2));
    const cast = assets.avatars.map((_, i) => i);
    for (const [from, to] of rng.shuffled(stretches).slice(0, count)) {
      const avatar = rng.pick(cast);
      const frames = Array.from({ length: assets.walkFrames }, (_, f) => stampOne((b) => b.stamp(assets.walkFrame(avatar, f))));
      const still = stampOne((b) => b.stamp(assets.person(avatar, "stand", "lo")));
      const object = new Mesh(frames[0]!, material);
      object.frustumCulled = false;
      group.add(object);
      const x = rng.range(from, to);
      const heading = rng.chance(0.5) ? 1 : -1;
      walkers.push({ object, frames, still, stride: assets.avatars[avatar]!.walkStride, z: aisle, x, from, to, speed: rng.range(0.75, 1.05), heading, facing: (heading * Math.PI) / 2, pause: 0, turnAfter: 1.4, walked: rng.range(0, 3) });
    }
    car.riders.add(group);
    return group;
  };

  const base = new Vector3();

  return {
    show(on) {
      if (on && !detailed) detailed = build();
      lo.visible = !on;
      if (detailed) detailed.visible = on;
    },
    update(time, dt) {
      if (!detailed || !detailed.visible) return;
      for (const s of standing) {
        const holding = s.person.pose === "strap";
        // The coach's own sway, felt more by whoever is not holding on.
        const give = holding ? 0.5 : 1;
        s.object.rotation.x = Math.sin(time * 1.3 + s.phase) * 0.018 * give;
        s.object.rotation.z = Math.sin(time * 0.8 + s.phase * 1.7) * 0.014 * give;
        s.next -= dt;
        if (s.next <= 0) {
          s.next = rng.range(2.5, 7);
          s.goalX = s.person.x + (holding ? rng.range(-0.04, 0.04) : rng.range(-0.12, 0.12));
          s.goalTurn = holding ? rng.range(-0.15, 0.15) : rng.range(-0.55, 0.55);
        }
        const ease = 1 - Math.exp(-dt * 1.6);
        s.object.position.x += (s.goalX - s.object.position.x) * ease;
        s.turn += (s.goalTurn - s.turn) * (1 - Math.exp(-dt * 1.1));
        s.object.rotation.y = s.person.facing + s.turn;
      }
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
      for (const s of standing) test(s.object.position.x, s.object.position.z, s.person.headTop, s.person);
      for (const person of crew) if (!STANDING.has(person.pose)) test(person.x, person.z, person.headTop, person);
      if (!detailed) for (const person of crew) if (STANDING.has(person.pose)) test(person.x, person.z, person.headTop, person);
      for (const w of walkers) test(w.x, w.z, 1.7, null);
      return found;
    },
  };
}
