/** Fixed measurements of the cross-section. Track runs along X; +Z is towards the viewer. */
export const CHUNK_LENGTH = 60;
export const SPAN = 30;
export const RAIL_Y = 15;
export const DECK_Y = 14.55;
export const DECK_HALF = 4.7;
export const TRACK_Z = 1.95;
export const MEDIAN_HALF = 1.6;
export const ROAD_HALF = 13.5;
export const SIDEWALK_HALF = 18;
/** The first row of blocks stands back on the near side, so the street under the line stays open. */
export const FRONT_ROW = 25;
export const FAR_BACK = -175;
export const FAR_FRONT = 130;
export const WORLD_TOP = 130;

export interface Context {
  seed: number;
  chunk: number;
  /** Distance along the endless line at this chunk's local x = 0. Local x runs negative ahead. */
  start: number;
}

/** Local x of a point at `distance` along the line. */
export const localX = (context: Context, distance: number): number => -(distance - context.start);

/** Every multiple of `step` along the line that falls in this chunk. */
export function latticeIn(context: Context, step: number, offset = 0): number[] {
  const out: number[] = [];
  const first = Math.ceil((context.start - offset) / step);
  for (let k = first; ; k++) {
    const distance = k * step + offset;
    if (distance >= context.start + CHUNK_LENGTH) break;
    out.push(distance);
  }
  return out;
}
