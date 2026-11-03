import "./ui/fonts";
import { Mesh, Scene, Vector3 } from "three";
import { loadAssets } from "./assets";
import { createCameraRig } from "./camera";
import { Batch } from "./geometry";
import { createPipeline, toBufferGeometry } from "./render";
import { Rng, hashSeed } from "./shared/rng";
import { createAtlas } from "./signs/atlas";
import { nextThought, operatorFor, rosterFor, type Passenger } from "./thoughts";
import { createTraffic } from "./traffic";
import { CAB_DEPTH, TRAIN_LENGTH, createTrain, type TrainCar } from "./train";
import { createOverlay } from "./ui";
import { RAIL_Y, TRACK_Z, createWorld } from "./world";

const params = new URLSearchParams(location.search);
const debug = import.meta.env.DEV;
const debugNumber = (name: string): number | null => (debug && params.has(name) ? Number(params.get(name)) : null);
const seed = params.has("seed") ? Number(params.get("seed")) : Math.floor(Math.random() * 1e9);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const pipeline = createPipeline(canvas);
const scene = new Scene();
const world = createWorld(pipeline.solid, seed);
scene.add(world.group);
const train = createTrain(pipeline);
scene.add(train.group);
const assets = await loadAssets();
// A second set on the other track, heading the other way.
const opposing = createTrain(pipeline, -TRACK_Z);
scene.add(opposing.group);

/**
 * The pace the reference film's city slides past at: about half a span a second. Slower than the
 * line's real cruising speed, and close enough to the traffic's that a car below reads as driving.
 */
const CRUISE = 10.5;
const OPPOSING_SPEED = 10.5;
let distance = debugNumber("at") ?? 4000 + (seed % 5000);
const traffic = createTraffic(pipeline.solid, assets, seed, distance);
scene.add(traffic.group);
let opposingX = -700;

const WIDE_WIDTH = (): number => (innerWidth / innerHeight > 1.2 ? 62 : 46);
const wideFocus = new Vector3(TRAIN_LENGTH * 0.28, RAIL_Y - 5, 0);
/** Measured from the reference film by solving its two families of parallel lines. */
const FILM_AZIMUTH = 35;
const FILM_ELEVATION = 23.5;
/** How far a drag may take the camera. The geometry is built to be seen from inside this range. */
const AZIMUTH_LIMITS = [8, 62] as const;
const ELEVATION_LIMITS = [14, 46] as const;
const rig = createCameraRig({
  azimuth: debugNumber("az") ?? FILM_AZIMUTH,
  elevation: debugNumber("el") ?? FILM_ELEVATION,
  width: debugNumber("w") ?? WIDE_WIDTH(),
  focus: wideFocus.clone(),
});
rig.snap();

// Quality --------------------------------------------------------------------------------------

// Starts modest on integrated graphics and adapts to what the machine actually delivers.
const gl = pipeline.renderer.getContext();
const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
const gpuName = rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)) : "";
const integrated = /intel|mali|adreno|powervr|swiftshader|llvmpipe|apple gpu/i.test(gpuName);
const fixedRatio = debugNumber("pr");
const maxRatio = fixedRatio ?? Math.min(devicePixelRatio || 1, 2);
const quality = {
  ratio: integrated ? Math.min(maxRatio, 1) : maxRatio,
  samples: debugNumber("msaa") ?? (integrated ? 2 : 4),
  sum: 0,
  frames: 0,
  calm: 0,
};
pipeline.setSamples(quality.samples);
if (debugNumber("shadow") === 0) pipeline.setShadows(false);

function resize(): void {
  pipeline.setPixelRatio(quality.ratio);
  pipeline.resize(innerWidth, innerHeight);
}
window.addEventListener("resize", resize);
resize();

/** Trades sharpness for smoothness, then wins it back. Runs on measured frame times only. */
function adaptQuality(dt: number): void {
  if (fixedRatio !== null || document.hidden) return;
  quality.sum += dt;
  quality.frames += 1;
  if (quality.frames < 45) return;
  const average = quality.sum / quality.frames;
  quality.sum = 0;
  quality.frames = 0;
  if (average > 1 / 42) {
    quality.calm = 0;
    if (quality.ratio > 0.7) {
      quality.ratio = Math.max(0.7, quality.ratio - (average > 1 / 25 ? 0.2 : 0.1));
      resize();
    } else if (quality.samples > 0) {
      quality.samples = 0;
      pipeline.setSamples(0);
    } else if (pipeline.shadowsOn) {
      // The last thing to give up: the drawing still reads without its cast shadows.
      pipeline.setShadows(false);
    }
  } else if (average < 1 / 57) {
    quality.calm += 1;
    if (quality.calm >= 4 && quality.ratio < maxRatio) {
      quality.ratio = Math.min(maxRatio, quality.ratio + 0.1);
      quality.calm = 0;
      resize();
    }
  }
}

void createAtlas(pipeline.renderer.capabilities.getMaxAnisotropy()).then((atlas) => pipeline.setAtlas(atlas));

// Passengers ------------------------------------------------------------------------------------

const crews: Passenger[][] = train.cars.map((car) => {
  const roster = rosterFor(assets, seed, car.index, car.theme, car.index === 0 ? -7.9 + CAB_DEPTH + 0.2 : -7.9);
  return car.index === 0 ? [...roster, operatorFor(assets, seed)] : roster;
});

/** Every coach keeps a light crew for looking in through the windows, and a detailed one for looking at. */
const riderMeshes = train.cars.map((car) => {
  const build = (lod: "hi" | "lo"): Mesh => {
    const batch = new Batch(1 << 13);
    for (const person of crews[car.index]!) {
      batch.at(person.x, 0, person.z, () => batch.stamp(assets.person(person.avatar, person.pose, lod)), person.facing);
    }
    const mesh = new Mesh(toBufferGeometry(batch.finish()), pipeline.solid);
    mesh.frustumCulled = false;
    car.riders.add(mesh);
    return mesh;
  };
  const lo = build("lo");
  let hi: Mesh | null = null;
  return {
    show(detailed: boolean): void {
      if (detailed && !hi) hi = build("hi");
      lo.visible = !detailed;
      if (hi) hi.visible = detailed;
    },
  };
});

// A second set on the other track carries no one close enough to see, only its light crew.
opposing.cars.forEach((car, index) => {
  const batch = new Batch(1 << 13);
  for (const person of crews[(index + 3) % 6]!) {
    batch.at(person.x, 0, person.z, () => batch.stamp(assets.person(person.avatar, person.pose, "lo")), person.facing);
  }
  const mesh = new Mesh(toBufferGeometry(batch.finish()), pipeline.solid);
  mesh.frustumCulled = false;
  car.riders.add(mesh);
});

// What the mouse can reach ----------------------------------------------------------------------

/** Seven places to look: the operator's cabin at index 0, then the six coaches. */
interface Target {
  index: number;
  car: TrainCar;
  theme: "cab" | TrainCar["theme"];
  x0: number;
  x1: number;
  speakers: () => Passenger[];
}

const CAB_END = CAB_DEPTH;
const targets: Target[] = [
  {
    index: 0,
    car: train.cars[0]!,
    theme: "cab",
    x0: -0.2,
    x1: CAB_END,
    speakers: () => crews[0]!.filter((p) => p.id === "operator"),
  },
  ...train.cars.map((car) => ({
    index: car.index + 1,
    car,
    theme: car.theme,
    x0: car.index === 0 ? CAB_END : car.bounds.min.x,
    x1: car.bounds.max.x,
    speakers: () => crews[car.index]!.filter((p) => p.thought && p.id !== "operator"),
  })),
];

const thoughtRng = new Rng(hashSeed(seed, 501));
let hovered: Target | null = null;
let hoverTime = 0;
let focused: Target | null = null;
let shownBubbles: Target | null = null;
let openBubbleId: string | null = null;
let bubbleTimer = 0;
let lastInput = performance.now();

const overlay = createOverlay(document.querySelector<HTMLElement>("#overlay")!, (id) => {
  lastInput = performance.now();
  bubbleTimer = 0;
  openBubbleId = id;
  overlay.openBubble(id);
});

const targetAt = (px: number, py: number): Target | null => {
  const { origin, direction } = rig.ray(px, py, innerWidth, innerHeight);
  let best: Target | null = null;
  let bestT = Infinity;
  for (const target of targets) {
    const { min, max } = target.car.bounds;
    const a = (target.x0 - origin.x) / direction.x;
    const b = (target.x1 - origin.x) / direction.x;
    const c = (min.y - origin.y) / direction.y;
    const d = (max.y - origin.y) / direction.y;
    const e = (min.z - origin.z) / direction.z;
    const f = (max.z - origin.z) / direction.z;
    const t0 = Math.max(Math.min(a, b), Math.min(c, d), Math.min(e, f));
    const t1 = Math.min(Math.max(a, b), Math.max(c, d), Math.max(e, f));
    if (t1 >= t0 && t0 < bestT) {
      bestT = t0;
      best = target;
    }
  }
  return best;
};

const carFocus = (target: Target): Vector3 => new Vector3((target.x0 + target.x1) / 2, RAIL_Y + 2.45, TRACK_Z - 0.3);
const carWidth = (target: Target): number => (target.index === 0 ? 8.5 : 17) * (innerWidth / innerHeight < 1 ? 0.8 : 1);

/** The wheel's zoom and the click's glide both act on where the camera is heading. */
const aim = {
  width: rig.target.width,
  focus: wideFocus.clone(),
};

function focusOn(target: Target | null): void {
  focused = target;
  if (target) {
    aim.width = carWidth(target);
    aim.focus.copy(carFocus(target));
  } else {
    aim.width = WIDE_WIDTH();
    aim.focus.copy(wideFocus);
  }
}

const right = new Vector3();
const up = new Vector3();

function zoomAt(px: number, py: number, factor: number): void {
  const before = aim.width;
  const after = Math.min(130, Math.max(7.5, before * factor));
  if (after === before) return;
  // Keep what is under the mouse under the mouse, which is the only way to travel down the train.
  const aspect = innerWidth / innerHeight;
  const offsetX = (px / innerWidth - 0.5) * before;
  const offsetY = (0.5 - py / innerHeight) * (before / aspect);
  const change = 1 - after / before;
  right.setFromMatrixColumn(rig.camera.matrixWorld, 0);
  up.setFromMatrixColumn(rig.camera.matrixWorld, 1);
  aim.focus.addScaledVector(right, offsetX * change).addScaledVector(up, offsetY * change);
  aim.width = after;
  aim.focus.x = Math.min(TRAIN_LENGTH + 30, Math.max(-40, aim.focus.x));
  aim.focus.y = Math.min(RAIL_Y + 30, Math.max(-5, aim.focus.y));
  aim.focus.z = Math.min(35, Math.max(-35, aim.focus.z));
  if (after >= WIDE_WIDTH() * 0.98) focused = null;
}

const pointer = { x: -1, y: -1, inside: false };
/** A held left button turns the camera a little: enough to look around, never enough to get lost. */
const orbit = { azimuth: 0, elevation: 0, holding: false, moved: 0, lastX: 0, lastY: 0, wasDrag: false };
const DRAG_DEGREES_PER_PIXEL = 0.16;
const clamp = (value: number, [low, high]: readonly [number, number]): number => Math.min(high, Math.max(low, value));

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  orbit.holding = true;
  orbit.moved = 0;
  orbit.wasDrag = false;
  orbit.lastX = event.clientX;
  orbit.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
const stopDragging = (): void => {
  orbit.holding = false;
};
canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("pointermove", (event) => {
  lastInput = performance.now();
  tour.running = false;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.inside = true;
  if (!orbit.holding) return;
  const dx = event.clientX - orbit.lastX;
  const dy = event.clientY - orbit.lastY;
  orbit.lastX = event.clientX;
  orbit.lastY = event.clientY;
  orbit.moved += Math.abs(dx) + Math.abs(dy);
  if (orbit.moved < 5) return;
  orbit.wasDrag = true;
  // The world follows the hand, as if you had hold of the page.
  orbit.azimuth = clamp(FILM_AZIMUTH + orbit.azimuth + dx * DRAG_DEGREES_PER_PIXEL, AZIMUTH_LIMITS) - FILM_AZIMUTH;
  orbit.elevation = clamp(FILM_ELEVATION + orbit.elevation + dy * DRAG_DEGREES_PER_PIXEL, ELEVATION_LIMITS) - FILM_ELEVATION;
});
canvas.addEventListener("pointerleave", () => {
  pointer.inside = false;
});
canvas.addEventListener("click", (event) => {
  lastInput = performance.now();
  tour.running = false;
  if (orbit.wasDrag) {
    orbit.wasDrag = false;
    return;
  }
  focusOn(targetAt(event.clientX, event.clientY));
});
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    lastInput = performance.now();
    tour.running = false;
    zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0014));
  },
  { passive: false },
);
// Two fingers do on a phone what the wheel does on a desk.
let pinch = 0;
canvas.addEventListener("touchend", () => {
  pinch = 0;
});
canvas.addEventListener("touchmove", (event) => {
  if (event.touches.length !== 2) return;
  event.preventDefault();
  orbit.holding = false;
  const [a, b] = [event.touches[0]!, event.touches[1]!];
  const gap = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  if (pinch > 0) zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, pinch / gap);
  pinch = gap;
}, { passive: false });

// With nobody at the mouse, the camera does what the original long take does ---------------------

const IDLE_BEFORE_TOUR = 22000;
const tour = { running: false, next: 0, step: 0 };

function runTour(now: number): void {
  if (reducedMotion || (debug && params.has("notour"))) return;
  if (now - lastInput < IDLE_BEFORE_TOUR) return;
  if (!tour.running) {
    tour.running = true;
    tour.step = 0;
    tour.next = now;
    focusOn(null);
  }
  if (now < tour.next) return;
  if (focused) {
    focusOn(null);
    tour.next = now + 9000;
    hovered = null;
    return;
  }
  if (tour.step < 2) {
    hovered = targets[1 + Math.floor(Math.random() * 6)]!;
    hoverTime = 0;
    tour.step += 1;
    tour.next = now + 3400;
    return;
  }
  focusOn(hovered ?? targets[0]!);
  tour.step = 0;
  tour.next = now + 21000;
}

// Frame -----------------------------------------------------------------------------------------

const point = new Vector3();
const screen = { x: 0, y: 0 };
const corners = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const BOX_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
const edgeA = { x: 0, y: 0 };
const edgeB = { x: 0, y: 0 };

function drawWire(target: Target): void {
  const { min, max } = target.car.bounds;
  corners.forEach((p, i) => p.set(i & 1 ? target.x1 : target.x0, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
  const edges: Array<[number, number, number, number]> = [];
  for (const [i, j] of BOX_EDGES) {
    rig.screenPosition(corners[i]!, edgeA, innerWidth, innerHeight);
    rig.screenPosition(corners[j]!, edgeB, innerWidth, innerHeight);
    edges.push([edgeA.x, edgeA.y, edgeB.x, edgeB.y]);
  }
  overlay.setWire(edges);
}

/** The coach in the middle of a close view opens by itself: zooming in is peeking in. */
function targetInView(): Target | null {
  if (aim.width > 34) return null;
  const centreX = rig.target.focus.x;
  return targets.find((t) => t.index > 0 && centreX >= t.x0 && centreX < t.x1) ?? (centreX < CAB_END ? targets[0]! : null);
}

function updateHover(dt: number): void {
  if (pointer.inside && !tour.running && !orbit.holding) {
    const under = targetAt(pointer.x, pointer.y);
    if (under !== hovered) {
      hovered = under;
      hoverTime = 0;
    }
    canvas.style.cursor = under ? "pointer" : "grab";
  } else if (orbit.holding) {
    canvas.style.cursor = "grabbing";
  } else if (!tour.running) {
    hovered = null;
  }
  hoverTime += dt;

  const inView = targetInView();
  const peeking = hovered && hoverTime > 0.14 ? hovered : null;
  const opening = new Set<number>();
  for (const candidate of [focused, peeking, inView]) if (candidate) opening.add(candidate.car.index);
  const rate = reducedMotion ? 100 : 3.4;
  for (const car of train.cars) {
    const goal = opening.has(car.index) ? 1 : 0;
    car.openness += (goal - car.openness) * (1 - Math.exp(-rate * dt));
    if (Math.abs(goal - car.openness) < 0.002) car.openness = goal;
    riderMeshes[car.index]!.show(car.openness > 0.01 && aim.width < 75);
  }

  // Thoughts belong to the coach you are closest to looking at.
  const showing = focused ?? inView ?? (aim.width < 40 ? peeking : null);
  if (showing !== shownBubbles) {
    shownBubbles = showing;
    const list = showing ? showing.speakers() : [];
    overlay.setBubbles(list);
    openBubbleId = list[0]?.id ?? null;
    bubbleTimer = 0;
    overlay.openBubble(openBubbleId);
  }
}

function updateCameraAim(time: number): void {
  const target = rig.target;
  target.width = debugNumber("w") ?? aim.width;
  const fx = debugNumber("fx");
  if (fx !== null) target.focus.set(fx, debugNumber("fy") ?? wideFocus.y, 0);
  else target.focus.copy(aim.focus);
  // Left alone, the turned camera eases back to where the film holds it.
  if (performance.now() - lastInput > 26000 && !orbit.holding) {
    orbit.azimuth *= 0.995;
    orbit.elevation *= 0.995;
  }
  const drift = reducedMotion ? 0 : Math.sin(time * 0.045);
  const wide = Math.min(1, Math.max(0, (aim.width - 18) / 50));
  const azimuth = FILM_AZIMUTH - (1 - wide) * 9 + wide * drift * 6 + orbit.azimuth;
  // Lifted a touch up close, so you can see down into an opened coach.
  const elevation = FILM_ELEVATION + (1 - wide) * 4 + orbit.elevation;
  target.azimuth = debugNumber("az") ?? clamp(azimuth, AZIMUTH_LIMITS);
  target.elevation = debugNumber("el") ?? clamp(elevation, ELEVATION_LIMITS);
}

function updateTags(dt: number): void {
  const labelled = hovered && (!focused || hovered !== focused) ? hovered : null;
  if (labelled) {
    drawWire(labelled);
    point.set((labelled.x0 + labelled.x1) / 2, labelled.car.bounds.max.y + 0.2, TRACK_Z);
    rig.screenPosition(point, screen, innerWidth, innerHeight);
    overlay.setCallout({ index: labelled.index, theme: labelled.theme }, screen.x, screen.y);
  } else {
    overlay.setWire(null);
    overlay.setCallout(null, 0, 0);
  }
  if (!shownBubbles) return;
  const car = shownBubbles.car;
  const list = shownBubbles.speakers();
  for (const person of list) {
    point.set(car.group.position.x + person.x, RAIL_Y + car.floorY + person.headTop + 0.14, TRACK_Z + person.z);
    rig.screenPosition(point, screen, innerWidth, innerHeight);
    overlay.placeBubble(person.id, screen.x, screen.y);
  }
  overlay.flushBubbles();
  bubbleTimer += dt;
  if (bubbleTimer > 5.6 && list.length > 0) {
    bubbleTimer = 0;
    const index = list.findIndex((p) => p.id === openBubbleId);
    // The one who has just finished moves on to their next thought, for when we come back round.
    if (index >= 0 && list.length > 1) {
      const speaker = list[index]!;
      speaker.thought = nextThought(shownBubbles.theme, speaker.thought, thoughtRng);
      overlay.updateBubble(speaker);
    }
    openBubbleId = list[(index + 1) % list.length]!.id;
    overlay.openBubble(openBubbleId);
  }
}

let last = performance.now();
const frozen = debug && params.has("freeze");

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  const moving = !frozen && !reducedMotion;
  if (moving) distance += CRUISE * dt;

  world.update(distance, 320, 260);
  train.update(time, distance);

  runTour(now);
  updateHover(dt);
  updateCameraAim(time);
  rig.update(reducedMotion ? 1 : dt, innerWidth / innerHeight);
  world.cull(rig.camera);
  traffic.update(distance, moving ? time : 0, moving ? dt : 0, rig.camera);
  updateTags(dt);
  adaptQuality(dt);
  pipeline.setViewWidth(rig.width);
  pipeline.setDistance(distance);

  // Passing every minute or two: never long enough to feel scheduled, never so rare it surprises.
  if (moving) {
    opposingX += (OPPOSING_SPEED + CRUISE) * dt;
    if (opposingX > 520) opposingX = -520 - Math.random() * 1300;
  }
  opposing.group.position.x = opposingX;
  opposing.group.visible = !reducedMotion && opposingX > -420;
  if (opposing.group.visible) opposing.update(time, distance * 2);

  pipeline.render(scene, rig.camera, rig.focusDepth, { world: world.group, distance, cull: (camera) => world.cull(camera) });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (debug) {
  Object.assign(window, {
    __metro: {
      world,
      rig,
      pipeline,
      train,
      seed,
      focusOn,
      targets,
      aim,
      ready: () => world.whenReady(),
      skip(metres: number) {
        distance += metres;
      },
    },
  });
}
