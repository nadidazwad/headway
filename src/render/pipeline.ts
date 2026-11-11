import {
  Color,
  ColorManagement,
  CustomBlending,
  DoubleSide,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SrcAlphaFactor,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  WebGLRenderer,
} from "three";
import { compositeFragment, fullscreenVertex, lineFragment, lineVertex, showFragment, solidFragment, solidVertex, steadyFragment } from "./shaders";
import { createShadows, type ShadowFrame } from "./shadow";

export interface CutPlane {
  /** World-space plane: everything with dot(p, normal) > w is removed. */
  normal: readonly [number, number, number];
  w: number;
}

export interface Pipeline {
  renderer: WebGLRenderer;
  /** The grey material every part of the city and its people use. */
  solid: ShaderMaterial;
  /** The same grey, for what moves by itself against the train or the city: traffic, people on foot. */
  moving: ShaderMaterial;
  /** The train's own material: the one thing in the world that keeps its colour. */
  colored: ShaderMaterial;
  /** A coloured copy whose geometry can be cut away by a moving plane. */
  cuttable(): ShaderMaterial;
  /** The material for thin parts; whatever is added to `lineScene` is drawn with the ink, after it. */
  lineMaterial: ShaderMaterial;
  /** The same for thin parts that ride with the train rather than slide past with the city. */
  trainLineMaterial: ShaderMaterial;
  lineScene: Scene;
  setCut(material: ShaderMaterial, cut: CutPlane | null): void;
  setAtlas(texture: Texture): void;
  setHaze(start: number, end: number): void;
  /** Minimal mode: no surface weathering, and the city dissolves into paper close behind the line. */
  setMinimal(on: boolean): void;
  /** How far the train has come: the city's surface textures are pinned to the line by it. */
  setDistance(metres: number): void;
  /** Lets lines between small parts fade as the camera pulls back, so a wide view never turns to noise. */
  setViewWidth(metres: number): void;
  setPixelRatio(ratio: number): void;
  /** Multisample count of the main pass: 4, 2 or 0. */
  setSamples(samples: number): void;
  resize(width: number, height: number): void;
  /** With `shadow`, the sun's passes run first: the city into its pinned map, the rest fresh. */
  render(scene: Scene, camera: OrthographicCamera, focusDepth: number, shadow?: ShadowFrame): void;
  setShadows(on: boolean): void;
  readonly shadowsOn: boolean;
  readonly pixelRatio: number;
  /** Triangles drawn by the last frame's sun and camera passes. */
  readonly stats: { shadowTriangles: number; mainTriangles: number; staticTriangles: number; shadowMs: number; mainMs: number; shadowCalls: number; mainCalls: number; gpu: Record<string, number> };
}

/**
 * GPU time per pass, in milliseconds and smoothed, for tuning on a shared or busy GPU where
 * wall-clock frame times lie. Dev only, behind ?gputime.
 */
function gpuTimer(gl: WebGL2RenderingContext, on: boolean): { begin(name: string): void; end(): void; collect(into: Record<string, number>): void } {
  const ext = on ? (gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null) : null;
  const open: Array<{ name: string; query: WebGLQuery }> = [];
  let current: { name: string; query: WebGLQuery } | null = null;
  return {
    begin(name) {
      if (!ext || current) return;
      const query = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      current = { name, query };
    },
    end() {
      if (!ext || !current) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      open.push(current);
      current = null;
    },
    collect(into) {
      if (!ext) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (open.length && gl.getQueryParameter(open[0]!.query, gl.QUERY_RESULT_AVAILABLE)) {
        const { name, query } = open.shift()!;
        const ms = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;
        gl.deleteQuery(query);
        if (!disjoint) into[name] = (into[name] ?? ms) * 0.9 + ms * 0.1;
      }
    },
  };
}

/** Where haze starts and ends behind the line, in metres of z. */
const HAZE = [12, 78] as const;
const MINIMAL_HAZE = [9, 46] as const;
/** Where the generated city dissolves entirely: from and to in front of the line, then behind it. */
const EDGE = [92, 124, 128, 170] as const;
const MINIMAL_EDGE = [40, 62, 46, 66] as const;

/**
 * Draws colour and a geometry buffer in one multisampled pass, then inks every edge in a
 * second one. The lines come from the buffer, so any solid in the world gets them for free.
 */
export function createPipeline(canvas: HTMLCanvasElement): Pipeline {
  // All colours here are authored and displayed as sRGB values; nothing is lit in linear light.
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(new Color(0, 0, 0), 0);
  renderer.autoClear = false;
  const context = renderer.getContext();
  const hasFloatBuffer = context.getExtension("EXT_color_buffer_float") !== null;

  const target = new WebGLRenderTarget(2, 2, { count: 2, samples: 4, depthBuffer: true, stencilBuffer: false });
  target.textures[0]!.type = UnsignedByteType;
  target.textures[0]!.minFilter = LinearFilter;
  target.textures[0]!.magFilter = LinearFilter;
  target.textures[1]!.type = hasFloatBuffer ? HalfFloatType : FloatType;
  target.textures[1]!.minFilter = LinearFilter;
  target.textures[1]!.magFilter = LinearFilter;

  // Phones and software renderers get maps a quarter the size.
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  const small = /mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(gpu);
  const shadows = createShadows(small ? { staticSize: [2048, 1024], dynamicSize: [1024, 512] } : { staticSize: [4096, 2048], dynamicSize: [2048, 1024] });
  const shared = {
    uAtlas: { value: null as Texture | null },
    uFocusDepth: { value: 0 },
    uLineWrap: { value: 0 },
    uPlain: { value: 0 },
    uCalm: { value: 0 },
  };

  const solid = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: solidVertex,
    fragmentShader: solidFragment,
    defines: import.meta.env.DEV && new URLSearchParams(location.search).has("noweather") ? { NO_WEATHER: 1 } : {},
    uniforms: {
      ...shared,
      uCutPlane: { value: new Vector4() },
      uCutEnabled: { value: 0 },
      uNeutral: { value: 1 },
      uMover: { value: 0 },
      ...shadows.uniforms,
    },
  });

  const copy = (neutral: number): ShaderMaterial => {
    const material = solid.clone();
    material.uniforms.uAtlas = shared.uAtlas;
    material.uniforms.uFocusDepth = shared.uFocusDepth;
    material.uniforms.uLineWrap = shared.uLineWrap;
    material.uniforms.uPlain = shared.uPlain;
    material.uniforms.uCalm = shared.uCalm;
    Object.assign(material.uniforms, shadows.uniforms);
    material.uniforms.uNeutral!.value = neutral;
    return material;
  };
  const colored = copy(0);
  const moving = copy(1);
  moving.uniforms.uMover!.value = 1;

  const cuttable = (): ShaderMaterial => copy(0);

  const composite = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: fullscreenVertex,
    fragmentShader: compositeFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uColor: { value: target.textures[0] },
      uData: { value: target.textures[1] },
      uTexel: { value: new Vector2() },
      uLineScale: { value: 1 },
      uSkyTop: { value: new Color(0xf7f9f2) },
      uSkyBottom: { value: new Color(0xf6f8f0) },
      uInk: { value: new Color(0.42, 0.42, 0.41) },
      uHaze: { value: new Vector2(...HAZE) },
      uEdge: { value: new Vector4(...EDGE) },
      uSoften: { value: 0 },
      uFineInk: { value: 0.6 },
      uCalm: shared.uCalm,
      uFocus: { value: new Vector3() },
      uRight: { value: new Vector3() },
      uUp: { value: new Vector3() },
      uForward: { value: new Vector3() },
    },
  });
  const lineUniforms = {
    uColor: composite.uniforms.uColor!,
    uData: composite.uniforms.uData!,
    uHaze: composite.uniforms.uHaze!,
    uEdge: composite.uniforms.uEdge!,
    uForward: composite.uniforms.uForward!,
    uFocusDepth: shared.uFocusDepth,
    uCalm: shared.uCalm,
    uPixel: { value: 0.04 },
    uLineWidth: { value: 1.5 },
  };
  const lineMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    transparent: true,
    side: DoubleSide,
    uniforms: lineUniforms,
    // A line has no depth for the steadying pass to place it by. One that slides with the city says so
    // in the picture's alpha, which it wears away where it is drawn.
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const trainLineMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    transparent: true,
    side: DoubleSide,
    uniforms: lineUniforms,
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  const lineScene = new Scene();
  const fullscreenScene = new Scene();
  const fullscreen = new Mesh(new PlaneGeometry(2, 2), composite);
  fullscreenScene.add(fullscreen);

  // The inked frame, and the steadied picture of this frame and of the one before.
  const inked = new WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false });
  const steadied = [new WebGLRenderTarget(2, 2, { depthBuffer: false }), new WebGLRenderTarget(2, 2, { depthBuffer: false })];
  for (const each of steadied) {
    each.texture.minFilter = LinearFilter;
    each.texture.magFilter = LinearFilter;
  }
  const steady = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: fullscreenVertex,
    fragmentShader: steadyFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uNow: { value: inked.texture },
      uPast: { value: steadied[0]!.texture },
      uColor: composite.uniforms.uColor!,
      uData: composite.uniforms.uData!,
      uPastClip: { value: new Matrix4() },
      uSlide: { value: 0 },
      uFresh: { value: 1 },
      uFocus: composite.uniforms.uFocus!,
      uRight: composite.uniforms.uRight!,
      uUp: composite.uniforms.uUp!,
      uForward: composite.uniforms.uForward!,
    },
  });
  const show = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: fullscreenVertex,
    fragmentShader: showFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: { uNow: { value: steadied[0]!.texture } },
  });
  /** How much of each new frame goes into the picture. The rest is the frames before it. */
  const FRESH = 0.2;
  /** Where in its pixel each frame is drawn: eight places that between them cover it evenly. */
  const NUDGES = [[0, -1 / 6], [-0.25, 1 / 6], [0.25, -7 / 18], [-0.375, -1 / 18], [0.125, 5 / 18], [-0.125, -5 / 18], [0.375, 1 / 18], [-0.4375, 7 / 18]] as const;
  const steadyOn = !(import.meta.env.DEV && new URLSearchParams(location.search).get("steady") === "0");
  let frameCount = 0;
  let pastValid = false;
  let slide = 0;
  let lastDistance: number | null = null;
  const fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const stats = { shadowTriangles: 0, mainTriangles: 0, staticTriangles: 0, shadowMs: 0, mainMs: 0, shadowCalls: 0, mainCalls: 0, gpu: {} as Record<string, number> };
  const timer = gpuTimer(context as WebGL2RenderingContext, import.meta.env.DEV && new URLSearchParams(location.search).has("gputime"));
  let pixelRatio = 1;
  let cssWidth = 2;
  let cssHeight = 2;

  const applySize = (): void => {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssWidth, cssHeight, false);
    const width = Math.max(2, Math.round(cssWidth * pixelRatio));
    const height = Math.max(2, Math.round(cssHeight * pixelRatio));
    target.setSize(width, height);
    inked.setSize(width, height);
    for (const each of steadied) each.setSize(width, height);
    pastValid = false;
    composite.uniforms.uTexel!.value.set(1 / width, 1 / height);
    composite.uniforms.uLineScale!.value = Math.max(0.6, pixelRatio * 0.5);
  };

  return {
    renderer,
    solid,
    moving,
    colored,
    cuttable,
    lineMaterial,
    trainLineMaterial,
    lineScene,
    setCut(material, cut) {
      if (!cut) {
        material.uniforms.uCutEnabled!.value = 0;
        return;
      }
      material.uniforms.uCutEnabled!.value = 1;
      material.uniforms.uCutPlane!.value.set(cut.normal[0], cut.normal[1], cut.normal[2], cut.w);
    },
    setAtlas(texture) {
      shared.uAtlas.value = texture;
    },
    setDistance(metres) {
      slide += lastDistance === null ? 0 : metres - lastDistance;
      lastDistance = metres;
      shared.uLineWrap.value = ((metres % 1024) + 1024) % 1024;
    },
    setHaze(start, end) {
      composite.uniforms.uHaze!.value.set(start, end);
    },
    setMinimal(on) {
      shared.uPlain.value = on ? 1 : 0;
      composite.uniforms.uHaze!.value.set(...(on ? MINIMAL_HAZE : HAZE));
      composite.uniforms.uEdge!.value.set(...(on ? MINIMAL_EDGE : EDGE));
    },
    setViewWidth(metres) {
      const t = Math.min(1, Math.max(0, (metres - 20) / 70));
      composite.uniforms.uFineInk!.value = 0.8 - 0.42 * t;
      // Up close everything is drawn at full weight; by the wide view the city has gone quiet behind the train.
      const calm = Math.min(1, Math.max(0, (metres - 24) / 30));
      shared.uCalm.value = calm * calm * (3 - 2 * calm);
    },
    setPixelRatio(ratio) {
      pixelRatio = ratio;
      applySize();
    },
    setSamples(samples) {
      // Without multisampling the composite softens edges itself, unless the steadying pass is there to do it better.
      composite.uniforms.uSoften!.value = samples === 0 && !steadyOn ? 1 : 0;
      if (target.samples === samples) return;
      target.samples = samples;
      target.dispose();
    },
    resize(width, height) {
      cssWidth = width;
      cssHeight = height;
      applySize();
    },
    setShadows(on) {
      shadows.enabled = on;
    },
    render(scene, camera, focusDepth, shadow) {
      shared.uFocusDepth.value = focusDepth;
      const { uFocus, uRight, uUp, uForward } = composite.uniforms;
      camera.updateMatrixWorld();
      uRight!.value.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar((camera.right - camera.left) / 2);
      uUp!.value.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar((camera.top - camera.bottom) / 2);
      uForward!.value.setFromMatrixColumn(camera.matrixWorld, 2).negate();
      uFocus!.value.setFromMatrixPosition(camera.matrixWorld).addScaledVector(uForward!.value, focusDepth);
      const t0 = performance.now();
      shadows.prepare(renderer);
      timer.begin("shadow");
      if (shadow) shadows.render(renderer, scene, camera, shadow);
      else shadows.uniforms.uShadowOn.value = 0;
      timer.end();
      stats.shadowMs = performance.now() - t0;
      stats.shadowTriangles = renderer.info.render.triangles;
      stats.shadowCalls = renderer.info.render.calls;
      stats.staticTriangles = shadows.staticTriangles;
      // Each frame is drawn a fraction of a pixel off the last, so that together they see between the pixels.
      const projection = camera.projectionMatrix.elements;
      const [restX, restY] = [projection[12]!, projection[13]!];
      const nudge = NUDGES[frameCount++ % NUDGES.length]!;
      if (steadyOn) {
        projection[12] = restX + (nudge[0] * 2) / target.width;
        projection[13] = restY + (nudge[1] * 2) / target.height;
      }
      renderer.setRenderTarget(target);
      timer.begin("main");
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      timer.end();
      stats.mainTriangles = renderer.info.render.triangles;
      stats.mainCalls = renderer.info.render.calls;
      stats.mainMs = performance.now() - t0 - stats.shadowMs;
      renderer.setRenderTarget(steadyOn ? inked : null);
      timer.begin("composite");
      fullscreen.material = composite;
      renderer.render(fullscreenScene, fullscreenCamera);
      timer.end();
      timer.begin("lines");
      lineMaterial.uniforms.uPixel!.value = (camera.right - camera.left) / target.width;
      renderer.clearDepth();
      renderer.render(lineScene, camera);
      timer.end();
      projection[12] = restX;
      projection[13] = restY;
      if (steadyOn) {
        timer.begin("steady");
        const [past, next] = frameCount % 2 ? [steadied[0]!, steadied[1]!] : [steadied[1]!, steadied[0]!];
        steady.uniforms.uPast!.value = past.texture;
        steady.uniforms.uSlide!.value = slide;
        steady.uniforms.uFresh!.value = pastValid ? FRESH : 1;
        fullscreen.material = steady;
        renderer.setRenderTarget(next);
        renderer.render(fullscreenScene, fullscreenCamera);
        show.uniforms.uNow!.value = next.texture;
        fullscreen.material = show;
        renderer.setRenderTarget(null);
        renderer.render(fullscreenScene, fullscreenCamera);
        timer.end();
        steady.uniforms.uPastClip!.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        pastValid = true;
      }
      slide = 0;
      timer.collect(stats.gpu);
    },
    get pixelRatio() {
      return pixelRatio;
    },
    stats,
    get shadowsOn() {
      return shadows.enabled;
    },
  };
}
