import { THEME_TITLES, type Passenger, type Theme } from "../thoughts";
import { faceSvg } from "./faces";
import { spreadFaces, type Box } from "./spread";

export interface Point {
  x: number;
  y: number;
}

export interface CalloutLabel {
  /** 0 is the operator's cabin; 1 to 6 are the coaches. */
  index: number;
  theme: Theme | "cab";
}

export interface Overlay {
  /**
   * The plane every card lies in: the screen direction of the track (a unit vector), and how
   * far a card's back shows behind it, in pixels. Cards run along the coach's side, upright.
   */
  setPlane(alongX: number, alongY: number, backX: number, backY: number): void;
  /**
   * Shows the coach's name over it, or hides it with null. `roof` and `floor` are the screen ends
   * of the coach's top and bottom edges: the card points at the roof where there is room above,
   * and hangs under the floor, pointing up, where there is not.
   */
  setCallout(label: CalloutLabel | null, roof?: readonly [Point, Point], floor?: readonly [Point, Point]): void;
  /** Draws the thin box round the hovered coach from its projected edges, or hides it. */
  setWire(edges: Array<[number, number, number, number]> | null): void;
  /** Replaces the thought bubbles. */
  setBubbles(passengers: Passenger[]): void;
  /** Rewrites one bubble's words, for when a passenger's thought moves on. */
  updateBubble(passenger: Passenger): void;
  placeBubble(id: string, x: number, y: number): void;
  /** Writes this frame's bubble positions, lifting any whose face would overlap another's. */
  flushBubbles(): void;
  /** Expands one bubble's words and collapses the others. */
  openBubble(id: string | null): void;
  /** Whether the mouse is resting on a bubble, so what it is reading should not be taken away. */
  readonly holding: boolean;
}

const bubbleBody = (passenger: Passenger): string => `
  <div class="bubble-face">${faceSvg(passenger.thought!.mood)}</div>
  <div class="bubble-body"><div>
    <span class="bubble-name"><span lang="bn">${passenger.name.bn}</span> <span class="bubble-latin">${passenger.name.en}</span></span>
    <span class="bubble-line" lang="bn">${passenger.thought!.bn}</span>
    <span class="bubble-translation">${passenger.thought!.en}</span>
  </div></div>`;

/** The gap from the tail's tip up to the card's bottom edge. */
const TAIL = 9;
const MARGIN = 8;

interface Card {
  root: HTMLElement;
  card: HTMLElement;
}

function makeCard(className: string): Card {
  const root = document.createElement("div");
  root.className = `tag ${className}`;
  const slab = document.createElement("div");
  slab.className = "slab";
  const card = document.createElement("div");
  card.className = "card";
  root.append(slab, card);
  return { root, card };
}

/** Words over the world, on cards laid in the coach's plane. Only the bubbles take the pointer. */
export function createOverlay(root: HTMLElement, onBubbleHover: (id: string) => void, onBubbleLeave: () => void): Overlay {
  root.innerHTML = `<svg class="wire" data-wire aria-hidden="true"></svg><div data-tags></div><a class="credits" href="${import.meta.env.BASE_URL}credits.txt" target="_blank" rel="noopener">credits</a>`;
  const wire = root.querySelector<SVGSVGElement>("[data-wire]")!;
  const tags = root.querySelector<HTMLElement>("[data-tags]")!;
  /** The track's slope on screen: a card is sheared by it, so its width stays as laid out. */
  const plane = { slope: 0 };

  const callout = makeCard("callout");
  callout.root.hidden = true;
  tags.append(callout.root);

  const bubbles = new Map<string, Card>();
  const anchors = new Map<string, { x: number; y: number }>();
  let openId: string | null = null;
  let currentCallout = "";
  /** A bubble's size with its words folded away. */
  const face = { width: 0, height: 0 };
  let heldBy: string | null = null;
  /** Where the mouse last truly was. A bubble can slide under a still mouse and fire an enter: that is not the hand reaching for it. */
  const hand = { x: -1, y: -1 };
  window.addEventListener("pointermove", (event) => {
    hand.x = event.clientX;
    hand.y = event.clientY;
  });

  /** Where the tail sits along a card's bottom edge so the card stays on screen, and the card's box. */
  const fitSize = (width: number, height: number, x: number, y: number, below: boolean): { tail: number; box: Box } => {
    const k = plane.slope;
    let tail = width / 2;
    tail = Math.min(tail, x - MARGIN);
    tail = Math.max(tail, width - (innerWidth - MARGIN - x));
    tail = Math.min(width - 16, Math.max(16, tail));
    const low = Math.min(k * -tail, k * (width - tail));
    const high = Math.max(k * -tail, k * (width - tail));
    const top = below ? y + TAIL + low : y - height - TAIL + low;
    const bottom = below ? y + TAIL + height + high : y - TAIL + high;
    return { tail, box: { left: x - tail, right: x + width - tail, top, bottom } };
  };
  const fit = (card: HTMLElement, x: number, y: number, below: boolean): { tail: number; box: Box } => fitSize(card.offsetWidth, card.offsetHeight, x, y, below);

  /**
   * Places a card with its tail's tip at (x, y): above the point, or under it pointing up.
   */
  const place = ({ root: element, card }: Card, x: number, y: number, below = false): void => {
    const { tail } = fit(card, x, y, below);
    const k = plane.slope;
    const shift = below ? TAIL : -(card.offsetHeight + TAIL);
    element.classList.toggle("below", below);
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) matrix(1, ${k.toFixed(4)}, 0, 1, 0, 0) translate(${(-tail).toFixed(1)}px, ${shift}px)`;
    card.style.setProperty("--tail", `${tail.toFixed(1)}px`);
  };

  /** The first point along a segment, from its middle outwards, where a card fits on screen. */
  const roomOn = (card: HTMLElement, [a, b]: readonly [Point, Point], below: boolean): Point | null => {
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9, 0, 1]) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x < MARGIN || x > innerWidth - MARGIN) continue;
      const { box } = fit(card, x, y, below);
      if (box.top >= MARGIN && box.bottom <= innerHeight - MARGIN) return { x, y };
    }
    return null;
  };

  return {
    setPlane(alongX, alongY, backX, backY) {
      plane.slope = alongY / Math.max(0.3, alongX);
      // The card's own frame is sheared; express the back's screen offset in it.
      const localX = backX;
      const localY = backY - plane.slope * localX;
      root.style.setProperty("--back-x", `${localX.toFixed(2)}px`);
      root.style.setProperty("--back-y", `${localY.toFixed(2)}px`);
    },
    setCallout(label, roof, floor) {
      if (!label || !roof || !floor) {
        callout.root.hidden = true;
        currentCallout = "";
        return;
      }
      const key = `${label.index}-${label.theme}`;
      if (key !== currentCallout) {
        currentCallout = key;
        const title = THEME_TITLES[label.theme];
        callout.root.hidden = false;
        // Restart the entrance each time a new coach is named.
        callout.root.style.animation = "none";
        void callout.root.offsetWidth;
        callout.root.style.animation = "";
        callout.card.innerHTML = `
          <div class="callout-kicker">CLICK TO STEP IN</div>
          <div class="callout-title">${title.en}</div>
          <div class="callout-bangla" lang="bn">${title.bn}</div>`;
      }
      const above = roomOn(callout.card, roof, false);
      const under = above ? null : roomOn(callout.card, floor, true);
      const at = above ?? under ?? { x: (roof[0].x + roof[1].x) / 2, y: (roof[0].y + roof[1].y) / 2 };
      place(callout, at.x, at.y, !above && !!under);
    },
    setWire(edges) {
      wire.style.display = edges ? "block" : "none";
      if (!edges) return;
      wire.innerHTML = edges.map(([a, b, c, d]) => `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"/>`).join("");
    },
    setBubbles(passengers) {
      for (const { root: element } of bubbles.values()) element.remove();
      bubbles.clear();
      anchors.clear();
      heldBy = null;
      for (const passenger of passengers) {
        if (!passenger.thought) continue;
        const bubble = makeCard("bubble");
        bubble.card.innerHTML = bubbleBody(passenger);
        const { id } = passenger;
        // Opens to a hand that moved here. Checked on moving too, for a bubble that slid under the mouse before it stirred.
        const reach = (event: PointerEvent): void => {
          if (event.pointerType === "mouse") heldBy = id;
          if (event.clientX !== hand.x || event.clientY !== hand.y) {
            if (id !== openId) onBubbleHover(id);
          }
        };
        bubble.root.addEventListener("pointerenter", reach);
        bubble.root.addEventListener("pointermove", reach);
        bubble.root.addEventListener("pointerleave", (event) => {
          // A finger always leaves as soon as it lifts: on a phone the card stays for reading.
          if (event.pointerType !== "mouse") return;
          heldBy = null;
          onBubbleLeave();
        });
        tags.append(bubble.root);
        bubbles.set(id, bubble);
      }
      const first = bubbles.values().next().value;
      if (first) {
        face.width = first.card.offsetWidth;
        face.height = first.card.offsetHeight;
      }
    },
    updateBubble(passenger) {
      const bubble = bubbles.get(passenger.id);
      if (bubble && passenger.thought) bubble.card.innerHTML = bubbleBody(passenger);
    },
    placeBubble(id, x, y) {
      anchors.set(id, { x, y });
    },
    flushBubbles() {
      const present = [...bubbles.keys()].filter((id) => anchors.has(id));
      const spots = present.map((id) => anchors.get(id)!);
      const lifted = spreadFaces(spots, (x, y) => fitSize(face.width, face.height, x, y, false).box);
      present.forEach((id, i) => place(bubbles.get(id)!, spots[i]!.x, lifted[i]!));
    },
    openBubble(id) {
      openId = id;
      for (const [key, bubble] of bubbles) bubble.root.classList.toggle("open", key === id);
    },
    get holding() {
      return heldBy !== null;
    },
  };
}
