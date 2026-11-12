# 用法：blender -b --python tools/blender/build.py -- [卡牌 id ...]
# 不带 id 就全部生成。产物：public/models/<id>.glb、public/models/manifest.json、art/model-previews/<id>.png
#
# 物体命名约定（游戏按名字接动画）：
#   body            静止主体
#   wing_R_* / wing_L_*   翅膀，枢轴在翼根，游戏里绕竖直轴扇动
#   spin_x_* / spin_y_* / spin_z_*   自转部件（光环、王冠），轴是 glTF 坐标（y 向上，z 朝前）

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import avd_lib as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TAU = math.tau


# ───────────── 六翼炽辉 ─────────────

def icon_seraph():
    ROBE, GOLD, GLOW, FW, FG, MASK, RED = range(7)
    mats = [
        L.mat('robe', '#f3ead6', rough=0.72, double=True),
        L.mat('gold', '#e0aa40', metal=0.55, rough=0.32),
        L.mat('glow', '#ffe2a0', rough=0.4, emit='#ffc860', strength=4.0),
        L.mat('feather', '#fbf6ea', rough=0.85, double=True),
        L.mat('feather_gold', '#f1cc7c', metal=0.35, rough=0.5, double=True),
        L.mat('mask', '#f6e2ae', metal=0.45, rough=0.25),
        L.mat('crimson', '#9c2f38', rough=0.6, double=True),
    ]
    bm = bmesh.new()

    # 长袍：钟形下摆，带一圈布褶，悬空不落地
    L.lathe(bm, [(0.37, 0.14), (0.35, 0.36), (0.28, 0.68), (0.19, 0.96), (0.155, 1.06)], ROBE, segs=64,
            rfun=lambda a, t: 1 + (0.11 * math.sin(a * 9 + 0.6) + 0.04 * math.sin(a * 17)) * (1 - t) ** 1.3,
            zfun=lambda a, t: 0.06 * math.sin(a * 5 + 1.0) * (1 - t) ** 2)
    # 内衬（下摆里透出的红）
    L.lathe(bm, [(0.3, 0.2), (0.29, 0.4), (0.22, 0.7), (0.14, 1.0)], RED, segs=32,
            rfun=lambda a, t: 1 + 0.08 * math.sin(a * 9 + 0.6) * (1 - t))
    # 躯干与手臂（合掌前伸）
    nodes = [((0, 0, 1.02), (0.15, 0.11)), ((0, 0, 1.33), (0.17, 0.12)), ((0, 0, 1.5), 0.05)]
    edges = [(0, 1), (1, 2)]
    for s in (1, -1):
        i = len(nodes)
        nodes += [((s * 0.2, 0, 1.42), 0.065), ((s * 0.31, -0.1, 1.2), 0.05), ((s * 0.1, -0.25, 1.27), 0.04)]
        edges += [(1, i), (i, i + 1), (i + 1, i + 2)]
    L.add_skin(bm, nodes, edges, ROBE, levels=2)

    def side(tb):
        # 喇叭袖
        L.tube(tb, [(0.31, -0.1, 1.2), (0.2, -0.18, 1.2), (0.12, -0.24, 1.2)], [0.06, 0.1, 0.14], ROBE, segs=14, cap0=False, cap1=False)
        L.torus(tb, (0.125, -0.238, 1.2), 0.138, 0.008, GOLD, axis='X', major=20, minor=6)
        L.ball(tb, (0.05, -0.27, 1.28), 0.04, MASK, scale=(0.8, 1, 1.3), seg=10)
        # 腰后飘带
        L.tube(tb, [(0.1, 0.13, 1.04), (0.36, 0.3, 0.74), (0.46, 0.36, 0.36), (0.66, 0.3, 0.1)], [0.03, 0.04, 0.032, 0.008], RED, segs=8, flat=0.12, twist=1.2)
    L.both_sides(bm, side)

    # 披肩、腰带、圣带
    L.lathe(bm, [(0.235, 1.37), (0.22, 1.42), (0.14, 1.48), (0.075, 1.5)], GOLD, segs=48, sy=0.74,
            zfun=lambda a, t: -0.045 * abs(math.sin(a * 6)) * (1 - t) ** 2)
    L.torus(bm, (0, 0, 1.06), 0.158, 0.02, GOLD, axis='Z', flat=1.4)
    L.tube(bm, [(0, -0.14, 1.36), (0, -0.2, 1.06), (0, -0.335, 0.62), (0, -0.42, 0.26)], [0.05, 0.055, 0.06, 0.07], RED, segs=8, flat=0.14, cap0=False)
    for z, y in ((0.98, -0.222), (0.72, -0.31), (0.46, -0.378)):
        L.ball(bm, (0, y, z), 0.022, GLOW, seg=8)
    L.ball(bm, (0, -0.135, 1.36), 0.03, GLOW, scale=(1, 0.6, 1.2), seg=10)

    # 头：兜帽 + 金面具 + 眼缝
    L.ball(bm, (0, 0.022, 1.645), 0.15, ROBE, scale=(1, 1.05, 1.12), seg=20)
    L.ball(bm, (0, -0.04, 1.635), 0.12, MASK, scale=(0.88, 0.86, 1.12), seg=20)
    for s in (1, -1):
        L.ball(bm, (s * 0.043, -0.136, 1.65), 0.021, GLOW, scale=(1.5, 0.5, 0.45), seg=8)
    L.tube(bm, [(0, 0.12, 1.7), (0, 0.17, 1.5), (0, 0.19, 1.28)], [0.11, 0.12, 0.05], ROBE, segs=12, flat=0.25, cap0=False)
    # 冠：一圈金刺
    for i in range(9):
        a = TAU * i / 9 + math.pi / 2
        d = Vector((math.cos(a), math.sin(a) * 1.05, 0))
        h = 0.2 if i == 4 else 0.13
        L.spike(bm, Vector((0, 0.01, 1.76)) + d * 0.1, Vector((0, 0.01, 1.76 + h)) + d * 0.17, 0.028, GOLD, segs=4)
    L.torus(bm, (0, 0.01, 1.765), 0.105, 0.014, GOLD, axis='Z', major=24, minor=6)
    # 掌间的光
    L.ball(bm, (0, -0.31, 1.3), 0.062, GLOW, seg=14)
    L.torus(bm, (0, -0.31, 1.3), 0.095, 0.006, GOLD, axis='Y', major=28, minor=5)
    body = L.finish('body', bm, mats)

    # 光环：竖在脑后的日轮，缓缓自转
    hb = bmesh.new()
    c = Vector((0, 0.17, 1.7))
    L.torus(hb, c, 0.33, 0.014, GLOW, axis='Y', major=56)
    L.torus(hb, c, 0.41, 0.007, GOLD, axis='Y', major=56, minor=5)
    for i in range(16):
        a = TAU * i / 16
        d = Vector((math.cos(a), 0, math.sin(a)))
        ln = 0.2 if i % 2 == 0 else 0.09
        L.spike(hb, c + d * 0.35, c + d * (0.35 + ln), 0.022, GLOW if i % 2 == 0 else GOLD, segs=4)
    halo = L.finish('spin_z_halo', hb, mats, origin=c, sharp=30)

    # 六翼：上翼高举，中翼平展，下翼垂拢
    wings = []
    for nm, span, lift, sweep, z, seed in (('a', 0.98, 44, 16, 1.4, 1), ('b', 0.86, 4, 24, 1.31, 2), ('c', 0.64, -46, 12, 1.2, 3)):
        wings += L.add_wing_pair(nm, mats, (0.08, 0.14, z), L.wing_matrix(lift, sweep),
                                 lambda b, span=span, seed=seed: L.feather_wing(b, span, FG, FW, FW, seed=seed))
    return [body, halo] + wings, dict(key='#fff1dc', rim='#ffd27a')


# ───────────── 火口暴君 ─────────────

def lava_tyrant():
    ROCK, LAVA, OBS, MEMB, EYE, BONE = range(6)
    mats = [
        L.mat('rock_veins', '#3a2c2e', rough=0.86),
        L.mat('lava', '#ff8a2a', rough=0.5, emit='#ff5a12', strength=5.0),
        L.mat('obsidian', '#17121a', metal=0.55, rough=0.18),
        L.mat('membrane', '#5c1612', rough=0.7, emit='#b0260a', strength=0.5, double=True),
        L.mat('eye', '#fff0b0', emit='#ffd860', strength=7.0),
        L.mat('bone', '#d9c9a6', rough=0.5),
    ]
    bm = bmesh.new()

    # 躯干：前倾的巨躯，粗前臂
    nodes = [
        ((0, 0.02, 0.86), (0.25, 0.2)), ((0, -0.02, 1.12), (0.3, 0.24)), ((0, -0.07, 1.42), (0.38, 0.27)),
        ((0, -0.15, 1.62), 0.15), ((0, -0.25, 1.78), (0.2, 0.19)), ((0, -0.42, 1.7), (0.14, 0.1)),
    ]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
    for s in (1, -1):
        i = len(nodes)
        nodes += [((s * 0.19, 0.02, 0.78), 0.17), ((s * 0.26, -0.1, 0.45), 0.13), ((s * 0.26, 0.04, 0.15), 0.11), ((s * 0.28, -0.17, 0.07), (0.12, 0.07))]
        edges += [(0, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
        i = len(nodes)
        nodes += [((s * 0.5, -0.05, 1.52), 0.21), ((s * 0.72, 0.0, 1.14), 0.15), ((s * 0.76, -0.2, 0.8), 0.18), ((s * 0.76, -0.27, 0.62), 0.2)]
        edges += [(2, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
    verts, faces = L.add_skin(bm, nodes, edges, ROCK, levels=3)
    L.displace(bm, verts, 0.04, 3.2, seed=2, amp2=0.014, freq2=10)
    def side(tb):
        # 肩上的火山口
        L.lathe(tb, [(0.23, 1.6), (0.2, 1.74), (0.13, 1.84)], ROCK, segs=9, n=3, center=(0.5, -0.03), smooth=False,
                rfun=lambda a, t: 1 + 0.16 * math.sin(a * 4 + 1))
        L.ball(tb, (0.5, -0.03, 1.84), 0.13, LAVA, scale=(1, 1, 0.45), seg=10)
        for a, h in ((0.3, 0.3), (2.2, 0.22), (4.0, 0.26)):
            p = Vector((0.5 + math.cos(a) * 0.2, -0.03 + math.sin(a) * 0.2, 1.7))
            L.spike(tb, p, p + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, h)), 0.06, OBS, segs=5)
        # 角：向外再向前上方卷
        L.tube(tb, [(0.14, -0.2, 1.9), (0.36, -0.14, 1.98), (0.5, -0.24, 2.18), (0.4, -0.46, 2.38)], [0.085, 0.065, 0.042, 0.004], OBS, segs=8, n=18)
        L.torus(tb, (0.18, -0.19, 1.91), 0.08, 0.016, LAVA, axis='X', major=14, minor=5)
        # 眼
        L.ball(tb, (0.085, -0.44, 1.83), 0.032, EYE, scale=(1.4, 0.7, 0.55), seg=8)
        # 拳上的黑曜石指刺、脚爪
        for k in range(3):
            x = 0.66 + k * 0.1
            L.spike(tb, (x, -0.38, 0.6), (x, -0.56, 0.44), 0.05, OBS, segs=5)
        for k in range(3):
            x = 0.2 + k * 0.08
            L.spike(tb, (x, -0.24, 0.05), (x + (k - 1) * 0.03, -0.4, 0.02), 0.04, OBS, segs=5)
        # 前臂岩甲
        v = L.ball(tb, (0.8, -0.06, 0.98), 0.17, ROCK, scale=(0.8, 1, 1.5), ico=2, smooth=False)
        L.displace(tb, v, 0.05, 6, seed=5)
        # 胸甲、膝甲：棱角分明的岩块压在圆润的躯干上
        for c, r, sc, sd in (((0.2, -0.31, 1.47), 0.2, (1, 0.5, 0.8), 7), ((0.27, -0.21, 0.48), 0.13, (1, 0.8, 1.2), 8), ((0.3, 0.2, 1.5), 0.2, (1, 0.6, 1), 9)):
            v = L.ball(tb, c, r, ROCK, scale=sc, ico=2, smooth=False)
            L.displace(tb, v, 0.04, 7, seed=sd)
        # 獠牙
        L.spike(tb, (0.1, -0.5, 1.66), (0.11, -0.54, 1.82), 0.028, BONE, segs=5)
        L.spike(tb, (0.04, -0.53, 1.7), (0.04, -0.56, 1.62), 0.018, BONE, segs=5)
    L.both_sides(bm, side)

    # 腹部炉膛：一团熔岩，外面箍着黑曜石肋
    L.ball(bm, (0, -0.24, 1.13), 0.17, LAVA, scale=(1, 0.55, 1.15), seg=14)
    for z, w in ((1.24, 0.19), (1.13, 0.21), (1.02, 0.18)):
        L.tube(bm, [(-w, -0.22, z), (-w * 0.5, -0.33, z), (0, -0.36, z), (w * 0.5, -0.33, z), (w, -0.22, z)], [0.02, 0.028, 0.03, 0.028, 0.02], OBS, segs=6, n=12)
    # 眉骨、口中的火、背刺、尾
    L.tube(bm, [(-0.18, -0.36, 1.86), (0, -0.46, 1.88), (0.18, -0.36, 1.86)], [0.035, 0.05, 0.035], OBS, segs=6, n=6)
    L.ball(bm, (0, -0.5, 1.69), 0.07, LAVA, scale=(1.3, 0.8, 0.45), seg=10)
    for i, (z, y, h) in enumerate(((1.0, 0.22, 0.22), (1.22, 0.21, 0.3), (1.44, 0.19, 0.34), (1.64, 0.05, 0.26))):
        L.spike(bm, (0, y - 0.05, z), (0, y + h, z + h * 0.7), 0.075, OBS, segs=5)
    L.tube(bm, [(0, 0.16, 0.82), (0, 0.55, 0.5), (0.22, 0.82, 0.32), (0.5, 0.78, 0.5)], [0.14, 0.1, 0.06, 0.025], ROCK, segs=9, n=14, cap0=False)
    L.ball(bm, (0.52, 0.775, 0.52), 0.07, LAVA, ico=1, smooth=False)
    body = L.finish('body', bm, mats, sharp=50)

    # 悬在头顶的熔岩王冠
    cb = bmesh.new()
    c = Vector((0, -0.25, 2.22))
    L.torus(cb, c, 0.2, 0.009, LAVA, axis='Z', major=32, minor=5)
    for i in range(6):
        a = TAU * i / 6
        p = c + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0))
        h = 0.2 if i % 2 == 0 else 0.13
        L.spike(cb, p, p + Vector((0, 0, h)), 0.04, OBS, segs=4)
        L.spike(cb, p, p - Vector((0, 0, h * 0.5)), 0.04, OBS, segs=4)
        L.ball(cb, p, 0.022, LAVA, seg=6)
    crown = L.finish('spin_y_crown', cb, mats, origin=c, sharp=30)

    wings = L.add_wing_pair('a', mats, (0.2, 0.24, 1.5), L.wing_matrix(24, 30),
                            lambda b: L.bat_wing(b, 1.05, OBS, MEMB, ragged=1.0, seed=4))
    return [body, crown] + wings, dict(key='#ffd9b0', rim='#ff5a20')


BUILDERS = {'icon_seraph': icon_seraph, 'lava_tyrant': lava_tyrant}
for _mod in ('chars_angel', 'chars_demon'):
    try:
        BUILDERS.update(__import__(_mod).BUILDERS)
    except ModuleNotFoundError:
        pass


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = argv or list(BUILDERS)
    for cid in ids:
        L.reset()
        try:
            objs, look = BUILDERS[cid]()
        except Exception:
            import traceback
            traceback.print_exc()
            print(f'AVD_FAIL {cid}')
            continue
        L.bake_ao(objs)
        L.export_glb(os.path.join(ROOT, 'public', 'models', f'{cid}.glb'))
        L.wire_vertex_color()
        L.render_preview(os.path.join(ROOT, 'art', 'model-previews', f'{cid}.png'), **look)
        L.render_preview(os.path.join(ROOT, 'art', 'model-previews', f'{cid}_back.png'), back=True, **look)
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        print(f'AVD_OK {cid} objects={len(objs)} tris={tris}')
    mdir = os.path.join(ROOT, 'public', 'models')
    have = sorted(f[:-4] for f in os.listdir(mdir) if f.endswith('.glb'))
    with open(os.path.join(mdir, 'manifest.json'), 'w') as fh:
        json.dump(have, fh)


main()
