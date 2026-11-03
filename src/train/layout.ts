/**
 * Measurements of one coach, in metres. Width and height are the real Line 6 figures. Length is
 * drawn at 16 m rather than 19.8 m, with three doors a side rather than four, so that a coach and
 * its passengers read at the scale the reference film gives them. Change it here and it all follows.
 */
export const CAR_PITCH = 16;
export const CAR_LENGTH = 15.8;
export const TRAIN_LENGTH = 6 * CAR_PITCH;
export const HALF_WIDTH = 2.95 / 2;
export const FLOOR_Y = 1.15;
export const ROOF_Y = 4.05;
export const SHOULDER_Y = 3.5;
export const CAB_DEPTH = 1.95;
export const DOOR_CENTERS = [-5.2, 0, 5.2] as const;
export const DOOR_HALF = 0.65;
export const DOOR_HEIGHT = 1.86;
export const BELT_Y = FLOOR_Y + 0.8;
export const HEAD_Y = FLOOR_Y + 1.98;
export const WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [-3.95, -1.25],
  [1.25, 3.95],
  [-7.75, -6.5],
  [6.5, 7.75],
];
export const BENCHES: ReadonlyArray<readonly [number, number]> = [
  [-4.2, -1.0],
  [1.0, 4.2],
  [-7.7, -6.2],
  [6.2, 7.7],
];
/** The far side's last bench gives way to the space every coach keeps for a wheelchair. */
export const WHEELCHAIR_BAY: readonly [number, number] = [6.2, 7.7];
export const INSIDE_HALF = HALF_WIDTH - 0.08;
export const SEAT_PITCH = 0.457;
export const SEAT_HEIGHT = 0.44;
export const STRAP_RAIL_Z = 0.78;
export const STRAP_STEP = 0.48;
/** Rail above the floor: the rings hang at a reach a short passenger can still make. */
export const STRAP_RAIL_HEIGHT = 2.0;
export const RING_DROP = 0.27;

/** The middle of each moulded seat along a bench, in the coach's own x. */
export function seatCentres(from: number, to: number): number[] {
  const count = Math.max(1, Math.round((to - from) / SEAT_PITCH));
  return Array.from({ length: count }, (_, i) => from + ((i + 0.5) * (to - from)) / count);
}
