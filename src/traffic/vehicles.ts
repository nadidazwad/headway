import type { Assets, PersonPose } from "../assets";
import type { Batch, Vec3 } from "../geometry";
import type { Rng } from "../shared/rng";
import type { Kind } from "./flow";

/** Every vehicle's nose lies along -x, wheels on y = 0. */

const STEEL = 0x54585a;
const TYRE = 0x2a2c2e;

function ringWheel(b: Batch, x: number, y: number, z: number, r: number): void {
  b.part();
  const segments = 14;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.bar([x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.024, 0.024, TYRE, 4);
  }
  b.part();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    b.bar([x + Math.cos(a) * r, y + Math.sin(a) * r, z], [x - Math.cos(a) * r, y - Math.sin(a) * r, z], 0.007, 0.007, 0x8e9294, 3);
  }
  b.part();
  b.ellipsoid(x, y, z, 0.05, 0.05, 0.05, STEEL, 3, 6);
}

/** Someone riding: hips at `seat`, a little forward for the bars, facing the way the nose points. */
function rider(b: Batch, assets: Assets, x: number, seatY: number, z: number, tone = 1, pose: PersonPose = "sit", facing = -Math.PI / 2, avatar?: number): void {
  const who = avatar ?? 0;
  b.at(x, seatY - 0.46, z, () => b.stamp(assets.person(who, pose, "far"), tone), facing);
}

const wholeCast = (assets: Assets, rng: Rng): number => rng.int(0, assets.avatars.length - 1);
const man = (assets: Assets, rng: Rng): number => {
  const men = assets.avatars.flatMap((a, i) => (a.female || a.outfit === "suit" ? [] : [i]));
  return rng.pick(men);
};

/**
 * The pedal van: a bicycle's front half steering a flat wooden bed on two rear wheels. Nothing on
 * the road carries more for less. It takes sacks to market, or a family to the next stop.
 */
export function pedalVan(b: Batch, assets: Assets, load: "goods" | "people", rng: Rng): void {
  const deckY = 0.66;
  const r = 0.33;
  ringWheel(b, -1.2, r, 0, r);
  ringWheel(b, 0.72, r, 0.68, r);
  ringWheel(b, 0.72, r, -0.68, r);
  const head: Vec3 = [-0.86, 0.98, 0];
  const saddle: Vec3 = [-0.4, 0.86, 0];
  b.part();
  b.bar([-1.2, r, 0], head, 0.02, 0.02, STEEL, 5);
  b.bar(head, [-0.92, 1.12, 0], 0.016, 0.016, STEEL, 5);
  b.bar([-0.94, 1.12, -0.3], [-0.94, 1.12, 0.3], 0.013, 0.013, STEEL, 5);
  b.bar(head, saddle, 0.02, 0.02, STEEL, 5);
  b.bar([-0.86, 0.72, 0], [-0.3, deckY - 0.04, 0], 0.024, 0.024, STEEL, 5);
  b.bar(saddle, [-0.3, deckY - 0.04, 0], 0.02, 0.02, STEEL, 5);
  b.bar([0.72, r, -0.68], [0.72, r, 0.68], 0.016, 0.016, STEEL, 4);
  b.part();
  b.ellipsoid(saddle[0], saddle[1] + 0.03, 0, 0.13, 0.03, 0.08, 0x2e3032, 3, 7);
  // The crank and chain under the rider.
  b.part();
  b.cylinder(-0.45, 0.36, -0.03, 0.075, 0.075, 0.01, STEEL, 9, false);
  b.bar([-0.45, 0.36, 0], [0.72, r, 0.04], 0.009, 0.009, 0x3c3e40, 3);
  // The bed: planks across two runners, sides worn pale, with a low rail.
  const x0 = -0.28;
  const x1 = 1.35;
  const half = 0.72;
  b.part();
  b.box(x0, deckY - 0.06, -half + 0.08, x1, deckY - 0.02, -half + 0.14, 0x6a5c4c);
  b.box(x0, deckY - 0.06, half - 0.14, x1, deckY - 0.02, half - 0.08, 0x6a5c4c);
  const planks = 8;
  for (let i = 0; i < planks; i++) {
    const a = x0 + ((x1 - x0) * i) / planks;
    const c = x0 + ((x1 - x0) * (i + 0.88)) / planks;
    b.part();
    b.box(a, deckY - 0.02, -half, c, deckY + 0.015, half, rng.pick([0xc2b49a, 0xb4a68c, 0xcabea6]));
  }
  rider(b, assets, saddle[0] + 0.02, saddle[1] + 0.03, 0, 0.92, "sit", -Math.PI / 2, man(assets, rng));
  if (load === "goods") {
    const sacks = rng.int(3, 5);
    for (let i = 0; i < sacks; i++) {
      const x = x0 + 0.34 + (i % 3) * 0.48;
      const z = -0.32 + (i % 2) * 0.62 + rng.range(-0.04, 0.04);
      const y = deckY + 0.015 + 0.17 + (i > 2 ? 0.28 : 0);
      b.part();
      b.ellipsoid(x, y, z, 0.27, 0.18, 0.22, rng.pick([0xe2dcc8, 0xd2ccb6, 0xcfc8b0]), 4, 8);
    }
    b.part();
    b.bar([x0 + 0.1, deckY + 0.5, -half], [x1 - 0.1, deckY + 0.5, half], 0.006, 0.006, 0x4e4a44, 3);
  } else {
    // A family riding at the sides of the bed, feet hanging over the road.
    const riders = rng.int(2, 4);
    for (let i = 0; i < riders; i++) {
      const side = i % 2 ? -1 : 1;
      const x = x0 + 0.42 + Math.floor(i / 2) * 0.72;
      rider(b, assets, x, deckY + 0.04, side * 0.5, 1.05, "sit", side > 0 ? 0 : Math.PI, wholeCast(assets, rng));
    }
  }
}

/** The stock bicycle with someone on it: often a delivery on the carrier. */
export function bicycleWithRider(b: Batch, assets: Assets, rng: Rng): void {
  b.stamp(assets.prop("bicycle", "lo"), 0.9);
  rider(b, assets, 0.24, 0.92, 0, 1, "sit", -Math.PI / 2, wholeCast(assets, rng));
  if (rng.chance(0.4)) {
    b.part();
    b.block(0.6, 0.86, 0, 0.42, 0.28, 0.34, 0xc4bea8);
  }
}

/** A Bajaj-style commuter bike with a rider, and in Dhaka usually a pillion behind. */
export function motorbikeWithRider(b: Batch, assets: Assets, rng: Rng): void {
  b.stamp(assets.prop("pulsar", "lo"), 0.95);
  rider(b, assets, 0.02, 0.86, 0, 1, "sit", -Math.PI / 2, man(assets, rng));
  if (rng.chance(0.35)) rider(b, assets, 0.42, 0.9, 0, 1.05, "sit", -Math.PI / 2, wholeCast(assets, rng));
}

const RICKSHAW_SEATS = { pullerX: -0.42, pullerY: 0.42, fareX: 0.6, fareY: 0.18 };

/** A rickshaw is never empty for long: the puller, and usually a fare under the hood. */
function seatRiders(b: Batch, assets: Assets, rng: Rng): void {
  const puller = assets.avatars.findIndex((a) => a.name === "Male_Adult_02-lungi");
  b.at(RICKSHAW_SEATS.pullerX, RICKSHAW_SEATS.pullerY, 0, () => b.stamp(assets.person(Math.max(0, puller), "sit", "far"), 0.9), -Math.PI / 2);
  const fare = rng.int(0, assets.avatars.length - 1);
  b.at(RICKSHAW_SEATS.fareX, RICKSHAW_SEATS.fareY, 0, () => b.stamp(assets.person(fare, "sit", "far"), 1.1), -Math.PI / 2);
}

/** Draws one kind of vehicle with whoever is on it, nose along -x, wheels on y = 0. */
export function drawVehicle(b: Batch, kind: Kind, assets: Assets, rng: Rng): void {
  if (kind === "bike") motorbikeWithRider(b, assets, rng);
  else if (kind === "bicycle") bicycleWithRider(b, assets, rng);
  else if (kind === "pedal_goods") pedalVan(b, assets, "goods", rng);
  else if (kind === "pedal_people") pedalVan(b, assets, "people", rng);
  else {
    b.stamp(assets.prop(kind, "lo"));
    if (kind === "rickshaw_fan" || kind === "rickshaw_cycle") seatRiders(b, assets, rng);
  }
}
