# 天使方角色：圣像（金箔长袍）、机枢（白瓷机甲 + 青色霓虹）、云篆（水墨仙灵）。
# 六翼炽辉在 build.py 里。

import math

import bmesh
from mathutils import Matrix, Vector

import avd_lib as L

TAU = math.tau
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def wing_pair(name, mats, root, span, lift, sweep, fn):
    return L.add_wing_pair(name, mats, root, L.wing_matrix(lift, sweep), fn)


def ring_halo(mats, mi, z, R=0.19, r=0.014, y=0.0, major=40, name='spin_y_halo', extra=None):
    hb = bmesh.new()
    c = Vector((0, y, z))
    L.torus(hb, c, R, r, mi, axis='Z', major=major, minor=6 if major > 8 else 4, smooth=major > 8)
    if extra:
        extra(hb, c)
    return L.finish(name, hb, mats, origin=c, sharp=30)


# ───────────── 圣像 ─────────────

ROBE, GOLD, GLOW, FW, FG, MASK, RED, IVORY = range(8)


def icon_mats():
    return [
        L.mat('robe', '#f3ead6', rough=0.72, double=True),
        L.mat('gold', '#e0aa40', metal=0.55, rough=0.32),
        L.mat('glow', '#ffe2a0', rough=0.4, emit='#ffc860', strength=4.0),
        L.mat('feather', '#fbf6ea', rough=0.85, double=True),
        L.mat('feather_gold', '#f1cc7c', metal=0.35, rough=0.5, double=True),
        L.mat('mask', '#f6e2ae', metal=0.45, rough=0.25),
        L.mat('crimson', '#9c2f38', rough=0.6, double=True),
        L.mat('ivory', '#f7f0dc', rough=0.5),
    ]


def icon_head(bm, z=1.64, s=1.0):
    L.ball(bm, (0, 0.022 * s, z + 0.005), 0.15 * s, ROBE, scale=(1, 1.05, 1.12), seg=20)
    L.ball(bm, (0, -0.04 * s, z - 0.005), 0.12 * s, MASK, scale=(0.88, 0.86, 1.12), seg=20)
    for sd in (1, -1):
        L.ball(bm, (sd * 0.043 * s, -0.136 * s, z + 0.01), 0.021 * s, GLOW, scale=(1.5, 0.5, 0.45), seg=8)


def icon_trim(bm, stole=True):
    L.lathe(bm, [(0.235, 1.37), (0.22, 1.42), (0.14, 1.48), (0.075, 1.5)], GOLD, segs=48, sy=0.74,
            zfun=lambda a, t: -0.045 * abs(math.sin(a * 6)) * (1 - t) ** 2)
    L.torus(bm, (0, 0, 1.06), 0.158, 0.02, GOLD, axis='Z', flat=1.4)
    if stole:
        L.tube(bm, [(0, -0.2, 1.06), (0, -0.335, 0.62), (0, -0.42, 0.26)], [0.055, 0.06, 0.07], RED, segs=8, flat=0.14, cap0=False)
        for z, y in ((0.72, -0.31), (0.46, -0.378)):
            L.ball(bm, (0, y, z), 0.022, GLOW, seg=8)


def hands_balls(bm, hands, mi, r=0.042):
    for h in hands.values():
        L.ball(bm, h, r, mi, seg=10)


def sun_halo(mats, c, R=0.26, rays=12):
    hb = bmesh.new()
    c = Vector(c)
    L.torus(hb, c, R, 0.013, GLOW, axis='Y', major=48)
    for i in range(rays):
        a = TAU * i / rays
        d = Vector((math.cos(a), 0, math.sin(a)))
        L.spike(hb, c + d * (R + 0.02), c + d * (R + (0.14 if i % 2 == 0 else 0.07)), 0.018, GLOW if i % 2 == 0 else GOLD, segs=4)
    return L.finish('spin_z_halo', hb, mats, origin=c, sharp=30)


def icon_acolyte():
    mats = icon_mats()
    bm = bmesh.new()
    hands = L.robed(bm, ROBE, 'hold', lining=RED)
    icon_head(bm, z=1.68, s=1.22)
    icon_trim(bm, stole=False)
    hands_balls(bm, hands, MASK)
    # 高烛：烛身、烛台、烛焰
    L.cyl(bm, (0, -0.31, 0.92), (0, -0.31, 1.72), 0.034, IVORY, segs=10)
    L.lathe(bm, [(0.02, 0.98), (0.1, 1.0), (0.115, 1.04)], GOLD, segs=16, center=(0, -0.31), cap0=True)
    L.ball(bm, (0, -0.31, 1.82), 0.055, GLOW, scale=(1, 1, 1.9), seg=12)
    L.ball(bm, (0, -0.31, 1.74), 0.04, GLOW, seg=8)
    body = L.finish('body', bm, mats)
    halo = ring_halo(mats, GLOW, 2.0, R=0.2)
    wings = wing_pair('a', mats, (0.07, 0.14, 1.36), 0.5, 28, 26, lambda b: L.feather_wing(b, 0.5, FG, FW, FW, seed=5, counts=(10, 9, 7)))
    return [body, halo] + wings, dict(key='#fff1dc', rim='#ffd27a')


def icon_choir():
    mats = icon_mats()
    bm = bmesh.new()
    hands = L.robed(bm, ROBE, 'hold', lining=RED)
    icon_head(bm)
    icon_trim(bm)
    hands_balls(bm, hands, MASK)
    # 摊开的颂歌集
    for s in (1, -1):
        R = L.rot(x=-38, z=-s * 16)
        L.box(bm, (s * 0.105, -0.36, 1.27), (0.21, 0.028, 0.28), RED, R=R)
        L.box(bm, (s * 0.1, -0.345, 1.285), (0.19, 0.02, 0.25), IVORY, R=R)
    L.ball(bm, (0, -0.33, 1.36), 0.02, GLOW, seg=8)
    # 冠
    L.torus(bm, (0, 0.01, 1.765), 0.105, 0.014, GOLD, axis='Z', major=24, minor=6)
    for i in range(5):
        a = math.pi * (0.2 + 0.15 * i) + math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        L.spike(bm, Vector((0, 0.01, 1.76)) + d * 0.1, Vector((0, 0.01, 1.76 + (0.13 if i == 2 else 0.09))) + d * 0.14, 0.024, GOLD, segs=4)
    body = L.finish('body', bm, mats)
    halo = sun_halo(mats, (0, 0.17, 1.7))
    wings = wing_pair('a', mats, (0.08, 0.14, 1.38), 0.86, 30, 20, lambda b: L.feather_wing(b, 0.86, FG, FW, FW, seed=6))
    return [body, halo] + wings, dict(key='#fff1dc', rim='#ffd27a')


def icon_shield():
    mats = icon_mats()
    bm = bmesh.new()
    hands = L.robed(bm, ROBE, 'down', 'hold', lining=RED, torso=((0.17, 0.13), (0.21, 0.15)), fold_amp=0.08)
    icon_head(bm, z=1.66)
    icon_trim(bm)
    hands_balls(bm, hands, GOLD, r=0.055)
    # 胸甲、肩甲、盔冠
    L.ball(bm, (0, -0.05, 1.3), 0.2, GOLD, scale=(1.05, 0.8, 0.95), seg=18)
    L.ball(bm, (0, -0.2, 1.33), 0.035, GLOW, seg=8)
    for s in (1, -1):
        L.ball(bm, (s * 0.29, 0, 1.47), 0.12, GOLD, scale=(1.15, 1.05, 0.8), seg=14)
        L.torus(bm, (s * 0.29, 0, 1.43), 0.125, 0.012, MASK, axis='Z', major=20, minor=5)
    L.plate(bm, [(0, -0.13, 1.8), (0, -0.04, 1.97), (0, 0.16, 1.9), (0, 0.15, 1.76)], 0.025, GOLD)
    # 大圆盾：鼓面上一轮太阳
    c = Vector((-0.2, -0.44, 1.0))
    R = 0.47
    L.disc(bm, c, R, 0.04, GOLD, axis='Y', segs=32, dome=0.25)
    L.torus(bm, c + Y * -0.01, R, 0.028, MASK, axis='Y', major=40, minor=6)

    def on_dome(rr, a):
        return c + Vector((math.cos(a) * rr, -0.02 - 0.115 * math.sqrt(max(0.0, 1 - (rr / R) ** 2)) - 0.012, math.sin(a) * rr))
    L.ball(bm, on_dome(0, 0), 0.1, GLOW, scale=(1, 0.45, 1), seg=14)
    for i in range(12):
        a = TAU * i / 12
        L.spike(bm, on_dome(0.13, a), on_dome(0.38 if i % 2 == 0 else 0.28, a), 0.026, MASK, segs=4)
    body = L.finish('body', bm, mats)
    halo = ring_halo(mats, GLOW, 1.98, R=0.2)
    wings = wing_pair('a', mats, (0.1, 0.16, 1.4), 0.82, -30, 44, lambda b: L.feather_wing(b, 0.82, FG, FW, FW, seed=7))
    return [body, halo] + wings, dict(key='#fff1dc', rim='#ffd27a')


# ───────────── 机枢 ─────────────

W, D, N, P = range(4)


def mech_mats():
    return [
        L.mat('ceramic', '#eef2f6', metal=0.1, rough=0.32),
        L.mat('frame', '#2a3140', metal=0.6, rough=0.4),
        L.mat('neon', '#b8f2ff', rough=0.4, emit='#4cc9f0', strength=4.0),
        L.mat('prism', '#9fe8ff', rough=0.2, emit='#4cc9f0', strength=1.3, double=True),
    ]


def mech_frame(bm, pose_r='down', pose_l=None):
    L.lathe(bm, [(0.09, 0.76), (0.165, 0.86), (0.13, 1.0)], W, segs=6, n=2, smooth=False, sy=0.8, cap0=True, cap1=True)
    L.cyl(bm, (0, 0, 0.98), (0, 0, 1.12), 0.075, D, segs=8)
    L.lathe(bm, [(0.12, 1.08), (0.25, 1.24), (0.27, 1.4), (0.15, 1.5)], W, segs=6, n=3, smooth=False, sy=0.72, cap0=True, cap1=True)
    L.ball(bm, (0, -0.185, 1.33), 0.05, N, seg=10)
    L.torus(bm, (0, -0.17, 1.33), 0.07, 0.012, D, axis='Y', major=6, minor=4, smooth=False)
    L.box(bm, (0, 0.17, 1.32), (0.24, 0.12, 0.3), D, taper=0.8)
    L.cyl(bm, (0, 0, 1.48), (0, 0, 1.57), 0.05, D, segs=8)
    L.ball(bm, (0, 0, 1.66), 0.125, W, scale=(0.9, 1, 1.1), seg=20)
    L.ball(bm, (0, -0.045, 1.665), 0.105, N, scale=(0.95, 0.85, 0.3), seg=16)
    L.plate(bm, [(0, -0.1, 1.77), (0, 0.02, 1.92), (0, 0.17, 1.82), (0, 0.1, 1.73)], 0.025, W)
    hands = {}
    for s, pose, key in ((1, pose_r, 'R'), (-1, pose_l or pose_r, 'L')):
        e, h = L._arm_pts(pose, s)
        sh = Vector((s * 0.31, 0, 1.44))
        L.ball(bm, sh, 0.1, W, ico=2, smooth=False)
        L.cyl(bm, sh, e, 0.04, D, segs=8)
        L.ball(bm, e, 0.05, D, seg=8)
        L.tube(bm, [e, h], [0.068, 0.046], W, segs=6, n=1, smooth=False)
        L.ball(bm, h, 0.048, D, seg=8)
        hands[key] = h
        L.tube(bm, [(s * 0.1, 0, 0.82), (s * 0.13, -0.05, 0.5)], [0.092, 0.066], W, segs=6, n=1, smooth=False)
        L.ball(bm, (s * 0.13, -0.095, 0.5), 0.04, N, seg=8)
        L.tube(bm, [(s * 0.13, -0.04, 0.5), (s * 0.12, 0.03, 0.1)], [0.078, 0.016], W, segs=6, n=1, smooth=False)
        L.ball(bm, (s * 0.12, 0.03, 0.07), 0.03, N, seg=8)
        L.plate(bm, [(s * 0.2, -0.01, 1.0), (s * 0.24, -0.01, 0.7), (s * 0.2, 0.06, 0.62), (s * 0.17, 0.06, 0.98)], 0.02, W)
    return hands


def hex_halo(mats, c, radii=(0.2,), axis='Z', name='spin_y_halo'):
    hb = bmesh.new()
    c = Vector(c)
    for i, R in enumerate(radii):
        L.torus(hb, c, R, 0.013, N if i % 2 == 0 else D, axis=axis, major=6, minor=4, smooth=False)
    return L.finish(name, hb, mats, origin=c, sharp=30)


def mech_drone():
    mats = mech_mats()
    bm = bmesh.new()
    L.ball(bm, (0, 0, 1.2), 0.22, W, scale=(0.85, 1.5, 0.7), seg=22)
    L.ball(bm, (0, 0.03, 1.12), 0.2, D, scale=(0.8, 1.4, 0.6), seg=18)
    L.ball(bm, (0, -0.3, 1.21), 0.075, N, scale=(1, 0.6, 1), seg=12)
    L.torus(bm, (0, -0.275, 1.21), 0.095, 0.016, D, axis='Y', major=6, minor=4, smooth=False)
    L.plate(bm, [(0, -0.12, 1.34), (0, 0.1, 1.52), (0, 0.3, 1.46), (0, 0.26, 1.33)], 0.02, W)
    L.spike(bm, (0, -0.05, 1.05), (0, -0.12, 0.72), 0.02, D, segs=5)
    L.ball(bm, (0, -0.12, 0.72), 0.022, N, seg=6)
    for s in (1, -1):
        L.cyl(bm, (s * 0.14, 0.18, 1.2), (s * 0.14, 0.42, 1.2), 0.062, D, segs=8)
        L.ball(bm, (s * 0.14, 0.43, 1.2), 0.048, N, seg=8)
        L.plate(bm, [(s * 0.15, -0.2, 1.2), (s * 0.3, -0.1, 1.2), (s * 0.3, 0.1, 1.2), (s * 0.15, 0.16, 1.2)], 0.02, W)
    body = L.finish('body', bm, mats)
    halo = hex_halo(mats, (0, 0, 1.62), (0.2,))
    wings = wing_pair('a', mats, (0.2, 0.04, 1.22), 0.72, 14, 24, lambda b: L.panel_wing(b, 0.72, W, N, n=3, a0=50, a1=-30))
    return [body, halo] + wings, dict(key='#e8f6ff', rim='#4cc9f0')


def mech_sentinel():
    mats = mech_mats()
    bm = bmesh.new()
    mech_frame(bm, 'down', 'hold')
    # 棱镜盾：一面半透的六边光幕
    c = Vector((-0.2, -0.44, 1.15))
    R = 0.42
    L.plate(bm, [c + Vector((math.cos(TAU * i / 6) * R, 0, math.sin(TAU * i / 6) * R)) for i in range(6)], 0.016, P)
    L.torus(bm, c, R, 0.022, W, axis='Y', major=6, minor=4, smooth=False)
    L.torus(bm, c + Y * -0.012, R * 0.45, 0.012, N, axis='Y', major=6, minor=4, smooth=False)
    L.ball(bm, c + Y * -0.012, 0.04, N, seg=8)
    for i in range(6):
        a = TAU * i / 6
        L.ball(bm, c + Vector((math.cos(a) * R, 0, math.sin(a) * R)), 0.036, D, ico=1, smooth=False)
    body = L.finish('body', bm, mats)
    halo = hex_halo(mats, (0, 0, 2.0), (0.2,))
    wings = wing_pair('a', mats, (0.13, 0.2, 1.42), 0.8, 24, 28, lambda b: L.panel_wing(b, 0.8, W, N, n=3))
    return [body, halo] + wings, dict(key='#e8f6ff', rim='#4cc9f0')


def mech_lancer():
    mats = mech_mats()
    bm = bmesh.new()
    mech_frame(bm, ((0.36, 0.06, 1.24), (0.36, -0.2, 1.1)), 'open')
    # 能量长枪
    a, b = Vector((0.36, 0.6, 1.3)), Vector((0.36, -0.6, 1.02))
    d = (b - a).normalized()
    L.cyl(bm, a, b, 0.028, W, segs=8)
    L.cyl(bm, a, a + d * 0.12, 0.04, D, segs=8)
    L.torus(bm, b - d * 0.02, 0.085, 0.016, D, axis='Y', major=6, minor=4, smooth=False)
    L.tube(bm, [b, b + d * 0.75], [0.062, 0.002], N, segs=6, n=1, cap1=False, smooth=False)
    L.tube(bm, [b + d * 0.02, b + d * 0.5], [0.09, 0.03], P, segs=6, n=1, cap0=False, cap1=False, smooth=False)
    for s in (1, -1):
        L.cyl(bm, (s * 0.12, 0.2, 1.42), (s * 0.16, 0.42, 1.52), 0.055, D, segs=8)
        L.ball(bm, (s * 0.165, 0.44, 1.53), 0.045, N, seg=8)
    body = L.finish('body', bm, mats)
    halo = hex_halo(mats, (0, 0, 2.0), (0.2,))
    wings = wing_pair('a', mats, (0.14, 0.2, 1.42), 0.88, 30, 48, lambda b: L.panel_wing(b, 0.88, W, N, n=3, a0=42, a1=0))
    return [body, halo] + wings, dict(key='#e8f6ff', rim='#4cc9f0')


def mech_archon():
    mats = mech_mats()
    bm = bmesh.new()
    tb = bmesh.new()
    mech_frame(tb, ((0.42, -0.06, 1.2), (0.5, -0.24, 1.2)), 'open')
    L.absorb(bm, tb, Matrix.Diagonal((1.22, 1.18, 1.06, 1)))
    for s in (1, -1):
        L.box(bm, (s * 0.44, 0, 1.62), (0.3, 0.26, 0.1), W, R=L.rot(y=s * 22), taper=0.7)
        L.box(bm, (s * 0.44, 0, 1.56), (0.2, 0.2, 0.04), N, R=L.rot(y=s * 22))
        # 腰间垂甲
        L.plate(bm, [(s * 0.12, -0.2, 1.02), (s * 0.3, -0.14, 1.02), (s * 0.33, -0.18, 0.5), (s * 0.2, -0.24, 0.38)], 0.022, W)
        L.plate(bm, [(s * 0.16, -0.215, 0.9), (s * 0.27, -0.185, 0.9), (s * 0.28, -0.205, 0.6), (s * 0.21, -0.235, 0.52)], 0.03, N)
    # 权杖
    L.cyl(bm, (0.61, -0.29, 0.15), (0.61, -0.29, 2.28), 0.026, W, segs=8)
    L.torus(bm, (0.61, -0.29, 2.42), 0.15, 0.016, N, axis='Y', major=6, minor=4, smooth=False)
    L.ball(bm, (0.61, -0.29, 2.42), 0.055, N, ico=1, smooth=False)
    L.ball(bm, (0.61, -0.29, 0.15), 0.04, D, ico=1, smooth=False)
    body = L.finish('body', bm, mats)
    objs = [body, hex_halo(mats, (0, 0.24, 1.92), (0.22, 0.31, 0.4), axis='Y', name='spin_z_halo')]
    # 环绕腰身的数据环
    for i, (tilt, R) in enumerate(((18, 0.56), (-14, 0.68))):
        rb = bmesh.new()
        L.torus(rb, (0, 0, 0), R, 0.009, N, axis='Z', major=64, minor=4)
        for k in range(8):
            a = TAU * k / 8
            L.box(rb, (math.cos(a) * R, math.sin(a) * R, 0), (0.05, 0.02, 0.035), N, R=L.rot(z=math.degrees(a) + 90))
        bmesh.ops.transform(rb, matrix=Matrix.Translation((0, 0, 1.08 + i * 0.22)) @ L.rot(x=tilt, y=tilt * 0.5), verts=rb.verts[:])
        objs.append(L.finish(f'spin_y_ring{i}', rb, mats, origin=(0, 0, 1.08 + i * 0.22), sharp=30))
    objs += wing_pair('a', mats, (0.16, 0.24, 1.56), 1.0, 34, 20, lambda b: L.panel_wing(b, 1.0, W, N, n=5, a0=62, a1=-10))
    objs += wing_pair('b', mats, (0.14, 0.24, 1.3), 0.7, -28, 26, lambda b: L.panel_wing(b, 0.7, W, N, n=3, a0=30, a1=-20))
    return objs, dict(key='#e8f6ff', rim='#4cc9f0')


# ───────────── 云篆 ─────────────

IROBE, JADE, JGLOW, INK, SKIN, IFW, GREY, WOOD, PETAL, STEEL = range(10)


def ink_mats():
    return [
        L.mat('silk', '#f5f5ef', rough=0.8, double=True),
        L.mat('jade', '#8fd3b6', rough=0.35, emit='#5fc9a0', strength=0.5, double=True),
        L.mat('jade_glow', '#d2ffe9', rough=0.4, emit='#7df0c0', strength=3.5),
        L.mat('ink', '#1b1d22', rough=0.6, double=True),
        L.mat('skin', '#f4e4d4', rough=0.6),
        L.mat('crane_feather', '#fbfbf6', rough=0.85, double=True),
        L.mat('wash', '#8d949b', rough=0.8, double=True),
        L.mat('wood', '#6f4a30', rough=0.5),
        L.mat('petal', '#f8dbe6', rough=0.6, emit='#f0a8c0', strength=0.25, double=True),
        L.mat('steel', '#e8eef2', metal=0.45, rough=0.2),
    ]


def ink_head(bm, z=1.64):
    L.ball(bm, (0, -0.01, z), 0.115, SKIN, scale=(0.92, 0.95, 1.08), seg=20)
    L.ball(bm, (0, 0.03, z + 0.022), 0.127, INK, scale=(1, 1, 1.04), seg=20)
    L.ball(bm, (0, 0.05, z + 0.18), 0.062, INK, seg=12)
    L.cyl(bm, (-0.13, 0.05, z + 0.18), (0.13, 0.05, z + 0.18), 0.01, JADE, segs=6)
    L.ball(bm, (0.13, 0.05, z + 0.18), 0.02, JGLOW, seg=6)
    L.tube(bm, [(0, 0.1, z), (0, 0.17, z - 0.3), (0, 0.2, z - 0.72)], [0.09, 0.08, 0.02], INK, segs=10, flat=0.4)
    for s in (1, -1):
        L.tube(bm, [(s * 0.1, -0.03, z + 0.03), (s * 0.13, -0.045, z - 0.15), (s * 0.115, -0.06, z - 0.32)], [0.03, 0.025, 0.008], INK, segs=6)
        L.ball(bm, (s * 0.042, -0.113, z + 0.004), 0.013, INK, seg=6)


def ink_dress(bm, hands, ribbons=True, tails=True):
    L.torus(bm, (0, 0, 1.07), 0.16, 0.024, JADE, axis='Z', flat=1.5)
    L.ball(bm, (0, -0.17, 1.07), 0.03, JGLOW, seg=8)
    for s in (1, -1):
        L.tube(bm, [(s * 0.04, -0.165, 1.05), (s * 0.07, -0.27, 0.72), (s * 0.11, -0.33, 0.42)], [0.03, 0.035, 0.02], JADE, segs=6, flat=0.15)
        L.tube(bm, [(s * 0.02, -0.07, 1.48), (s * 0.1, -0.13, 1.3), (s * 0.02, -0.15, 1.12)], [0.02, 0.028, 0.02], GREY, segs=6, flat=0.3)
        if ribbons:
            L.tube(bm, [(s * 0.12, 0.1, 1.45), (s * 0.5, 0.28, 1.88), (s * 0.84, 0.22, 1.42), (s * 0.62, 0.12, 0.86), (s * 0.86, 0.02, 0.46)],
                   [0.03, 0.05, 0.05, 0.04, 0.01], JADE, segs=8, n=28, flat=0.1, twist=1.6 * s)
    if tails:
        for key, s in (('R', 1), ('L', -1)):
            h = hands[key]
            L.tube(bm, [h, h + Vector((0, 0.03, -0.26)), h + Vector((s * 0.04, 0.07, -0.52))], [0.13, 0.11, 0.02], IROBE, segs=10, flat=0.35, cap0=False)
            L.ball(bm, h + Vector((0, -0.03, 0.02)), 0.036, SKIN, seg=8)


def jade_halo(mats, c=(0, 0.17, 1.68), R=0.27):
    hb = bmesh.new()
    c = Vector(c)
    L.torus(hb, c, R, 0.017, JGLOW, axis='Y', major=48)
    for i in range(3):
        a = TAU * i / 3 + 0.5
        L.ball(hb, c + Vector((math.cos(a) * R, 0, math.sin(a) * R)), 0.035, JADE, seg=8)
    return L.finish('spin_z_halo', hb, mats, origin=c, sharp=30)


SLIM = [(0.3, 0.1), (0.31, 0.36), (0.25, 0.68), (0.18, 0.96), (0.155, 1.06)]


def crane_wings(name, mats, root, span, lift, sweep, seed):
    return wing_pair(name, mats, root, span, lift, sweep, lambda b: L.feather_wing(b, span, INK, IFW, IFW, seed=seed))


def ink_crane():
    mats = ink_mats()
    bm = bmesh.new()
    hands = L.robed(bm, IROBE, 'hold', profile=SLIM, wind=0.22, lining=GREY, sleeve=(0.06, 0.11, 0.15))
    ink_head(bm)
    ink_dress(bm, hands)
    # 卷轴
    L.cyl(bm, (-0.19, -0.33, 1.22), (0.19, -0.33, 1.22), 0.042, IROBE, segs=12)
    L.cyl(bm, (-0.05, -0.33, 1.22), (0.05, -0.33, 1.22), 0.045, INK, segs=12)
    for s in (1, -1):
        L.ball(bm, (s * 0.2, -0.33, 1.22), 0.03, JADE, seg=8)
    body = L.finish('body', bm, mats)
    return [body, jade_halo(mats)] + crane_wings('a', mats, (0.08, 0.14, 1.38), 0.8, 26, 22, 11), dict(key='#f2fff8', rim='#8fd3b6')


def ink_blade():
    mats = ink_mats()
    bm = bmesh.new()
    hands = L.robed(bm, IROBE, ((0.42, -0.08, 1.34), (0.56, -0.3, 1.42)), 'open', profile=SLIM, wind=-0.22, lining=GREY)
    ink_head(bm)
    ink_dress(bm, hands)
    # 剑，与挥出的一道飞白墨痕
    H = hands['R']
    d = Vector((0.35, -0.35, 0.78)).normalized()
    L.cyl(bm, H - d * 0.13, H + d * 0.03, 0.018, JADE, segs=8)
    L.ball(bm, H + d * 0.04, 0.045, JADE, scale=(1.3, 1.3, 0.5), seg=8)
    L.tube(bm, [H + d * 0.04, H + d * 0.55, H + d * 1.0], [0.04, 0.036, 0.002], STEEL, segs=6, flat=0.16)
    tip = H + d * 1.0
    L.tube(bm, [tip, (0.1, -0.88, 1.78), (-0.52, -0.72, 1.26), (-0.8, -0.36, 0.7)], [0.012, 0.085, 0.06, 0.004], INK, segs=8, n=24, flat=0.08)
    L.tube(bm, [(0.2, -0.86, 1.6), (-0.4, -0.76, 1.12), (-0.66, -0.46, 0.66)], [0.006, 0.03, 0.003], GREY, segs=6, n=16, flat=0.1)
    body = L.finish('body', bm, mats)
    return [body, jade_halo(mats)] + crane_wings('a', mats, (0.08, 0.14, 1.38), 0.84, 32, 24, 12), dict(key='#f2fff8', rim='#8fd3b6')


def ink_lotus():
    mats = ink_mats()
    bm = bmesh.new()
    hands = L.robed(bm, IROBE, 'hold', profile=[(0.42, 0.62), (0.4, 0.72), (0.25, 0.94), (0.155, 1.06)], folds=6, fold_amp=0.06, lining=None)
    ink_head(bm)
    ink_dress(bm, hands, tails=False)
    hands_balls(bm, hands, SKIN, r=0.036)
    # 莲台：两圈花瓣托着一个玉座
    L.lathe(bm, [(0.05, 0.34), (0.34, 0.42), (0.42, 0.58)], JADE, segs=24, cap0=True, cap1=True)
    L.ball(bm, (0, 0, 0.3), 0.1, JGLOW, scale=(1, 1, 0.6), seg=10)
    for n, R, z, tilt, size, off in ((9, 0.4, 0.5, 58, 0.3, 0.0), (9, 0.33, 0.56, 30, 0.26, 0.5)):
        for i in range(n):
            tb = bmesh.new()
            L.ball(tb, (0, 0, size * 0.85), size, PETAL, scale=(0.5, 0.13, 1), seg=10)
            L.absorb(bm, tb, Matrix.Rotation(TAU * (i + off) / n, 4, 'Z') @ Matrix.Translation((0, -R, z)) @ L.rot(x=tilt))
    # 琵琶
    L.ball(bm, (0.08, -0.31, 1.13), 0.17, WOOD, scale=(0.75, 0.3, 1.1), seg=16)
    L.ball(bm, (0.08, -0.355, 1.13), 0.12, IROBE, scale=(0.75, 0.1, 1.05), seg=12)
    L.cyl(bm, (0.06, -0.3, 1.26), (-0.23, -0.27, 1.68), 0.022, WOOD, segs=8)
    L.ball(bm, (-0.24, -0.27, 1.7), 0.035, WOOD, seg=8)
    for k in range(2):
        p = Vector((-0.17 - k * 0.04, -0.27, 1.6 + k * 0.055))
        L.cyl(bm, p + Vector((0.05, 0, 0.04)), p - Vector((0.05, 0, 0.04)), 0.008, JADE, segs=5)
    body = L.finish('body', bm, mats)
    return [body, jade_halo(mats)] + crane_wings('a', mats, (0.08, 0.14, 1.38), 0.8, 30, 22, 13), dict(key='#f2fff8', rim='#8fd3b6')


def ink_dragon():
    mats = ink_mats()
    bm = bmesh.new()
    hands = L.robed(bm, IROBE, 'open', profile=SLIM, wind=0.15, lining=GREY)
    ink_head(bm)
    ink_dress(bm, hands, ribbons=False)
    # 云龙：绕身一圈半，龙首探在右前上方
    pts = []
    Nn = 30
    for k in range(Nn + 1):
        t = k / Nn
        a = math.pi / 2 + t * TAU * 1.6
        r = 0.66 - 0.14 * t + 0.05 * math.sin(t * 9)
        pts.append(Vector((math.cos(a) * r, math.sin(a) * r * 0.85, 0.12 + 1.86 * t ** 0.9)))
    L.tube(bm, pts, [0.012, 0.06, 0.1, 0.115, 0.115, 0.105, 0.09], IROBE, segs=12, n=Nn * 3, cap1=False)
    for k in range(3, Nn):
        p = pts[k]
        out = Vector((p.x, p.y, 0)).normalized()
        rr = L.samp([0.012, 0.06, 0.1, 0.115, 0.115, 0.105, 0.09], k / Nn)
        up = (out * 0.45 + Z * 0.9).normalized()
        L.spike(bm, p + up * rr * 0.7, p + up * (rr + 0.11) + (pts[k] - pts[k + 1]).normalized() * 0.06, 0.035, INK, segs=4)
        if k % 4 == 0:
            L.ball(bm, p - Z * rr * 0.6 + out * 0.05, 0.1, IROBE, scale=(1.3, 1.3, 0.7), seg=10)
            L.ball(bm, p - Z * rr * 0.5 - out * 0.08, 0.07, GREY, scale=(1.2, 1.2, 0.7), seg=8)
    E = pts[-1]
    f = (pts[-1] - pts[-2]).normalized()
    f = (f + Vector((0, -0.5, -0.25))).normalized()
    side = f.cross(Z).normalized()
    up = side.cross(f).normalized()
    L.tube(bm, [E - f * 0.05, E + f * 0.16, E + f * 0.36], [0.1, 0.115, 0.06], IROBE, segs=12, n=8)
    L.tube(bm, [E + f * 0.1 - up * 0.07, E + f * 0.33 - up * 0.1], [0.06, 0.035], GREY, segs=8, n=3)
    for s in (1, -1):
        L.ball(bm, E + f * 0.17 + side * s * 0.085 + up * 0.06, 0.03, JGLOW, seg=8)
        L.tube(bm, [E + f * 0.05 + side * s * 0.06 + up * 0.09, E - f * 0.08 + side * s * 0.12 + up * 0.26, E - f * 0.22 + side * s * 0.1 + up * 0.36], [0.025, 0.018, 0.004], JADE, segs=6)
        L.tube(bm, [E - f * 0.04 + side * s * 0.11 + up * 0.22, E - f * 0.02 + side * s * 0.2 + up * 0.3], [0.014, 0.003], JADE, segs=5, n=2)
        L.tube(bm, [E + f * 0.3 + side * s * 0.05, E + f * 0.42 + side * s * 0.2 - up * 0.05, E + f * 0.3 + side * s * 0.36 - up * 0.2], [0.012, 0.009, 0.002], JGLOW, segs=5)
    for k in range(4):
        L.spike(bm, E - f * (0.02 + k * 0.05) + up * 0.09, E - f * (0.12 + k * 0.06) + up * 0.24, 0.04, INK, segs=4)
    L.ball(bm, hands['L'] + Vector((0, -0.04, 0.08)), 0.06, JGLOW, seg=12)
    body = L.finish('body', bm, mats)
    objs = [body, jade_halo(mats)]
    objs += crane_wings('a', mats, (0.08, 0.14, 1.4), 0.92, 38, 20, 14)
    objs += crane_wings('b', mats, (0.08, 0.14, 1.26), 0.66, -18, 26, 15)
    return objs, dict(key='#f2fff8', rim='#8fd3b6')


BUILDERS = {
    'icon_acolyte': icon_acolyte, 'icon_choir': icon_choir, 'icon_shield': icon_shield,
    'mech_drone': mech_drone, 'mech_sentinel': mech_sentinel, 'mech_lancer': mech_lancer, 'mech_archon': mech_archon,
    'ink_crane': ink_crane, 'ink_blade': ink_blade, 'ink_lotus': ink_lotus, 'ink_dragon': ink_dragon,
}
