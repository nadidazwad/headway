import { LINE_RADIUS_RANGE } from "../geometry";

/**
 * Weathering for the grey city: each surface kind gets the marks that make it read as real in
 * Dhaka, as a multiplier on its value. Every pattern is pinned to the line and fades out before
 * its detail shrinks under a pixel, so nothing shimmers as the city slides past.
 */
const WEATHERING = /* glsl */ `
const float WRAP = 1024.0;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Value noise, periodic in x with the given period in cells, so the line's wrap never shows. */
float vnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  float a = hash12(vec2(x0, i.y));
  float b = hash12(vec2(x1, i.y));
  float c = hash12(vec2(x0, i.y + 1.0));
  float d = hash12(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Noise at scale cells a metre over coordinates whose x wraps at WRAP metres. */
float wnoise(vec2 uv, float scale) {
  return vnoise(uv * scale, WRAP * scale);
}

float wfbm(vec2 uv, float scale) {
  return 0.5 * wnoise(uv, scale) + 0.3 * wnoise(uv + 31.7, scale * 2.0) + 0.2 * wnoise(uv + 71.3, scale * 4.0);
}

/** 1 for detail of this size in metres when it spans several pixels, 0 once it would alias. */
float detail(float size, float px) {
  return 1.0 - smoothstep(size * 0.22, size * 0.55, px);
}

/** A thin dark joint every step metres along t, width metres wide, faded by pixel size. */
float joint(float t, float step, float width, float px) {
  float d = abs(fract(t / step + 0.5) - 0.5) * step;
  return (1.0 - smoothstep(width * 0.5, width * 0.5 + max(px, 0.004), d)) * detail(step * 0.35, px);
}

float asphalt(vec2 uv, float px) {
  float v = 1.0 + (wfbm(uv * vec2(1.0, 1.6), 0.125) - 0.5) * 0.11;
  // Two wheel paths in every lane, polished darker, and an oil line down the middle.
  float z = abs(uv.y);
  float lane = z < 4.9 ? 3.4 : z < 7.9 ? 6.4 : z < 10.75 ? 9.4 : 12.1;
  float dz = z - lane;
  float track = exp(-pow((abs(dz) - 0.82) / 0.32, 2.0));
  v -= track * 0.05 * step(z, 13.4);
  v -= exp(-pow(dz / 0.2, 2.0)) * 0.08 * wnoise(uv * vec2(1.0, 0.0) + vec2(0.0, lane), 0.5) * step(z, 13.4);
  // Patches of newer tar where the road was dug up, and older paler ones.
  vec2 cell = floor(uv / vec2(4.0, 2.4));
  float h = hash12(vec2(mod(cell.x, WRAP / 4.0), cell.y));
  vec2 f = fract(uv / vec2(4.0, 2.4));
  float inside = step(0.12 + h * 0.2, f.x) * step(f.x, 0.75 + h * 0.2) * step(0.15, f.y) * step(f.y, 0.85);
  v += inside * (h > 0.93 ? -0.075 : h > 0.88 ? 0.035 : 0.0);
  // Cracks: thin dark lines along the ridges of a noise field, only where the road has aged.
  float crack = abs(wnoise(uv + wnoise(uv, 2.0) * 0.6, 1.0) - 0.5);
  float aged = smoothstep(0.6, 0.75, wnoise(uv, 0.18));
  v -= (1.0 - smoothstep(0.002, 0.006 + px * 0.2, crack)) * 0.08 * aged * detail(0.12, px);
  v += (wnoise(uv, 16.0) - 0.5) * 0.06 * detail(0.06, px);
  return v;
}

float concreteSurface(vec2 uv, float px, float vertical) {
  float v = 1.0 + (wfbm(uv, 0.5) - 0.5) * 0.09;
  // Formwork lifts up a pier, and the vertical runs of water from every joint above.
  v -= joint(uv.y, 1.5, 0.02, px) * 0.06 * vertical;
  float runs = wnoise(vec2(uv.x * 2.6, uv.y * 0.09), 1.0);
  v -= smoothstep(0.58, 0.9, runs) * 0.09 * vertical;
  v += (wnoise(uv, 12.0) - 0.5) * 0.045 * detail(0.08, px);
  return v;
}

float plasterSurface(vec2 uv, float px) {
  float v = 1.0 + (wfbm(uv * vec2(1.0, 0.7), 0.4) - 0.5) * 0.12;
  // The black monsoon streaks that run down every Dhaka facade from its ledges and sills.
  float streak = wnoise(vec2(uv.x * 2.2, uv.y * 0.07), 1.0);
  float ledge = smoothstep(0.0, 0.25, fract((uv.y + 0.2) / 3.1)) * (1.0 - fract((uv.y + 0.2) / 3.1));
  v -= smoothstep(0.55, 0.88, streak) * (0.05 + 0.1 * ledge) * (0.5 + wnoise(uv * vec2(0.5, 0.2), 1.0));
  // Rising damp and splash-back at the foot of the wall.
  float damp = 1.0 - smoothstep(0.15, 1.1 + wnoise(vec2(uv.x, 0.0), 0.9) * 0.9, uv.y);
  v -= damp * 0.1;
  v += (wnoise(uv, 10.0) - 0.5) * 0.045 * detail(0.1, px);
  return v;
}

float pavingSurface(vec2 uv, float px) {
  vec2 cell = floor(uv / 0.6);
  float h = hash12(vec2(mod(cell.x, WRAP / 0.6), cell.y));
  float v = 1.0 + (h - 0.5) * 0.08;
  // Broken and sunken slabs, dark with what collects in them.
  v -= step(0.92, h) * 0.09;
  float joints = max(joint(uv.x, 0.6, 0.018, px), joint(uv.y, 0.6, 0.018, px));
  v -= joints * 0.09;
  v += (wfbm(uv, 0.6) - 0.5) * 0.1;
  return v;
}

float soilSurface(vec2 uv, float px) {
  float v = 1.0 + (wfbm(uv, 0.3) - 0.5) * 0.12;
  v -= smoothstep(0.62, 0.8, wnoise(uv, 1.3)) * 0.05;
  v += (wnoise(uv, 9.0) - 0.5) * 0.06 * detail(0.1, px);
  return v;
}

float roofSurface(vec2 uv, float px) {
  float v = 1.0 + (wfbm(uv, 0.25) - 0.5) * 0.12;
  // Where the rain stood: rings of dirt around shallow puddles.
  float pool = wnoise(uv, 0.45);
  v -= smoothstep(0.62, 0.7, pool) * (1.0 - smoothstep(0.7, 0.8, pool)) * 0.07;
  v += (wnoise(uv, 11.0) - 0.5) * 0.04 * detail(0.09, px);
  return v;
}

float brickSurface(vec2 uv, float px) {
  float course = 0.085;
  float row = floor(uv.y / course);
  float shifted = uv.x / 0.24 + mod(row, 2.0) * 0.5;
  float h = hash12(vec2(mod(floor(shifted), WRAP / 0.24), row));
  float fade = detail(0.085, px);
  float v = 1.0 + (h - 0.5) * 0.14 * fade;
  float mortar = max(joint(uv.y, course, 0.012, px), joint(shifted * 0.24, 0.24, 0.012, px));
  v += mortar * 0.16;
  v -= smoothstep(0.6, 0.9, wnoise(vec2(uv.x * 2.0, uv.y * 0.1), 1.0)) * 0.08;
  return v;
}

float tinSurface(vec2 uv, float px) {
  float ridge = sin(uv.x * 6.2831 / 0.076);
  float v = 1.0 + ridge * 0.06 * detail(0.076, px);
  v -= smoothstep(0.55, 0.85, wfbm(uv, 0.9)) * 0.12;
  return v;
}

float foliageSurface(vec3 p, float px) {
  vec2 a = p.xy + p.z * 0.37;
  vec2 b = p.zy - p.x * 0.29;
  float leaves = 0.5 * (wnoise(a, 3.5) + wnoise(b + 13.0, 3.5));
  float v = 1.0 + (leaves - 0.5) * 0.3 * detail(0.28, px);
  float fine = 0.5 * (wnoise(a, 13.0) + wnoise(b, 13.0));
  v += (fine - 0.5) * 0.5 * detail(0.09, px);
  return v;
}

float barkSurface(vec2 uv, float px) {
  return 1.0 + (wnoise(vec2(uv.x * 8.0, uv.y * 0.6), 1.0) - 0.5) * 0.16 * detail(0.06, px);
}

/**
 * The ribs cast into a pier. Rounded and band-limited, they flatten to their average tone before
 * they could alias, and a crisp groove only joins them when the camera is close enough to carry it.
 */
float flutedSurface(vec2 uv, float px) {
  const float RIB = 20.0 / 90.0;
  float wave = cos(uv.x * 6.2831853 / RIB);
  float groove = 0.166 - smoothstep(0.72, 1.0, wave);
  return 0.94 - 0.05 * wave * detail(RIB, px) + 0.14 * groove * detail(0.07, px);
}

float weathering(float kind, vec3 p, vec3 n) {
  if (kind < 0.5) return 1.0;
  vec3 an = abs(n);
  // Project onto the plane the face mostly lies in: floors and roofs take x and z, walls take
  // their run along the street and their height.
  vec2 uv = an.y > max(an.x, an.z) ? p.xz : an.z > an.x ? p.xy : vec2(p.z, p.y);
  float vertical = 1.0 - smoothstep(0.55, 0.8, an.y);
  float px = max(length(fwidth(p)), 1e-4);
  int k = int(kind + 0.5);
  if (k == 1) return foliageSurface(p, px);
  if (k == 2) return asphalt(uv, px);
  if (k == 3) return concreteSurface(uv, px, vertical);
  if (k == 4) return vertical > 0.5 ? plasterSurface(uv, px) : roofSurface(uv, px);
  if (k == 5) return pavingSurface(uv, px);
  if (k == 6) return soilSurface(uv, px);
  if (k == 7) return vertical > 0.5 ? plasterSurface(uv, px) : roofSurface(uv, px);
  if (k == 8) return vertical > 0.5 ? brickSurface(uv, px) : roofSurface(uv, px);
  if (k == 9) return tinSurface(uv, px);
  if (k == 10) return barkSurface(uv, px);
  if (k == 12) return concreteSurface(uv, px, vertical) * flutedSurface(uv, px);
  return 1.0;
}
`;

export const solidVertex = /* glsl */ `
in vec4 colorPart;
in float surface;
out float vSurface;
out vec3 vLine;
out vec3 vColor;
out vec3 vWorld;
out vec3 vNormalWorld;
out vec3 vNormalView;
out vec2 vUv;
out float vPart;
out float vDepth;
uniform float uFocusDepth;
/** Distance along the line, wrapped at 1024 m: the city's textures are pinned to it, not to the screen. */
uniform float uLineWrap;

void main() {
  vec4 local = vec4(position, 1.0);
  vec3 localNormal = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    localNormal = mat3(instanceMatrix) * localNormal;
  #endif
  vec4 world = modelMatrix * local;
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vSurface = surface;
  vLine = vec3(uLineWrap - world.x, world.y, world.z);
  vNormalWorld = mat3(modelMatrix) * localNormal;
  vNormalView = mat3(viewMatrix) * vNormalWorld;
  vColor = colorPart.rgb;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vPart = colorPart.a;
  vUv = uv;
  vDepth = -view.z - uFocusDepth;
  gl_Position = projectionMatrix * view;
}
`;

export const solidFragment = /* glsl */ `
precision highp float;
in vec3 vColor;
in vec3 vWorld;
in vec3 vNormalWorld;
in vec3 vNormalView;
in vec2 vUv;
in float vPart;
in float vDepth;
in float vSurface;
in vec3 vLine;
uniform sampler2D uAtlas;
uniform highp sampler2DShadow uStaticShadow;
uniform mat4 uStaticMatrix;
uniform highp sampler2DShadow uDynamicShadow;
uniform mat4 uDynamicMatrix;
uniform vec2 uShadowTexel;
uniform vec2 uShadowStep;
uniform float uShadowOn;
uniform vec4 uCutPlane;
uniform float uCutEnabled;
uniform float uNeutral;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outData;

const vec3 SUN = vec3(0.33, 0.80, 0.50);
const vec3 PAPER = vec3(0.985, 0.992, 0.965);
${WEATHERING}

/** Light reaching a point through one shadow map: 1 in sun, 0 in shade, with a soft edge. */
float shadowTap(highp sampler2DShadow map, mat4 matrix, vec3 world, vec3 n, float texel, float stepUv, float spread) {
  vec3 p = world + n * texel * 1.8 + SUN * texel * 0.6;
  vec4 clip = matrix * vec4(p, 1.0);
  vec3 s = clip.xyz / clip.w * 0.5 + 0.5;
  vec2 edge = min(s.xy, 1.0 - s.xy);
  float inside = smoothstep(0.0, 0.02, min(edge.x, edge.y));
  if (inside <= 0.0 || s.z >= 1.0) return 1.0;
  float t = stepUv * spread;
  float depth = s.z - 0.00012;
  float lit = 2.0 * texture(map, vec3(s.xy, depth));
  lit += texture(map, vec3(s.xy + vec2(t, t * 0.4), depth));
  lit += texture(map, vec3(s.xy + vec2(-t * 0.4, t), depth));
  lit += texture(map, vec3(s.xy + vec2(-t, -t * 0.4), depth));
  lit += texture(map, vec3(s.xy + vec2(t * 0.4, -t), depth));
  return mix(1.0, lit / 6.0, inside);
}

/** How much sun reaches this point: the city's pinned map and the traffic's own, together. */
float sunlight(vec3 world, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  float city = shadowTap(uStaticShadow, uStaticMatrix, world, n, uShadowTexel.x, uShadowStep.x, 1.2);
  // Traffic, people and trains only ever shade the road and its pavements.
  if (abs(world.z) > 24.0 || world.y > 32.0 || city < 0.02) return city;
  vec3 p = world + n * uShadowTexel.y * 1.8 + SUN * uShadowTexel.y * 0.6;
  vec4 clip = uDynamicMatrix * vec4(p, 1.0);
  vec3 s = clip.xyz / clip.w * 0.5 + 0.5;
  if (any(lessThan(s.xy, vec2(0.0))) || any(greaterThan(s.xy, vec2(1.0)))) return city;
  float t = uShadowStep.y * 0.9;
  float depth = s.z - 0.00012;
  float moving = 0.5 * texture(uDynamicShadow, vec3(s.xy, depth));
  moving += 0.25 * texture(uDynamicShadow, vec3(s.xy + vec2(t, t * 0.5), depth));
  moving += 0.25 * texture(uDynamicShadow, vec3(s.xy - vec2(t, t * 0.5), depth));
  return min(city, moving);
}

void main() {
  if (uCutEnabled > 0.5 && dot(vWorld, uCutPlane.xyz) > uCutPlane.w) discard;
  vec3 n = normalize(vNormalWorld);
  float light = 0.5 + 0.5 * dot(n, SUN);
  float tone = 0.5 + 0.6 * light;
  vec3 tint = mix(vec3(0.87, 0.91, 1.02), vec3(1.01, 1.0, 0.98), smoothstep(0.25, 0.95, light));

  vec3 base = vColor;
  if (vUv.x > 0.0 || vUv.y > 0.0) {
    vec4 ink = texture(uAtlas, vUv);
    base = mix(base, ink.rgb, ink.a);
  }

  // Cast shadow, only on faces the sun would otherwise reach: the rest are already in shade.
  float shade = mix(1.0, sunlight(vWorld, n), smoothstep(-0.05, 0.3, dot(n, SUN)));

  // Streets sit in the shade of what stands around them.
  float streetShade = mix(0.97, 1.0, smoothstep(0.0, 9.0, vWorld.y));
  vec3 lit;
  if (uNeutral > 0.5) {
    // The city is one grey drawing: authored colour decides only how light each part is.
    float value = dot(base, vec3(0.3, 0.59, 0.11));
    // Print keeps its blacks, so a sign still reads; everything else is lifted towards the paper.
    bool printed = vUv.x > 0.0 || vUv.y > 0.0;
    bool figure = vSurface > 10.5 && vSurface < 11.5;
    value = printed ? 0.2 + 0.8 * value : figure ? 0.14 + 0.86 * pow(value, 0.85) : 0.42 + 0.58 * pow(value, 0.7);
    #ifndef NO_WEATHER
    value *= weathering(vSurface, vLine, n);
    #endif
    // Leaves keep the full fall of light across a crown; built things are flattened towards paper.
    float flatten = vSurface > 0.5 && vSurface < 1.5 ? 0.12 : 0.36;
    lit = PAPER * value * mix(tone, 1.0, flatten) * streetShade * mix(0.84, 1.0, shade);
  } else {
    lit = base * tone * tint * mix(0.72, 1.0, shade);
  }

  outColor = vec4(lit, 1.0);
  vec3 nv = normalize(vNormalView);
  outData = vec4(nv.xy, vDepth, vPart + 0.002);
}
`;

/**
 * Thin parts, drawn after the ink as ribbons that face the camera. The soft edge is computed, not
 * sampled, so a line keeps its exact weight however it falls between pixels.
 */
export const lineVertex = /* glsl */ `
in vec4 colorPart;
in float surface;
uniform float uFocusDepth;
uniform float uPixel;
uniform float uLineWidth;
uniform vec3 uForward;
out vec3 vColor;
out float vWorldZ;
out float vDepth;
out float vSide;
out float vHalf;
out float vDensity;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 axis = normalize(mat3(modelMatrix) * normal);
  vec3 across = cross(axis, uForward);
  float len = length(across);
  across = len > 0.001 ? across / len : normalize(cross(vec3(0.0, 1.0, 0.0), uForward));
  float radius = uv.x * LINE_RADIUS_RANGE;
  float wanted = 0.5 * uLineWidth * uPixel;
  float halfWidth = max(radius, wanted);
  float side = uv.y * 2.0 - 1.0;
  float reach = halfWidth + uPixel;
  world.xyz += across * side * reach + axis * (surface * 2.0 - 1.0) * uPixel * 0.5;
  vec4 view = viewMatrix * world;
  vColor = colorPart.rgb;
  vWorldZ = world.z;
  vDepth = -view.z - uFocusDepth;
  vSide = side * reach / uPixel;
  vHalf = halfWidth / uPixel;
  vDensity = clamp(radius / wanted, 0.0, 1.0);
  gl_Position = projectionMatrix * view;
}
`.replace("LINE_RADIUS_RANGE", LINE_RADIUS_RANGE.toFixed(4));

export const lineFragment = /* glsl */ `
precision highp float;
in vec3 vColor;
in float vWorldZ;
in float vDepth;
in float vSide;
in float vHalf;
in float vDensity;
uniform sampler2D uColor;
uniform sampler2D uData;
uniform vec2 uHaze;
layout(location = 0) out vec4 outColor;

void main() {
  // The solid pass's depth is the depth test: lines never wrote to it, so they pass behind solids properly.
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  float cover = texelFetch(uColor, pixel, 0).a;
  if (cover > 0.02) {
    float scene = texelFetch(uData, pixel, 0).z / cover;
    if (vDepth > scene + 0.05 + abs(scene) * 0.002) discard;
  }
  float d = abs(vSide);
  float edge = clamp(vHalf - d + 0.5, 0.0, 1.0);
  float value = dot(vColor, vec3(0.3, 0.59, 0.11));
  value = 0.42 + 0.58 * pow(value, 0.7);
  // At a pixel wide a line is ink. Wide enough to see round, it shades like a rod with its own outline.
  float resolved = smoothstep(1.2, 3.0, vHalf);
  float t = d / max(vHalf, 0.001);
  float round = mix(0.56, 1.02 - 0.3 * t * t, resolved);
  float outline = resolved * smoothstep(vHalf - 1.4, vHalf - 0.4, d);
  vec3 colour = vec3(0.985, 0.992, 0.965) * value * round * (1.0 - 0.5 * outline);
  float behind = smoothstep(uHaze.x, uHaze.y, -vWorldZ);
  behind = 1.0 - (1.0 - behind) * (1.0 - behind * 0.15);
  float far = max(smoothstep(92.0, 124.0, vWorldZ), smoothstep(128.0, 170.0, -vWorldZ));
  float alpha = edge * mix(0.42, 1.0, vDensity) * (1.0 - max(min(behind, 0.965), far));
  if (alpha < 0.004) discard;
  outColor = vec4(colour, alpha);
}
`;

export const fullscreenVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const compositeFragment = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uData;
uniform vec2 uTexel;
uniform float uLineScale;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uInk;
uniform vec2 uHaze;
uniform float uFineInk;
uniform vec3 uFocus;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
layout(location = 0) out vec4 outColor;

float depthEdge(float center, float a, float b, float threshold) {
  return smoothstep(threshold, threshold * 2.6, abs(a + b - 2.0 * center));
}

void main() {
  vec4 color = texture(uColor, vUv);
  vec4 c = texture(uData, vUv);
  vec2 o = uTexel * uLineScale;
  vec4 l = texture(uData, vUv - vec2(o.x, 0.0));
  vec4 r = texture(uData, vUv + vec2(o.x, 0.0));
  vec4 d = texture(uData, vUv - vec2(0.0, o.y));
  vec4 u = texture(uData, vUv + vec2(0.0, o.y));

  // Orthographic depth is exactly planar on a flat face, so its second difference is zero.
  // Anything left over is a real edge, however steep the face.
  float threshold = 0.07 + abs(c.z) * 0.0035;
  float depthLine = max(depthEdge(c.z, l.z, r.z, threshold), depthEdge(c.z, d.z, u.z, threshold));
  float normalLine = smoothstep(0.42, 1.05, length(l.xy - r.xy) + length(d.xy - u.xy));
  float partLine = smoothstep(0.0015, 0.005, abs(l.w - r.w) + abs(d.w - u.w)) * uFineInk;
  float line = max(depthLine * 0.9, max(normalLine * 0.75, partLine));
  // Inside a crown of leaves the ink all but disappears; it keeps its full weight round the outside.
  if (min(c.w, min(l.w, min(r.w, min(d.w, u.w)))) > 0.995) line *= 0.22;

  float coverage = color.a;
  vec3 solid = coverage > 0.001 ? color.rgb / coverage : vec3(0.0);
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, vUv.y));

  // Haze grows with distance from the line itself, so the train never fades along its own length.
  float depth = coverage > 0.001 ? c.z / coverage : 0.0;
  vec3 world = uFocus + uRight * (vUv.x * 2.0 - 1.0) + uUp * (vUv.y * 2.0 - 1.0) + uForward * depth;
  float behind = smoothstep(uHaze.x, uHaze.y, -world.z);
  behind = 1.0 - (1.0 - behind) * (1.0 - behind * 0.15);
  // Both edges of the generated city dissolve into the paper rather than stopping.
  float edge = max(smoothstep(92.0, 124.0, world.z), smoothstep(128.0, 170.0, -world.z));
  float haze = max(min(behind, 0.965), edge);
  vec3 inked = mix(solid, solid * uInk, line);
  vec3 scene = mix(inked, sky, haze);
  vec3 finalColor = mix(sky, scene, coverage);
  outColor = vec4(finalColor, 1.0);
}
`;
