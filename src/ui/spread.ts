export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const CLEAR = 4;
const STEP = 6;

const clashes = (a: Box, b: Box): boolean => a.left < b.right + CLEAR && a.right > b.left - CLEAR && a.top < b.bottom + CLEAR && a.bottom > b.top - CLEAR;

/**
 * Where each thought's face goes, lifted clear of the faces before it. This takes where people's
 * heads are and nothing else. In particular it must never learn which bubble is open: when opening
 * one moved the others, whichever then slid under a resting mouse opened in turn, and moved them back.
 * `boxAt` gives a closed face's screen box with its tail's tip at a point. Returns each face's y.
 */
export function spreadFaces(anchors: ReadonlyArray<{ x: number; y: number }>, boxAt: (x: number, y: number) => Box): number[] {
  const placed: Box[] = [];
  return anchors.map(({ x, y: start }) => {
    let y = start;
    let box = boxAt(x, y);
    for (let guard = 0; guard < 12; guard++) {
      const clash = placed.find((other) => clashes(box, other));
      if (!clash) break;
      y -= box.bottom - clash.top + STEP;
      box = boxAt(x, y);
    }
    placed.push(box);
    return y;
  });
}
