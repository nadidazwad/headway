import { DynamicDrawUsage, type BufferGeometry, type InterleavedBufferAttribute } from "three";
import { Batch, STRIDE, type Stampable } from "../geometry";
import { toBufferGeometry } from "../render";

/**
 * A baked figure is one frozen pose. This cuts its head free at the neck so it can turn, nod and
 * tilt on its own: enough for a glance at a neighbour or a sleeper's droop, which is most of what
 * anyone does on a train.
 */
export interface Head {
  geometry: BufferGeometry;
  /** Radians: yaw to the figure's own left, pitch down, roll towards its right shoulder. */
  pose(yaw: number, pitch: number, roll: number): void;
}

interface Cut {
  body: Stampable;
  head: Stampable;
  /** For each head vertex, how fully it follows the head: 1 on the skull, fading to 0 down the neck. */
  follows: Float32Array;
  pivot: readonly [number, number, number];
}

/** The face and scalp are baked with this part mark. */
const HEAD_PART = 1;
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const cuts = new WeakMap<Stampable, Cut | null>();

function cutAtNeck(figure: Stampable): Cut | null {
  const cached = cuts.get(figure);
  if (cached !== undefined) return cached;
  const { pos, part, count } = figure;
  let top = -Infinity;
  for (let i = 0; i < count; i++) if (part[i] === HEAD_PART) top = Math.max(top, pos[i * 3 + 1]!);
  let cx = 0;
  let cz = 0;
  let skull = 0;
  for (let i = 0; i < count; i++) {
    if (part[i] !== HEAD_PART || pos[i * 3 + 1]! < top - 0.16) continue;
    cx += pos[i * 3]!;
    cz += pos[i * 3 + 2]!;
    skull++;
  }
  if (!skull) {
    cuts.set(figure, null);
    return null;
  }
  cx /= skull;
  cz /= skull;
  const neck = top - 0.25;
  // Whatever sits on the head goes with it, hair and scarf included; a hand raised beside it does not.
  const weight = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const height = smooth((pos[i * 3 + 1]! - (neck - 0.05)) / 0.11);
    const reach = Math.hypot(pos[i * 3]! - cx, pos[i * 3 + 2]! - cz);
    weight[i] = height * (1 - smooth((reach - 0.16) / 0.07));
  }

  const take = (wanted: boolean): { stamp: Stampable; from: number[] } => {
    const to = new Int32Array(count).fill(-1);
    const from: number[] = [];
    const index: number[] = [];
    for (let t = 0; t < figure.index.length; t += 3) {
      const corners = [figure.index[t]!, figure.index[t + 1]!, figure.index[t + 2]!];
      if (corners.some((v) => weight[v]! > 0.001) !== wanted) continue;
      for (const v of corners) {
        if (to[v] === -1) {
          to[v] = from.length;
          from.push(v);
        }
        index.push(to[v]!);
      }
    }
    const stamp: Stampable = {
      count: from.length,
      pos: new Float32Array(from.length * 3),
      nor: new Int8Array(from.length * 3),
      grey: new Uint8Array(from.length),
      part: new Uint8Array(from.length),
      index: new Uint16Array(index),
      ...(figure.surface === undefined ? {} : { surface: figure.surface }),
    };
    from.forEach((v, i) => {
      for (let k = 0; k < 3; k++) {
        stamp.pos[i * 3 + k] = pos[v * 3 + k]!;
        stamp.nor[i * 3 + k] = figure.nor[v * 3 + k]!;
      }
      stamp.grey[i] = figure.grey[v]!;
      stamp.part[i] = part[v]!;
    });
    return { stamp, from };
  };
  const head = take(true);
  const cut: Cut = { body: take(false).stamp, head: head.stamp, follows: Float32Array.from(head.from, (v) => weight[v]!), pivot: [cx, neck, cz] };
  cuts.set(figure, cut);
  return cut;
}

const asGeometry = (stamp: Stampable): BufferGeometry => {
  const batch = new Batch(1 << 11);
  batch.cull = false;
  batch.stamp(stamp);
  return toBufferGeometry(batch.finish());
};

/** The figure without its head, for stamping into any batch, or null if this one has no head to free. */
export function bodyOf(figure: Stampable): Stampable | null {
  return cutAtNeck(figure)?.body ?? null;
}

/** The figure's head as a mesh of its own that can be turned. Null if this figure has none to free. */
export function headOf(figure: Stampable): Head | null {
  const cut = cutAtNeck(figure);
  if (!cut) return null;
  const geometry = asGeometry(cut.head);
  const positions = (geometry.getAttribute("position") as InterleavedBufferAttribute).data;
  const normals = (geometry.getAttribute("normal") as InterleavedBufferAttribute).data;
  positions.setUsage(DynamicDrawUsage);
  normals.setUsage(DynamicDrawUsage);
  const floats = positions.array as Float32Array;
  const bytes = normals.array as Int8Array;
  const { pos, nor, count } = cut.head;
  const [px, py, pz] = cut.pivot;
  return {
    geometry,
    pose(yaw, pitch, roll) {
      // Roll about the way it faces, then nod, then turn: the order a neck works in.
      let last = -1;
      let sy = 0, cy = 1, sp = 0, cp = 1, sr = 0, cr = 1;
      for (let i = 0; i < count; i++) {
        const w = cut.follows[i]!;
        if (w <= 0) continue;
        // Most of a head follows fully, so the sines are worked out once for all of it.
        if (w !== last) {
          last = w;
          sy = Math.sin(yaw * w);
          cy = Math.cos(yaw * w);
          sp = Math.sin(pitch * w);
          cp = Math.cos(pitch * w);
          sr = Math.sin(roll * w);
          cr = Math.cos(roll * w);
        }
        let x = pos[i * 3]! - px, y = pos[i * 3 + 1]! - py, z = pos[i * 3 + 2]! - pz;
        let x1 = x * cr - y * sr, y1 = x * sr + y * cr;
        const at = (i * STRIDE) / 4;
        floats[at] = x1 * cy + (y1 * sp + z * cp) * sy + px;
        floats[at + 1] = y1 * cp - z * sp + py;
        floats[at + 2] = -x1 * sy + (y1 * sp + z * cp) * cy + pz;
        x = nor[i * 3]!;
        y = nor[i * 3 + 1]!;
        z = nor[i * 3 + 2]!;
        x1 = x * cr - y * sr;
        y1 = x * sr + y * cr;
        const to = i * STRIDE + 12;
        bytes[to] = x1 * cy + (y1 * sp + z * cp) * sy;
        bytes[to + 1] = y1 * cp - z * sp;
        bytes[to + 2] = -x1 * sy + (y1 * sp + z * cp) * cy;
      }
      positions.needsUpdate = true;
      normals.needsUpdate = true;
    },
  };
}
