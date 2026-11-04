import { CAR_PITCH, TRAIN_LENGTH } from "../train/layout";

/** Length of one rail. The joints set the rhythm: at the train's pace, about one every 1.7 seconds. */
export const RAIL_LENGTH = 18;
const BOGIE_FROM_CENTRE = 5.5;
const AXLE_FROM_BOGIE = 1.1;

/** Where every axle rides, measured along the train from its nose. */
export const AXLES: readonly number[] = Array.from({ length: TRAIN_LENGTH / CAR_PITCH }, (_, car) => (car + 0.5) * CAR_PITCH).flatMap((centre) =>
  [-BOGIE_FROM_CENTRE, BOGIE_FROM_CENTRE].flatMap((bogie) => [centre + bogie - AXLE_FROM_BOGIE, centre + bogie + AXLE_FROM_BOGIE]),
);

export interface RailHit {
  /** How far along the line the train will have come when this axle meets its joint. */
  at: number;
  /** Which axle, as a position along the train. */
  axle: number;
}

/**
 * Every axle meeting a rail joint while the train covers the distance after `from`, up to and
 * including `to`. Only distance comes into it, never time: a train that stops goes quiet, and any
 * way of slicing the journey gives each hit exactly once.
 */
export function railHits(from: number, to: number): RailHit[] {
  const hits: RailHit[] = [];
  for (const axle of AXLES) {
    // An axle `axle` metres back from the nose is that much behind the train's own distance.
    let joint = Math.floor((from - axle) / RAIL_LENGTH) + 1;
    for (; joint * RAIL_LENGTH + axle <= to; joint++) hits.push({ at: joint * RAIL_LENGTH + axle, axle });
  }
  return hits.sort((a, b) => a.at - b.at);
}
