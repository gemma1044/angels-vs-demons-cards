// 程序化 3D 角色：全部用基础几何体拼出来，不依赖外部模型。
// 角色默认面朝 +Z，脚底在 y=0。每个主题一套造型语言，卡牌的 ModelSpec 再做体型/翅膀/武器的变化。

import * as THREE from 'three';
import { instantiateModel } from './models';
import { THEME_INFO, type CardDef, type ModelSpec, type Theme } from '../game/cards';

export interface CharacterRig {
  root: THREE.Group;
  /** 翅膀枢轴：userData.side = ±1，userData.base = 初始 rotation.y */
  wings: THREE.Object3D[];
  /** 需要缓慢自转的部件（光环、数据环、锯片） */
  spinners: THREE.Object3D[];
  height: number;
  floating: boolean;
  color: THREE.Color;
}

type Mat = THREE.MeshStandardMaterial;

const std = (color: number | string, o: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...o });
const glow = (color: number | string, intensity = 1.6): Mat =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity * 0.6, roughness: 0.4 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ———————————————————— 翅膀 ————————————————————

type WingKind = 'feather' | 'crane' | 'bat' | 'ragged';

/** 翅膀轮廓（xy 平面，向 +x 伸展，根部在原点） */
function wingShape(kind: WingKind): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.12);
  if (kind === 'feather' || kind === 'crane') {
    s.quadraticCurveTo(0.55, 0.75, 1.25, 0.8);
    // 羽尖一层层收回来
    const tips: [number, number][] = [[1.05, 0.38], [0.86, 0.08], [0.66, -0.16], [0.44, -0.32], [0.22, -0.4]];
    let px = 1.25;
    let py = 0.8;
    for (const [x, y] of tips) {
      s.quadraticCurveTo((px + x) / 2 + 0.1, (py + y) / 2 - 0.08, x, y);
      px = x;
      py = y;
    }
    s.quadraticCurveTo(0.05, -0.3, 0, -0.18);
  } else {
    // 蝠翼：骨架尖 + 内凹的膜
    s.quadraticCurveTo(0.4, 0.85, 1.2, 0.95);
    const pts: [number, number][] = kind === 'bat'
      ? [[0.95, 0.3], [0.7, -0.05], [0.4, -0.3]]
      : [[1.0, 0.45], [0.82, 0.05], [0.6, 0.1], [0.5, -0.3], [0.3, -0.1]];
    let px = 1.2;
    let py = 0.95;
    for (const [x, y] of pts) {
      s.quadraticCurveTo((px + x) / 2 - 0.1, (py + y) / 2 + 0.16, x, y);
      px = x;
      py = y;
    }
    s.quadraticCurveTo(0.12, -0.05, 0, -0.2);
  }
  s.closePath();
  return s;
}

const wingGeoCache = new Map<string, THREE.BufferGeometry>();
function wingGeo(kind: WingKind): THREE.BufferGeometry {
  let g = wingGeoCache.get(kind);
  if (!g) {
    g = new THREE.ExtrudeGeometry(wingShape(kind), { depth: 0.035, bevelEnabled: false, curveSegments: 5 });
    wingGeoCache.set(kind, g);
  }
  return g;
}

interface WingStyle {
  kind: WingKind | 'panel' | 'scrap';
  main: Mat;
  accent: Mat;
}

/** 生成一侧翅膀的造型（向 +x 伸展） */
function wingMesh(style: WingStyle): THREE.Object3D {
  const g = new THREE.Group();
  if (style.kind === 'panel') {
    // 机械翼板：三片菱形刃 + 发光边
    for (let i = 0; i < 3; i++) {
      const len = 1.15 - i * 0.24;
      const blade = mesh(new THREE.BoxGeometry(len, 0.17, 0.04), style.main, len / 2 + 0.12, 0, 0);
      const edge = mesh(new THREE.BoxGeometry(len * 0.95, 0.07, 0.06), style.accent, len / 2 + 0.14, -0.1, 0);
      const holder = new THREE.Group();
      holder.add(blade, edge);
      holder.rotation.z = 0.62 - i * 0.48;
      g.add(holder);
    }
    g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), style.accent));
  } else if (style.kind === 'scrap') {
    // 废铁翼：几块歪斜的铁板
    const plates: [number, number, number, number, number][] = [
      [0.42, 0.42, 0.55, 0.3, 0.5], [0.85, 0.5, 0.5, 0.26, 0.2], [0.7, 0.05, 0.6, 0.24, -0.25], [0.3, -0.12, 0.4, 0.22, -0.6],
    ];
    plates.forEach(([x, y, w, h, r], i) => {
      const plate = mesh(new THREE.BoxGeometry(w, h, 0.05), i % 2 ? style.accent : style.main, x, y, 0);
      plate.rotation.z = r;
      g.add(plate);
    });
    const strut = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), style.accent, 0.5, 0.3, -0.03);
    strut.rotation.z = -1.0;
    g.add(strut);
  } else {
    g.add(mesh(wingGeo(style.kind), style.main));
    if (style.kind === 'crane') {
      // 鹤羽：外缘压一层墨色
      const tip = mesh(wingGeo('feather'), style.accent, 0.42, 0.14, -0.02);
      tip.scale.set(0.7, 0.72, 1);
      g.add(tip);
    } else if (style.kind === 'feather') {
      const inner = mesh(wingGeo('feather'), style.accent, 0.02, 0.02, 0.03);
      inner.scale.set(0.62, 0.62, 1);
      g.add(inner);
    } else {
      // 蝠翼骨架
      const bone = mesh(new THREE.CylinderGeometry(0.022, 0.035, 1.5, 5), style.accent, 0.6, 0.56, 0.02);
      bone.rotation.z = -0.92;
      g.add(bone);
    }
  }
  return g;
}

function addWings(rig: CharacterRig, parent: THREE.Object3D, pairs: number, style: WingStyle, y: number, z: number, size = 1): void {
  const layout = [
    { rz: 0.28, s: 1.0, dy: 0 },
    { rz: -0.3, s: 0.8, dy: -0.12 },
    { rz: -0.85, s: 0.62, dy: -0.26 },
  ];
  for (let i = 0; i < pairs; i++) {
    const l = layout[i];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, y + l.dy, z - i * 0.04);
      const w = wingMesh(style);
      w.rotation.z = l.rz;
      w.scale.setScalar(l.s * size);
      const flip = new THREE.Group();
      flip.scale.x = side;
      flip.add(w);
      pivot.add(flip);
      pivot.rotation.y = -side * 0.5;
      pivot.userData = { side, base: pivot.rotation.y, phase: i * 0.6 };
      rig.wings.push(pivot);
      parent.add(pivot);
    }
  }
}

// ———————————————————— 通用部件 ————————————————————

function horn(mat: Mat, length: number, radius: number, curve: number): THREE.Group {
  // 两段圆锥拼出弯角
  const g = new THREE.Group();
  const a = mesh(new THREE.CylinderGeometry(radius * 0.6, radius, length * 0.55, 6), mat, 0, length * 0.27, 0);
  const tipHolder = new THREE.Group();
  tipHolder.position.y = length * 0.52;
  tipHolder.rotation.z = curve;
  tipHolder.add(mesh(new THREE.ConeGeometry(radius * 0.6, length * 0.6, 6), mat, 0, length * 0.28, 0));
  g.add(a, tipHolder);
  return g;
}

function addHorns(parent: THREE.Object3D, mat: Mat, y: number, spread: number, length: number, radius: number, curve: number): void {
  for (const side of [1, -1]) {
    const h = horn(mat, length, radius, curve);
    h.position.set(side * spread, y, 0);
    h.rotation.z = -side * 0.55;
    h.scale.x = side;
    parent.add(h);
  }
}

function addTail(parent: THREE.Object3D, mat: Mat, tipMat: Mat, y: number): void {
  const pts = [new THREE.Vector3(0, y, -0.15), new THREE.Vector3(0, y - 0.25, -0.55), new THREE.Vector3(0, y - 0.1, -0.9), new THREE.Vector3(0, y + 0.25, -1.0)];
  const curve = new THREE.CatmullRomCurve3(pts);
  parent.add(mesh(new THREE.TubeGeometry(curve, 10, 0.04, 5), mat));
  const tip = mesh(new THREE.ConeGeometry(0.09, 0.2, 4), tipMat, 0, y + 0.33, -1.0);
  parent.add(tip);
}

function addWeapon(rig: CharacterRig, parent: THREE.Object3D, spec: ModelSpec, main: Mat, accent: Mat, handY: number, reach: number): void {
  const hand = new THREE.Group();
  hand.position.set(reach, handY, 0.12);
  switch (spec.weapon) {
    case 'staff': {
      hand.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), main, 0, 0.25, 0));
      hand.add(mesh(new THREE.OctahedronGeometry(0.13), accent, 0, 1.08, 0));
      break;
    }
    case 'candle': {
      hand.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), main, 0, 0.1, 0));
      hand.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 6), accent, 0, 0.56, 0));
      break;
    }
    case 'lance': {
      const lance = mesh(new THREE.ConeGeometry(0.09, 2.0, 6), accent, 0, 0.2, 0.5);
      lance.rotation.x = Math.PI / 2 - 0.2;
      hand.add(lance, mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), main, 0, 0.02, -0.2));
      break;
    }
    case 'sword': {
      const blade = mesh(new THREE.BoxGeometry(0.07, 1.1, 0.025), accent, 0, 0.55, 0);
      hand.add(blade, mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), main, 0, 0, 0));
      hand.rotation.x = 0.5;
      break;
    }
    case 'shield': {
      hand.position.set(-reach * 0.75, handY - 0.1, 0.34);
      const disc = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 10), main);
      disc.rotation.x = Math.PI / 2;
      const boss = mesh(new THREE.SphereGeometry(0.13, 8, 6), accent, 0, 0, 0.05);
      hand.add(disc, boss);
      break;
    }
    case 'lute': {
      const body = mesh(new THREE.SphereGeometry(0.2, 8, 6), main, 0, 0, 0.1);
      body.scale.set(1, 1.3, 0.45);
      const neck = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.04), accent, 0, 0.5, 0.1);
      hand.add(body, neck);
      hand.position.x = 0;
      hand.position.z = 0.3;
      hand.rotation.z = -0.6;
      break;
    }
    case 'fan': {
      const fan = mesh(new THREE.CircleGeometry(0.34, 8, 0, Math.PI), main);
      (fan.material as Mat).side = THREE.DoubleSide;
      hand.add(fan, mesh(new THREE.BoxGeometry(0.5, 0.03, 0.02), accent, 0, 0.02, 0));
      break;
    }
    case 'saw': {
      const arm = mesh(new THREE.BoxGeometry(0.14, 0.14, 0.7), main, 0, 0, 0.3);
      const blade = new THREE.Group();
      blade.position.set(0, 0, 0.75);
      const disc = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12), accent);
      disc.rotation.z = Math.PI / 2;
      blade.add(disc);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const tooth = mesh(new THREE.ConeGeometry(0.05, 0.12, 4), accent, 0, Math.cos(a) * 0.33, Math.sin(a) * 0.33);
        tooth.rotation.x = a;
        blade.add(tooth);
      }
      blade.userData.spin = new THREE.Vector3(6, 0, 0);
      rig.spinners.push(blade);
      hand.add(arm, blade);
      break;
    }
    case 'claws': {
      for (const side of [1, -1]) {
        for (let i = -1; i <= 1; i++) {
          const c = mesh(new THREE.ConeGeometry(0.035, 0.22, 4), accent, side * reach + i * 0.06, handY - 0.14, 0.2);
          c.rotation.x = Math.PI * 0.8;
          parent.add(c);
        }
      }
      return;
    }
    default:
      return;
  }
  parent.add(hand);
}

function addCrown(parent: THREE.Object3D, mat: Mat, y: number, r: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parent.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat, Math.cos(a) * r, y, Math.sin(a) * r));
  }
}

/** 人形骨架：长袍（或双腿）+ 躯干 + 头 + 双臂。返回关键高度，方便挂配件。 */
function humanoid(
  parent: THREE.Object3D,
  o: { robe: Mat | null; torso: Mat; skin: Mat; limb: Mat; bulky?: boolean; slim?: boolean; boxy?: boolean },
): { shoulderY: number; headY: number; reach: number } {
  const w = o.bulky ? 1.4 : o.slim ? 0.85 : 1;
  const legH = 0.95;
  if (o.robe) {
    parent.add(mesh(new THREE.CylinderGeometry(0.2 * w, 0.46 * w, legH, 8), o.robe, 0, legH / 2, 0));
  } else {
    for (const side of [1, -1]) {
      const leg = o.boxy
        ? mesh(new THREE.BoxGeometry(0.2 * w, legH, 0.24 * w), o.limb, side * 0.17 * w, legH / 2, 0)
        : mesh(new THREE.CylinderGeometry(0.11 * w, 0.14 * w, legH, 6), o.limb, side * 0.16 * w, legH / 2, 0);
      parent.add(leg);
    }
  }
  const torsoH = 0.62;
  const torsoY = legH + torsoH / 2 - 0.05;
  parent.add(
    o.boxy
      ? mesh(new THREE.BoxGeometry(0.62 * w, torsoH, 0.4 * w), o.torso, 0, torsoY, 0)
      : mesh(new THREE.CylinderGeometry(0.27 * w, 0.2 * w, torsoH, 8), o.torso, 0, torsoY, 0),
  );
  const shoulderY = legH + torsoH - 0.12;
  const reach = 0.36 * w;
  for (const side of [1, -1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.065 * w, 0.055 * w, 0.62, 6), o.limb, side * reach, shoulderY - 0.26, 0.04);
    arm.rotation.z = side * 0.18;
    parent.add(arm);
    if (o.bulky) parent.add(mesh(new THREE.IcosahedronGeometry(0.17, 0), o.torso, side * reach, shoulderY + 0.03, 0));
  }
  const headY = legH + torsoH + 0.2;
  parent.add(mesh(new THREE.IcosahedronGeometry(0.21, 1), o.skin, 0, headY, 0));
  return { shoulderY, headY, reach };
}

// ———————————————————— 六个主题 ————————————————————

type Builder = (rig: CharacterRig, body: THREE.Group, spec: ModelSpec) => void;

/** 圣像：金袍、白羽、金色光环 */
const buildIcon: Builder = (rig, body, spec) => {
  const gold = std(0xd9a441, { metalness: 0.5, roughness: 0.4 });
  const ivory = std(0xfff3d6);
  const skin = std(0xf3d2ab);
  const shine = glow(0xffd95a, 1.8);
  const { shoulderY, headY, reach } = humanoid(body, { robe: gold, torso: ivory, skin, limb: ivory, bulky: spec.bulky });
  // 披肩与腰带
  body.add(mesh(new THREE.TorusGeometry(0.25, 0.05, 6, 12), gold, 0, shoulderY + 0.06, 0).rotateX(Math.PI / 2));
  body.add(mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 12), shine, 0, 0.98, 0).rotateX(Math.PI / 2));
  // 头发
  const hair = mesh(new THREE.SphereGeometry(0.225, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0xa9742c), 0, headY + 0.02, -0.02);
  body.add(hair);
  // 光环
  const halo = mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 20), shine, 0, headY + 0.36, 0);
  halo.rotation.x = Math.PI / 2;
  halo.userData.spin = new THREE.Vector3(0, 0, 0.8);
  rig.spinners.push(halo);
  body.add(halo);
  if (spec.wingPairs >= 3) {
    const big = mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 24), shine, 0, headY + 0.1, -0.2);
    body.add(big);
  }
  addWings(rig, body, spec.wingPairs, { kind: 'feather', main: std(0xffffff, { side: THREE.DoubleSide }), accent: std(0xffe6a8, { side: THREE.DoubleSide }) }, shoulderY, -0.2);
  if (spec.weapon === 'crown') addCrown(body, shine, headY + 0.24, 0.17);
  else addWeapon(rig, body, spec, gold, shine, shoulderY - 0.5, reach + 0.05);
};

/** 机枢：白瓷装甲、青色发光、翼板、六边形光环、悬浮推进器 */
const buildMech: Builder = (rig, body, spec) => {
  const shell = std(0xd4e6f5, { metalness: 0.35, roughness: 0.3 });
  const dark = std(0x2b3a4a, { metalness: 0.6, roughness: 0.4 });
  const neon = glow(0x4cc9f0, 2.2);
  const w = spec.bulky ? 1.3 : 1;
  // 下半身：倒锥推进器，悬浮
  body.add(mesh(new THREE.ConeGeometry(0.26 * w, 0.75, 6), shell, 0, 0.72, 0).rotateX(Math.PI));
  body.add(mesh(new THREE.ConeGeometry(0.12 * w, 0.3, 6), neon, 0, 0.3, 0).rotateX(Math.PI));
  // 躯干
  body.add(mesh(new THREE.BoxGeometry(0.6 * w, 0.55, 0.38 * w), shell, 0, 1.36, 0));
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), neon, 0, 1.4, 0.2 * w));
  body.add(mesh(new THREE.BoxGeometry(0.72 * w, 0.12, 0.3 * w), dark, 0, 1.08, 0));
  const shoulderY = 1.56;
  const reach = 0.42 * w;
  for (const side of [1, -1]) {
    body.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.26), shell, side * reach, shoulderY, 0));
    body.add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.12), dark, side * reach, shoulderY - 0.38, 0.03));
  }
  // 头盔 + 目镜
  const headY = 1.86;
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.32), shell, 0, headY, 0));
  body.add(mesh(new THREE.BoxGeometry(0.32, 0.06, 0.1), neon, 0, headY + 0.02, 0.13));
  // 六边形光环（竖在脑后）
  const rings = spec.wingPairs >= 2 ? 3 : 1;
  for (let i = 0; i < rings; i++) {
    const halo = mesh(new THREE.TorusGeometry(0.32 + i * 0.13, 0.022, 4, 6), neon, 0, headY + 0.08, -0.22 - i * 0.03);
    halo.userData.spin = new THREE.Vector3(0, 0, (i % 2 ? -1 : 1) * 0.7);
    rig.spinners.push(halo);
    body.add(halo);
  }
  addWings(rig, body, spec.wingPairs, { kind: 'panel', main: shell, accent: neon }, shoulderY - 0.05, -0.24);
  addWeapon(rig, body, spec, shell, neon, shoulderY - 0.62, reach + 0.02);
};

/** 机枢无人机：没有人形，只有核心、翼板和光环 */
const buildDrone: Builder = (rig, body, spec) => {
  const shell = std(0xeef4f8, { metalness: 0.35, roughness: 0.3 });
  const neon = glow(0x4cc9f0, 2.2);
  const core = mesh(new THREE.OctahedronGeometry(0.34, 0), shell, 0, 1.2, 0);
  core.scale.set(0.8, 1, 1.5);
  body.add(core, mesh(new THREE.SphereGeometry(0.13, 8, 6), neon, 0, 1.2, 0.36));
  body.add(mesh(new THREE.ConeGeometry(0.08, 0.3, 5), neon, 0, 0.82, 0).rotateX(Math.PI));
  const halo = mesh(new THREE.TorusGeometry(0.3, 0.022, 4, 6), neon, 0, 1.72, 0);
  halo.rotation.x = Math.PI / 2;
  halo.userData.spin = new THREE.Vector3(0, 0, 1.5);
  rig.spinners.push(halo);
  body.add(halo);
  addWings(rig, body, spec.wingPairs, { kind: 'panel', main: shell, accent: neon }, 1.25, -0.1);
};

/** 云篆：白衣玉带、鹤羽、飘带与脚下云团 */
const buildInk: Builder = (rig, body, spec) => {
  const white = std(0xf6fbf8);
  const jade = std(0x5fbf9a);
  const ink = std(0x1c2326);
  const skin = std(0xf6e0cc);
  const jadeGlow = glow(0x9af0cc, 1.3);
  const { shoulderY, headY, reach } = humanoid(body, { robe: white, torso: white, skin, limb: white, slim: true });
  // 玉带与衣襟
  body.add(mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 12), jade, 0, 0.98, 0).rotateX(Math.PI / 2));
  body.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.05), jade, 0, 0.72, 0.3).rotateX(-0.28));
  // 宽袖
  for (const side of [1, -1]) {
    const sleeve = mesh(new THREE.ConeGeometry(0.17, 0.5, 6), white, side * (reach + 0.04), shoulderY - 0.42, 0.04);
    sleeve.rotation.z = side * 0.2;
    body.add(sleeve);
  }
  // 发髻
  body.add(mesh(new THREE.SphereGeometry(0.225, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), ink, 0, headY + 0.02, -0.03));
  body.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), ink, 0, headY + 0.27, -0.05));
  body.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), jadeGlow, 0, headY + 0.27, -0.05).rotateZ(Math.PI / 2));
  // 脑后玉环
  const ring = mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 24), jadeGlow, 0, headY + 0.02, -0.2);
  body.add(ring);
  // 飘带：绕身的大环
  const ribbon = mesh(new THREE.TorusGeometry(0.62, 0.025, 4, 28, Math.PI * 1.5), std(0x8fd3b6, { side: THREE.DoubleSide }), 0, shoulderY - 0.1, -0.1);
  ribbon.rotation.set(1.2, 0, 0.4);
  ribbon.scale.z = 3;
  ribbon.userData.spin = new THREE.Vector3(0, 0, 0.5);
  rig.spinners.push(ribbon);
  body.add(ribbon);
  // 脚下云团
  const cloud = std(0xffffff, { transparent: true, opacity: 0.9 });
  for (const [x, z, r] of [[-0.3, 0.1, 0.26], [0.28, 0.14, 0.24], [0, -0.22, 0.3], [0.05, 0.3, 0.2]] as const) {
    const puff = mesh(new THREE.SphereGeometry(r, 7, 5), cloud, x, 0.05, z);
    puff.scale.y = 0.6;
    body.add(puff);
  }
  addWings(rig, body, spec.wingPairs, { kind: 'crane', main: std(0xffffff, { side: THREE.DoubleSide }), accent: std(0x1c2326, { side: THREE.DoubleSide }) }, shoulderY, -0.18);
  addWeapon(rig, body, spec, white, spec.weapon === 'sword' ? jadeGlow : jade, shoulderY - 0.5, reach + 0.06);
};

function lavaMats() {
  return { rock: std(0x2a1a17, { roughness: 0.95 }), ember: glow(0xff6b1a, 2.4), hot: glow(0xffc04a, 2.6) };
}

/** 熔渊：黑曜石身体、熔岩裂缝、粗角、岩浆蝠翼 */
const buildLava: Builder = (rig, body, spec) => {
  const { rock, ember, hot } = lavaMats();
  const w = spec.bulky ? 1.35 : 1;
  for (const side of [1, -1]) body.add(mesh(new THREE.CylinderGeometry(0.15 * w, 0.2 * w, 0.7, 5), rock, side * 0.2 * w, 0.35, 0));
  const torso = mesh(new THREE.IcosahedronGeometry(0.46 * w, 0), rock, 0, 1.08, 0);
  torso.scale.y = 1.15;
  body.add(torso);
  // 胸口熔核与裂缝
  body.add(mesh(new THREE.IcosahedronGeometry(0.17 * w, 0), hot, 0, 1.1, 0.34 * w));
  for (const [x, y, r] of [[-0.2, 1.32, 0.5], [0.22, 0.9, -0.6], [0.05, 0.78, 0.2]] as const) {
    const crack = mesh(new THREE.BoxGeometry(0.3 * w, 0.04, 0.04), ember, x * w, y, 0.38 * w);
    crack.rotation.z = r;
    body.add(crack);
  }
  const shoulderY = 1.42;
  const reach = 0.52 * w;
  for (const side of [1, -1]) {
    body.add(mesh(new THREE.IcosahedronGeometry(0.2 * w, 0), rock, side * reach, shoulderY, 0));
    const arm = mesh(new THREE.CylinderGeometry(0.09 * w, 0.13 * w, 0.7, 5), rock, side * (reach + 0.06), shoulderY - 0.42, 0.06);
    body.add(arm);
    body.add(mesh(new THREE.IcosahedronGeometry(0.14 * w, 0), ember, side * (reach + 0.06), shoulderY - 0.82, 0.08));
  }
  const headY = 1.72;
  body.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), rock, 0, headY, 0.04));
  for (const side of [1, -1]) body.add(mesh(new THREE.SphereGeometry(0.04, 5, 4), hot, side * 0.09, headY + 0.03, 0.22));
  addHorns(body, ember, headY + 0.1, 0.14, spec.weapon === 'crown' ? 0.6 : 0.42, 0.075, 0.9);
  if (spec.weapon === 'crown') addCrown(body, hot, headY + 0.26, 0.15);
  addTail(body, rock, ember, 0.75);
  addWings(rig, body, spec.wingPairs, { kind: 'ragged', main: std(0xc2410c, { emissive: 0xff5a1a, emissiveIntensity: 0.7, side: THREE.DoubleSide }), accent: rock }, shoulderY, -0.3, 1.15);
};

/** 熔渊猎犬：四足 */
const buildBeast: Builder = (rig, body) => {
  const { rock, ember, hot } = lavaMats();
  const trunk = mesh(new THREE.IcosahedronGeometry(0.42, 0), rock, 0, 0.75, -0.1);
  trunk.scale.set(0.95, 0.9, 1.7);
  body.add(trunk);
  for (const [x, z] of [[0.26, 0.4], [-0.26, 0.4], [0.26, -0.55], [-0.26, -0.55]] as const) {
    body.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 5), rock, x, 0.3, z));
    body.add(mesh(new THREE.IcosahedronGeometry(0.09, 0), ember, x, 0.04, z + 0.05));
  }
  const head = mesh(new THREE.IcosahedronGeometry(0.26, 0), rock, 0, 1.0, 0.68);
  head.scale.z = 1.3;
  body.add(head, mesh(new THREE.BoxGeometry(0.26, 0.05, 0.3), hot, 0, 0.88, 0.85));
  for (const side of [1, -1]) body.add(mesh(new THREE.SphereGeometry(0.045, 5, 4), hot, side * 0.12, 1.08, 0.9));
  // 背脊熔岩刺
  for (let i = 0; i < 4; i++) body.add(mesh(new THREE.ConeGeometry(0.07, 0.3 - i * 0.03, 4), ember, 0, 1.2 - i * 0.03, 0.3 - i * 0.3));
  const horns = new THREE.Group();
  horns.position.set(0, 1.1, 0.6);
  addHorns(horns, ember, 0, 0.14, 0.36, 0.06, 0.9);
  body.add(horns);
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.6);
  addTail(tail, rock, hot, 0.6);
  body.add(tail);
};

/** 夜棘：修身黑裙、高领、细长弯角、蝠翼、绯红点缀 */
const buildGoth: Builder = (rig, body, spec) => {
  const black = std(0x1d1024, { roughness: 0.6 });
  const crimson = std(0xa3123f, { roughness: 0.5 });
  const pale = std(0xe9dfee);
  const blood = glow(0xff2e63, 1.5);
  const { shoulderY, headY, reach } = humanoid(body, { robe: black, torso: spec.bulky ? std(0x2e2436, { metalness: 0.6, roughness: 0.35 }) : crimson, skin: pale, limb: black, slim: !spec.bulky, bulky: spec.bulky });
  // 裙摆红边与荆棘
  body.add(mesh(new THREE.TorusGeometry(spec.bulky ? 0.62 : 0.38, 0.03, 5, 14), crimson, 0, 0.05, 0).rotateX(Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = spec.bulky ? 0.5 : 0.32;
    const thorn = mesh(new THREE.ConeGeometry(0.03, 0.16, 4), crimson, Math.cos(a) * r, 0.3, Math.sin(a) * r);
    thorn.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    body.add(thorn);
  }
  // 高领（立在脑后）
  const collar = mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.42, 8, 1, true, Math.PI * 0.5, Math.PI), std(0x3a0d24, { side: THREE.DoubleSide }), 0, shoulderY + 0.22, -0.02);
  body.add(collar);
  body.add(mesh(new THREE.OctahedronGeometry(0.06), blood, 0, shoulderY + 0.02, 0.24));
  // 长发
  body.add(mesh(new THREE.SphereGeometry(0.225, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), std(0x0d0712), 0, headY + 0.02, -0.03));
  for (const side of [1, -1]) body.add(mesh(new THREE.SphereGeometry(0.028, 5, 4), blood, side * 0.08, headY + 0.02, 0.19));
  addHorns(body, crimson, headY + 0.12, 0.12, 0.46, 0.04, 1.3);
  addTail(body, black, blood, 0.7);
  addWings(rig, body, spec.wingPairs, { kind: 'bat', main: std(0x5a1140, { side: THREE.DoubleSide }), accent: black }, shoulderY, -0.2, 1.05);
  addWeapon(rig, body, spec, spec.weapon === 'shield' ? black : crimson, spec.weapon === 'sword' ? std(0xdfe3ee, { metalness: 0.8, roughness: 0.2 }) : blood, shoulderY - 0.5, reach + 0.05);
};

function rustMats() {
  return {
    rust: std(0x8a4b2a, { metalness: 0.5, roughness: 0.8 }),
    iron: std(0x3d4043, { metalness: 0.7, roughness: 0.5 }),
    toxic: glow(0x9bff3d, 2.4),
  };
}

/** 蚀械：锈铁方块身体、不对称肩甲、排气管、毒绿独眼 */
const buildRust: Builder = (rig, body, spec) => {
  const { rust, iron, toxic } = rustMats();
  const w = spec.bulky ? 1.35 : 1;
  for (const side of [1, -1]) body.add(mesh(new THREE.BoxGeometry(0.2 * w, 0.8, 0.26 * w), iron, side * 0.2 * w, 0.4, 0));
  const torso = mesh(new THREE.BoxGeometry(0.72 * w, 0.72, 0.5 * w), rust, 0, 1.12, 0);
  torso.rotation.z = 0.05;
  body.add(torso);
  // 炉心
  body.add(mesh(new THREE.CylinderGeometry(0.15 * w, 0.15 * w, 0.06, 8), toxic, 0, 1.12, 0.26 * w).rotateX(Math.PI / 2));
  body.add(mesh(new THREE.TorusGeometry(0.17 * w, 0.03, 5, 10), iron, 0, 1.12, 0.27 * w));
  const shoulderY = 1.46;
  const reach = 0.48 * w;
  // 不对称：左肩大甲片，右肩小
  const plate = mesh(new THREE.BoxGeometry(0.4 * w, 0.14, 0.46 * w), iron, reach, shoulderY + 0.06, 0);
  plate.rotation.z = -0.3;
  body.add(plate, mesh(new THREE.BoxGeometry(0.2 * w, 0.12, 0.3 * w), rust, -reach, shoulderY, 0));
  for (const side of [1, -1]) body.add(mesh(new THREE.BoxGeometry(0.13 * w, 0.62, 0.15 * w), iron, side * reach, shoulderY - 0.42, 0.04));
  // 排气管（角的位置）
  for (const [x, h, r] of [[0.22, 0.6, -0.25], [-0.2, 0.42, 0.3], [0.05, 0.3, 0]] as const) {
    const pipe = mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 6), iron, x * w, shoulderY + 0.2 + h / 2, -0.2 * w);
    pipe.rotation.z = r;
    body.add(pipe);
  }
  const headY = 1.68;
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.24, 0.3), rust, 0.03, headY, 0.1));
  body.add(mesh(new THREE.SphereGeometry(0.075, 7, 5), toxic, 0.03, headY + 0.01, 0.26));
  for (const side of [1, -1]) {
    const antenna = mesh(new THREE.ConeGeometry(0.035, 0.36, 4), iron, 0.03 + side * 0.13, headY + 0.26, 0.05);
    antenna.rotation.z = -side * 0.5;
    body.add(antenna);
  }
  addWings(rig, body, spec.wingPairs, { kind: 'scrap', main: rust, accent: iron }, shoulderY - 0.05, -0.3 * w, 1.1);
  addWeapon(rig, body, spec, iron, spec.weapon === 'saw' ? std(0xb9bec4, { metalness: 0.9, roughness: 0.25 }) : toxic, shoulderY - 0.7, reach);
};

/** 蚀械螨群：三只小机械虫 */
const buildSwarm: Builder = (_rig, body) => {
  const { rust, iron, toxic } = rustMats();
  for (const [x, z, s, r] of [[-0.42, 0.1, 1, 0.3], [0.4, 0.25, 0.85, -0.4], [0.02, -0.4, 1.15, 0]] as const) {
    const bug = new THREE.Group();
    bug.position.set(x, 0, z);
    bug.rotation.y = r;
    bug.scale.setScalar(s);
    const shell = mesh(new THREE.IcosahedronGeometry(0.28, 0), rust, 0, 0.36, 0);
    shell.scale.set(1, 0.75, 1.25);
    bug.add(shell, mesh(new THREE.SphereGeometry(0.07, 6, 5), toxic, 0, 0.4, 0.33));
    for (const side of [1, -1]) {
      for (let i = -1; i <= 1; i++) {
        const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), iron, side * 0.3, 0.2, i * 0.2);
        leg.rotation.z = side * 0.9;
        bug.add(leg);
      }
      const fang = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), iron, side * 0.1, 0.3, 0.4);
      fang.rotation.x = Math.PI / 2;
      bug.add(fang);
      const antenna = mesh(new THREE.ConeGeometry(0.02, 0.3, 4), iron, side * 0.1, 0.68, 0.1);
      antenna.rotation.z = -side * 0.4;
      bug.add(antenna);
    }
    body.add(bug);
  }
};

const BUILDERS: Record<Theme, Builder> = { icon: buildIcon, mech: buildMech, ink: buildInk, lava: buildLava, goth: buildGoth, rust: buildRust };

export function buildCharacter(card: CardDef): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rig: CharacterRig = {
    root,
    wings: [],
    spinners: [],
    height: 2.1 * card.model.scale,
    floating: !!card.model.floating || card.theme === 'mech',
    color: new THREE.Color(THEME_INFO[card.theme].color),
  };
  // 有 Blender 模型的卡牌直接用模型
  const model = instantiateModel(card.id);
  if (model) {
    body.add(model.root);
    body.scale.setScalar(card.model.scale);
    rig.wings = model.wings;
    rig.spinners = model.spinners;
    rig.height = model.height * card.model.scale;
    return rig;
  }
  const form = card.model.form;
  const builder = form === 'drone' ? buildDrone : form === 'beast' ? buildBeast : form === 'swarm' ? buildSwarm : BUILDERS[card.theme];
  builder(rig, body, card.model);
  body.scale.setScalar(card.model.scale);
  if (form === 'beast' || form === 'swarm') rig.height = 1.3 * card.model.scale;
  return rig;
}
