import { Box3, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type ShaderMaterial } from "three";
import { toBufferGeometry, toLineGeometry, type CutPlane, type Pipeline } from "../render";
import type { Theme } from "../thoughts";
import { RAIL_Y, TRACK_Z } from "../world/layout";
import { AXLE_OFFSET, BOGIE_OFFSET, WHEEL_RADIUS, WHEEL_Z, buildCar, buildWheel } from "./geometry";
import { CAR_LENGTH, CAR_PITCH, FLOOR_Y, HALF_WIDTH, ROOF_Y } from "./layout";

/** Six cars, each what is on Dhaka's mind. The first is the one Line 6 reserves for women. */
export const CAR_THEMES: readonly Theme[] = ["women", "jam", "bazar", "kaj", "bari", "gorom"];

export interface TrainCar {
  index: number;
  theme: Theme;
  group: Group;
  floorY: number;
  bounds: Box3;
  shellMaterial: ShaderMaterial;
  shell: Mesh;
  /** Passengers and anything else that rides inside. */
  riders: Group;
  /** Seats, poles, straps and screens: drawn only from close to, and built the first time they are. */
  showDetail(on: boolean): void;
  /** 0 fully closed, 1 fully cut away. Eased by the caller. */
  openness: number;
  /** The driving cab, behind its own wall: it opens by itself, apart from the coach. */
  cabin: { shellMaterial: ShaderMaterial; openness: number } | null;
}

export interface Train {
  group: Group;
  cars: TrainCar[];
  /** @param travelled metres this train has moved, which turns its wheels */
  update(time: number, travelled: number): void;
}

const SHELL_TOP = RAIL_Y + ROOF_Y + 1.6;
const AXIS = new Vector3(0, 0, 1);

/** Builds the six-car set with its nose at x = 0, trailing towards +x. */
export function createTrain(pipeline: Pipeline, trackZ = TRACK_Z): Train {
  const group = new Group();
  group.position.set(0, RAIL_Y, trackZ);
  const pairs = {
    front: buildCar({ cab: "front", pantograph: false, women: true }),
    rear: buildCar({ cab: "rear", pantograph: false, women: false }),
    plain: buildCar({ cab: "none", pantograph: false, women: false }),
    pantograph: buildCar({ cab: "none", pantograph: true, women: false }),
  };
  const geometries = Object.fromEntries(
    Object.entries(pairs).map(([key, value]) => [key, [toBufferGeometry(value.fixed), toBufferGeometry(value.shell)]]),
  ) as Record<keyof typeof pairs, [ReturnType<typeof toBufferGeometry>, ReturnType<typeof toBufferGeometry>]>;
  const detailGeometry = new Map<keyof typeof pairs, { solid: BufferGeometry; lines: BufferGeometry | null }>();
  const cabinGeometry = pairs.front.cabin && toBufferGeometry(pairs.front.cabin);

  const cars: TrainCar[] = CAR_THEMES.map((theme, index) => {
    const carGroup = new Group();
    carGroup.position.x = CAR_LENGTH / 2 + index * CAR_PITCH;
    const kind = index === 0 ? "front" : index === CAR_THEMES.length - 1 ? "rear" : index === 1 || index === 4 ? "pantograph" : "plain";
    const [fixedGeometry, shellGeometry] = geometries[kind];
    const fixedMesh = new Mesh(fixedGeometry, pipeline.colored);
    const material = pipeline.cuttable();
    const shell = new Mesh(shellGeometry, material);
    fixedMesh.frustumCulled = false;
    shell.frustumCulled = false;
    const riders = new Group();
    riders.position.y = FLOOR_Y;
    carGroup.add(fixedMesh, shell, riders);
    group.add(carGroup);
    let cabin: TrainCar["cabin"] = null;
    if (kind === "front" && cabinGeometry) {
      const shellMaterial = pipeline.cuttable();
      const cabinMesh = new Mesh(cabinGeometry, shellMaterial);
      cabinMesh.frustumCulled = false;
      carGroup.add(cabinMesh);
      cabin = { shellMaterial, openness: 0 };
    }
    let detail: Mesh | null = null;
    let detailLines: Mesh | null = null;
    const showDetail = (on: boolean): void => {
      if (on && !detail) {
        let built = detailGeometry.get(kind);
        if (!built) {
          const data = pairs[kind].detail();
          const solid = toBufferGeometry(data);
          built = { solid, lines: toLineGeometry(solid, data) };
          detailGeometry.set(kind, built);
        }
        detail = new Mesh(built.solid, pipeline.colored);
        detail.frustumCulled = false;
        carGroup.add(detail);
        if (built.lines) {
          detailLines = new Mesh(built.lines, pipeline.lineMaterial);
          detailLines.frustumCulled = false;
          detailLines.matrixAutoUpdate = false;
          pipeline.lineScene.add(detailLines);
        }
      }
      if (detail) detail.visible = on;
      if (detailLines) {
        detailLines.visible = on;
        // The line pass has its own scene, so its meshes copy where the coach has got to.
        if (on) {
          carGroup.updateWorldMatrix(true, false);
          detailLines.matrix.copy(carGroup.matrixWorld);
        }
      }
    };
    return {
      showDetail,
      index,
      theme,
      group: carGroup,
      floorY: FLOOR_Y,
      bounds: new Box3(
        new Vector3(carGroup.position.x - CAR_LENGTH / 2, RAIL_Y, trackZ - HALF_WIDTH - 0.1),
        new Vector3(carGroup.position.x + CAR_LENGTH / 2, RAIL_Y + ROOF_Y + 0.4, trackZ + HALF_WIDTH + 0.1),
      ),
      shellMaterial: material,
      shell,
      riders,
      openness: 0,
      cabin,
    };
  });

  // Wheels turn with the distance travelled: near-side only, since the far side is never in view.
  const positions: number[] = [];
  for (const car of cars) {
    for (const bogieX of [-BOGIE_OFFSET, BOGIE_OFFSET]) {
      for (const axle of [-AXLE_OFFSET, AXLE_OFFSET]) positions.push(car.group.position.x + bogieX + axle);
    }
  }
  const wheels = new InstancedMesh(toBufferGeometry(buildWheel()), pipeline.colored, positions.length);
  wheels.instanceMatrix.setUsage(DynamicDrawUsage);
  wheels.frustumCulled = false;
  group.add(wheels);
  const matrix = new Matrix4();
  const spin = new Quaternion();
  const place = new Vector3();
  const unit = new Vector3(1, 1, 1);
  const cutAt = (openness: number): CutPlane | null =>
    openness <= 0.001
      ? null
      : {
          normal: [0, 0.76, 0.65],
          w: 0.76 * (RAIL_Y + FLOOR_Y - 1.2) + 0.65 * (TRACK_Z - HALF_WIDTH - 0.8) + (1 - openness) * 0.76 * (SHELL_TOP - RAIL_Y) * 1.7,
        };

  return {
    group,
    cars,
    update(time, travelled) {
      spin.setFromAxisAngle(AXIS, travelled / WHEEL_RADIUS);
      positions.forEach((x, i) => {
        place.set(x, WHEEL_RADIUS, WHEEL_Z);
        wheels.setMatrixAt(i, matrix.compose(place, spin, unit));
      });
      wheels.instanceMatrix.needsUpdate = true;
      // A light sway, as a real set riding its suspension has at line speed.
      for (const car of cars) {
        car.group.position.y = Math.sin(time * 2.3 + car.index * 0.7) * 0.012;
        car.group.rotation.x = Math.sin(time * 1.7 + car.index) * 0.0025;
        pipeline.setCut(car.shellMaterial, cutAt(car.openness));
        if (car.cabin) pipeline.setCut(car.cabin.shellMaterial, cutAt(car.cabin.openness));
      }
    },
  };
}
