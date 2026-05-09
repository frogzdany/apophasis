import * as THREE from 'three'

// Classic 3D simplex noise (Ashima / Stefan Gustavson) — public domain.
// Used for vertex displacement on the blob.
const SIMPLEX_NOISE_GLSL = /* glsl */ `
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uNoiseAmp;
  uniform float uNoiseFreq;
  uniform float uNoiseSpeed;
  uniform float uStretch;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDisplacement;

  ${SIMPLEX_NOISE_GLSL}

  void main() {
    vec3 pos = position;
    pos.y *= uStretch;

    float t = uTime * uNoiseSpeed;
    float n = snoise(pos * uNoiseFreq + vec3(t, t * 0.7, -t * 0.4));
    n += 0.5 * snoise(pos * (uNoiseFreq * 2.1) + vec3(-t, t * 1.3, t * 0.8));

    vec3 displaced = pos + normal * n * uNoiseAmp;
    vDisplacement = n;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAGMENT = /* glsl */ `
  uniform float uIridescence;
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform float uTextureBlend;
  uniform float uHasTexture;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDisplacement;

  vec3 palette(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    float fres = pow(1.0 - clamp(dot(vNormalW, vViewDir), 0.0, 1.0), 2.0);

    float hue = dot(vNormalW, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    hue += vDisplacement * 0.4 + uTime * 0.05;
    vec3 rainbow = palette(hue);

    vec3 dark = mix(vec3(0.02, 0.02, 0.04), vec3(0.18, 0.20, 0.30), fres);
    vec3 colored = mix(dark, rainbow, uIridescence);

    colored += fres * mix(vec3(0.05), vec3(0.4, 0.6, 1.0), uIridescence) * 0.6;

    // Result-image projection. We sample the texture using the view-space
    // normal (matcap-style) so the image faces whichever way the camera is
    // looking — even while OrbitControls auto-rotates the blob. We mask
    // the texture to the front-facing area (1 - fresnel) so the rim stays
    // iridescent, giving the morphed result a soft halo.
    if (uHasTexture > 0.5 && uTextureBlend > 0.001) {
      vec3 vn = normalize(mat3(viewMatrix) * vNormalW);
      vec2 texUv = vn.xy * 0.5 + 0.5;
      vec3 tex = texture2D(uTexture, texUv).rgb;
      // Smooth front-facing mask: 1 dead-center, fades to 0 at silhouette.
      float center = smoothstep(0.0, 0.85, 1.0 - fres);
      float mixK = uTextureBlend * center;
      colored = mix(colored, tex, mixK);
    }

    gl_FragColor = vec4(colored, 1.0);
  }
`

export interface LucyUniforms {
  uTime: { value: number }
  uNoiseAmp: { value: number }
  uNoiseFreq: { value: number }
  uNoiseSpeed: { value: number }
  uStretch: { value: number }
  uIridescence: { value: number }
  uTexture: { value: THREE.Texture | null }
  uTextureBlend: { value: number }
  uHasTexture: { value: number }
}

export type LucyMaterial = THREE.ShaderMaterial & { uniforms: LucyUniforms }

export function createLucyMaterial(): LucyMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNoiseAmp: { value: 0.18 },
      uNoiseFreq: { value: 1.2 },
      uNoiseSpeed: { value: 0.25 },
      uStretch: { value: 1.0 },
      uIridescence: { value: 0.05 },
      uTexture: { value: null },
      uTextureBlend: { value: 0 },
      uHasTexture: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  }) as LucyMaterial
}
