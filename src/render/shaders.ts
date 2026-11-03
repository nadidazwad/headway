export const solidVertex = /* glsl */ `
in vec4 colorPart;
out vec3 vColor;
out vec3 vWorld;
out vec3 vNormalWorld;
out vec3 vNormalView;
out vec2 vUv;
out float vPart;
out float vDepth;
uniform float uFocusDepth;

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
uniform sampler2D uAtlas;
uniform vec4 uCutPlane;
uniform float uCutEnabled;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outData;

const vec3 SUN = vec3(0.33, 0.80, 0.50);

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

  // Streets sit in the shade of what stands around them.
  float streetShade = mix(0.84, 1.0, smoothstep(0.0, 9.0, vWorld.y));
  vec3 lit = base * tone * tint * streetShade;

  outColor = vec4(lit, 1.0);
  vec3 nv = normalize(vNormalView);
  outData = vec4(nv.xy, vDepth, vPart + 0.002);
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
  float threshold = 0.05 + abs(c.z) * 0.0035;
  float depthLine = max(depthEdge(c.z, l.z, r.z, threshold), depthEdge(c.z, d.z, u.z, threshold));
  float normalLine = smoothstep(0.22, 0.6, length(l.xy - r.xy) + length(d.xy - u.xy));
  float partLine = smoothstep(0.0015, 0.005, abs(l.w - r.w) + abs(d.w - u.w)) * uFineInk;
  float line = max(depthLine * 0.9, max(normalLine * 0.75, partLine));

  float coverage = color.a;
  vec3 solid = coverage > 0.001 ? color.rgb / coverage : vec3(0.0);
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, vUv.y));

  float depth = coverage > 0.001 ? c.z / coverage : 1000.0;
  float haze = smoothstep(uHaze.x, uHaze.y, depth);
  haze = 1.0 - (1.0 - haze) * (1.0 - haze * 0.15);
  vec3 inked = mix(solid, solid * uInk, line);
  vec3 scene = mix(inked, sky, min(haze, 0.965));
  vec3 finalColor = mix(sky, scene, coverage);
  outColor = vec4(finalColor, 1.0);
}
`;
