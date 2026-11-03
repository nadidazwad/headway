import { THEME_TITLES, type Passenger, type Theme } from "../thoughts";
import { faceSvg } from "./faces";

export interface CalloutLabel {
  /** 0 is the operator's cabin; 1 to 6 are the coaches. */
  index: number;
  theme: Theme | "cab";
}

export interface Overlay {
  /** Shows the callout over a coach, or hides it with null. */
  setCallout(label: CalloutLabel | null, x: number, y: number): void;
  /** Draws the thin box round the hovered coach from its projected edges, or hides it. */
  setWire(edges: Array<[number, number, number, number]> | null): void;
  /** Replaces the thought bubbles. */
  setBubbles(passengers: Passenger[]): void;
  /** Rewrites one bubble's words, for when a passenger's thought moves on. */
  updateBubble(passenger: Passenger): void;
  placeBubble(id: string, x: number, y: number): void;
  /** Writes this frame's bubble positions, lifting any that would overlap another. */
  flushBubbles(): void;
  /** Expands one bubble's words and collapses the others. */
  openBubble(id: string | null): void;
}

const toBangla = (value: string): string => value.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]!);

const bubbleBody = (passenger: Passenger): string => `
  <div class="bubble-face">${faceSvg(passenger.thought!.mood)}</div>
  <div class="bubble-body"><div>
    <span class="bubble-name"><span lang="bn">${passenger.name.bn}</span> <span class="bubble-latin">${passenger.name.en}</span></span>
    <span class="bubble-line" lang="bn">${passenger.thought!.bn}</span>
    <span class="bubble-translation">${passenger.thought!.en}</span>
  </div></div>`;

/** Words floating over the world. There is nothing here to press: only labels that follow the scene. */
export function createOverlay(root: HTMLElement, onBubbleHover: (id: string) => void): Overlay {
  root.innerHTML = `<svg class="wire" data-wire aria-hidden="true"></svg><div data-tags></div><a class="credits" href="${import.meta.env.BASE_URL}credits.txt" target="_blank" rel="noopener">credits</a>`;
  const wire = root.querySelector<SVGSVGElement>("[data-wire]")!;
  const tags = root.querySelector<HTMLElement>("[data-tags]")!;

  const callout = document.createElement("div");
  callout.className = "tag callout";
  callout.hidden = true;
  tags.append(callout);

  const bubbles = new Map<string, HTMLElement>();
  const anchors = new Map<string, { x: number; y: number }>();
  let openId: string | null = null;
  let currentCallout = "";

  return {
    setCallout(label, x, y) {
      if (!label) {
        callout.hidden = true;
        currentCallout = "";
        return;
      }
      const key = `${label.index}-${label.theme}`;
      if (key !== currentCallout) {
        currentCallout = key;
        const title = THEME_TITLES[label.theme];
        const number = String(label.index).padStart(2, "0");
        callout.hidden = false;
        callout.innerHTML = `
          <div class="callout-kicker"><span>${label.index === 0 ? "CAB" : number}</span><span>/</span><span>EXPLORE</span></div>
          <div class="callout-title"><span>${title.en}</span><span aria-hidden="true">↗</span></div>
          <div class="callout-bangla" lang="bn">${title.bn}${label.index === 0 ? "" : ` · কোচ ${toBangla(number)}`}</div>`;
      }
      const width = callout.offsetWidth;
      const height = callout.offsetHeight;
      const left = Math.min(innerWidth - width - 8, Math.max(8, x - width / 2));
      const top = Math.max(8, y - height - 12);
      callout.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      callout.style.setProperty("--tail", `${Math.min(width - 14, Math.max(14, x - left))}px`);
    },
    setWire(edges) {
      wire.style.display = edges ? "block" : "none";
      if (!edges) return;
      wire.innerHTML = edges.map(([a, b, c, d]) => `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"/>`).join("");
    },
    setBubbles(passengers) {
      for (const element of bubbles.values()) element.remove();
      bubbles.clear();
      anchors.clear();
      for (const passenger of passengers) {
        if (!passenger.thought) continue;
        const element = document.createElement("div");
        element.className = "tag bubble";
        element.innerHTML = bubbleBody(passenger);
        element.addEventListener("pointerenter", () => onBubbleHover(passenger.id));
        tags.append(element);
        bubbles.set(passenger.id, element);
      }
    },
    updateBubble(passenger) {
      const element = bubbles.get(passenger.id);
      if (element && passenger.thought) element.innerHTML = bubbleBody(passenger);
    },
    placeBubble(id, x, y) {
      anchors.set(id, { x, y });
    },
    flushBubbles() {
      const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      const order = [...bubbles.keys()].sort((a, b) => (a === openId ? -1 : b === openId ? 1 : 0));
      for (const id of order) {
        const anchor = anchors.get(id);
        const element = bubbles.get(id);
        if (!anchor || !element) continue;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const left = Math.min(innerWidth - width - 8, Math.max(8, anchor.x - width / 2));
        let top = Math.max(8, anchor.y - height - 12);
        for (let guard = 0; guard < 6; guard++) {
          const clash = placed.find((box) => left < box.right + 4 && left + width > box.left - 4 && top < box.bottom + 4 && top + height > box.top - 4);
          if (!clash) break;
          top = clash.top - height - 6;
        }
        placed.push({ left, right: left + width, top, bottom: top + height });
        element.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        element.style.setProperty("--tail", `${Math.min(width - 14, Math.max(14, anchor.x - left))}px`);
      }
    },
    openBubble(id) {
      openId = id;
      for (const [key, element] of bubbles) element.classList.toggle("open", key === id);
    },
  };
}
