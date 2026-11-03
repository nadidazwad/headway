import {
  Box3,
  DepthTexture,
  DoubleSide,
  Frustum,
  GLSL3,
  LessEqualCompare,
  LinearFilter,
  Matrix4,
  OrthographicCamera,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";

/** Towards the sun. The same vector the solid shader lights by. */
export const SUN = new Vector3(0.33, 0.8, 0.5).normalize();

const depthVertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const depthFragment = /* glsl */ `
precision highp float;
in vec3 vWorld;
uniform vec4 uCutPlane;
uniform float uCutEnabled;
layout(location = 0) out vec4 outColor;
void main() {
  if (uCutEnabled > 0.5 && dot(vWorld, uCutPlane.xyz) > uCutPlane.w) discard;
  outColor = vec4(1.0);
}
`;

export interface ShadowUniforms {
  uStaticShadow: { value: DepthTexture };
  uStaticMatrix: { value: Matrix4 };
  uDynamicShadow: { value: DepthTexture };
  uDynamicMatrix: { value: Matrix4 };
  /** World metres per texel of the static and dynamic maps. */
  uShadowTexel: { value: Vector2 };
  /** One texel in uv, for each map. */
  uShadowStep: { value: Vector2 };
  uShadowOn: { value: number };
}

export interface ShadowFrame {
  /** Everything that never moves against the line: the city, drawn into the static map. */
  world: Object3D;
  /** Distance along the line now. The city has slid by exactly the difference since any earlier frame. */
  distance: number;
  /** Restores the camera's own culling of the city once the sun's passes are done. */
  cull: (camera: OrthographicCamera) => void;
}

export interface Shadows {
  uniforms: ShadowUniforms;
  /**
   * Gives every map real contents once. Until a depth target has been drawn into, its texture does
   * not exist on the GPU, and any draw whose shader samples it fails: so this must run before the
   * first frame, shadows on or off.
   */
  prepare(renderer: WebGLRenderer): void;
  render(renderer: WebGLRenderer, scene: Scene, view: OrthographicCamera, frame: ShadowFrame): void;
  enabled: boolean;
  /** Triangles drawn into the static maps this frame, for the frame-time budget. */
  readonly staticTriangles: number;
}

/** The sun's fixed basis: world x runs straight across the map, so sliding the city slides the map. */
const FORWARD = SUN.clone().negate();
const RIGHT = new Vector3(1, 0, 0).addScaledVector(FORWARD, -FORWARD.x).normalize();
const UP = new Vector3().crossVectors(RIGHT, FORWARD).normalize();

/** The block of world a static map covers when it is made: reaching ahead of the view, to slide into it. */
const STATIC_X = [-205, 175] as const;
const STATIC_Z = [-82, 112] as const;
const STATIC_TOP = 50;
/** How far the city may slide before the next static map takes over. */
const STATIC_LIFE = 150;
/** Begin building the next map this far before it is needed. */
const STATIC_LEAD = 80;
/** Triangles a frame may spend building the next static map. */
const BUILD_BUDGET = 90000;
const CASTER_TOP = 140;
/** The band the dynamic map covers: the road, its pavements and the train above them. */
const DYNAMIC_Z = [-22, 22] as const;
const DYNAMIC_TOP = 30;

function depthTarget(width: number, height: number): WebGLRenderTarget {
  const depthTexture = new DepthTexture(width, height, UnsignedIntType);
  depthTexture.compareFunction = LessEqualCompare;
  depthTexture.minFilter = LinearFilter;
  depthTexture.magFilter = LinearFilter;
  return new WebGLRenderTarget(width, height, { depthTexture, depthBuffer: true, stencilBuffer: false });
}

/** Points a sun camera along FORWARD so it frames every point given, snapped to whole texels. */
function frame(camera: OrthographicCamera, points: readonly Vector3[], width: number, height: number): Vector2 {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, along = 0;
  for (const p of points) {
    const x = p.dot(RIGHT);
    const y = p.dot(UP);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    along += p.dot(FORWARD);
  }
  along /= points.length;
  const spanX = maxX - minX + 4;
  const spanY = maxY - minY + 4;
  const texel = new Vector2(spanX / width, spanY / height);
  const cx = Math.round((minX + maxX) / 2 / texel.x) * texel.x;
  const cy = Math.round((minY + maxY) / 2 / texel.y) * texel.y;
  camera.position.set(0, 0, 0).addScaledVector(RIGHT, cx).addScaledVector(UP, cy).addScaledVector(FORWARD, along - 400);
  camera.up.copy(UP);
  camera.lookAt(camera.position.clone().add(FORWARD));
  camera.left = -spanX / 2;
  camera.right = spanX / 2;
  camera.bottom = -spanY / 2;
  camera.top = spanY / 2;
  // Room towards the sun for the tallest tower outside the view to throw its shadow in.
  camera.near = 400 - CASTER_TOP / SUN.y;
  camera.far = 400 + 240;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return texel;
}

function corners(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new Vector3(x, y, z));
  return out;
}

interface StaticMap {
  target: WebGLRenderTarget;
  camera: OrthographicCamera;
  /** Distance along the line the map was framed at. */
  reference: number;
  matrix: Matrix4;
  texel: number;
  /** Meshes already drawn into it, or found to miss it. */
  considered: WeakSet<Mesh>;
  /** Whether every mesh there was when it was last extended has been considered. */
  complete: boolean;
  needsClear: boolean;
}

/**
 * Sun shadow in two maps. The city only ever slides along x, so its shadow is drawn once into a
 * large map pinned to the line and read back offset by how far the city has slid since; the next
 * map is built a little each frame ahead of need. Traffic, people and trains move on their own,
 * so they get a small map of their own each frame, framed around the road.
 */
export function createShadows(options: { staticSize: readonly [number, number]; dynamicSize: readonly [number, number] }): Shadows {
  const [staticW, staticH] = options.staticSize;
  const [dynamicW, dynamicH] = options.dynamicSize;
  const makeStatic = (): StaticMap => ({
    target: depthTarget(staticW, staticH),
    camera: new OrthographicCamera(),
    reference: Number.NaN,
    matrix: new Matrix4(),
    texel: 0.1,
    considered: new WeakSet(),
    complete: false,
    needsClear: true,
  });
  const maps = [makeStatic(), makeStatic()] as const;
  let active = 0;
  let building: StaticMap | null = null;
  const dynamic = { target: depthTarget(dynamicW, dynamicH), camera: new OrthographicCamera() };

  const uniforms: ShadowUniforms = {
    uStaticShadow: { value: maps[0].target.depthTexture! },
    uStaticMatrix: { value: new Matrix4() },
    uDynamicShadow: { value: dynamic.target.depthTexture! },
    uDynamicMatrix: { value: new Matrix4() },
    uShadowTexel: { value: new Vector2(0.1, 0.1) },
    uShadowStep: { value: new Vector2(1 / staticW, 1 / dynamicW) },
    uShadowOn: { value: 1 },
  };

  const depthFor = new WeakMap<Material, ShaderMaterial>();
  const depthMaterial = (source: Material): ShaderMaterial => {
    let material = depthFor.get(source);
    if (!material) {
      const sourceUniforms = (source as ShaderMaterial).uniforms ?? {};
      material = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: depthVertex,
        fragmentShader: depthFragment,
        side: DoubleSide,
        colorWrite: false,
        uniforms: {
          // Shared objects, so a coach that is cut open casts as it is drawn.
          uCutPlane: sourceUniforms.uCutPlane ?? { value: new Vector4() },
          uCutEnabled: sourceUniforms.uCutEnabled ?? { value: 0 },
        },
      });
      depthFor.set(source, material);
    }
    return material;
  };

  const swapped: Array<[Mesh, Material | Material[]]> = [];
  const swapIn = (mesh: Mesh): void => {
    swapped.push([mesh, mesh.material]);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(depthMaterial) : depthMaterial(mesh.material);
  };
  const swapBack = (): void => {
    for (const [mesh, material] of swapped) mesh.material = material;
    swapped.length = 0;
  };

  const start = (map: StaticMap, reference: number): void => {
    map.reference = reference;
    map.considered = new WeakSet();
    map.complete = false;
    map.needsClear = true;
    const texel = frame(map.camera, corners(STATIC_X[0], STATIC_X[1], 0, STATIC_TOP, STATIC_Z[0], STATIC_Z[1]), staticW, staticH);
    map.texel = Math.max(texel.x, texel.y);
    map.matrix.multiplyMatrices(map.camera.projectionMatrix, map.camera.matrixWorldInverse);
  };

  const frustum = new Frustum();
  const projection = new Matrix4();
  const box = new Box3();
  const chosen: Mesh[] = [];
  const hidden: Mesh[] = [];
  const base = new Vector3();
  let staticTriangles = 0;

  /** Draws into `map` whatever city it has not yet considered, up to a budget of triangles. */
  const extend = (renderer: WebGLRenderer, map: StaticMap, world: Object3D, distance: number, budget: number): boolean => {
    // Slide the map's camera along with the city, so what is drawn now lands where the map expects it.
    const camera = map.camera;
    base.copy(camera.position);
    camera.position.x += distance - map.reference;
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    chosen.length = 0;
    let spent = 0;
    let finished = true;
    world.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || map.considered.has(mesh)) return;
      if (spent > budget) {
        finished = false;
        return;
      }
      map.considered.add(mesh);
      const bounds = mesh.geometry.boundingBox;
      if (!bounds) return;
      box.copy(bounds).applyMatrix4(mesh.matrixWorld);
      if (!frustum.intersectsBox(box)) return;
      chosen.push(mesh);
      spent += (mesh.geometry.index?.count ?? 0) / 3;
    });
    if (chosen.length || map.needsClear) {
      hidden.length = 0;
      world.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && mesh.visible) {
          mesh.visible = false;
          hidden.push(mesh);
        }
      });
      for (const mesh of chosen) {
        mesh.visible = true;
        swapIn(mesh);
      }
      renderer.setRenderTarget(map.target);
      if (map.needsClear) renderer.clear(false, true, false);
      map.needsClear = false;
      renderer.render(world, camera);
      swapBack();
      for (const mesh of chosen) mesh.visible = false;
      for (const mesh of hidden) mesh.visible = true;
    }
    camera.position.copy(base);
    camera.updateMatrixWorld();
    staticTriangles += spent;
    return finished;
  };

  const viewCorner = new Vector3();
  const viewDirection = new Vector3();
  const dynamicPoints = Array.from({ length: 8 }, () => new Vector3());
  const slide = new Matrix4();
  const usable = (map: StaticMap, distance: number): boolean => distance >= map.reference && distance - map.reference <= STATIC_LIFE;

  let prepared = false;
  const shadows: Shadows = {
    uniforms,
    enabled: true,
    prepare(renderer) {
      if (prepared) return;
      prepared = true;
      for (const target of [maps[0].target, maps[1].target, dynamic.target]) {
        renderer.setRenderTarget(target);
        renderer.clear(false, true, false);
      }
      renderer.setRenderTarget(null);
    },
    get staticTriangles() {
      return staticTriangles;
    },
    render(renderer, scene, view, { world, distance, cull }) {
      uniforms.uShadowOn.value = shadows.enabled ? 1 : 0;
      staticTriangles = 0;
      if (!shadows.enabled) return;
      world.updateMatrixWorld(true);

      // The static map: hand over to the next one once the city has slid too far through this one.
      let current = maps[active]!;
      if (!usable(current, distance)) {
        if (building && usable(building, distance)) {
          while (!extend(renderer, building, world, distance, Infinity));
          active = maps.indexOf(building);
        } else {
          // A jump, or the very first frame: make one for where we are now.
          start(current, distance);
        }
        building = null;
        current = maps[active]!;
      }
      // Chunks that arrive late still belong in the map in use.
      current.complete = extend(renderer, current, world, distance, Infinity);
      if (!building && distance - current.reference > STATIC_LIFE - STATIC_LEAD) {
        building = maps[1 - active]!;
        start(building, current.reference + STATIC_LIFE);
      }
      if (building) building.complete = extend(renderer, building, world, distance, BUILD_BUDGET);

      slide.makeTranslation(-(distance - current.reference), 0, 0);
      uniforms.uStaticMatrix.value.multiplyMatrices(current.matrix, slide);
      uniforms.uStaticShadow.value = current.target.depthTexture!;

      // The dynamic map: the road band the camera sees, drawn fresh every frame.
      view.updateMatrixWorld();
      viewDirection.set(0, 0, -1).transformDirection(view.matrixWorld);
      let i = 0;
      for (const [sx, sy] of [[view.left, view.bottom], [view.right, view.bottom], [view.left, view.top], [view.right, view.top]] as const) {
        viewCorner.set(sx, sy, 0).applyMatrix4(view.matrixWorld);
        for (const height of [0, DYNAMIC_TOP]) {
          const t = (height - viewCorner.y) / viewDirection.y;
          const p = dynamicPoints[i++]!.copy(viewCorner).addScaledVector(viewDirection, t);
          p.z = Math.min(DYNAMIC_Z[1], Math.max(DYNAMIC_Z[0], p.z));
        }
      }
      const dynamicTexel = frame(dynamic.camera, dynamicPoints, dynamicW, dynamicH);
      uniforms.uDynamicMatrix.value.multiplyMatrices(dynamic.camera.projectionMatrix, dynamic.camera.matrixWorldInverse);
      uniforms.uShadowTexel.value.set(current.texel, Math.max(dynamicTexel.x, dynamicTexel.y));

      const worldWasVisible = world.visible;
      world.visible = false;
      scene.traverseVisible((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && !object.userData.noShadow) swapIn(mesh);
      });
      renderer.setRenderTarget(dynamic.target);
      renderer.clear(false, true, false);
      renderer.render(scene, dynamic.camera);
      swapBack();
      world.visible = worldWasVisible;
      cull(view);
    },
  };
  return shadows;
}
