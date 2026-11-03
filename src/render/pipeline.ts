import {
  Camera,
  Color,
  ColorManagement,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { compositeFragment, fullscreenVertex, solidFragment, solidVertex } from "./shaders";

export interface CutPlane {
  /** World-space plane: everything with dot(p, normal) > w is removed. */
  normal: readonly [number, number, number];
  w: number;
}

export interface Pipeline {
  renderer: WebGLRenderer;
  /** The one material every solid in the world uses. */
  solid: ShaderMaterial;
  /** A copy whose geometry can be cut away by a moving plane. */
  cuttable(): ShaderMaterial;
  setCut(material: ShaderMaterial, cut: CutPlane | null): void;
  setAtlas(texture: Texture): void;
  setHaze(start: number, end: number): void;
  /** Lets lines between small parts fade as the camera pulls back, so a wide view never turns to noise. */
  setViewWidth(metres: number): void;
  setPixelRatio(ratio: number): void;
  /** Multisample count of the main pass: 4, 2 or 0. */
  setSamples(samples: number): void;
  resize(width: number, height: number): void;
  render(scene: Scene, camera: Camera, focusDepth: number): void;
  readonly pixelRatio: number;
}

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

  const shared = {
    uAtlas: { value: null as Texture | null },
    uFocusDepth: { value: 0 },
  };

  const solid = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: solidVertex,
    fragmentShader: solidFragment,
    uniforms: {
      ...shared,
      uCutPlane: { value: new Vector4() },
      uCutEnabled: { value: 0 },
    },
  });

  const cuttable = (): ShaderMaterial => {
    const material = solid.clone();
    material.uniforms.uAtlas = shared.uAtlas;
    material.uniforms.uFocusDepth = shared.uFocusDepth;
    return material;
  };

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
      uSkyTop: { value: new Color(0xf6efe0) },
      uSkyBottom: { value: new Color(0xf7ecd9) },
      uInk: { value: new Color(0.42, 0.42, 0.45) },
      uHaze: { value: new Vector2(6, 88) },
      uFineInk: { value: 0.6 },
    },
  });
  const fullscreenScene = new Scene();
  fullscreenScene.add(new Mesh(new PlaneGeometry(2, 2), composite));
  const fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let pixelRatio = 1;
  let cssWidth = 2;
  let cssHeight = 2;

  const applySize = (): void => {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssWidth, cssHeight, false);
    const width = Math.max(2, Math.round(cssWidth * pixelRatio));
    const height = Math.max(2, Math.round(cssHeight * pixelRatio));
    target.setSize(width, height);
    composite.uniforms.uTexel!.value.set(1 / width, 1 / height);
    composite.uniforms.uLineScale!.value = Math.max(0.6, pixelRatio * 0.5);
  };

  return {
    renderer,
    solid,
    cuttable,
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
    setHaze(start, end) {
      composite.uniforms.uHaze!.value.set(start, end);
    },
    setViewWidth(metres) {
      const t = Math.min(1, Math.max(0, (metres - 20) / 70));
      composite.uniforms.uFineInk!.value = 0.8 - 0.42 * t;
    },
    setPixelRatio(ratio) {
      pixelRatio = ratio;
      applySize();
    },
    setSamples(samples) {
      if (target.samples === samples) return;
      target.samples = samples;
      target.dispose();
    },
    resize(width, height) {
      cssWidth = width;
      cssHeight = height;
      applySize();
    },
    render(scene, camera, focusDepth) {
      shared.uFocusDepth.value = focusDepth;
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(fullscreenScene, fullscreenCamera);
    },
    get pixelRatio() {
      return pixelRatio;
    },
  };
}
