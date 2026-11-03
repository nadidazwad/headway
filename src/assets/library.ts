import type { Stampable } from "../geometry";

export type PersonPose = "stand" | "look" | "phone" | "music" | "bag" | "sit" | "sitrest" | "strap" | "sitphone";

interface LodEntry {
  vertices: number;
  triangles: number;
  indices: number;
  grey: number;
  part: number;
}

interface PeopleIndex {
  quant: number;
  stride: number;
  avatars: Array<{
    name: string;
    female: boolean;
    lods: { hi: LodEntry; lo: LodEntry; far: LodEntry };
    poses: Record<PersonPose, { hi: number; lo: number; far: number; top: number }>;
    walk: number[];
    /** Metres one full walk cycle covers: two steps. */
    walkStride: number;
  }>;
}

interface PropLod {
  vertices: number;
  triangles: number;
  pos: number;
  nor: number;
  grey: number;
  part: number;
  index: number;
}

interface PropIndex {
  props: Record<string, { size: [number, number, number]; lods: Record<string, PropLod> }>;
}

export interface Assets {
  avatars: ReadonlyArray<{ name: string; female: boolean; walkStride: number }>;
  person(avatar: number, pose: PersonPose, lod: "hi" | "lo" | "far"): Stampable;
  walkFrame(avatar: number, frame: number): Stampable;
  readonly walkFrames: number;
  /** Height of the top of the head in this pose, in metres. */
  top(avatar: number, pose: PersonPose): number;
  prop(key: string, lod: string): Stampable;
  propSize(key: string): readonly [number, number, number];
  hasProp(key: string): boolean;
}

const fetchAll = async (url: string): Promise<ArrayBuffer> => (await fetch(url)).arrayBuffer();
const fetchJson = async <T>(url: string): Promise<T> => (await (await fetch(url)).json()) as T;

let shared: Promise<Assets> | null = null;

/** Loads the baked people and props once, in whichever thread asks. */
export function loadAssets(base: string = import.meta.env.BASE_URL): Promise<Assets> {
  shared ??= load(base);
  return shared;
}

async function load(base: string): Promise<Assets> {
  const [peopleIndex, peopleBytes, propIndex, propBytes] = await Promise.all([
    fetchJson<PeopleIndex>(`${base}people/people.json`),
    fetchAll(`${base}people/people.bin`),
    fetchJson<PropIndex>(`${base}props/props.json`),
    fetchAll(`${base}props/props.bin`),
  ]);

  const stride = peopleIndex.stride;
  const quantScale = 1 / peopleIndex.quant;
  const view = new DataView(peopleBytes);
  const cache = new Map<string, Stampable>();

  const decodePerson = (avatarIndex: number, lodName: "hi" | "lo" | "far", offset: number): Stampable => {
    const lod = peopleIndex.avatars[avatarIndex]!.lods[lodName];
    const count = lod.vertices;
    const pos = new Float32Array(count * 3);
    const nor = new Int8Array(count * 3);
    for (let i = 0; i < count; i++) {
      const o = offset + i * stride;
      pos[i * 3] = view.getInt16(o, true) * quantScale;
      pos[i * 3 + 1] = view.getInt16(o + 2, true) * quantScale;
      pos[i * 3 + 2] = view.getInt16(o + 4, true) * quantScale;
      nor[i * 3] = view.getInt8(o + 6);
      nor[i * 3 + 1] = view.getInt8(o + 7);
      nor[i * 3 + 2] = view.getInt8(o + 8);
    }
    return {
      count,
      pos,
      nor,
      grey: new Uint8Array(peopleBytes, lod.grey, count),
      part: new Uint8Array(peopleBytes, lod.part, count),
      index: new Uint16Array(peopleBytes.slice(lod.indices, lod.indices + lod.triangles * 6)),
    };
  };

  return {
    avatars: peopleIndex.avatars,
    person(avatar, pose, lod) {
      const key = `p${avatar}:${pose}:${lod}`;
      let stamp = cache.get(key);
      if (!stamp) {
        stamp = decodePerson(avatar, lod, peopleIndex.avatars[avatar]!.poses[pose][lod]);
        cache.set(key, stamp);
      }
      return stamp;
    },
    walkFrame(avatar, frame) {
      const key = `w${avatar}:${frame}`;
      let stamp = cache.get(key);
      if (!stamp) {
        stamp = decodePerson(avatar, "lo", peopleIndex.avatars[avatar]!.walk[frame]!);
        cache.set(key, stamp);
      }
      return stamp;
    },
    walkFrames: peopleIndex.avatars[0]!.walk.length,
    top(avatar, pose) {
      return peopleIndex.avatars[avatar]!.poses[pose].top;
    },
    prop(key, lodName) {
      const cacheKey = `o${key}:${lodName}`;
      let stamp = cache.get(cacheKey);
      if (!stamp) {
        const lod = propIndex.props[key]!.lods[lodName]!;
        stamp = {
          count: lod.vertices,
          pos: new Float32Array(propBytes, lod.pos, lod.vertices * 3),
          nor: new Int8Array(propBytes, lod.nor, lod.vertices * 3),
          grey: new Uint8Array(propBytes, lod.grey, lod.vertices),
          part: new Uint8Array(propBytes, lod.part, lod.vertices),
          index: new Uint32Array(propBytes, lod.index, lod.triangles * 3),
        };
        cache.set(cacheKey, stamp);
      }
      return stamp;
    },
    propSize(key) {
      return propIndex.props[key]!.size;
    },
    hasProp(key) {
      return key in propIndex.props;
    },
  };
}
