import { OrthographicCamera, Vector3 } from "three";

export interface CameraPose {
  azimuth: number;
  elevation: number;
  /** World metres across the width of a landscape screen. */
  width: number;
  focus: Vector3;
}

export interface CameraRig {
  camera: OrthographicCamera;
  /** Where the camera is heading. Motion towards it is eased, so it can change at any moment. */
  target: CameraPose;
  /** Applies a target instantly, with no easing: for the first frame and for reduced motion. */
  snap(): void;
  update(dt: number, aspect: number): void;
  /** Distance from the camera to the focus plane: the zero of the depth haze. */
  readonly focusDepth: number;
  /** Current width, for scaling things that must hold a screen size. */
  readonly width: number;
  screenPosition(point: Vector3, out: { x: number; y: number }, viewWidth: number, viewHeight: number): void;
  ray(px: number, py: number, viewWidth: number, viewHeight: number): { origin: Vector3; direction: Vector3 };
}

const DISTANCE = 520;
const scratch = new Vector3();

/** A critically damped spring per quantity keeps every interrupt smooth, wherever it starts. */
function damp(value: number, velocity: { v: number }, target: number, omega: number, dt: number): number {
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = value - target;
  const temp = (velocity.v + omega * change) * dt;
  velocity.v = (velocity.v - omega * temp) * e;
  return target + (change + temp) * e;
}

export function createCameraRig(start: CameraPose): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1800);
  const target: CameraPose = { ...start, focus: start.focus.clone() };
  const pose: CameraPose = { ...start, focus: start.focus.clone() };
  const speed = {
    azimuth: { v: 0 },
    elevation: { v: 0 },
    width: { v: 0 },
    x: { v: 0 },
    y: { v: 0 },
    z: { v: 0 },
  };

  const apply = (aspect: number): void => {
    // Portrait screens keep the same scene height rather than the same width.
    const width = aspect >= 1 ? pose.width : pose.width * Math.max(aspect * 1.25, 0.62);
    const halfW = width / 2;
    const halfH = halfW / aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    const az = (pose.azimuth * Math.PI) / 180;
    const el = (pose.elevation * Math.PI) / 180;
    camera.position.set(
      pose.focus.x - Math.sin(az) * Math.cos(el) * DISTANCE,
      pose.focus.y + Math.sin(el) * DISTANCE,
      pose.focus.z + Math.cos(az) * Math.cos(el) * DISTANCE,
    );
    camera.lookAt(pose.focus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  return {
    camera,
    target,
    snap() {
      pose.azimuth = target.azimuth;
      pose.elevation = target.elevation;
      pose.width = target.width;
      pose.focus.copy(target.focus);
      for (const key of Object.values(speed)) key.v = 0;
    },
    update(dt, aspect) {
      const omega = 2.6;
      pose.azimuth = damp(pose.azimuth, speed.azimuth, target.azimuth, omega, dt);
      pose.elevation = damp(pose.elevation, speed.elevation, target.elevation, omega, dt);
      pose.width = damp(pose.width, speed.width, target.width, omega, dt);
      pose.focus.x = damp(pose.focus.x, speed.x, target.focus.x, omega, dt);
      pose.focus.y = damp(pose.focus.y, speed.y, target.focus.y, omega, dt);
      pose.focus.z = damp(pose.focus.z, speed.z, target.focus.z, omega, dt);
      apply(aspect);
    },
    get focusDepth() {
      return DISTANCE;
    },
    get width() {
      return pose.width;
    },
    screenPosition(point, out, viewWidth, viewHeight) {
      scratch.copy(point).project(camera);
      out.x = ((scratch.x + 1) / 2) * viewWidth;
      out.y = ((1 - scratch.y) / 2) * viewHeight;
    },
    ray(px, py, viewWidth, viewHeight) {
      const ndcX = (px / viewWidth) * 2 - 1;
      const ndcY = 1 - (py / viewHeight) * 2;
      const origin = new Vector3(ndcX, ndcY, -1).unproject(camera);
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      return { origin, direction };
    },
  };
}
