// 战场用到的自定义着色器：脚下的「海」（云海 / 熔岩 / 星云）、竞技场符文、环境光尘、画面调色。

import * as THREE from 'three';
import { modelTime } from './models';

const NOISE = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}`;

/** 竞技场下方的海：0 = 天使云海，1 = 恶魔熔岩，2 = 黄昏星云。z>0 是己方半边，z<0 是对手半边。 */
export function makeSeaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uKindNear: { value: 0 }, uKindFar: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uKindNear; uniform float uKindFar;
      varying vec2 vP;
      ${NOISE}
      vec3 angelSea(vec2 p){
        float c = fbm(p * 0.07 + vec2(uTime * 0.012, 0.0));
        float c2 = fbm(p * 0.16 - vec2(0.0, uTime * 0.02));
        float d = smoothstep(0.38, 0.78, c * 0.62 + c2 * 0.45);
        vec3 deep = vec3(0.02, 0.08, 0.32);
        vec3 cloud = mix(vec3(0.62, 0.8, 1.25), vec3(1.3, 1.1, 0.75), smoothstep(0.55, 0.9, c2));
        float rays = pow(max(0.0, sin(p.x * 0.35 + c * 6.0 + uTime * 0.15)), 8.0) * 0.25;
        return mix(deep, cloud, d) * (0.45 + d * 0.85) + vec3(1.0, 0.8, 0.4) * rays * d;
      }
      vec3 demonSea(vec2 p){
        float n = fbm(p * 0.1 + uTime * 0.01);
        float ridge = 1.0 - abs(2.0 * fbm(p * 0.085 + vec2(0.0, uTime * 0.015)) - 1.0);
        float crack = pow(smoothstep(0.72, 1.0, ridge), 2.0);
        vec3 crust = vec3(0.06, 0.015, 0.015) + n * vec3(0.09, 0.02, 0.01);
        vec3 lava = vec3(2.2, 0.6, 0.08);
        return crust + lava * crack * (0.7 + 0.3 * sin(uTime * 1.3 + n * 9.0));
      }
      vec3 duskSea(vec2 p){
        float n = fbm(p * 0.055 + uTime * 0.008);
        float n2 = fbm(p * 0.12 - uTime * 0.012);
        float d = smoothstep(0.42, 0.85, n * 0.6 + n2 * 0.5);
        vec3 col = mix(vec3(0.05, 0.02, 0.13), vec3(0.7, 0.35, 1.25), d * d);
        float star = step(0.996, hash(floor(p * 1.6))) * (0.6 + 0.4 * sin(uTime * 2.0 + p.x));
        return col + star * vec3(1.6);
      }
      vec3 pick(float k, vec2 p){ return k < 0.5 ? angelSea(p) : (k < 1.5 ? demonSea(p) : duskSea(p)); }
      void main(){
        // 海面在竞技场下方很深处，按镜头透视，中线投到海面上大约在 z = -16
        float zz = vP.y + 16.0;
        float t = smoothstep(-7.0, 7.0, zz + sin(vP.x * 0.25 + uTime * 0.3) * 2.0);
        vec3 col = mix(pick(uKindFar, vP), pick(uKindNear, vP), t);
        // 两个半场交界处的一道能量缝
        float seam = exp(-abs(zz + sin(vP.x * 0.25 + uTime * 0.3) * 2.0) * 0.5);
        col += vec3(0.6, 0.5, 1.0) * seam * 0.25;
        col *= smoothstep(130.0, 25.0, length(vP)) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** 竞技场地面上的发光符文：外圈、流动的中线、战线分隔。按半场染色。 */
export function makeRuneMaterial(laneGap: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uColNear: { value: new THREE.Color(1, 0.8, 0.4) },
      uColFar: { value: new THREE.Color(1, 0.3, 0.2) },
      uGap: { value: laneGap },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColNear; uniform vec3 uColFar; uniform float uGap;
      varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        vec3 col = mix(uColFar, uColNear, smoothstep(-0.5, 0.5, vP.y));
        float g = 0.0;
        g += smoothstep(0.06, 0.0, abs(r - 8.05)) * 1.0;
        float dash = step(0.5, fract(a * 24.0 / 6.2832 + uTime * 0.04));
        g += smoothstep(0.1, 0.0, abs(r - 7.6)) * dash * 0.8;
        float dash2 = step(0.4, fract(a * 72.0 / 6.2832 - uTime * 0.07));
        g += smoothstep(0.045, 0.0, abs(r - 7.25)) * dash2 * 0.55;
        // 中线：一道来回流动的能量
        float inX = step(abs(vP.x), uGap * 2.0 + 0.2);
        float pulse = 0.55 + 0.45 * sin(vP.x * 1.6 - uTime * 3.0);
        g += (smoothstep(0.07, 0.0, abs(vP.y)) * 1.5 + exp(-abs(vP.y) * 3.0) * 0.25) * inX * pulse;
        // 战线分隔
        float d = abs(fract(vP.x / uGap + 0.5) - 0.5) * uGap;
        float inField = inX * step(abs(vP.y), 4.3);
        g += smoothstep(0.035, 0.0, d) * 0.4 * inField;
        gl_FragColor = vec4(col * g * 0.9, g);
      }`,
  });
}

/** 单位脚下的召唤阵：天使是六芒日轮，恶魔是五角逆阵，各自缓缓转动 */
export function makeSigilMaterial(color: THREE.Color, angel: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: color.clone() }, uSides: { value: angel ? 6 : 5 }, uDir: { value: angel ? 1 : -1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uSides; uniform float uDir;
      varying vec2 vUv;
      float poly(vec2 p, float n, float rot){
        float a = atan(p.y, p.x) + rot;
        float seg = 6.2832 / n;
        return length(p) * cos(mod(a, seg) - seg * 0.5);
      }
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float t = uTime * 0.35 * uDir;
        float g = smoothstep(0.03, 0.0, abs(r - 0.93));
        g += smoothstep(0.018, 0.0, abs(r - 0.8)) * 0.7;
        g += step(0.5, fract((a + t) * 20.0 / 6.2832)) * smoothstep(0.035, 0.0, abs(r - 0.865)) * 0.8;
        // 两个错开的多边形叠成星阵
        float inside = step(r, 0.8);
        g += smoothstep(0.022, 0.0, abs(poly(p, uSides, -t) - 0.5)) * inside * 0.8;
        g += smoothstep(0.022, 0.0, abs(poly(p, uSides, -t + 3.1416 / uSides) - 0.5)) * inside * 0.8;
        g += smoothstep(0.015, 0.0, abs(r - 0.3)) * 0.6;
        g += exp(-r * 2.6) * (0.22 + 0.08 * sin(uTime * 2.0));
        g *= uOpacity;
        gl_FragColor = vec4(uColor * g * 1.1, g);
      }`,
  });
}

/** 环境光尘：天使半场是缓缓上升的金色光点，恶魔半场是火星 */
export function makeMoteMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute vec3 aColor;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec3 p = position;
        float sp = 0.25 + aSeed * 0.9;
        p.y = mod(position.y + uTime * sp, 7.5);
        p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.35;
        p.z += cos(uTime * 0.5 + aSeed * 23.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (10.0 + aSeed * 22.0) * uScale * (10.0 / -mv.z);
        vAlpha = sin(p.y / 7.5 * 3.1416) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 90.0));
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * 1.1 * a * a * vAlpha, a * vAlpha);
      }`,
  });
}

/** 画面调色：暗角、轻微色差（受击时加强）、对比度 */
export const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uPunch: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uPunch;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (0.004 + uPunch * 0.03) * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = max(col, vec3(0.0));
      col *= 1.0 - r2 * 0.85;
      col += vec3(1.0, 0.9, 0.8) * uPunch * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** 给标准材质加一圈主题色的轮廓光（菲涅尔） */
export function addRim(mat: THREE.MeshStandardMaterial, color: THREE.Color, strength = 0.9): void {
  const rim = color.clone().multiplyScalar(strength);
  // 材质标了 veins 的（熔岩系模型的岩石表面）再叠一层流动的熔岩裂纹
  const veins = !!mat.userData.veins;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);\ntotalEmissiveRadiance += uRim * rimF;',
      );
    if (!veins) return;
    shader.uniforms.uVeinTime = modelTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos; uniform float uVeinTime;
        float vh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float vn(vec3 p){
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(vh(i), vh(i + vec3(1,0,0)), f.x), mix(vh(i + vec3(0,1,0)), vh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(vh(i + vec3(0,0,1)), vh(i + vec3(1,0,1)), f.x), mix(vh(i + vec3(0,1,1)), vh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vp = vObjPos * 4.2;
          float vnz = vn(vp) * 0.62 + vn(vp * 2.3 + 7.0) * 0.38;
          float ridge = 1.0 - abs(2.0 * vnz - 1.0);
          float vein = smoothstep(0.9, 0.98, ridge);
          float core = smoothstep(0.965, 1.0, ridge);
          float flow = 0.72 + 0.28 * sin(uVeinTime * 1.7 + vnz * 26.0 - vObjPos.y * 3.0);
          vec3 lava = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.22), core);
          totalEmissiveRadiance += lava * vein * flow * 1.6 * smoothstep(0.05, 0.35, vObjPos.y);
          diffuseColor.rgb *= 1.0 - vein * 0.7;
        }`,
      );
  };
  mat.customProgramCacheKey = () => (veins ? 'rim-veins' : 'rim');
}
