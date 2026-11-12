// 3D 战场：浮空竞技场、圣所、卡牌飞入并化为角色、攻击/受击/死亡的动作与特效。
// 只负责「演」，不做规则判断；规则结果由 engine 的事件驱动。

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { KEYWORD_INFO, THEME_INFO, type CardDef } from '../game/cards';
import { LANES, type PlayerId, type UnitStats } from '../game/engine';
import { buildCharacter, type CharacterRig } from './characters';
import { modelTime } from './models';
import { addRim, makeSigilMaterial, GradeShader, makeMoteMaterial, makeRuneMaterial, makeSeaMaterial } from './shaders';

export type SideKind = 'angel' | 'demon' | 'dusk';

const SIDE: Record<SideKind, { glow: number; floor: number; mote: number; sea: number }> = {
  angel: { glow: 0xffd66b, floor: 0x2a3658, mote: 0xffe2a0, sea: 0 },
  demon: { glow: 0xff4d2d, floor: 0x3a171b, mote: 0xff7a30, sea: 1 },
  dusk: { glow: 0xb48cff, floor: 0x2c2246, mote: 0xc9a8ff, sea: 2 },
};

const LANE_GAP = 2.9;
const UNIT_Z = 2.6;
const ARENA_R = 8.3;
/** 圣所：己方的离镜头近，缩小并贴近战线，免得挡住手牌和单位 */
const SANCTUM_Z = [5.4, 6.4];
const SANCTUM_SCALE = [0.6, 0.9];
const UNIT_SCALE = 1.1;
const CARD_W = 2.1;
const CARD_H = 2.8;
export const laneX = (lane: number) => (lane - (LANES - 1) / 2) * LANE_GAP;
const sideSign = (player: PlayerId) => (player === 0 ? 1 : -1);

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIn = (x: number) => x * x * x;
const easeOutBack = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

/** 超过 1 的 HDR 颜色，交给辉光去溢出 */
const hdr = (color: number | THREE.Color, k = 2.2) => new THREE.Color(color).multiplyScalar(k * 0.55);

interface Tween {
  t: number;
  dur: number;
  fn: (k: number) => void;
  ease: (x: number) => number;
  resolve: () => void;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
}

interface FlashMat {
  m: THREE.MeshStandardMaterial;
  e: THREE.Color;
  i: number;
}

const textures = new Map<string, THREE.Texture>();
function cardTexture(id: string): THREE.Texture {
  let t = textures.get(id);
  if (!t) {
    t = new THREE.TextureLoader().load(`/cards/${id}.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(id, t);
  }
  return t;
}

/** 一张立体卡牌：卡面 + 主题色描边 + 背后的光晕。落地后就是角色脚下的召唤阵。 */
class Card3D {
  group = new THREE.Group();
  face: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;

  constructor(card: CardDef) {
    const color = new THREE.Color(THEME_INFO[card.theme].color);
    this.face = new THREE.MeshBasicMaterial({ map: cardTexture(card.id), side: THREE.DoubleSide, transparent: true });
    this.glow = new THREE.MeshBasicMaterial({ color: hdr(color, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.edge = new THREE.LineBasicMaterial({ color: hdr(color, 3), transparent: true });
    const plane = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const face = new THREE.Mesh(plane, this.face);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 0.5, CARD_H + 0.5), this.glow);
    glow.position.z = -0.02;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plane), this.edge);
    edge.position.z = 0.005;
    this.group.add(glow, face, edge);
  }

  setOpacity(k: number): void {
    this.face.opacity = k;
    this.glow.opacity = 0.55 * k;
    this.edge.opacity = k;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.face.dispose();
    this.glow.dispose();
    this.edge.dispose();
  }
}

/** 单位脚下的召唤阵：卡牌落地后化成它，角色站在阵上而不是踩着自己的卡面 */
class Sigil {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;

  constructor(color: THREE.Color, angel: boolean) {
    this.mat = makeSigilMaterial(color, angel);
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

class Actor {
  holder = new THREE.Group();
  rig: CharacterRig;
  label: HTMLDivElement;
  card3d: Card3D;
  sigil: Sigil;
  mats: FlashMat[] = [];
  flash = 0;
  flashColor = new THREE.Color(0xff3030);
  shake = 0;
  hp = 0;
  phase = Math.random() * 6;
  dead = false;
  private flashDirty = false;

  constructor(public uid: number, public player: PlayerId, public lane: number, public card: CardDef) {
    this.rig = buildCharacter(card);
    this.rig.root.scale.setScalar(UNIT_SCALE);
    this.rig.height *= UNIT_SCALE;
    this.holder.add(this.rig.root);
    this.holder.position.copy(this.home());
    this.holder.rotation.y = player === 0 ? Math.PI : 0;
    const seen = new Set<THREE.Material>();
    this.rig.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.isMeshStandardMaterial && !seen.has(mat)) {
        seen.add(mat);
        addRim(mat, this.rig.color, 0.4);
        this.mats.push({ m: mat, e: mat.emissive.clone(), i: mat.emissiveIntensity });
      }
    });
    this.card3d = new Card3D(card);
    this.sigil = new Sigil(this.rig.color, card.faction === 'angel');
    this.sigil.mesh.position.copy(this.home()).setY(0.09);
    this.label = document.createElement('div');
    this.label.className = `unit-label side-${player} faction-${card.faction}`;
  }

  home(): THREE.Vector3 {
    return new THREE.Vector3(laneX(this.lane), 0, sideSign(this.player) * UNIT_Z);
  }

  update(time: number, dt: number): void {
    const t = time + this.phase;
    const hover = this.rig.floating ? 0.28 + Math.sin(t * 1.8) * 0.09 : Math.abs(Math.sin(t * 1.6)) * 0.03;
    this.rig.root.position.y = hover;
    this.rig.root.position.x = this.shake > 0 ? Math.sin(time * 70) * 0.12 * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 4);
    for (const w of this.rig.wings) {
      const { side, base, phase } = w.userData as { side: number; base: number; phase: number };
      w.rotation.y = base + side * Math.sin(t * (this.rig.floating ? 5 : 2.4) + phase) * (this.rig.floating ? 0.3 : 0.14);
    }
    for (const s of this.rig.spinners) {
      const v = s.userData.spin as THREE.Vector3;
      s.rotation.x += v.x * dt;
      s.rotation.y += v.y * dt;
      s.rotation.z += v.z * dt;
    }
    this.sigil.mat.uniforms.uTime.value = t;
    if (this.flash > 0 || this.flashDirty) {
      const k = Math.max(0, this.flash);
      for (const f of this.mats) {
        f.m.emissive.copy(f.e).lerp(this.flashColor, k);
        f.m.emissiveIntensity = f.i + (1.2 - f.i) * k;
      }
      this.flashDirty = this.flash > 0;
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }
  }

  doFlash(color: number): void {
    this.flashColor.set(color);
    this.flash = 1;
  }

  dispose(): void {
    this.holder.removeFromParent();
    this.label.remove();
    this.card3d.dispose();
    this.sigil.dispose();
    this.rig.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

interface Sanctum {
  group: THREE.Group;
  crystal: THREE.Mesh;
  rings: THREE.Mesh[];
  mat: THREE.MeshStandardMaterial;
  pulse: number;
  pulseColor: THREE.Color;
  base: THREE.Color;
  light: THREE.PointLight;
}

export class Battlefield {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  /** 调试：把镜头推近看模型 */
  inspect(pos: [number, number, number], look: [number, number, number]): void {
    this.camHome.set(...pos);
    this.camLook.set(...look);
  }

  private camHome = new THREE.Vector3(0, 12.6, 15.4);
  private camLook = new THREE.Vector3(0, 0.6, 1.5);
  private camShake = 0;
  private punch = 0;
  private intro = 0;
  private mouse = new THREE.Vector2();
  private mouseSmooth = new THREE.Vector2();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private actors = new Map<number, Actor>();
  private sanctums: Sanctum[] = [];
  private tiles: THREE.Mesh[][] = [[], []];
  private floors: THREE.Mesh[] = [];
  private rims: THREE.Mesh[] = [];
  private decor: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private sideLights: THREE.PointLight[] = [];
  private rocks: THREE.Mesh[] = [];
  private sea = makeSeaMaterial();
  private runes = makeRuneMaterial(LANE_GAP);
  private motes = makeMoteMaterial();
  private moteGeo = new THREE.BufferGeometry();
  private fxLight = new THREE.PointLight(0xffffff, 0, 16);
  private selectable = new Set<number>();
  private hoverLane = -1;
  private labels: HTMLDivElement;
  private last = performance.now();
  private time = 0;
  private raycaster = new THREE.Raycaster();
  private particleGeo = new THREE.TetrahedronGeometry(0.09);
  private sides: [SideKind, SideKind] = ['angel', 'demon'];

  onLaneClick: (lane: number) => void = () => {};
  onUnitHover: (uid: number | null) => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'unit-labels';
    container.appendChild(this.labels);

    // 后处理：HDR 渲染 → 辉光 → 调色（暗角/色差）→ 输出
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.34, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.scene.background = new THREE.Color(0x05060d);
    this.buildEnvironment();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      this.hoverLane = this.pickLane(e);
      canvas.style.cursor = this.selectable.has(this.hoverLane) ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => (this.hoverLane = -1));
    canvas.addEventListener('click', (e) => {
      const lane = this.pickLane(e);
      if (lane >= 0 && this.selectable.has(lane)) this.onLaneClick(lane);
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    const frame = () => {
      this.tick(true);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // 页面在后台时 rAF 会停，补一个定时器保证动画和流程能走完
    setInterval(() => {
      if (performance.now() - this.last > 120) this.tick(false);
    }, 60);
  }

  // ———————————————————— 场景搭建 ————————————————————

  private buildEnvironment(): void {
    this.scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x1a1020, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 10;
    sc.bottom = -10;
    sc.far = 40;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const back = new THREE.DirectionalLight(0x8899ff, 0.9);
    back.position.set(6, 6, -10);
    this.scene.add(back, this.fxLight);

    // 脚下的海
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), this.sea);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -13;
    this.scene.add(sea);

    // 浮空竞技场：两个半圆台面 + 倒锥岩体 + 发光边缘
    const rock = new THREE.MeshStandardMaterial({ color: 0x191826, flatShading: true, roughness: 0.95 });
    const under = new THREE.Mesh(new THREE.ConeGeometry(ARENA_R * 0.98, 8, 9, 3), rock);
    under.rotation.x = Math.PI;
    under.position.y = -4.6;
    this.scene.add(under);
    for (const player of [0, 1] as PlayerId[]) {
      const start = player === 0 ? -Math.PI / 2 : Math.PI / 2;
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(ARENA_R, ARENA_R * 0.96, 0.6, 48, 1, false, start, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.55, metalness: 0.25 }),
      );
      floor.position.y = -0.3;
      floor.receiveShadow = true;
      this.scene.add(floor);
      this.floors.push(floor);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R, 0.07, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = player === 0 ? 0 : Math.PI;
      rim.position.y = 0.02;
      this.scene.add(rim);
      this.rims.push(rim);
      for (let lane = 0; lane < LANES; lane++) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(LANE_GAP - 0.4, 0.06, 3.0),
          new THREE.MeshStandardMaterial({ color: 0x33384f, roughness: 0.35, metalness: 0.4, emissive: 0x000000 }),
        );
        tile.position.set(laneX(lane), 0.03, sideSign(player) * UNIT_Z);
        tile.receiveShadow = true;
        this.scene.add(tile);
        this.tiles[player].push(tile);
      }
      const light = new THREE.PointLight(0xffffff, 22, 22);
      light.position.set(0, 4.5, sideSign(player) * 7.5);
      this.scene.add(light);
      this.sideLights.push(light);
      this.scene.add(this.decor[player]);
    }
    const runes = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 72), this.runes);
    runes.rotation.x = -Math.PI / 2;
    runes.position.y = 0.012;
    this.scene.add(runes);

    // 四周漂浮的碎岩
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const r = ARENA_R + 2.5 + Math.random() * 7;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.9, 0), rock);
      m.position.set(Math.cos(a) * r, -1 - Math.random() * 5, Math.sin(a) * r);
      m.scale.y = 0.6 + Math.random() * 0.8;
      m.userData = { y: m.position.y, phase: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4 };
      this.scene.add(m);
      this.rocks.push(m);
    }

    // 环境光尘
    const n = 420;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = Math.random() * 7.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      seed[i] = Math.random();
    }
    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.moteGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const points = new THREE.Points(this.moteGeo, this.motes);
    points.frustumCulled = false;
    this.scene.add(points);

    for (const player of [0, 1] as PlayerId[]) this.sanctums.push(this.buildSanctum(player));
  }

  private buildSanctum(player: PlayerId): Sanctum {
    const group = new THREE.Group();
    group.position.set(0, 0, sideSign(player) * SANCTUM_Z[player]);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3d52, flatShading: true, roughness: 0.8 });
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.35, 8), stone);
    b1.position.y = 0.17;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.35, 8), stone);
    b2.position.y = 0.5;
    b1.receiveShadow = b2.receiveShadow = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, flatShading: true, roughness: 0.25, metalness: 0.2 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), mat);
    crystal.scale.y = 1.7;
    crystal.position.y = 2.2;
    crystal.castShadow = true;
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.3, 0.035, 6, 40), mat);
      ring.position.y = 2.2;
      ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4);
      rings.push(ring);
      group.add(ring);
    }
    const light = new THREE.PointLight(0xffffff, 14, 14);
    light.position.y = 2.6;
    group.add(b1, b2, crystal, light);
    group.scale.setScalar(SANCTUM_SCALE[player]);
    this.scene.add(group);
    return { group, crystal, rings, mat, pulse: 0, pulseColor: new THREE.Color(), base: new THREE.Color(), light };
  }

  /** 每个半场后方的布景：天使是立柱与光环，恶魔是黑曜石尖刺，黄昏是紫晶 */
  private buildDecor(player: PlayerId, kind: SideKind): void {
    const g = this.decor[player];
    for (const child of [...g.children]) {
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      g.remove(child);
    }
    const c = SIDE[kind];
    const sign = sideSign(player);
    // 己方离镜头近，只在两侧放矮的；对手一侧放满一圈
    const angles = player === 0 ? [-66, -50, 50, 66] : [-70, -52, -34, -17, 17, 34, 52, 70];
    const tall = player === 0 ? 0.55 : 1;
    angles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = Math.sin(a) * (ARENA_R - 0.7);
      const z = sign * Math.cos(a) * (ARENA_R - 0.7);
      const item = new THREE.Group();
      item.position.set(x, 0, z);
      if (kind === 'angel') {
        const marble = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.4, metalness: 0.1 });
        const h = (3.4 + (i % 2) * 0.9) * tall;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, h, 10), marble);
        col.position.y = h / 2;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.75), marble);
        base.position.y = 0.11;
        const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), new THREE.MeshBasicMaterial({ color: hdr(c.glow, 2.6) }));
        cap.position.y = h + 0.45;
        cap.userData.bob = i;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: hdr(c.glow, 2) }));
        ring.position.y = h + 0.45;
        ring.rotation.x = Math.PI / 2;
        item.add(col, base, cap, ring);
        col.castShadow = true;
      } else if (kind === 'demon') {
        const obsidian = new THREE.MeshStandardMaterial({ color: 0x18090b, flatShading: true, roughness: 0.5, metalness: 0.3 });
        const h = (2.6 + ((i * 7) % 4) * 0.7) * tall;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5, h, 5), obsidian);
        spike.position.y = h / 2;
        spike.rotation.set(Math.sin(i * 3.1) * 0.22, i, Math.cos(i * 2.3) * 0.22);
        const small = new THREE.Mesh(new THREE.ConeGeometry(0.3, h * 0.55, 4), obsidian);
        small.position.set(0.5, h * 0.27, 0.2);
        small.rotation.z = -0.35;
        const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: hdr(0xff5a1a, 3) }));
        ember.position.y = h + 0.5;
        ember.userData.bob = i;
        const pool = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), new THREE.MeshBasicMaterial({ color: hdr(0xff3a0a, 1.6) }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.02;
        item.add(spike, small, ember, pool);
        spike.castShadow = true;
      } else {
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6a4ab0, emissive: c.glow, emissiveIntensity: 0.9, flatShading: true, roughness: 0.2, metalness: 0.3 });
        const h = (2.2 + (i % 3) * 0.8) * tall;
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), crystalMat);
        cr.scale.y = h / 1.0;
        cr.position.y = h * 0.5 + 0.6;
        cr.userData.bob = i;
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), crystalMat);
        shard.position.set(0.7, h * 0.4, 0);
        shard.userData.bob = i + 2;
        item.add(cr, shard);
        cr.castShadow = true;
      }
      g.add(item);
    });
  }

  /** 新对局：清场并按双方卡组的阵营给半场、海面、布景和圣所上色 */
  reset(side0: SideKind, side1: SideKind): void {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    this.sides = [side0, side1];
    this.sea.uniforms.uKindNear.value = SIDE[side0].sea;
    this.sea.uniforms.uKindFar.value = SIDE[side1].sea;
    (this.runes.uniforms.uColNear.value as THREE.Color).set(SIDE[side0].glow);
    (this.runes.uniforms.uColFar.value as THREE.Color).set(SIDE[side1].glow);
    this.sides.forEach((kind, index) => {
      const player = index as PlayerId;
      const c = SIDE[kind];
      (this.floors[player].material as THREE.MeshStandardMaterial).color.set(c.floor);
      (this.rims[player].material as THREE.MeshBasicMaterial).color.copy(hdr(c.glow, 2.4));
      this.sideLights[player].color.set(c.glow);
      const s = this.sanctums[player];
      s.base.set(c.glow);
      s.mat.color.set(c.glow);
      s.mat.emissive.set(c.glow);
      s.light.color.set(c.glow);
      s.group.scale.setScalar(SANCTUM_SCALE[player]);
      s.group.visible = true;
      for (const tile of this.tiles[player]) (tile.material as THREE.MeshStandardMaterial).color.set(c.floor).multiplyScalar(1.7);
      this.buildDecor(player, kind);
    });
    // 光尘按所在半场染色
    const pos = this.moteGeo.getAttribute('position');
    const col = this.moteGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      tmp.set(SIDE[pos.getZ(i) > 0 ? side0 : side1].mote);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
    this.setSelectable([]);
    this.intro = 1;
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.motes.uniforms.uScale.value = (h / 860) * this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    // 窄屏时把镜头拉远，保证四条战线都在画面里
    const pull = Math.max(1, 1.55 / this.camera.aspect);
    this.camHome.set(0, 0.6 + 12 * pull, 1.5 + 13.9 * pull);
    this.camera.updateProjectionMatrix();
  }

  // ———————————————————— 帧循环 ————————————————————

  private tick(render: boolean): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      p.mesh.scale.setScalar(p.life / p.max);
    }
    for (const a of this.actors.values()) a.update(this.time, dt);
    this.sanctums.forEach((s, i) => {
      s.crystal.rotation.y += dt * 0.6;
      s.crystal.position.y = 2.2 + Math.sin(this.time * 1.3 + i * 2) * 0.12;
      s.rings[0].rotation.z += dt * 0.5;
      s.rings[1].rotation.z -= dt * 0.35;
      s.pulse = Math.max(0, s.pulse - dt * 2.5);
      s.mat.emissive.copy(s.base).lerp(s.pulseColor, s.pulse);
      s.mat.emissiveIntensity = 0.9 + s.pulse * 1.6;
    });
    // 可部署的战线呼吸发光
    for (let lane = 0; lane < LANES; lane++) {
      const m = this.tiles[0][lane].material as THREE.MeshStandardMaterial;
      if (this.selectable.has(lane)) {
        m.emissive.set(0x4dffa0);
        m.emissiveIntensity = (lane === this.hoverLane ? 1.6 : 0.5) + Math.sin(this.time * 5) * 0.2;
      } else {
        m.emissiveIntensity = 0;
      }
    }
    if (!render) return;

    this.sea.uniforms.uTime.value = this.time;
    modelTime.value = this.time;
    this.runes.uniforms.uTime.value = this.time;
    this.motes.uniforms.uTime.value = this.time;
    for (const r of this.rocks) {
      r.position.y = r.userData.y + Math.sin(this.time * 0.5 + r.userData.phase) * 0.4;
      r.rotation.y += r.userData.spin * dt;
      r.rotation.x += r.userData.spin * dt * 0.6;
    }
    for (const g of this.decor) {
      for (const item of g.children) {
        for (const o of item.children) {
          if (o.userData.bob !== undefined) {
            o.position.y += Math.sin(this.time * 1.4 + o.userData.bob) * dt * 0.12;
            o.rotation.y += dt * 0.6;
          }
        }
      }
    }
    this.fxLight.intensity *= Math.exp(-dt * 9);
    this.punch = Math.max(0, this.punch - dt * 3.5);
    this.grade.uniforms.uPunch.value = this.punch;
    this.camShake = Math.max(0, this.camShake - dt * 3);
    this.intro = Math.max(0, this.intro - dt * 0.55);
    this.mouseSmooth.lerp(this.mouse, Math.min(1, dt * 3));

    // 镜头：开场从高空推下来；平时跟着鼠标轻微视差；受击时抖动并轻推
    const k = easeInOut(this.intro);
    this.camera.position.copy(this.camHome);
    this.camera.position.x += this.mouseSmooth.x * 0.9 + Math.sin(k * 2.2) * 9 * k;
    this.camera.position.y += -this.mouseSmooth.y * 0.5 + k * 11;
    this.camera.position.z += k * 9 - this.punch * 0.5;
    if (this.camShake > 0) {
      this.camera.position.x += Math.sin(this.time * 90) * 0.18 * this.camShake;
      this.camera.position.y += Math.cos(this.time * 77) * 0.14 * this.camShake;
    }
    this.camera.lookAt(this.camLook);
    this.composer.render(dt);
    this.updateLabels();
  }

  private project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.container.clientWidth, y: (-p.y * 0.5 + 0.5) * this.container.clientHeight };
  }

  private updateLabels(): void {
    for (const a of this.actors.values()) {
      if (a.dead) continue;
      // 己方标签放脚前，敌方标签放头顶，避免互相遮挡
      const anchor = a.holder.position.clone();
      if (a.player === 0) anchor.add(new THREE.Vector3(0, 0.05, 1.65));
      else anchor.add(new THREE.Vector3(0, a.rig.height + 0.75, 0));
      const { x, y } = this.project(anchor);
      a.label.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private tween(dur: number, fn: (k: number) => void, ease = easeInOut): Promise<void> {
    return new Promise((resolve) => this.tweens.push({ t: 0, dur, fn, ease, resolve }));
  }

  wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {});
  }

  private pickLane(e: PointerEvent | MouseEvent): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // 与地面求交，再按 x 落在哪条战线判断；只认己方半场
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return -1;
    if (hit.z < 0.2 || hit.z > UNIT_Z + 2.4) return -1;
    const lane = Math.round(hit.x / LANE_GAP + (LANES - 1) / 2);
    return lane >= 0 && lane < LANES && Math.abs(hit.x - laneX(lane)) < LANE_GAP / 2 - 0.1 ? lane : -1;
  }

  // ———————————————————— 特效 ————————————————————

  private burst(at: THREE.Vector3, color: number | THREE.Color, count = 14, speed = 4, gravity = 9): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 2.4) });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const vel = new THREE.Vector3(Math.cos(a) * (1 - up * 0.4), up, Math.sin(a) * (1 - up * 0.4)).multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      const life = 0.45 + Math.random() * 0.55;
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, life, max: life, gravity });
    }
  }

  private ring(at: THREE.Vector3, color: number, size = 2.2, dur = 0.5): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 2.2), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at).setY(0.14);
    this.scene.add(m);
    void this.tween(dur, (k) => {
      m.scale.setScalar(0.2 + k * size);
      mat.opacity = 1 - k;
    }, easeOut).then(() => {
      m.removeFromParent();
      m.geometry.dispose();
      mat.dispose();
    });
  }

  private pillar(at: THREE.Vector3, color: number, dur = 0.8): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 14, 16, 1, true), mat);
    m.position.copy(at).setY(7);
    this.scene.add(m);
    void this.tween(dur, (k) => {
      mat.opacity = 0.6 * (1 - k);
      m.scale.set(1 - k * 0.75, 1, 1 - k * 0.75);
    }).then(() => {
      m.removeFromParent();
      m.geometry.dispose();
      mat.dispose();
    });
  }

  /** 命中瞬间的闪光：一颗迅速膨胀消散的光球 + 一盏瞬时点光 */
  private flashAt(at: THREE.Vector3, color: number | THREE.Color, size = 1.4): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat);
    m.position.copy(at);
    this.scene.add(m);
    this.fxLight.position.copy(at).add(new THREE.Vector3(0, 1, 0));
    this.fxLight.color.set(color);
    this.fxLight.intensity = 50;
    void this.tween(0.22, (k) => {
      m.scale.setScalar(0.3 + k * size);
      mat.opacity = 1 - k;
    }, easeOut).then(() => {
      m.removeFromParent();
      m.geometry.dispose();
      mat.dispose();
    });
  }

  /** 斩击光弧 */
  private slash(at: THREE.Vector3, color: THREE.Color, facing: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 3), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.45, 28, 1, 0, 2.5), mat);
    m.position.copy(at);
    m.rotation.set(-0.5, facing > 0 ? 0 : Math.PI, Math.random() * 1.2 - 0.6);
    this.scene.add(m);
    const start = m.rotation.z;
    void this.tween(0.24, (k) => {
      m.rotation.z = start - 1.2 + k * 2.6;
      m.scale.setScalar(0.7 + k * 0.9);
      mat.opacity = 1 - k * k;
    }, easeOut).then(() => {
      m.removeFromParent();
      m.geometry.dispose();
      mat.dispose();
    });
  }

  /** 一道光束（打圣所用） */
  private beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color): void {
    const len = from.distanceTo(to);
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, len, 8, 1, true), mat);
    m.position.lerpVectors(from, to, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(m);
    void this.tween(0.3, (k) => {
      mat.opacity = 1 - k;
      m.scale.x = m.scale.z = 1 + k * 1.5;
    }).then(() => {
      m.removeFromParent();
      m.geometry.dispose();
      mat.dispose();
    });
  }

  private async projectile(from: THREE.Vector3, to: THREE.Vector3, color: number | THREE.Color, dur = 0.28, arc = 1.2): Promise<void> {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 3.2) });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat);
    this.scene.add(m);
    let trail = 0;
    await this.tween(dur, (k) => {
      m.position.lerpVectors(from, to, k);
      m.position.y += Math.sin(k * Math.PI) * arc;
      if (k > trail) {
        trail = k + 0.06;
        this.burst(m.position, color, 2, 0.8, 0);
      }
    }, easeIn);
    m.removeFromParent();
    m.geometry.dispose();
    mat.dispose();
  }

  private popup(world: THREE.Vector3, text: string, cls: string): void {
    const { x, y } = this.project(world);
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.labels.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private chest(a: Actor): THREE.Vector3 {
    return a.holder.position.clone().add(new THREE.Vector3(0, a.rig.height * 0.6, 0));
  }

  private sanctumCore(player: PlayerId): THREE.Vector3 {
    return new THREE.Vector3(0, 2.2 * SANCTUM_SCALE[player], sideSign(player) * SANCTUM_Z[player]);
  }

  // ———————————————————— 对外：演出 ————————————————————

  /** 出牌：卡牌飞入战场 → 拍在战线上成为召唤阵 → 角色从卡面里升起 */
  async summon(player: PlayerId, lane: number, uid: number, card: CardDef): Promise<void> {
    const actor = new Actor(uid, player, lane, card);
    this.actors.set(uid, actor);
    actor.label.addEventListener('mouseenter', () => this.onUnitHover(uid));
    actor.label.addEventListener('mouseleave', () => this.onUnitHover(null));
    actor.label.style.opacity = '0';
    const home = actor.home();
    const color = actor.rig.color;
    const angel = card.faction === 'angel';

    // 1. 卡牌从手牌方向（对手则从远处）飞到战线上空，边飞边翻转
    const c3 = actor.card3d.group;
    this.scene.add(c3);
    const from = player === 0 ? new THREE.Vector3(home.x * 0.35, 6.2, 11.5) : new THREE.Vector3(home.x * 1.3, 8, -13);
    const above = home.clone().setY(3.3);
    const tilt = -0.75;
    await this.tween(0.42, (k) => {
      c3.position.lerpVectors(from, above, k);
      c3.position.y += Math.sin(k * Math.PI) * 1.6;
      c3.rotation.set(tilt, (1 - k) * Math.PI * 2, 0);
      c3.scale.setScalar(0.45 + k * 0.75);
    }, easeOut);
    await this.wait(0.1);
    // 2. 拍到地面
    await this.tween(0.15, (k) => {
      c3.position.y = 3.3 + (0.085 - 3.3) * k;
      c3.rotation.x = tilt + (-Math.PI / 2 - tilt) * k;
      c3.scale.setScalar(1.2 - 0.2 * k);
    }, easeIn);
    c3.position.set(home.x, 0.085, home.z);
    c3.rotation.set(-Math.PI / 2, 0, 0);
    this.ring(home, color.getHex(), 3, 0.55);
    this.flashAt(home.clone().setY(0.5), color, 2.2);
    this.burst(home.clone().setY(0.2), color, 22, 5);
    this.camShake = Math.max(this.camShake, 0.3 + card.cost * 0.08);
    this.punch = Math.max(this.punch, 0.35);

    // 3. 角色从卡面里升起：天使伴着光柱，恶魔伴着向上的火星
    this.scene.add(actor.holder);
    this.labels.appendChild(actor.label);
    if (angel) this.pillar(home, color.getHex());
    else this.burst(home.clone().setY(0.1), 0xff5a1a, 26, 3.2, -6);
    actor.doFlash(angel ? 0xfff2b0 : 0xff5522);
    // 卡面同时化成光散掉，原地留下一圈召唤阵
    this.scene.add(actor.sigil.mesh);
    const c3d = actor.card3d;
    await this.tween(0.5, (k) => {
      actor.holder.scale.set(0.5 + 0.5 * k, Math.max(0.01, k), 0.5 + 0.5 * k);
      const f = Math.min(1, k * 1.6);
      c3d.setOpacity(1 - f);
      c3.position.y = 0.085 + f * 0.35;
      c3.scale.setScalar(1 + f * 0.3);
      actor.sigil.mat.uniforms.uOpacity.value = f;
    }, easeOutBack);
    c3.removeFromParent();
    actor.sigil.mat.uniforms.uOpacity.value = 1;
    actor.holder.scale.setScalar(1);
    actor.label.style.opacity = '1';
    await this.wait(0.1);
  }

  /** 攻击动作：蓄力 → 冲刺，在命中瞬间 resolve；收招在后台播完 */
  async attack(uid: number, targetUid: number | null): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    const home = a.home();
    const dir = -sideSign(a.player);
    const target = targetUid !== null ? this.actors.get(targetUid) : null;
    const reach = target ? target.home().add(new THREE.Vector3(0, 0, -dir * 1.25)) : home.clone().add(new THREE.Vector3(0, 0, dir * 1.9));
    const back = home.clone().add(new THREE.Vector3(0, 0, -dir * 0.55));
    a.doFlash(a.rig.color.getHex());
    await this.tween(0.16, (k) => {
      a.holder.position.lerpVectors(home, back, k);
      a.holder.scale.set(1 + k * 0.08, 1 - k * 0.1, 1 + k * 0.08);
    }, easeOut);
    await this.tween(0.13, (k) => {
      a.holder.position.lerpVectors(back, reach, k);
      a.holder.position.y = Math.sin(k * Math.PI) * 0.5;
      a.holder.rotation.x = dir * k * 0.3 * (a.player === 0 ? -1 : 1);
      a.holder.scale.set(1 - k * 0.05, 1 + k * 0.08, 1 + k * 0.1);
    }, easeIn);
    a.holder.scale.setScalar(1);
    if (target) {
      const hit = this.chest(target);
      this.slash(hit, a.rig.color, dir);
      this.flashAt(hit, a.rig.color, 1.5);
      this.burst(hit, 0xffffff, 12, 4.5);
      this.punch = Math.max(this.punch, 0.6);
      this.camShake = Math.max(this.camShake, 0.35);
    } else {
      // 对面没人：朝圣所轰出一道光束
      const core = this.sanctumCore(a.player === 0 ? 1 : 0);
      this.beam(this.chest(a), core, a.rig.color);
      this.flashAt(core, a.rig.color, 2.4);
      await this.wait(0.08);
    }
    void this.tween(0.3, (k) => {
      if (a.dead) return;
      a.holder.position.lerpVectors(reach, home, k);
      a.holder.rotation.x *= 1 - k;
    }).then(() => {
      if (!a.dead) a.holder.position.copy(home);
      a.holder.rotation.x = 0;
    });
  }

  async strike(fromUid: number, targetUid: number): Promise<void> {
    const from = this.actors.get(fromUid);
    const to = this.actors.get(targetUid);
    if (!from || !to) return;
    await this.projectile(this.chest(from), this.chest(to), from.rig.color, 0.3, 1.8);
    this.flashAt(this.chest(to), from.rig.color, 1.6);
    this.punch = Math.max(this.punch, 0.4);
  }

  async hurt(uid: number, amount: number): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    a.doFlash(0xff2222);
    a.shake = 1;
    a.hp = Math.max(0, a.hp - amount);
    const hpEl = a.label.querySelector('.hp b');
    if (hpEl) hpEl.textContent = String(a.hp);
    this.burst(this.chest(a), 0xff5544, 10, 3.5);
    this.popup(this.chest(a).add(new THREE.Vector3(0, 0.8, 0)), `-${amount}`, 'dmg');
    await this.wait(0.24);
  }

  async healUnit(uid: number, amount: number): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    a.doFlash(0x66ff99);
    this.burst(a.holder.position.clone().setY(0.4), 0x7dffb0, 12, 2.2, -3);
    this.ring(a.home(), 0x7dffb0, 1.6, 0.5);
    this.popup(this.chest(a).add(new THREE.Vector3(0, 0.8, 0)), `+${amount}`, 'heal');
    await this.wait(0.2);
  }

  async kill(uid: number): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    a.dead = true;
    a.label.remove();
    a.doFlash(0xffffff);
    const pos = a.home();
    this.burst(pos.clone().setY(1), a.rig.color, 34, 5.5);
    this.flashAt(pos.clone().setY(1), a.rig.color, 2);
    this.ring(pos, a.rig.color.getHex(), 2.8, 0.5);
    this.camShake = Math.max(this.camShake, 0.4);
    await this.tween(0.5, (k) => {
      a.holder.scale.setScalar(Math.max(0.001, 1 - k));
      a.holder.position.y = a.card.faction === 'angel' ? k * 2.6 : -k * 1.2;
      a.holder.rotation.y += 0.3;
      // 脚下的召唤阵扩散并熄灭
      a.sigil.mat.uniforms.uOpacity.value = 1 - k;
      a.sigil.mesh.scale.setScalar(1 + k * 0.4);
    }, easeIn);
    this.actors.delete(uid);
    a.dispose();
  }

  async hitSanctum(player: PlayerId, amount: number, source: 'attack' | 'pierce' | 'burn'): Promise<void> {
    const s = this.sanctums[player];
    const core = this.sanctumCore(player);
    if (source === 'burn') {
      const from = this.sanctumCore(player === 0 ? 1 : 0);
      await this.projectile(from, core, 0xff7a2a, 0.4, 3.5);
      this.flashAt(core, 0xff7a2a, 2.2);
    }
    s.pulseColor.set(0xff2222);
    s.pulse = 1;
    this.camShake = Math.min(1.3, 0.4 + amount * 0.13);
    this.punch = Math.max(this.punch, Math.min(1, 0.4 + amount * 0.08));
    this.burst(core, source === 'burn' ? 0xff7a2a : 0xffffff, 14 + amount * 3, 5.5);
    this.ring(core.clone(), 0xff4433, 2.6, 0.45);
    this.popup(core.clone().add(new THREE.Vector3(0, 1.6, 0)), `-${amount}`, 'dmg big');
    await this.wait(0.3);
  }

  async healSanctum(player: PlayerId, amount: number): Promise<void> {
    const s = this.sanctums[player];
    const core = this.sanctumCore(player);
    s.pulseColor.set(0x66ff99);
    s.pulse = 1;
    this.burst(core.clone().setY(0.8), 0x7dffb0, 14, 2.4, -3);
    this.popup(core.clone().add(new THREE.Vector3(0, 1.6, 0)), `+${amount}`, 'heal big');
    await this.wait(0.2);
  }

  /** 落败一方的圣所碎裂 */
  async shatter(player: PlayerId): Promise<void> {
    const s = this.sanctums[player];
    const core = this.sanctumCore(player);
    for (let i = 0; i < 4; i++) {
      this.camShake = 1.5;
      this.punch = 1;
      this.burst(core, i % 2 ? 0xffffff : s.base, 36, 8);
      this.flashAt(core, s.base, 3 + i);
      this.ring(core, s.base.getHex(), 5 + i, 0.7);
      await this.wait(0.16);
    }
    await this.tween(0.4, (k) => s.group.scale.setScalar(SANCTUM_SCALE[player] * (1 - k * 0.999)), easeIn);
    s.group.visible = false;
  }

  /** 羁绊触发时，己方全体身上闪一下并升起光环 */
  bondFlash(player: PlayerId, color: number): void {
    for (const a of this.actors.values()) {
      if (a.player !== player || a.dead) continue;
      a.doFlash(color);
      this.ring(a.home(), color, 1.8, 0.7);
      this.burst(a.home().setY(0.2), color, 8, 2.4, -4);
    }
    this.punch = Math.max(this.punch, 0.3);
  }

  // ———————————————————— 对外：状态 ————————————————————

  setStats(units: Record<number, UnitStats>): void {
    for (const a of this.actors.values()) {
      const s = units[a.uid];
      if (!s || a.dead) continue;
      a.hp = s.hp;
      const kw = s.keywords.map((k) => `<i class="kw ${s.bonus.keywords.includes(k) ? 'buff' : ''}">${KEYWORD_INFO[k].name}</i>`).join('');
      a.label.innerHTML =
        `<span class="atk ${s.bonus.atk > 0 ? 'buff' : ''}">⚔<b>${s.atk}</b></span>` +
        `<span class="hp ${s.hp < s.maxHp ? 'hurt' : s.bonus.hp > 0 ? 'buff' : ''}">♥<b>${s.hp}</b></span>` +
        (s.armor > 0 ? `<span class="armor ${s.bonus.armor > 0 ? 'buff' : ''}">⛨<b>${s.armor}</b></span>` : '') +
        (kw ? `<span class="kws">${kw}</span>` : '');
    }
  }

  setSelectable(lanes: number[]): void {
    this.selectable = new Set(lanes);
    if (!lanes.length) this.renderer.domElement.style.cursor = 'default';
  }

  actorCard(uid: number): CardDef | null {
    return this.actors.get(uid)?.card ?? null;
  }
}
