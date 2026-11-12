# 恶魔方角色：熔渊（岩石躯体 + 熔岩）、夜棘（哥特黑红）、蚀械（锈铁废械 + 毒绿）。
# 火口暴君在 build.py 里。

import math

import bmesh
from mathutils import Matrix, Vector

import avd_lib as L

TAU = math.tau
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def wing_pair(name, mats, root, span, lift, sweep, fn):
    return L.add_wing_pair(name, mats, root, L.wing_matrix(lift, sweep), fn)


# ───────────── 熔渊 ─────────────

ROCK, LAVA, OBS, MEMB, EYE, BONE = range(6)


def lava_mats():
    return [
        L.mat('rock_veins', '#3a2c2e', rough=0.86),
        L.mat('lava', '#ff8a2a', rough=0.5, emit='#ff5a12', strength=5.0),
        L.mat('obsidian', '#17121a', metal=0.55, rough=0.18),
        L.mat('membrane', '#5c1612', rough=0.7, emit='#b0260a', strength=0.5, double=True),
        L.mat('eye', '#fff0b0', emit='#ffd860', strength=7.0),
        L.mat('bone', '#d9c9a6', rough=0.5),
    ]


def rock_skin(bm, nodes, edges, levels=3, amp=0.035, seed=2):
    verts, faces = L.add_skin(bm, nodes, edges, ROCK, levels=levels)
    L.displace(bm, verts, amp, 3.4, seed=seed, amp2=amp * 0.35, freq2=10)


def rock_chunk(bm, c, r, sc, seed):
    v = L.ball(bm, c, r, ROCK, scale=sc, ico=2, smooth=False)
    L.displace(bm, v, r * 0.22, 7, seed=seed)


def lava_imp():
    mats = lava_mats()
    bm = bmesh.new()
    nodes = [((0, 0, 0.56), (0.13, 0.11)), ((0, -0.03, 0.86), (0.16, 0.13)), ((0, -0.09, 1.2), 0.21), ((0, -0.27, 1.13), (0.11, 0.08))]
    edges = [(0, 1), (1, 2), (2, 3)]
    for s in (1, -1):
        i = len(nodes)
        nodes += [((s * 0.1, 0, 0.5), 0.085), ((s * 0.17, -0.09, 0.28), 0.06), ((s * 0.17, 0.0, 0.07), 0.05), ((s * 0.18, -0.13, 0.04), (0.065, 0.035))]
        edges += [(0, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
        i = len(nodes)
        if s > 0:
            nodes += [((0.2, -0.03, 0.93), 0.07), ((0.35, -0.06, 1.16), 0.05), ((0.31, -0.1, 1.42), 0.06)]
        else:
            nodes += [((-0.2, -0.03, 0.93), 0.07), ((-0.36, -0.1, 0.76), 0.05), ((-0.32, -0.24, 0.62), 0.06)]
        edges += [(1, i), (i, i + 1), (i + 1, i + 2)]
    rock_skin(bm, nodes, edges, amp=0.02, seed=4)
    # 举在头顶的一团余烬
    v = L.ball(bm, (0.31, -0.12, 1.6), 0.13, LAVA, ico=2, smooth=False)
    L.displace(bm, v, 0.03, 9, seed=3)
    for k, (dx, dz) in enumerate(((0.12, 0.16), (-0.1, 0.2), (0.02, 0.26))):
        L.ball(bm, (0.31 + dx, -0.12, 1.6 + dz), 0.03 - k * 0.005, LAVA, ico=1, smooth=False)
    for s in (1, -1):
        L.tube(bm, [(s * 0.1, -0.08, 1.37), (s * 0.17, -0.05, 1.48), (s * 0.15, -0.12, 1.57)], [0.05, 0.035, 0.004], OBS, segs=6)
        L.spike(bm, (s * 0.19, -0.06, 1.24), (s * 0.4, 0.02, 1.34), 0.06, ROCK, segs=4)
        L.ball(bm, (s * 0.085, -0.275, 1.25), 0.045, EYE, scale=(1.2, 0.6, 1.1), seg=10)
        for k in range(3):
            L.spike(bm, (s * 0.32 + (k - 1) * 0.035, -0.28, 0.6) if s < 0 else (0.31 + (k - 1) * 0.035, -0.14, 1.47), (s * 0.32 + (k - 1) * 0.05, -0.38, 0.54) if s < 0 else (0.31 + (k - 1) * 0.06, -0.2, 1.55), 0.018, OBS, segs=4)
    # 咧开的嘴
    L.ball(bm, (0, -0.33, 1.1), 0.07, LAVA, scale=(1.4, 0.6, 0.35), seg=10)
    for k in range(4):
        x = -0.06 + k * 0.04
        L.spike(bm, (x, -0.365, 1.115), (x, -0.375, 1.07), 0.014, BONE, segs=4)
    # 尾巴，尖端一枚烧红的箭头
    L.tube(bm, [(0, 0.1, 0.55), (0, 0.4, 0.4), (0.2, 0.55, 0.6), (0.35, 0.45, 0.85)], [0.06, 0.04, 0.025, 0.015], ROCK, segs=7, n=14, cap0=False)
    L.spike(bm, (0.33, 0.47, 0.82), (0.44, 0.38, 1.02), 0.07, LAVA, segs=4)
    body = L.finish('body', bm, mats, sharp=50)
    wings = wing_pair('a', mats, (0.1, 0.12, 0.92), 0.5, 30, 30, lambda b: L.bat_wing(b, 0.5, OBS, MEMB, seed=5))
    return [body] + wings, dict(key='#ffd9b0', rim='#ff5a20', height=1.8)


def lava_hound():
    mats = lava_mats()
    bm = bmesh.new()
    nodes = [((0, 0.45, 0.76), (0.2, 0.2)), ((0, 0.0, 0.84), (0.24, 0.24)), ((0, -0.42, 0.88), (0.3, 0.31)),
             ((0, -0.7, 1.02), 0.17), ((0, -0.92, 1.08), (0.18, 0.16)), ((0, -1.16, 1.02), (0.1, 0.075))]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
    for s in (1, -1):
        i = len(nodes)
        nodes += [((s * 0.2, 0.5, 0.6), 0.14), ((s * 0.25, 0.66, 0.36), 0.09), ((s * 0.25, 0.54, 0.1), 0.07), ((s * 0.26, 0.4, 0.05), (0.09, 0.05))]
        edges += [(0, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
        i = len(nodes)
        nodes += [((s * 0.26, -0.44, 0.6), 0.15), ((s * 0.29, -0.4, 0.32), 0.1), ((s * 0.29, -0.54, 0.05), (0.1, 0.055))]
        edges += [(2, i), (i, i + 1), (i + 1, i + 2)]
    rock_skin(bm, nodes, edges, amp=0.035, seed=6)
    # 下颚与口中的火
    L.tube(bm, [(0, -0.84, 0.94), (0, -1.02, 0.9), (0, -1.16, 0.93)], [0.1, 0.08, 0.04], ROCK, segs=8, n=6)
    L.ball(bm, (0, -1.02, 0.965), 0.075, LAVA, scale=(1, 1.7, 0.45), seg=10)
    for s in (1, -1):
        for k in range(3):
            y = -0.98 - k * 0.07
            L.spike(bm, (s * 0.065, y, 1.0), (s * 0.065, y - 0.01, 0.93), 0.016, BONE, segs=4)
        L.spike(bm, (s * 0.06, -1.18, 0.96), (s * 0.06, -1.2, 1.06), 0.02, BONE, segs=4)
        L.ball(bm, (s * 0.1, -1.03, 1.15), 0.035, EYE, scale=(1, 1.4, 0.6), seg=8)
        # 向前冲的角、耳
        L.tube(bm, [(s * 0.13, -0.86, 1.2), (s * 0.26, -0.82, 1.36), (s * 0.24, -1.02, 1.5), (s * 0.14, -1.2, 1.46)], [0.065, 0.05, 0.03, 0.004], OBS, segs=7, n=14)
        for k in range(3):
            L.spike(bm, (s * (0.22 + k * 0.03), -0.5 + k * 0.08, 0.05), (s * (0.23 + k * 0.035), -0.66 + k * 0.08, 0.02), 0.03, OBS, segs=4)
        rock_chunk(bm, (s * 0.26, -0.44, 0.98), 0.16, (0.8, 1.2, 0.8), 11)
    # 脊背一排黑曜石刺
    for k in range(7):
        y = -0.72 + k * 0.2
        z = 1.2 - abs(k - 2) * 0.035 - (0.12 if k > 4 else 0)
        L.spike(bm, (0, y, z - 0.08), (0, y + 0.12, z + 0.24 - k * 0.012), 0.065, OBS, segs=5)
    L.tube(bm, [(0, 0.6, 0.8), (0, 0.9, 0.95), (0, 1.0, 1.3), (0.1, 0.86, 1.5)], [0.1, 0.07, 0.045, 0.02], ROCK, segs=7, n=14, cap0=False)
    L.ball(bm, (0.11, 0.85, 1.52), 0.06, LAVA, ico=1, smooth=False)
    body = L.finish('body', bm, mats, sharp=50)
    return [body], dict(key='#ffd9b0', rim='#ff5a20', height=1.9)


def lava_brute():
    mats = lava_mats()
    bm = bmesh.new()
    nodes = [((0, 0.02, 0.8), (0.26, 0.2)), ((0, -0.02, 1.08), (0.32, 0.24)), ((0, -0.08, 1.4), (0.44, 0.28)),
             ((0, -0.2, 1.56), 0.16), ((0, -0.3, 1.62), (0.19, 0.17)), ((0, -0.47, 1.54), (0.13, 0.09))]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
    for s in (1, -1):
        i = len(nodes)
        nodes += [((s * 0.2, 0.02, 0.72), 0.17), ((s * 0.28, -0.1, 0.42), 0.13), ((s * 0.28, 0.04, 0.14), 0.11), ((s * 0.3, -0.17, 0.07), (0.13, 0.07))]
        edges += [(0, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
        i = len(nodes)
        nodes += [((s * 0.58, -0.05, 1.5), 0.23), ((s * 0.82, -0.06, 1.08), 0.16), ((s * 0.84, -0.26, 0.66), 0.2), ((s * 0.84, -0.34, 0.42), 0.26)]
        edges += [(2, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
    rock_skin(bm, nodes, edges, amp=0.045, seed=8)
    for s in (1, -1):
        # 肩上一簇乱刺
        for k, (a, h, r) in enumerate(((0.4, 0.42, 0.09), (1.5, 0.3, 0.075), (2.6, 0.36, 0.08), (4.2, 0.24, 0.07), (5.4, 0.32, 0.075))):
            p = Vector((s * (0.6 + math.cos(a) * 0.14), -0.03 + math.sin(a) * 0.14, 1.62))
            L.spike(bm, p, p + Vector((s * (0.1 + math.cos(a) * 0.14), math.sin(a) * 0.16, h)), r, OBS, segs=5)
        rock_chunk(bm, (s * 0.6, -0.04, 1.6), 0.24, (1, 0.9, 0.6), 12)
        rock_chunk(bm, (s * 0.22, -0.33, 1.42), 0.22, (1, 0.5, 0.8), 13)
        rock_chunk(bm, (s * 0.9, -0.14, 0.9), 0.19, (0.8, 1, 1.5), 14)
        # 公羊一样盘卷的角
        L.tube(bm, [(s * 0.14, -0.26, 1.74), (s * 0.34, -0.14, 1.86), (s * 0.5, -0.24, 1.74), (s * 0.48, -0.46, 1.56), (s * 0.36, -0.52, 1.66)],
               [0.1, 0.09, 0.07, 0.045, 0.006], OBS, segs=8, n=22)
        L.ball(bm, (s * 0.085, -0.47, 1.68), 0.034, EYE, scale=(1.4, 0.7, 0.55), seg=8)
        L.spike(bm, (s * 0.09, -0.56, 1.5), (s * 0.1, -0.6, 1.66), 0.03, BONE, segs=5)
        # 滴着熔岩的拳
        v = L.ball(bm, (s * 0.84, -0.4, 0.4), 0.2, LAVA, scale=(1, 0.8, 0.8), ico=2, smooth=False)
        L.displace(bm, v, 0.03, 8, seed=9)
        for k in range(3):
            L.tube(bm, [(s * 0.84 + (k - 1) * 0.1, -0.42, 0.3), (s * 0.84 + (k - 1) * 0.1, -0.43, 0.12 + k * 0.04)], [0.035, 0.008], LAVA, segs=5, n=3)
        for k in range(3):
            L.spike(bm, (s * (0.22 + k * 0.08), -0.24, 0.05), (s * (0.22 + k * 0.1), -0.4, 0.02), 0.04, OBS, segs=5)
    L.tube(bm, [(-0.19, -0.42, 1.72), (0, -0.52, 1.74), (0.19, -0.42, 1.72)], [0.035, 0.05, 0.035], OBS, segs=6, n=6)
    L.ball(bm, (0, -0.55, 1.53), 0.07, LAVA, scale=(1.3, 0.8, 0.45), seg=10)
    for z, y, h in ((1.0, 0.22, 0.22), (1.24, 0.22, 0.3), (1.48, 0.2, 0.32)):
        L.spike(bm, (0, y - 0.05, z), (0, y + h, z + h * 0.7), 0.08, OBS, segs=5)
    body = L.finish('body', bm, mats, sharp=50)
    wings = wing_pair('a', mats, (0.22, 0.24, 1.46), 0.72, 26, 34, lambda b: L.bat_wing(b, 0.72, OBS, MEMB, ragged=1.0, seed=6))
    return [body] + wings, dict(key='#ffd9b0', rim='#ff5a20', height=2.3)


# ───────────── 夜棘 ─────────────

BLACK, CRIM, PALE, HAIR, BLOOD, SILVER, GMEMB, WHITE = range(8)


def goth_mats():
    return [
        L.mat('velvet', '#17131a', rough=0.75, double=True),
        L.mat('crimson', '#8e1838', rough=0.55, double=True),
        L.mat('pale', '#ece2e4', rough=0.55),
        L.mat('hair', '#0e0b10', rough=0.4),
        L.mat('blood', '#ff5a80', rough=0.4, emit='#ff2e63', strength=3.5),
        L.mat('silver', '#b9bcc6', metal=0.6, rough=0.25),
        L.mat('wing_membrane', '#6a1230', rough=0.7, emit='#a01040', strength=0.35, double=True),
        L.mat('lace', '#f2eef0', rough=0.8, double=True),
    ]


def goth_head(bm, z=1.64, horns='curl', hair='long'):
    L.ball(bm, (0, -0.01, z), 0.115, PALE, scale=(0.9, 0.95, 1.1), seg=20)
    for s in (1, -1):
        L.ball(bm, (s * 0.042, -0.113, z + 0.006), 0.016, BLOOD, scale=(1.3, 0.6, 0.7), seg=6)
        L.spike(bm, (s * 0.1, 0.0, z + 0.02), (s * 0.19, 0.03, z + 0.1), 0.03, PALE, segs=4)
        if horns == 'curl':
            L.tube(bm, [(s * 0.07, -0.02, z + 0.1), (s * 0.17, 0.02, z + 0.2), (s * 0.2, -0.04, z + 0.33), (s * 0.13, -0.1, z + 0.4)], [0.035, 0.03, 0.02, 0.003], HAIR, segs=6, n=14)
        elif horns == 'long':
            L.tube(bm, [(s * 0.07, 0.0, z + 0.1), (s * 0.13, 0.12, z + 0.26), (s * 0.12, 0.28, z + 0.46)], [0.032, 0.024, 0.003], HAIR, segs=6, n=10)
        elif horns == 'small':
            L.spike(bm, (s * 0.07, -0.03, z + 0.1), (s * 0.1, -0.05, z + 0.22), 0.025, HAIR, segs=5)
    if hair == 'long':
        L.ball(bm, (0, 0.03, z + 0.025), 0.128, HAIR, scale=(1, 1, 1.03), seg=20)
        L.tube(bm, [(0, 0.1, z), (0, 0.18, z - 0.35), (0, 0.22, z - 0.8)], [0.1, 0.1, 0.03], HAIR, segs=10, flat=0.4)
        for s in (1, -1):
            L.tube(bm, [(s * 0.1, -0.04, z + 0.04), (s * 0.135, -0.05, z - 0.18), (s * 0.12, -0.08, z - 0.4)], [0.03, 0.028, 0.006], HAIR, segs=6)
    elif hair == 'twin':
        L.ball(bm, (0, 0.03, z + 0.025), 0.128, HAIR, scale=(1, 1, 1.03), seg=20)
        for s in (1, -1):
            L.ball(bm, (s * 0.14, 0.04, z + 0.1), 0.05, HAIR, seg=10)
            L.tube(bm, [(s * 0.15, 0.04, z + 0.08), (s * 0.27, 0.08, z - 0.15), (s * 0.24, 0.06, z - 0.45)], [0.05, 0.055, 0.01], HAIR, segs=8, twist=2)
    elif hair == 'up':
        L.ball(bm, (0, 0.03, z + 0.025), 0.128, HAIR, scale=(1, 1, 1.03), seg=20)
        L.ball(bm, (0, 0.06, z + 0.17), 0.1, HAIR, scale=(1, 1, 1.15), seg=14)
        L.ball(bm, (0, 0.08, z + 0.3), 0.065, HAIR, seg=10)
        for s in (1, -1):
            L.tube(bm, [(s * 0.1, -0.04, z + 0.04), (s * 0.14, -0.06, z - 0.16), (s * 0.1, -0.1, z - 0.3)], [0.028, 0.024, 0.005], HAIR, segs=6, twist=3)
    elif hair == 'slick':
        L.ball(bm, (0, 0.035, z + 0.03), 0.122, HAIR, scale=(0.95, 1.05, 1.0), seg=20)


def goth_wings(name, mats, root, span, lift, sweep, seed, ragged=0.0):
    return wing_pair(name, mats, root, span, lift, sweep, lambda b: L.bat_wing(b, span, HAIR, GMEMB, ragged=ragged, seed=seed))


def skin_hands(bm, hands, mi=PALE):
    for h in hands.values():
        L.ball(bm, h, 0.04, mi, seg=10)


def goth_bat():
    mats = goth_mats()
    bm = bmesh.new()
    # 及膝的蓬裙，下面露出两条腿
    hands = L.robed(bm, BLACK, ((0.38, -0.08, 1.28), (0.46, -0.22, 1.42)), 'down',
                    profile=[(0.4, 0.5), (0.39, 0.62), (0.3, 0.84), (0.17, 1.0), (0.145, 1.06)], folds=10, fold_amp=0.07, lining=CRIM, sleeve=(0.07, 0.06, 0.05),
                    torso=((0.14, 0.1), (0.155, 0.11)))
    L.lathe(bm, [(0.42, 0.5), (0.43, 0.53)], WHITE, segs=64, n=1, rfun=lambda a, t: 1 + 0.07 * math.sin(a * 10 + 0.6) + 0.02 * math.sin(a * 40))
    for s in (1, -1):
        L.tube(bm, [(s * 0.09, 0, 0.7), (s * 0.1, -0.01, 0.35), (s * 0.1, 0.0, 0.1)], [0.065, 0.05, 0.04], BLACK, segs=8)
        L.ball(bm, (s * 0.1, -0.05, 0.05), 0.06, HAIR, scale=(0.8, 1.6, 0.7), seg=8)
        L.ball(bm, (s * 0.2, 0, 1.44), 0.085, WHITE, scale=(1, 1, 0.9), seg=10)
    # 白围裙、领结、发带
    L.tube(bm, [(0, -0.13, 1.3), (0, -0.2, 1.02), (0, -0.36, 0.72), (0, -0.44, 0.56)], [0.07, 0.09, 0.13, 0.15], WHITE, segs=8, flat=0.1, cap0=False)
    L.torus(bm, (0, 0, 1.06), 0.15, 0.02, WHITE, axis='Z', flat=1.4)
    for s in (1, -1):
        L.ball(bm, (s * 0.05, -0.12, 1.46), 0.04, CRIM, scale=(1.3, 0.5, 0.8), seg=8)
    goth_head(bm, horns='small', hair='twin')
    L.tube(bm, [(-0.12, 0.0, 1.73), (0, -0.03, 1.78), (0.12, 0.0, 1.73)], [0.02, 0.025, 0.02], WHITE, segs=6, flat=0.4)
    skin_hands(bm, hands)
    # 托盘与一杯绯红
    H = hands['R'] + Vector((0, -0.02, 0.05))
    L.disc(bm, H, 0.2, 0.014, SILVER, axis='Z', segs=24)
    L.torus(bm, H + Z * 0.008, 0.2, 0.012, SILVER, axis='Z', major=24, minor=5)
    L.lathe(bm, [(0.045, H.z + 0.01), (0.012, H.z + 0.03), (0.012, H.z + 0.11), (0.05, H.z + 0.16), (0.055, H.z + 0.24)], SILVER, segs=14, center=(H.x, H.y), cap0=True)
    L.ball(bm, (H.x, H.y, H.z + 0.22), 0.045, BLOOD, scale=(1, 1, 0.5), seg=10)
    body = L.finish('body', bm, mats)
    return [body] + goth_wings('a', mats, (0.08, 0.12, 1.36), 0.5, 30, 28, 21), dict(key='#ffe6f0', rim='#ff2e63')


def goth_organ():
    mats = goth_mats()
    bm = bmesh.new()
    hands = L.robed(bm, BLACK, 'play', profile=[(0.28, 0.05), (0.27, 0.36), (0.22, 0.7), (0.165, 0.98), (0.15, 1.06)], folds=7, fold_amp=0.07, lining=CRIM,
                    sleeve=(0.06, 0.055, 0.05), torso=((0.13, 0.1), (0.16, 0.11)))
    # 高立领、前襟一排扣
    L.lathe(bm, [(0.09, 1.44), (0.15, 1.58), (0.19, 1.74)], BLACK, segs=24, rfun=lambda a, t: 1.0 if math.sin(a) > -0.75 else 0.72)
    L.lathe(bm, [(0.085, 1.45), (0.14, 1.58), (0.175, 1.72)], CRIM, segs=24, rfun=lambda a, t: 1.0 if math.sin(a) > -0.75 else 0.72)
    for k in range(5):
        L.ball(bm, (0, -0.13 - k * 0.015, 1.36 - k * 0.14), 0.018, SILVER, seg=6)
    goth_head(bm, z=1.67, horns='long', hair='slick')
    skin_hands(bm, hands)
    for key, s in (('R', 1), ('L', -1)):
        for k in range(3):
            h = hands[key]
            L.spike(bm, h + Vector(((k - 1) * 0.02, -0.02, 0)), h + Vector(((k - 1) * 0.035, -0.1, -0.04)), 0.01, PALE, segs=4)
    # 悬在身前的键盘
    L.box(bm, (0, -0.56, 1.1), (0.62, 0.16, 0.035), HAIR, R=L.rot(x=-14))
    L.box(bm, (0, -0.57, 1.125), (0.58, 0.12, 0.02), WHITE, R=L.rot(x=-14))
    for k in range(9):
        L.box(bm, (-0.24 + k * 0.06, -0.545, 1.146), (0.022, 0.07, 0.02), HAIR, R=L.rot(x=-14))
    L.box(bm, (0, -0.55, 1.07), (0.5, 0.1, 0.02), BLOOD, R=L.rot(x=-14))
    # 背后一排荆棘缠着的风琴管
    for k in range(9):
        x = -0.48 + k * 0.12
        h = 2.5 - abs(k - 4) * 0.22
        y = 0.34 + abs(k - 4) * 0.02
        r = 0.05 - abs(k - 4) * 0.004
        L.cyl(bm, (x, y, 0.5 + abs(k - 4) * 0.08), (x, y, h), r, SILVER if k % 2 == 0 else HAIR, segs=10)
        L.tube(bm, [(x, y, h), (x, y, h + 0.08)], [r, r * 0.3], HAIR, segs=10, n=1)
        L.ball(bm, (x, y - r * 0.8, h - 0.25), r * 0.65, BLOOD, scale=(1, 0.5, 2.2), seg=8)
    L.box(bm, (0, 0.34, 0.62), (1.1, 0.14, 0.12), HAIR)
    L.vine(bm, [(-0.56, 0.3, 0.6), (-0.2, 0.22, 1.1), (0.3, 0.26, 1.5), (0.56, 0.3, 2.0), (0.3, 0.42, 2.3)], 0.018, HAIR, CRIM, seed=3, n=28)
    L.vine(bm, [(0.56, 0.28, 0.66), (0.1, 0.22, 0.95), (-0.4, 0.26, 1.6), (-0.3, 0.4, 2.2)], 0.016, HAIR, CRIM, seed=4, n=24)
    body = L.finish('body', bm, mats)
    return [body] + goth_wings('a', mats, (0.07, 0.14, 1.38), 0.5, -20, 50, 22), dict(key='#ffe6f0', rim='#ff2e63', height=2.6)


def goth_thorn():
    mats = goth_mats()
    bm = bmesh.new()
    hands = L.humanoid(bm, BLACK, 'down', 'hold', bulk=1.2)
    # 盔：细缝里透出红光，一对弯角
    L.ball(bm, (0, 0, 1.66), 0.14, HAIR, scale=(0.92, 1, 1.12), seg=20)
    L.ball(bm, (0, -0.075, 1.67), 0.09, BLOOD, scale=(1.1, 0.7, 0.14), seg=12)
    L.plate(bm, [(0, -0.15, 1.6), (0, -0.19, 1.72), (0, -0.05, 1.86), (0, 0.12, 1.84), (0, 0.1, 1.74)], 0.02, SILVER)
    for s in (1, -1):
        L.tube(bm, [(s * 0.1, 0.0, 1.74), (s * 0.24, 0.02, 1.84), (s * 0.3, -0.06, 2.02), (s * 0.22, -0.14, 2.14)], [0.045, 0.04, 0.026, 0.003], HAIR, segs=7, n=16)
        # 肩甲带刺
        L.ball(bm, (s * 0.31, 0, 1.48), 0.14, HAIR, scale=(1.15, 1, 0.8), seg=14)
        L.torus(bm, (s * 0.31, 0, 1.44), 0.145, 0.012, SILVER, axis='Z', major=20, minor=5)
        for a in (0.3, 1.4, 2.5):
            p = Vector((s * (0.33 + math.cos(a) * 0.06), math.sin(a) * 0.08 - 0.02, 1.55))
            L.spike(bm, p, p + Vector((s * 0.12, math.sin(a) * 0.1, 0.16)), 0.03, SILVER, segs=4)
        L.ball(bm, (s * 0.14, -0.06, 0.52), 0.085, HAIR, scale=(1, 1, 1.3), seg=10)
        L.ball(bm, hands['R' if s > 0 else 'L'], 0.065, HAIR, seg=10)
    L.ball(bm, (0, -0.06, 1.32), 0.2, HAIR, scale=(1.05, 0.75, 0.95), seg=18)
    L.ball(bm, (0, -0.2, 1.36), 0.035, BLOOD, seg=8)
    L.torus(bm, (0, 0, 1.0), 0.19, 0.03, SILVER, axis='Z', flat=1.3)
    for s in (1, -1):
        L.plate(bm, [(s * 0.05, -0.18, 0.98), (s * 0.22, -0.13, 0.98), (s * 0.25, -0.15, 0.62), (s * 0.12, -0.2, 0.54)], 0.02, HAIR)
    # 绯红披风
    L.cape(bm, (-0.3, 0.12, 1.5), (0.3, 0.12, 1.5), 1.35, CRIM, flare=1.7, waves=3, back=0.32)
    # 塔盾：筝形黑铁，边缘一圈荆棘
    c = Vector((-0.3, -0.42, 1.0))
    sh = [Vector(p) for p in ((-0.3, 0, 0.5), (0.3, 0, 0.5), (0.34, 0, 0.1), (0, 0, -0.62), (-0.34, 0, 0.1))]
    L.plate(bm, [c + p for p in sh], 0.045, HAIR)
    L.plate(bm, [c + p * 0.6 + Vector((0, -0.03, 0.0)) for p in sh], 0.02, CRIM)
    L.ball(bm, c + Vector((0, -0.05, 0.1)), 0.06, BLOOD, scale=(1, 0.5, 1), seg=10)
    ring = [c + p + Vector((0, -0.035, 0)) for p in sh]
    L.vine(bm, ring + [ring[0]], 0.02, HAIR, SILVER, seed=5, n=40)
    # 右手一柄倒垂的刺剑
    H = hands['R']
    L.cyl(bm, H + Vector((0, 0, 0.12)), H + Vector((0, 0, -0.04)), 0.02, HAIR, segs=8)
    L.box(bm, H + Vector((0, 0, -0.05)), (0.05, 0.2, 0.03), SILVER)
    L.tube(bm, [H + Vector((0, 0, -0.06)), H + Vector((0, -0.02, -0.5)), H + Vector((0, -0.04, -0.86))], [0.04, 0.035, 0.002], SILVER, segs=6, flat=0.2)
    L.vine(bm, [(0.16, -0.1, 0.1), (0.05, -0.14, 0.5), (0.2, -0.1, 0.9), (0.34, 0.0, 1.2)], 0.014, HAIR, CRIM, seed=6, n=22)
    body = L.finish('body', bm, mats)
    return [body] + goth_wings('a', mats, (0.1, 0.2, 1.42), 0.7, 34, 36, 23), dict(key='#ffe6f0', rim='#ff2e63', height=2.3)


def goth_countess():
    mats = goth_mats()
    bm = bmesh.new()
    hands = L.robed(bm, BLACK, 'point', 'open', profile=[(0.2, 0.0), (0.46, 0.22), (0.42, 0.5), (0.27, 0.8), (0.15, 1.0), (0.13, 1.06)], folds=8, fold_amp=0.12, lining=CRIM,
                    sleeve=(0.05, 0.05, 0.09), torso=((0.125, 0.095), (0.15, 0.105)))
    # 外裙：绯红的一层，下摆裁成花瓣
    L.lathe(bm, [(0.44, 0.52), (0.3, 0.78), (0.165, 1.0), (0.14, 1.06)], CRIM, segs=64,
            rfun=lambda a, t: 1 + 0.1 * math.sin(a * 8 + 0.6) * (1 - t),
            zfun=lambda a, t: -0.16 * abs(math.sin(a * 4)) * (1 - t) ** 1.5)
    L.torus(bm, (0, 0, 1.05), 0.14, 0.02, SILVER, axis='Z', flat=1.3)
    L.ball(bm, (0, -0.15, 1.05), 0.03, BLOOD, seg=8)
    # 露肩，立起的月牙领
    for s in (1, -1):
        L.ball(bm, (s * 0.18, 0, 1.43), 0.07, PALE, seg=10)
        L.tube(bm, [(s * 0.06, 0.1, 1.46), (s * 0.2, 0.12, 1.62), (s * 0.26, 0.06, 1.8)], [0.05, 0.07, 0.01], CRIM, segs=8, flat=0.2)
    L.ball(bm, (0, -0.02, 1.4), 0.13, PALE, scale=(1.1, 0.75, 0.6), seg=12)
    L.ball(bm, (0, -0.105, 1.42), 0.03, BLOOD, scale=(1, 0.6, 1.3), seg=8)
    goth_head(bm, horns='curl', hair='up')
    skin_hands(bm, hands)
    # 刺剑
    H = hands['R']
    d = Vector((0.25, -0.75, 0.3)).normalized()
    L.cyl(bm, H - d * 0.1, H + d * 0.03, 0.016, HAIR, segs=8)
    L.ball(bm, H + d * 0.04, 0.05, SILVER, scale=(1, 1, 1), ico=1, smooth=False)
    L.torus(bm, H + d * 0.04, 0.06, 0.008, SILVER, axis='Y', major=16, minor=5)
    L.tube(bm, [H + d * 0.05, H + d * 0.95], [0.014, 0.002], SILVER, segs=6, n=1)
    L.ball(bm, hands['L'] + Vector((0, -0.02, 0.1)), 0.05, BLOOD, seg=12)
    body = L.finish('body', bm, mats)
    # 脑后一弯绯月
    mb = bmesh.new()
    c = Vector((0, 0.2, 1.78))
    arc = [c + Vector((math.cos(a) * 0.42, 0, math.sin(a) * 0.42)) for a in [math.radians(-50 + i * 28) for i in range(11)]]
    L.tube(mb, arc, [0.002, 0.03, 0.05, 0.03, 0.002], BLOOD, segs=8, n=40, flat=0.35)
    moon = L.finish('moon', mb, mats, origin=c, sharp=0)
    return [body, moon] + goth_wings('a', mats, (0.08, 0.12, 1.38), 1.0, 38, 22, 24), dict(key='#ffe6f0', rim='#ff2e63', height=2.4)


# ───────────── 蚀械 ─────────────

RUST, IRON, TOXIC, DARK, HAZ = range(5)


def rust_mats():
    return [
        L.mat('rust', '#8f4a28', rough=0.9),
        L.mat('iron', '#50525a', metal=0.55, rough=0.5),
        L.mat('toxic', '#d8ff7a', rough=0.4, emit='#9bff3d', strength=4.0),
        L.mat('soot', '#1c1a1a', rough=0.8),
        L.mat('hazard', '#c9a227', rough=0.7),
    ]


def rivets(bm, pts, r=0.016):
    for p in pts:
        L.ball(bm, p, r, IRON, seg=6)


def claw(bm, at, d, size=1.0, n=3, mi=IRON):
    at, d = Vector(at), Vector(d).normalized()
    side = d.cross(Z).normalized() if abs(d.z) < 0.9 else X
    for k in range(n):
        o = side * (k - (n - 1) / 2) * 0.07 * size
        L.tube(bm, [at + o, at + o * 1.6 + d * 0.14 * size + Z * 0.03 * size, at + o * 1.2 + d * 0.26 * size - Z * 0.06 * size], [0.03 * size, 0.024 * size, 0.003], mi, segs=5, n=6)


def mite(tb, seed):
    v = L.ball(tb, (0, 0.02, 0.34), 0.28, RUST, scale=(1, 1.3, 0.7), ico=2, smooth=False)
    L.displace(tb, v, 0.03, 6, seed=seed)
    L.torus(tb, (0, 0.02, 0.36), 0.2, 0.02, IRON, axis='Y', major=10, minor=4, smooth=False, flat=1.0)
    L.box(tb, (0, -0.33, 0.3), (0.22, 0.18, 0.16), IRON, taper=0.7)
    L.box(tb, (0, 0.1, 0.52), (0.1, 0.3, 0.05), TOXIC)
    for s in (1, -1):
        L.ball(tb, (s * 0.07, -0.42, 0.33), 0.04, TOXIC, seg=8)
        L.tube(tb, [(s * 0.06, -0.4, 0.24), (s * 0.14, -0.54, 0.22), (s * 0.04, -0.62, 0.2)], [0.025, 0.02, 0.003], IRON, segs=5)
        L.tube(tb, [(s * 0.06, -0.3, 0.4), (s * 0.12, -0.36, 0.62), (s * 0.2, -0.5, 0.7)], [0.012, 0.01, 0.004], IRON, segs=4)
        for k in range(3):
            y = -0.18 + k * 0.2
            L.tube(tb, [(s * 0.2, y, 0.3), (s * 0.42, y + (k - 1) * 0.08, 0.42), (s * 0.5, y + (k - 1) * 0.14, 0.02)], [0.03, 0.024, 0.008], IRON, segs=5, n=6)
            L.ball(tb, (s * 0.42, y + (k - 1) * 0.08, 0.42), 0.035, DARK, seg=6)


def rust_mite():
    mats = rust_mats()
    bm = bmesh.new()
    for i, (x, y, sc, rz) in enumerate(((-0.46, -0.1, 0.9, 18), (0.44, -0.25, 0.8, -24), (0.02, 0.42, 1.1, 4))):
        tb = bmesh.new()
        mite(tb, seed=i + 1)
        L.absorb(bm, tb, Matrix.Translation((x, y, 0)) @ L.rot(z=rz) @ Matrix.Diagonal((sc, sc, sc, 1)))
    body = L.finish('body', bm, mats)
    return [body], dict(key='#f0ffd0', rim='#9bff3d', height=1.4)


def rust_saw():
    mats = rust_mats()
    bm = bmesh.new()
    # 细长的腿、骨盆、脊柱
    for s in (1, -1):
        L.cyl(bm, (s * 0.1, 0, 0.92), (s * 0.15, -0.08, 0.5), 0.035, IRON, segs=6)
        L.box(bm, (s * 0.15, -0.08, 0.5), (0.1, 0.1, 0.1), RUST, R=L.rot(x=20))
        L.cyl(bm, (s * 0.15, -0.08, 0.5), (s * 0.14, 0.03, 0.08), 0.03, IRON, segs=6)
        L.box(bm, (s * 0.14, -0.05, 0.04), (0.12, 0.26, 0.08), RUST, taper=0.7)
    L.box(bm, (0, 0, 0.94), (0.3, 0.18, 0.14), RUST, taper=0.8)
    L.cyl(bm, (0, 0.02, 0.98), (0, -0.04, 1.3), 0.04, IRON, segs=6)
    L.box(bm, (0, -0.06, 1.4), (0.36, 0.24, 0.3), RUST, R=L.rot(x=-12), taper=1.25)
    L.box(bm, (0.06, -0.2, 1.4), (0.14, 0.03, 0.16), HAZ, R=L.rot(x=-12))
    rivets(bm, [(sx * 0.15, -0.19, 1.3 + k * 0.1) for sx in (1, -1) for k in range(3)])
    # 背上的冷却液罐，漏着毒绿
    L.cyl(bm, (-0.06, 0.16, 1.2), (-0.06, 0.16, 1.62), 0.085, TOXIC, segs=10)
    for z in (1.2, 1.41, 1.62):
        L.cyl(bm, (-0.06, 0.16, z - 0.025), (-0.06, 0.16, z + 0.025), 0.095, IRON, segs=10)
    L.tube(bm, [(-0.06, 0.16, 1.64), (0.1, 0.2, 1.8), (0.34, 0.06, 1.6), (0.44, -0.1, 1.36)], [0.022, 0.022, 0.022], TOXIC, segs=6, n=16)
    # 头：歪着的铁盒，弯折的天线角
    L.box(bm, (0.02, -0.12, 1.72), (0.22, 0.24, 0.18), RUST, R=L.rot(y=10, x=-8), taper=0.85)
    L.box(bm, (0.02, -0.25, 1.66), (0.18, 0.06, 0.06), IRON, R=L.rot(y=10))
    for s in (1, -1):
        L.ball(bm, (0.02 + s * 0.055, -0.245, 1.74), 0.035 if s > 0 else 0.022, TOXIC, seg=8)
        L.tube(bm, [(s * 0.1, -0.1, 1.8), (s * 0.2, -0.06, 1.98), (s * 0.3, -0.14, 1.94)], [0.02, 0.016, 0.006], IRON, segs=5, n=6)
    # 左臂：三指爪
    L.cyl(bm, (-0.2, -0.04, 1.48), (-0.36, -0.02, 1.16), 0.035, IRON, segs=6)
    L.ball(bm, (-0.2, -0.04, 1.5), 0.075, RUST, ico=1, smooth=False)
    L.cyl(bm, (-0.36, -0.02, 1.16), (-0.34, -0.2, 0.88), 0.03, IRON, segs=6)
    L.box(bm, (-0.34, -0.2, 0.88), (0.1, 0.1, 0.1), RUST)
    claw(bm, (-0.34, -0.22, 0.84), (0, -0.6, -0.8), size=0.9)
    # 右臂：链锯
    L.ball(bm, (0.2, -0.04, 1.5), 0.085, RUST, ico=1, smooth=False)
    L.cyl(bm, (0.2, -0.04, 1.48), (0.42, -0.1, 1.3), 0.04, IRON, segs=6)
    L.box(bm, (0.46, -0.16, 1.28), (0.2, 0.3, 0.22), HAZ, R=L.rot(x=-10))
    L.box(bm, (0.46, -0.1, 1.42), (0.08, 0.14, 0.06), DARK)
    a, b = Vector((0.46, -0.3, 1.26)), Vector((0.46, -1.18, 1.12))
    d = (b - a).normalized()
    up = Vector((0, d.z, -d.y)).normalized() * -1
    bar = [a + up * 0.09, b + up * 0.07, b + d * 0.06, b - up * 0.07, a - up * 0.09]
    L.plate(bm, bar, 0.03, IRON)
    L.plate(bm, [p + (Vector((0.46, -0.74, 1.19)) - p) * 0.3 + X * 0.018 for p in bar], 0.012, TOXIC)
    for k in range(11):
        t = k / 10
        for sg in (1, -1):
            p = a.lerp(b, t) + up * sg * (0.09 - 0.02 * t)
            L.spike(bm, p, p + up * sg * 0.055 + d * 0.03, 0.022, DARK, segs=4)
    body = L.finish('body', bm, mats)
    wings = wing_pair('a', mats, (0.1, 0.24, 1.5), 0.7, 28, 30, lambda b: L.scrap_wing(b, 0.7, RUST, IRON, DARK, seed=3))
    return [body] + wings, dict(key='#f0ffd0', rim='#9bff3d')


def rust_core():
    mats = rust_mats()
    bm = bmesh.new()
    # 炉身：一只矮墩墩的铁桶
    L.lathe(bm, [(0.3, 0.34), (0.47, 0.52), (0.52, 0.95), (0.44, 1.26), (0.3, 1.4)], RUST, segs=10, n=4, smooth=False, cap0=True, cap1=True)
    for z, r in ((0.55, 0.49), (1.24, 0.46)):
        L.torus(bm, (0, 0, z), r, 0.03, IRON, axis='Z', major=10, minor=5, smooth=False)
        rivets(bm, [(math.cos(TAU * k / 10) * (r + 0.02), math.sin(TAU * k / 10) * (r + 0.02), z + 0.06) for k in range(10)], r=0.02)
    # 胸口裂开的炉心，外面焊着铁栅
    c = Vector((0, -0.4, 0.9))
    L.ball(bm, c, 0.24, TOXIC, scale=(1, 0.6, 1), seg=16)
    L.torus(bm, c + Y * -0.08, 0.27, 0.035, IRON, axis='Y', major=10, minor=5, smooth=False)
    for k in (-1, 0, 1):
        L.tube(bm, [c + Vector((k * 0.12, -0.08, -0.26)), c + Vector((k * 0.13, -0.2, 0)), c + Vector((k * 0.12, -0.08, 0.26))], [0.022, 0.026, 0.022], IRON, segs=6, n=8)
    L.plate(bm, [c + Vector((0.2, -0.1, 0.3)), c + Vector((0.36, -0.04, 0.38)), c + Vector((0.38, -0.05, 0.1)), c + Vector((0.26, -0.1, 0.16))], 0.03, HAZ)
    # 烟囱角
    for x, y, h, r in ((0.2, 0.05, 0.62, 0.085), (-0.18, 0.1, 0.44, 0.075), (0.02, 0.24, 0.3, 0.06)):
        L.cyl(bm, (x, y, 1.36), (x * 1.25, y, 1.4 + h), r, IRON, segs=8)
        L.torus(bm, (x * 1.25, y, 1.4 + h), r + 0.01, 0.02, DARK, axis='Z', major=8, minor=4, smooth=False)
        L.ball(bm, (x * 1.25, y, 1.4 + h), r * 0.8, TOXIC, scale=(1, 1, 0.5), seg=8)
    # 头：陷在桶沿里的小铁盒，一道眼缝
    L.box(bm, (0, -0.26, 1.44), (0.3, 0.24, 0.18), IRON, taper=0.8)
    L.box(bm, (0, -0.385, 1.45), (0.22, 0.03, 0.04), TOXIC)
    for s in (1, -1):
        # 短腿
        L.box(bm, (s * 0.24, 0, 0.26), (0.22, 0.26, 0.3), IRON, taper=0.8)
        L.box(bm, (s * 0.25, -0.06, 0.06), (0.28, 0.42, 0.12), RUST, taper=0.75)
        # 粗臂 + 爪
        L.ball(bm, (s * 0.56, -0.02, 1.12), 0.15, RUST, ico=2, smooth=False)
        L.cyl(bm, (s * 0.58, -0.02, 1.1), (s * 0.72, -0.1, 0.72), 0.075, IRON, segs=8)
        L.box(bm, (s * 0.74, -0.16, 0.56), (0.24, 0.26, 0.34), RUST, R=L.rot(x=20), taper=1.2)
        claw(bm, (s * 0.74, -0.24, 0.4), (0, -0.7, -0.7), size=1.3)
        # 管线
        L.tube(bm, [(s * 0.4, 0.3, 0.7), (s * 0.56, 0.42, 1.0), (s * 0.36, 0.36, 1.34), (s * 0.2, 0.16, 1.5)], [0.04, 0.04, 0.04], DARK, segs=6, n=14)
    L.tube(bm, [(0.1, 0.44, 0.6), (0.2, 0.56, 0.4), (0.1, 0.6, 0.16)], [0.03, 0.03, 0.03], TOXIC, segs=6, n=8)
    body = L.finish('body', bm, mats)
    return [body], dict(key='#f0ffd0', rim='#9bff3d', height=2.1)


def rust_colossus():
    mats = rust_mats()
    bm = bmesh.new()
    for s in (1, -1):
        L.box(bm, (s * 0.2, 0.0, 0.72), (0.22, 0.24, 0.42), RUST, taper=0.85)
        L.ball(bm, (s * 0.2, -0.06, 0.5), 0.1, IRON, ico=1, smooth=False)
        L.box(bm, (s * 0.21, 0.0, 0.3), (0.2, 0.22, 0.4), IRON, taper=1.2)
        L.cyl(bm, (s * 0.3, 0.1, 0.84), (s * 0.3, 0.12, 0.2), 0.03, DARK, segs=6)
        L.box(bm, (s * 0.22, -0.08, 0.06), (0.3, 0.46, 0.12), RUST, taper=0.75)
        L.plate(bm, [(s * 0.1, -0.15, 0.86), (s * 0.32, -0.15, 0.86), (s * 0.32, -0.17, 0.56), (s * 0.12, -0.17, 0.62)], 0.025, HAZ if s > 0 else IRON)
    L.box(bm, (0, 0, 0.98), (0.5, 0.3, 0.16), IRON, taper=0.8)
    L.cyl(bm, (0, 0, 1.02), (0, 0, 1.2), 0.1, DARK, segs=8)
    # 躯干：倒梯形的铁箱，胸前三道毒绿的散热缝
    L.box(bm, (0, -0.02, 1.48), (0.56, 0.38, 0.58), RUST, taper=1.5)
    for k in range(3):
        L.box(bm, (0, -0.26 - k * 0.012, 1.36 + k * 0.12), (0.36 + k * 0.08, 0.03, 0.045), TOXIC)
    L.plate(bm, [(-0.4, -0.3, 1.74), (-0.1, -0.31, 1.74), (-0.14, -0.27, 1.5), (-0.36, -0.26, 1.54)], 0.03, IRON)
    L.plate(bm, [(0.12, -0.31, 1.76), (0.42, -0.3, 1.76), (0.4, -0.26, 1.62), (0.16, -0.27, 1.6)], 0.03, HAZ)
    rivets(bm, [(sx * 0.4, -0.3, 1.5 + k * 0.1) for sx in (1, -1) for k in range(3)], r=0.02)
    # 头：小铁盒上一只独眼
    L.box(bm, (0, -0.12, 1.9), (0.26, 0.26, 0.2), IRON, taper=0.8)
    L.ball(bm, (0, -0.25, 1.9), 0.075, TOXIC, seg=12)
    L.torus(bm, (0, -0.245, 1.9), 0.09, 0.02, DARK, axis='Y', major=8, minor=4, smooth=False)
    L.tube(bm, [(0.1, -0.05, 1.98), (0.18, 0.0, 2.2), (0.28, -0.06, 2.24)], [0.016, 0.012, 0.005], IRON, segs=5, n=6)
    # 右肩：大铁箱 + 排气管；左肩：一只旧齿轮
    L.box(bm, (0.6, 0, 1.78), (0.42, 0.4, 0.3), RUST, R=L.rot(y=12), taper=0.8)
    L.plate(bm, [(0.42, -0.21, 1.9), (0.78, -0.21, 1.84), (0.78, -0.21, 1.7), (0.42, -0.21, 1.74)], 0.02, HAZ)
    L.torus(bm, (-0.62, 0, 1.76), 0.17, 0.08, IRON, axis='X', major=12, minor=6, smooth=False)
    for k in range(12):
        a = TAU * k / 12
        L.box(bm, (-0.62, math.cos(a) * 0.26, 1.76 + math.sin(a) * 0.26), (0.12, 0.07, 0.07), IRON, R=L.rot(x=math.degrees(a)))
    L.ball(bm, (-0.62, 0, 1.76), 0.1, RUST, ico=1, smooth=False)
    for x, y, h in ((0.2, 0.26, 0.7), (0.0, 0.3, 0.5), (-0.2, 0.26, 0.62)):
        L.cyl(bm, (x, y, 1.5), (x, y + 0.08, 1.8 + h), 0.065, IRON, segs=8)
        L.torus(bm, (x, y + 0.08, 1.8 + h), 0.075, 0.018, DARK, axis='Z', major=8, minor=4, smooth=False)
        L.ball(bm, (x, y + 0.08, 1.8 + h), 0.05, TOXIC, scale=(1, 1, 0.5), seg=8)
    # 左臂：巨爪
    L.cyl(bm, (-0.64, 0, 1.66), (-0.8, -0.06, 1.2), 0.075, IRON, segs=8)
    L.box(bm, (-0.82, -0.14, 0.96), (0.28, 0.3, 0.44), RUST, R=L.rot(x=18), taper=1.25)
    claw(bm, (-0.82, -0.24, 0.74), (0, -0.6, -0.8), size=1.7)
    # 右臂：臂端托着圆锯（圆锯单独做成自转部件）
    L.cyl(bm, (0.64, 0, 1.64), (0.82, -0.08, 1.2), 0.075, IRON, segs=8)
    L.box(bm, (0.84, -0.2, 1.06), (0.24, 0.5, 0.26), RUST, R=L.rot(x=14))
    L.box(bm, (0.72, -0.5, 0.98), (0.03, 0.34, 0.1), IRON, R=L.rot(x=14))
    L.tube(bm, [(0.3, 0.2, 1.3), (0.6, 0.3, 1.1), (0.86, 0.06, 1.14)], [0.03, 0.03, 0.03], TOXIC, segs=6, n=10)
    body = L.finish('body', bm, mats)
    sb = bmesh.new()
    c = Vector((0.84, -0.62, 0.95))
    L.disc(sb, c, 0.3, 0.025, IRON, axis='X', segs=24)
    L.disc(sb, c, 0.1, 0.06, DARK, axis='X', segs=10)
    L.torus(sb, c, 0.2, 0.012, TOXIC, axis='X', major=24, minor=4)
    for k in range(16):
        a = TAU * k / 16
        p = c + Vector((0, math.cos(a) * 0.29, math.sin(a) * 0.29))
        L.spike(sb, p, p + Vector((0, math.cos(a + 0.5) * 0.1, math.sin(a + 0.5) * 0.1)), 0.035, IRON, segs=4)
    saw = L.finish('spin_x_saw', sb, mats, origin=c, sharp=30)
    wings = wing_pair('a', mats, (0.2, 0.3, 1.7), 0.95, 30, 30, lambda b: L.scrap_wing(b, 0.95, RUST, IRON, DARK, seed=5))
    return [body, saw] + wings, dict(key='#f0ffd0', rim='#9bff3d', height=2.6)


BUILDERS = {
    'lava_imp': lava_imp, 'lava_hound': lava_hound, 'lava_brute': lava_brute,
    'goth_bat': goth_bat, 'goth_organ': goth_organ, 'goth_thorn': goth_thorn, 'goth_countess': goth_countess,
    'rust_mite': rust_mite, 'rust_saw': rust_saw, 'rust_core': rust_core, 'rust_colossus': rust_colossus,
}
