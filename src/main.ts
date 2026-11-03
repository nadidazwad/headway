import "./ui/fonts";
import { Mesh, Scene, Vector3 } from "three";
import { createCameraRig } from "./camera";
import { Batch } from "./geometry";
import { TRAIN_LENGTH, createJourney } from "./line6";
import { drawPerson } from "./people";
import { createPipeline, toBufferGeometry } from "./render";
import { createAtlas } from "./signs/atlas";
import { operatorFor, rosterFor, type Passenger, type Theme } from "./thoughts";
import { createTrain, type TrainCar } from "./train";
import { createOverlay, type Language } from "./ui";
import { RAIL_Y, TRACK_Z, createWorld } from "./world";

const params = new URLSearchParams(location.search);
const seed = params.has("seed") ? Number(params.get("seed")) : Math.floor(Math.random() * 1e9);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const pipeline = createPipeline(canvas);
const scene = new Scene();
const world = createWorld(pipeline.solid, seed);
scene.add(world.group);
const train = createTrain(pipeline);
scene.add(train.group);

const wideFocus = (): Vector3 => new Vector3(TRAIN_LENGTH * 0.31, RAIL_Y - 2.5, 0);
const rig = createCameraRig({
  azimuth: Number(params.get("az") ?? 24),
  elevation: Number(params.get("el") ?? 33),
  width: Number(params.get("w") ?? 112),
  focus: params.has("fx") ? new Vector3(Number(params.get("fx")), RAIL_Y - 2.5, 0) : wideFocus(),
});
rig.snap();

function resize(): void {
  pipeline.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  pipeline.resize(innerWidth, innerHeight);
}
window.addEventListener("resize", resize);
resize();

void createAtlas(pipeline.renderer.capabilities.getMaxAnisotropy()).then((atlas) => pipeline.setAtlas(atlas));

const journey = createJourney();
if (params.has("travel")) journey.advance(Number(params.get("travel")));
const frozen = params.has("freeze");
const fixedDistance = params.has("at") ? Number(params.get("at")) : null;

// Passengers ------------------------------------------------------------------------------------

interface CarCrew {
  passengers: Passenger[];
  mesh: Mesh | null;
  stop: number;
}
const crews: CarCrew[] = train.cars.map(() => ({ passengers: [], mesh: null, stop: -1 }));

const riderBounds = (car: TrainCar): number => (car.index === 0 ? -9.9 + 3.1 : -9.9);

function seatPassengers(car: TrainCar, stopIndex: number): void {
  const crew = crews[car.index]!;
  if (crew.stop === stopIndex) return;
  crew.stop = stopIndex;
  const roster = rosterFor(seed, car.index, car.theme as Theme, stopIndex, riderBounds(car));
  const everyone = car.index === 0 ? [...roster, operatorFor(stopIndex)] : roster;
  crew.passengers = everyone;
  if (crew.mesh) {
    car.riders.remove(crew.mesh);
    crew.mesh.geometry.dispose();
  }
  const batch = new Batch(1 << 13);
  for (const person of everyone) {
    batch.at(person.x, person.pose === "seated" ? 0.0 : 0, person.z, () => drawPerson(batch, person), person.facing);
  }
  const mesh = new Mesh(toBufferGeometry(batch.finish()), pipeline.solid);
  mesh.frustumCulled = false;
  car.riders.add(mesh);
  crew.mesh = mesh;
}

// Interaction -----------------------------------------------------------------------------------

let hovered: number | null = null;
let open: number | null = null;
let lastInput = performance.now();
let openBubbleId: string | null = null;
let bubbleTimer = 0;

const carThemeOf = (carIndex: number): Theme | "cab" => (carIndex === 0 ? "cab" : (train.cars[carIndex - 1]!.theme as Theme));
/** Button 0 is the operator's cab in the first car; buttons 1 to 6 are the six coaches. */
const carForChoice = (choice: number): TrainCar => train.cars[Math.max(0, choice - 1)]!;

const overlay = createOverlay(
  document.querySelector<HTMLElement>("#overlay")!,
  {
    onSelectCar(index) {
      lastInput = performance.now();
      select(index);
    },
    onBubbleHover(id) {
      lastInput = performance.now();
      openBubbleId = id;
      bubbleTimer = 0;
      overlay.openBubble(id);
    },
    onLanguage(language: Language) {
      localStorage.setItem("metro-language", language);
    },
  },
  (params.get("lang") as Language | null) ?? (localStorage.getItem("metro-language") as Language | null) ?? "bn",
);

const speakers = (choice: number): Passenger[] => {
  const crew = crews[carForChoice(choice).index]!;
  const list = crew.passengers.filter((p) => p.thought);
  if (choice === 0) return list.filter((p) => p.id.startsWith("operator"));
  if (carForChoice(choice).index === 0) return list.filter((p) => !p.id.startsWith("operator"));
  return list;
};

function select(choice: number | null): void {
  open = choice;
  overlay.setActiveCar(choice);
  if (choice === null) {
    overlay.setBubbles([]);
    openBubbleId = null;
    return;
  }
  overlay.setCallout(null);
  hovered = null;
  const car = carForChoice(choice);
  seatPassengers(car, journey.state.stopIndex);
  const list = speakers(choice);
  overlay.setBubbles(list);
  openBubbleId = list[0]?.id ?? null;
  bubbleTimer = 0;
  overlay.openBubble(openBubbleId);
}

function carAtPointer(px: number, py: number): number | null {
  const { origin, direction } = rig.ray(px, py, innerWidth, innerHeight);
  let best: number | null = null;
  let bestT = Infinity;
  for (const car of train.cars) {
    const box = car.bounds;
    let t0 = 0;
    let t1 = Infinity;
    let hit = true;
    for (const axis of ["x", "y", "z"] as const) {
      const d = direction[axis];
      const o = origin[axis];
      if (Math.abs(d) < 1e-6) {
        if (o < box.min[axis] || o > box.max[axis]) hit = false;
        continue;
      }
      const a = (box.min[axis] - o) / d;
      const b = (box.max[axis] - o) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (hit && t1 >= t0 && t0 < bestT) {
      bestT = t0;
      best = car.index;
    }
  }
  return best;
}

canvas.addEventListener("pointermove", (event) => {
  lastInput = performance.now();
  if (open !== null) return;
  const car = carAtPointer(event.clientX, event.clientY);
  hovered = car === null ? null : car + 1;
  canvas.style.cursor = car === null ? "default" : "pointer";
});
canvas.addEventListener("pointerleave", () => {
  hovered = null;
});
canvas.addEventListener("click", (event) => {
  lastInput = performance.now();
  const car = carAtPointer(event.clientX, event.clientY);
  if (open !== null) {
    if (car === null || car + 1 === open) {
      if (car === null) select(null);
    } else select(car + 1);
    return;
  }
  if (car !== null) select(car + 1);
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  lastInput = performance.now();
  zoomFactor = Math.min(1.7, Math.max(0.55, zoomFactor * Math.exp(event.deltaY * 0.0012)));
}, { passive: false });
window.addEventListener("keydown", (event) => {
  lastInput = performance.now();
  if (event.key === "Escape") select(null);
  else if (/^[0-6]$/.test(event.key)) select(Number(event.key));
  else if (event.key === "ArrowRight") select(open === null ? 1 : Math.min(6, open + 1));
  else if (event.key === "ArrowLeft") select(open === null ? 0 : Math.max(0, open - 1));
});

let zoomFactor = 1;

// Frame -----------------------------------------------------------------------------------------

let last = performance.now();
const IDLE_BEFORE_TOUR = 9000;
const tour = { next: 0, labels: 0, inCar: false, choice: 1 };

/** With nobody at the controls, the camera does what the original long take does. */
function runTour(now: number): void {
  if (reducedMotion || params.has("notour") || now - lastInput < IDLE_BEFORE_TOUR || now < tour.next) return;
  if (tour.inCar) {
    select(null);
    tour.inCar = false;
    tour.labels = 0;
    tour.next = now + 7000;
    return;
  }
  if (tour.labels < 2) {
    hovered = 1 + Math.floor(Math.random() * 6);
    tour.choice = hovered;
    tour.labels += 1;
    tour.next = now + 3200;
    return;
  }
  const choice = Math.random() < 0.18 ? 0 : tour.choice;
  select(choice);
  tour.inCar = true;
  tour.next = now + 19000;
}

const point = new Vector3();
const screen = { x: 0, y: 0 };

function updateCamera(time: number, dt: number): void {
  const target = rig.target;
  if (open === null) {
    // The idle camera drifts slowly round the train, like the long take it is modelled on.
    const drift = reducedMotion ? 0 : Math.sin(time * 0.05);
    if (!params.has("az")) target.azimuth = 24 + drift * 13;
    target.elevation = params.has("el") ? Number(params.get("el")) : 33;
    const base = params.has("w") ? Number(params.get("w")) : innerWidth / innerHeight > 1.2 ? 112 : 70;
    target.width = base * zoomFactor;
    if (!params.has("fx")) target.focus.copy(wideFocus());
  } else {
    const car = carForChoice(open);
    const cab = open === 0;
    const portrait = innerWidth / innerHeight < 1;
    target.azimuth = 22;
    target.elevation = 34;
    target.width = (cab ? 12 : 24) * (portrait ? 0.9 : 1) * zoomFactor;
    const x = cab ? 2.6 : car.group.position.x;
    target.focus.set(x, RAIL_Y + 2.3, TRACK_Z - 0.3);
  }
  rig.update(reducedMotion ? 1 : dt, innerWidth / innerHeight);
}

function updateOpenness(dt: number): void {
  const openCar = open === null ? -1 : carForChoice(open).index;
  for (const car of train.cars) {
    const goal = car.index === openCar ? 1 : 0;
    const rate = reducedMotion ? 100 : 2.6;
    car.openness += (goal - car.openness) * (1 - Math.exp(-rate * dt));
    if (Math.abs(goal - car.openness) < 0.001) car.openness = goal;
  }
}

function updateTags(dt: number): void {
  if (hovered !== null) {
    overlay.setCallout({ index: hovered, theme: carThemeOf(hovered) });
    const car = carForChoice(hovered);
    point.set(car.group.position.x, RAIL_Y + 5.1, TRACK_Z);
    rig.screenPosition(point, screen, innerWidth, innerHeight);
    overlay.placeCallout(screen.x, screen.y);
  } else if (open === null) {
    overlay.setCallout(null);
  }
  if (open !== null) {
    const car = carForChoice(open);
    const crew = crews[car.index]!;
    const list = speakers(open);
    for (const person of list) {
      point.set(car.group.position.x + person.x, RAIL_Y + car.floorY + person.headTop + 0.16, TRACK_Z + person.z);
      rig.screenPosition(point, screen, innerWidth, innerHeight);
      overlay.placeBubble(person.id, screen.x, screen.y);
    }
    bubbleTimer += dt;
    if (bubbleTimer > 5.2 && list.length > 1) {
      bubbleTimer = 0;
      const index = list.findIndex((p) => p.id === openBubbleId);
      openBubbleId = list[(index + 1) % list.length]!.id;
      overlay.openBubble(openBubbleId);
    }
    void crew;
  }
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  const state = frozen ? journey.state : journey.advance(reducedMotion ? 0 : dt);
  const distance = fixedDistance ?? state.distance;

  const stop = state.stopIndex;
  const needsReseat = crews.some((crew) => crew.stop !== stop);
  if (needsReseat) {
    const car = train.cars.find((c) => crews[c.index]!.stop !== stop);
    if (car) {
      seatPassengers(car, stop);
      if (open !== null && carForChoice(open).index === car.index) select(open);
    }
  }

  world.update(distance, 340, 300);
  train.update(state.doors, time, state.speedKmh);
  runTour(now);
  updateOpenness(dt);
  updateCamera(time, dt);
  updateTags(dt);
  overlay.setReadout(state);
  pipeline.render(scene, rig.camera, rig.focusDepth);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  __metro: { world, journey, rig, pipeline, train, seed, select, overlay, ready: () => world.whenReady() },
});
