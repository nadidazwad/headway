/** What the camera is doing, as far as the ears are concerned. */
export interface Listening {
  /** Metres of world across the view. */
  viewWidth: number;
  /** How far a coach has opened: 0 outside, 1 sitting in it. */
  inside: number;
}

export interface Mix {
  city: number;
  train: number;
  interior: number;
  /** Where the coach's walls cut off what comes from outside, in hertz. */
  cutoff: number;
}

const WIDE = 62;
const CLOSE = 16;
const OPEN_AIR = 16000;
const THROUGH_WALLS = 620;

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Wide is mostly city with the train going by, close is more train, an opened coach is its own room. */
export function mixFor({ viewWidth, inside }: Listening): Mix {
  const close = smooth((WIDE - viewWidth) / (WIDE - CLOSE));
  const pulledBack = smooth((viewWidth - WIDE) / WIDE);
  const seated = smooth(inside);
  const outside = 1 - seated * 0.72;
  return {
    city: (0.86 - 0.5 * close) * outside,
    train: (0.3 + 0.5 * close - 0.14 * pulledBack) * (1 - seated * 0.68),
    interior: seated,
    // Falling evenly through the octaves, so the walls seem to close rather than a filter to sweep.
    cutoff: OPEN_AIR * Math.pow(THROUGH_WALLS / OPEN_AIR, seated),
  };
}
