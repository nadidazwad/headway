import {
  Box3,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
  type ShaderMaterial,
} from "three";
import { toBufferGeometry, type Pipeline } from "../render";
import { RAIL_Y, TRACK_Z } from "../world/layout";
import { CAR_LENGTH, CAR_PITCH, DOOR_CENTERS, DOOR_HALF, FLOOR_Y, HALF_WIDTH, ROOF_Y, buildCar, buildDoorLeaf } from "./geometry";

export type CarTheme = "memory" | "present" | "future" | "home" | "city" | "women";

/** Six cars: the reference's past, present and future, plus Dhaka's own three. */
export const CAR_THEMES: readonly CarTheme[] = ["memory", "present", "future", "home", "city", "women"];

export interface TrainCar {
  index: number;
  theme: CarTheme;
  group: Group;
  /** Where to hang passengers: local x of the middle of the passenger area. */
  floorY: number;
  bounds: Box3;
  shellMaterial: ShaderMaterial;
  shell: Mesh;
  /** Passengers and anything else that rides inside. */
  riders: Group;
  /** 0 fully closed, 1 fully cut away. Eased by the caller. */
  openness: number;
}

export interface Train {
  group: Group;
  cars: TrainCar[];
  update(doors: number, time: number, speedKmh: number): void;
  /** World-space front end of the first car. */
  readonly head: Vector3;
}

const SHELL_TOP = RAIL_Y + ROOF_Y + 1.6;

/** Builds the six-car set with its nose at x = 0, trailing towards +x along the near track. */
export function createTrain(pipeline: Pipeline, direction: 1 | -1 = 1, trackZ = TRACK_Z): Train {
  const group = new Group();
  group.position.set(0, RAIL_Y, trackZ);
  if (direction < 0) group.scale.x = -1;
  const middle = { cab: "none", pantograph: false } as const;
  const pantographCar = { cab: "none", pantograph: true } as const;
  const front = buildCar({ cab: "front", pantograph: false });
  const rear = buildCar({ cab: "rear", pantograph: false });
  const plain = buildCar(middle);
  const panto = buildCar(pantographCar);
  const geometries = {
    frontFixed: toBufferGeometry(front.fixed),
    frontShell: toBufferGeometry(front.shell),
    rearFixed: toBufferGeometry(rear.fixed),
    rearShell: toBufferGeometry(rear.shell),
    plainFixed: toBufferGeometry(plain.fixed),
    plainShell: toBufferGeometry(plain.shell),
    pantoFixed: toBufferGeometry(panto.fixed),
    pantoShell: toBufferGeometry(panto.shell),
  };
  const cars: TrainCar[] = CAR_THEMES.map((theme, index) => {
    const carGroup = new Group();
    carGroup.position.x = CAR_LENGTH / 2 + index * CAR_PITCH;
    const pair =
      index === 0 ? [geometries.frontFixed, geometries.frontShell] :
      index === CAR_THEMES.length - 1 ? [geometries.rearFixed, geometries.rearShell] :
      index === 1 || index === 4 ? [geometries.pantoFixed, geometries.pantoShell] :
      [geometries.plainFixed, geometries.plainShell];
    const fixedMesh = new Mesh(pair[0], pipeline.solid);
    const material = pipeline.cuttable();
    const shell = new Mesh(pair[1], material);
    pair[0]!.computeBoundingSphere();
    pair[1]!.computeBoundingSphere();
    const riders = new Group();
    riders.position.y = FLOOR_Y;
    carGroup.add(fixedMesh, shell, riders);
    group.add(carGroup);
    return {
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
    };
  });

  // Door leaves: left and right leaf of each of the four doors on the near side.
  const leafGeometry = toBufferGeometry(buildDoorLeaf());
  const doorCount = cars.length * DOOR_CENTERS.length * 2;
  const doors = new InstancedMesh(leafGeometry, pipeline.cuttable(), doorCount);
  doors.instanceMatrix.setUsage(DynamicDrawUsage);
  doors.frustumCulled = false;
  group.add(doors);
  const matrix = new Matrix4();
  const head = new Vector3(0, RAIL_Y, trackZ);

  const writeDoors = (open: number): void => {
    let i = 0;
    const leafWidth = DOOR_HALF / 2 + 0.02;
    for (let car = 0; car < cars.length; car++) {
      const carX = cars[car]!.group.position.x;
      for (const center of DOOR_CENTERS) {
        for (const side of [-1, 1]) {
          const closed = center + (side * DOOR_HALF) / 2;
          const x = closed + side * open * (DOOR_HALF - 0.03);
          void leafWidth;
          matrix.makeTranslation(carX + x, FLOOR_Y, HALF_WIDTH - 0.006);
          // A car being looked into has its near doors removed with the wall.
          if (cars[car]!.openness > 0.5) matrix.makeScale(0, 0, 0);
          doors.setMatrixAt(i++, matrix);
        }
      }
    }
    doors.instanceMatrix.needsUpdate = true;
  };
  writeDoors(0);

  return {
    group,
    cars,
    head,
    update(doorState, time, speedKmh) {
      writeDoors(doorState);
      // A light sway that grows with speed, as a real set riding its suspension does.
      const motion = Math.min(1, speedKmh / 100);
      for (const car of cars) {
        car.group.position.y = Math.sin(time * 2.3 + car.index * 0.7) * 0.012 * motion;
        car.group.rotation.x = Math.sin(time * 1.7 + car.index) * 0.0025 * motion;
        const cut = 1 - car.openness;
        // The cut plane descends through the shell towards the camera-side floor.
        pipeline.setCut(car.shellMaterial, car.openness <= 0.001 ? null : {
          normal: [0, 0.76, 0.65],
          w: 0.76 * (RAIL_Y + FLOOR_Y - 1.2) + 0.65 * (TRACK_Z - HALF_WIDTH - 0.8) + cut * 0.76 * (SHELL_TOP - RAIL_Y) * 1.7,
        });
      }
    },
  };
}
