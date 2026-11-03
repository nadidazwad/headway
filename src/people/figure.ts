import type { Batch, Vec3 } from "../geometry";
import type { Passenger } from "../thoughts";

const shoe = 0x2a2522;

function mix(a: number, b: number, t: number): number {
  const channel = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return channel(16) | channel(8) | channel(0);
}

/** One person, feet at the origin, facing +Z, built of tapered limbs in clothes that read as Dhaka. */
export function drawPerson(b: Batch, person: Pick<Passenger, "outfit" | "pose" | "female" | "hijab" | "backpack" | "tone" | "palette" | "hair">): void {
  const { outfit, pose, female, hijab, backpack, tone, palette, hair } = person;
  const [upper, lower] = palette;
  const seated = pose === "seated";
  const hipY = seated ? 0.5 : 0.9;
  const shoulderY = hipY + 0.46;
  const shoulderX = female ? 0.165 : 0.19;
  const hipX = female ? 0.095 : 0.085;

  const longTop = outfit === "panjabi" || outfit === "salwar" || outfit === "burqa";
  const wrapped = outfit === "saree" || outfit === "lungi" || outfit === "burqa";
  const legColor = outfit === "panjabi" ? 0xf2efe6 : outfit === "school" ? (female ? 0x20304f : 0x2a3a55) : lower;

  // Legs.
  const kneeZ = seated ? 0.42 : 0.02;
  const kneeY = seated ? hipY : 0.48;
  const ankleZ = seated ? 0.45 : 0;
  const ankleY = 0.08;
  for (const side of [-1, 1]) {
    const x = side * hipX;
    b.part();
    b.bar([x, hipY, 0], [x * 1.05, kneeY, kneeZ], 0.078, 0.058, legColor, 7);
    b.bar([x * 1.05, kneeY, kneeZ], [x * 1.05, ankleY, ankleZ], 0.056, 0.038, legColor, 7);
    b.part();
    b.ellipsoid(x * 1.05, 0.05, ankleZ + 0.05, 0.05, 0.05, 0.12, female && outfit === "saree" ? 0xc99d76 : shoe, 4, 7);
  }

  // Wrapped lower garments hide the legs: saree, lungi, the fall of a burqa.
  if (wrapped && !seated) {
    b.part();
    const color = outfit === "lungi" ? mix(lower, 0x3f6f9e, 0.6) : outfit === "burqa" ? upper : upper;
    b.lathe(0, 0, [[0.2, 0.06], [0.22, 0.14], [0.2, 0.5], [0.165, hipY + 0.02], [0.13, hipY + 0.1]], color, 12);
  } else if (wrapped && seated) {
    b.part();
    const color = outfit === "lungi" ? mix(lower, 0x3f6f9e, 0.6) : upper;
    b.box(-0.17, 0.12, 0.3, 0.17, hipY + 0.05, 0.5, color);
    b.part();
    b.box(-0.18, hipY - 0.1, -0.1, 0.18, hipY + 0.07, 0.48, color);
  }

  // Torso, slightly fuller at chest and hips.
  b.part();
  const torsoColor = outfit === "school" ? 0xf6f4ec : upper;
  b.ellipsoid(0, hipY + 0.05, 0, 0.165, 0.13, 0.11, longTop ? torsoColor : legColor, 5, 9);
  b.part();
  const chestW = female ? 0.16 : 0.18;
  b.lathe(0, 0, [[0.13, hipY + 0.02], [chestW * 0.9, hipY + 0.14], [chestW * 0.86, hipY + 0.26], [chestW, hipY + 0.38], [0.14, shoulderY + 0.02], [0.06, shoulderY + 0.05]], torsoColor, 10);
  // Long kameez or panjabi hem.
  if (longTop && !seated) {
    b.part();
    b.lathe(0, 0, [[0.2, 0.52], [0.18, 0.75], [0.15, hipY + 0.05]], torsoColor, 10);
  } else if (longTop && seated) {
    b.part();
    b.box(-0.16, hipY - 0.04, -0.04, 0.16, hipY + 0.04, 0.36, torsoColor);
  }
  if (outfit === "shirt" || outfit === "school") {
    // Button placket.
    b.part();
    b.box(-0.012, hipY + 0.06, 0.124, 0.012, shoulderY - 0.02, 0.14, mix(torsoColor, 0x000000, 0.25));
  }
  if (outfit === "panjabi") {
    b.part();
    b.box(-0.022, shoulderY - 0.24, 0.135, 0.022, shoulderY - 0.02, 0.15, mix(torsoColor, 0x8a6a3a, 0.5));
  }

  // Arms, according to pose.
  const armColor = outfit === "tshirt" || outfit === "saree" ? tone : torsoColor;
  const sleeve = outfit === "tshirt" || outfit === "saree" ? torsoColor : armColor;
  for (const side of [-1, 1]) {
    const shoulder: Vec3 = [side * shoulderX, shoulderY - 0.02, 0];
    let elbow: Vec3 = [side * (shoulderX + 0.035), shoulderY - 0.28, 0.01];
    let wrist: Vec3 = [side * (shoulderX + 0.02), shoulderY - 0.52, 0.06];
    if (seated) {
      elbow = [side * (shoulderX + 0.02), shoulderY - 0.27, 0.05];
      wrist = [side * 0.09, hipY + 0.07, 0.28];
    }
    if (pose === "strap" && side === 1) {
      elbow = [side * (shoulderX + 0.09), shoulderY + 0.2, 0.02];
      wrist = [side * (shoulderX + 0.02), shoulderY + 0.44, 0.03];
    }
    if (pose === "phone" && side === -1) {
      elbow = [side * (shoulderX + 0.03), shoulderY - 0.27, 0.05];
      wrist = [side * 0.04, shoulderY - 0.2, 0.26];
    }
    b.part();
    b.bar(shoulder, elbow, 0.052, 0.042, sleeve, 6);
    b.bar(elbow, wrist, 0.042, 0.032, armColor === torsoColor ? armColor : tone, 6);
    b.part();
    b.ellipsoid(wrist[0], wrist[1], wrist[2], 0.038, 0.042, 0.038, tone, 3, 6);
    if (pose === "phone" && side === -1) {
      b.part();
      b.box(wrist[0] - 0.035, wrist[1] + 0.01, wrist[2] - 0.01, wrist[0] + 0.035, wrist[1] + 0.13, wrist[2] + 0.005, 0x1c2024);
    }
  }

  // Saree pallu across the chest and over the shoulder; orna for the salwar.
  if (outfit === "saree" || outfit === "salwar") {
    const scarf = outfit === "saree" ? mix(upper, 0xffffff, 0.2) : mix(upper, lower, 0.5);
    b.part();
    b.bar([-shoulderX * 0.9, shoulderY + 0.02, 0.05], [shoulderX * 0.9, hipY + 0.14, 0.13], 0.05, 0.05, scarf, 6);
    if (outfit === "salwar") {
      b.part();
      b.bar([shoulderX * 0.9, shoulderY + 0.02, 0.05], [-shoulderX * 0.9, hipY + 0.14, 0.13], 0.04, 0.04, scarf, 6);
    }
  }

  // Neck and head.
  const headY = shoulderY + 0.17;
  b.part();
  b.bar([0, shoulderY, 0], [0, headY - 0.05, 0.005], 0.045, 0.04, tone, 6);
  b.part();
  b.ellipsoid(0, headY, 0.01, 0.087, 0.11, 0.095, tone, 7, 11);
  b.part();
  // Eyes and a suggestion of brows.
  for (const side of [-1, 1]) {
    b.ellipsoid(side * 0.036, headY + 0.015, 0.098, 0.014, 0.009, 0.006, 0x1a1512, 3, 5);
    b.ellipsoid(side * 0.036, headY + 0.042, 0.096, 0.018, 0.005, 0.004, 0x2a221c, 2, 4);
  }

  if (hijab) {
    const scarf = outfit === "burqa" ? mix(upper, 0x000000, 0.1) : mix(upper, 0xffffff, 0.35);
    b.part();
    b.ellipsoid(0, headY + 0.012, -0.012, 0.102, 0.128, 0.105, scarf, 6, 10);
    b.part();
    b.lathe(0, 0, [[0.2, shoulderY - 0.04], [0.14, shoulderY + 0.04], [0.095, headY - 0.05]], scarf, 10);
    // Face opening.
    b.part();
    b.ellipsoid(0, headY - 0.002, 0.052, 0.07, 0.08, 0.052, tone, 5, 8);
    for (const side of [-1, 1]) {
      b.ellipsoid(side * 0.03, headY + 0.012, 0.1, 0.012, 0.008, 0.005, 0x1a1512, 3, 5);
    }
  } else {
    b.part();
    if (female) {
      b.ellipsoid(0, headY + 0.03, -0.018, 0.096, 0.108, 0.1, hair, 6, 10);
      b.part();
      // A long braid down the back or an open fall of hair.
      b.bar([0, headY - 0.02, -0.075], [0, shoulderY - 0.22, -0.13], 0.052, 0.024, hair, 6);
    } else {
      b.ellipsoid(0, headY + 0.052, -0.014, 0.092, 0.075, 0.098, hair, 5, 10);
    }
  }

  if (backpack) {
    b.part();
    b.box(-0.15, hipY + 0.1, -0.28, 0.15, shoulderY - 0.02, -0.12, outfit === "school" ? 0x2f6fb0 : 0x4a5157);
    b.part();
    b.box(-0.11, hipY + 0.15, -0.3, 0.11, hipY + 0.28, -0.28, 0x6a7178);
  }
}
