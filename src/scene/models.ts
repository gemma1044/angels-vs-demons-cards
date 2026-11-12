// Blender 脚本生成的角色模型（public/models/*.glb）。有模型的卡牌用模型，没有的仍走 characters.ts 里的几何体拼装。
// 物体命名约定见 tools/blender/build.py：body / wing_R_* / wing_L_* / spin_x|y|z_*

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Loaded {
  scene: THREE.Group;
  height: number;
}

const cache = new Map<string, Loaded>();

/** 模型着色器共用的时间（熔岩裂纹的流动），由战场每帧推进 */
export const modelTime = { value: 0 };

/** Blender 里的发光强度是按离线渲染调的，进游戏要压一压，不然辉光会糊成一片 */
const EMISSIVE_SCALE = 0.3;

export async function preloadModels(): Promise<void> {
  let ids: string[] = [];
  try {
    const res = await fetch('/models/manifest.json');
    if (res.ok) ids = (await res.json()) as string[];
  } catch {
    return;
  }
  const loader = new GLTFLoader();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`/models/${id}.glb`);
        const height = new THREE.Box3().setFromObject(gltf.scene).max.y;
        cache.set(id, { scene: gltf.scene, height });
      } catch (err) {
        console.warn(`模型 ${id} 加载失败，改用几何体角色`, err);
      }
    }),
  );
}

export interface ModelInstance {
  root: THREE.Object3D;
  wings: THREE.Object3D[];
  spinners: THREE.Object3D[];
  height: number;
}

export function instantiateModel(id: string): ModelInstance | null {
  const src = cache.get(id);
  if (!src) return null;
  const root = src.scene.clone(true);
  const wings: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  // 每个单位自己一份材质：受击闪光会改发光色，不能互相串
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      const base = m.material as THREE.MeshStandardMaterial;
      let mat = own.get(base);
      if (!mat) {
        mat = base.clone();
        mat.emissiveIntensity *= EMISSIVE_SCALE;
        if (base.name.includes('veins')) mat.userData.veins = true;
        own.set(base, mat);
      }
      m.material = mat;
    }
    if (o.name.startsWith('wing_')) {
      o.userData = { side: o.name.startsWith('wing_R') ? 1 : -1, base: 0, phase: wings.length * 0.35 };
      wings.push(o);
    } else if (o.name.startsWith('spin_')) {
      const axis = o.name[5];
      o.userData.spin = new THREE.Vector3(axis === 'x' ? 0.5 : 0, axis === 'y' ? 0.6 : 0, axis === 'z' ? 0.35 : 0);
      spinners.push(o);
    }
  });
  return { root, wings, spinners, height: src.height };
}
