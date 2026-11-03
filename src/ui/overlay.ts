import { STATIONS, type JourneyState } from "../line6";
import { THEME_TITLES, type Passenger, type Theme } from "../thoughts";
import { faceSvg } from "./faces";

export type Language = "bn" | "en";

export interface CarLabel {
  index: number;
  theme: Theme | "cab";
}

export interface Overlay {
  /** Shows the callout over a car, or hides it with null. */
  setCallout(label: CarLabel | null): void;
  placeCallout(x: number, y: number): void;
  /** Draws the thin box round the hovered coach from its projected edges, or hides it. */
  setWire(edges: Array<[number, number, number, number]> | null): void;
  /** Replaces the thought bubbles for the open car. */
  setBubbles(passengers: Passenger[]): void;
  placeBubble(id: string, x: number, y: number): void;
  /** Writes this frame's bubble positions, lifting any that would overlap another. */
  flushBubbles(): void;
  /** Expands one bubble's words and collapses the others. */
  openBubble(id: string | null): void;
  setReadout(state: JourneyState): void;
  setActiveCar(index: number | null): void;
  readonly language: Language;
}

interface Handlers {
  onSelectCar(index: number | null): void;
  onBubbleHover(id: string): void;
  onLanguage(language: Language): void;
}

const toBangla = (value: string): string => value.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]!);

const WORDS = {
  bn: {
    title: "ভাবনার ট্রেন",
    next: "পরবর্তী স্টেশন",
    at: "এখন স্টেশনে",
    towards: "গন্তব্য",
    explore: "দেখুন",
    hint: "কোচের ওপর মাউস রাখুন, ক্লিক করে ভেতরে দেখুন। Esc দিয়ে ফিরুন।",
    back: "পুরো শহর",
    cab: "চালক",
    kmh: "কিমি/ঘ",
    km: "কিমি",
  },
  en: {
    title: "Train of Thought",
    next: "NEXT STATION",
    at: "NOW AT",
    towards: "TOWARDS",
    explore: "EXPLORE",
    hint: "Hover a coach, click to look inside. Esc to come back out.",
    back: "City",
    cab: "Cab",
    kmh: "km/h",
    km: "km",
  },
} as const;

export function createOverlay(root: HTMLElement, handlers: Handlers, initial: Language): Overlay {
  let language: Language = initial;
  document.documentElement.lang = language;

  root.innerHTML = `
    <div class="chrome chrome-brand">
      <div class="brand-title" data-brand></div>
      <div class="brand-sub">DHAKA METRO · MRT LINE 6</div>
    </div>
    <div class="chrome chrome-controls" role="group" aria-label="Language">
      <button type="button" data-lang="bn" aria-pressed="false">বাং</button>
      <button type="button" data-lang="en" aria-pressed="false">EN</button>
    </div>
    <div class="chrome chrome-hint" data-hint></div>
    <div class="chrome chrome-cars" role="group" aria-label="Coaches" data-cars></div>
    <div class="chrome chrome-readout" role="status" aria-live="off">
      <div class="readout-row">
        <span class="readout-kicker" data-kicker></span>
        <span class="readout-speed" data-speed></span>
      </div>
      <div class="readout-row">
        <span class="readout-next" data-next></span>
        <span class="readout-kicker" data-towards></span>
      </div>
      <div class="line-strip" data-strip></div>
    </div>
    <svg class="wire" data-wire aria-hidden="true"></svg>
    <div data-tags></div>
  `;

  const $ = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const strip = $("[data-strip]");
  const lineKm = STATIONS[STATIONS.length - 1]!.km;
  strip.innerHTML =
    STATIONS.map((station) => `<i class="line-stop" style="left:${(station.km / lineKm) * 100}%"></i>`).join("") +
    `<i class="line-train" data-train></i>`;
  const trainDot = $("[data-train]");
  const tags = $("[data-tags]");
  const wire = root.querySelector<SVGSVGElement>("[data-wire]")!;

  const callout = document.createElement("div");
  callout.className = "tag callout";
  callout.hidden = true;
  tags.append(callout);

  const carButtons = $("[data-cars]");
  const bubbles = new Map<string, HTMLElement>();
  const anchors = new Map<string, { x: number; y: number }>();
  let currentPassengers: Passenger[] = [];
  let currentCallout: CarLabel | null = null;
  let activeCar: number | null = null;
  let lastReadout: JourneyState | null = null;
  let openId: string | null = null;

  const renderCars = (): void => {
    const words = WORDS[language];
    const numbers = [0, 1, 2, 3, 4, 5, 6];
    carButtons.innerHTML =
      `<button type="button" data-car="none" aria-pressed="${activeCar === null}">${words.back}</button>` +
      numbers
        .map((n) => {
          const text = n === 0 ? words.cab : language === "bn" ? toBangla(String(n)) : String(n);
          return `<button type="button" data-car="${n}" aria-pressed="${activeCar === n}">${text}</button>`;
        })
        .join("");
  };

  const renderCallout = (): void => {
    if (!currentCallout) {
      callout.hidden = true;
      return;
    }
    const words = WORDS[language];
    const title = THEME_TITLES[currentCallout.theme];
    const number = currentCallout.index === 0 ? words.cab.toUpperCase() : String(currentCallout.index).padStart(2, "0");
    callout.hidden = false;
    callout.innerHTML = `
      <div class="callout-kicker"><span>${language === "bn" ? toBangla(number) : number}</span><span>/</span><span>${words.explore}</span></div>
      <div class="callout-title"><span>${language === "bn" ? title.bn : title.en}</span><span aria-hidden="true">↗</span></div>
    `;
  };

  const renderBubbles = (): void => {
    for (const element of bubbles.values()) element.remove();
    bubbles.clear();
    for (const passenger of currentPassengers) {
      if (!passenger.thought) continue;
      const element = document.createElement("div");
      element.className = "tag bubble";
      if (passenger.id === openId) element.classList.add("open");
      const name = language === "bn" ? passenger.name.bn : passenger.name.en;
      const line = language === "bn" ? passenger.thought.bn : passenger.thought.en;
      element.innerHTML = `
        <div class="bubble-face">${faceSvg(passenger.thought.mood)}</div>
        <div class="bubble-body"><div>
          <span class="bubble-name">${name}</span>
          <span class="bubble-line">${line}</span>
        </div></div>
      `;
      element.addEventListener("pointerenter", () => handlers.onBubbleHover(passenger.id));
      element.addEventListener("click", () => handlers.onBubbleHover(passenger.id));
      tags.append(element);
      bubbles.set(passenger.id, element);
    }
  };

  const setLanguage = (next: Language): void => {
    language = next;
    document.documentElement.lang = next;
    const words = WORDS[language];
    $("[data-brand]").textContent = words.title;
    $("[data-hint]").textContent = words.hint;
    root.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    });
    renderCars();
    renderCallout();
    renderBubbles();
    if (lastReadout) overlay.setReadout(lastReadout);
    handlers.onLanguage(next);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang as Language));
  });
  carButtons.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-car]");
    if (!button) return;
    handlers.onSelectCar(button.dataset.car === "none" ? null : Number(button.dataset.car));
  });

  const place = (element: HTMLElement, x: number, y: number): void => {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const margin = 8;
    const left = Math.min(innerWidth - width - margin, Math.max(margin, x - width / 2));
    const top = Math.max(margin, y - height - 12);
    element.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    element.style.setProperty("--tail", `${Math.min(width - 14, Math.max(14, x - left))}px`);
  };

  const kicker = $("[data-kicker]");
  const next = $("[data-next]");
  const speed = $("[data-speed]");
  const towards = $("[data-towards]");

  const overlay: Overlay = {
    setCallout(label) {
      if (label?.index === currentCallout?.index && label?.theme === currentCallout?.theme) return;
      currentCallout = label;
      renderCallout();
    },
    placeCallout(x, y) {
      if (currentCallout) place(callout, x, y);
    },
    setWire(edges) {
      wire.style.display = edges ? "block" : "none";
      if (!edges) return;
      wire.innerHTML = edges.map(([a, b, c, d]) => `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"/>`).join("");
    },
    setBubbles(passengers) {
      currentPassengers = passengers;
      renderBubbles();
    },
    placeBubble(id, x, y) {
      anchors.set(id, { x, y });
    },
    flushBubbles() {
      const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      // The open bubble keeps its place; the rest make room for it, widest first.
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
    setReadout(state) {
      lastReadout = state;
      const words = WORDS[language];
      const stopped = state.phase === "dwell";
      const stationNow = stopped ? state.from : state.to;
      kicker.textContent = stopped ? words.at : words.next;
      next.textContent = language === "bn" ? stationNow.bn : stationNow.en;
      const speedValue = String(Math.round(state.speedKmh));
      speed.textContent = `${language === "bn" ? toBangla(speedValue) : speedValue} ${words.kmh}`;
      towards.textContent = `${words.towards} ${language === "bn" ? state.towards.bn : state.towards.en}`;
      trainDot.style.left = `${(state.km / lineKm) * 100}%`;
    },
    setActiveCar(index) {
      if (activeCar === index) return;
      activeCar = index;
      renderCars();
    },
    get language() {
      return language;
    },
  };

  setLanguage(initial);
  return overlay;
}
