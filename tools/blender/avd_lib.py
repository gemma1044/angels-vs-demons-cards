# 角色建模的公共积木：材质、扫掠管、旋转体、蒙皮躯干、羽翼、蝠翼、AO 烘焙、导出、预览渲染。
# 约定：Blender 坐标，Z 向上，角色面朝 -Y（导出 glTF 后即面朝 +Z），脚底 z=0，scale=1 时人形约 1.9 高。

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

TAU = math.tau


# ───────────── 基础 ─────────────

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def mat(name, color, metal=0.0, rough=0.6, emit=None, strength=0.0, double=False):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs[0], out.inputs[0])
    col = srgb(color) if isinstance(color, str) else color
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit is not None:
        e = srgb(emit) if isinstance(emit, str) else emit
        b.inputs['Emission Color'].default_value = (*e, 1)
        b.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = not double
    return m


def samp(vals, t):
    """在等距控制值之间做线性插值；值可以是数或 (a, b)"""
    if not isinstance(vals, (list, tuple)) or len(vals) == 1:
        return vals if not isinstance(vals, (list, tuple)) else vals[0]
    u = max(0.0, min(1.0, t)) * (len(vals) - 1)
    k = min(int(u), len(vals) - 2)
    f = u - k
    a, b = vals[k], vals[k + 1]
    if isinstance(a, (tuple, list)):
        return tuple(a[i] + (b[i] - a[i]) * f for i in range(len(a)))
    return a + (b - a) * f


def cr(pts, n):
    """Catmull-Rom 重采样成 n+1 个点"""
    P = [Vector(p) for p in pts]
    segs = len(P) - 1
    if segs == 1:
        return [P[0].lerp(P[1], i / n) for i in range(n + 1)]
    out = []
    for i in range(n + 1):
        u = i / n * segs
        k = min(int(u), segs - 1)
        f = u - k
        p0, p1, p2, p3 = P[max(k - 1, 0)], P[k], P[k + 1], P[min(k + 2, segs)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3))
    return out


def _tag(faces, mi, smooth):
    for f in faces:
        f.material_index = mi
        f.smooth = smooth


def tube(bm, pts, radii, mi=0, segs=10, n=None, cap0=True, cap1=True, flat=1.0, smooth=True, twist=0.0):
    """沿折线扫掠的变径管。radii 沿长度插值；flat<1 压扁成带状。"""
    n = n or max(1, (len(pts) - 1) * 5)
    C = cr(pts, n)
    T = [(C[min(i + 1, n)] - C[max(i - 1, 0)]).normalized() for i in range(n + 1)]
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = (up - T[0] * up.dot(T[0])).normalized()
    rings = []
    for i in range(n + 1):
        N = (N - T[i] * N.dot(T[i])).normalized()
        B = T[i].cross(N)
        r = samp(radii, i / n)
        tw = twist * i / n
        ring = []
        for j in range(segs):
            a = TAU * j / segs + tw
            ring.append(bm.verts.new(C[i] + N * (math.cos(a) * r) + B * (math.sin(a) * r * flat)))
        rings.append(ring)
    faces = []
    for i in range(n):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(segs):
            k = (j + 1) % segs
            faces.append(bm.faces.new((r0[j], r0[k], r1[k], r1[j])))
    if cap0:
        c = bm.verts.new(C[0])
        for j in range(segs):
            faces.append(bm.faces.new((rings[0][(j + 1) % segs], rings[0][j], c)))
    if cap1:
        c = bm.verts.new(C[n])
        for j in range(segs):
            faces.append(bm.faces.new((rings[n][j], rings[n][(j + 1) % segs], c)))
    _tag(faces, mi, smooth)
    return faces


def spike(bm, a, b, r, mi=0, segs=6, smooth=False):
    return tube(bm, [a, b], [r, r * 0.02], mi, segs=segs, n=1, cap1=False, smooth=smooth)


def lathe(bm, profile, mi=0, segs=32, n=None, rfun=None, zfun=None, center=(0, 0), sy=1.0, smooth=True, cap0=False, cap1=False):
    """旋转体。profile 是 [(r, z)]，自下而上；rfun(a, t) 调半径（做褶皱），zfun(a, t) 调高度（做下摆起伏）。"""
    n = n or (len(profile) - 1) * 4
    P = cr([(r, 0, z) for r, z in profile], n)
    rows = []
    for i in range(n + 1):
        t = i / n
        row = []
        for j in range(segs):
            a = TAU * j / segs
            r = P[i].x * (rfun(a, t) if rfun else 1)
            z = P[i].z + (zfun(a, t) if zfun else 0)
            row.append(bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a) * sy, z)))
        rows.append(row)
    faces = []
    for i in range(n):
        for j in range(segs):
            k = (j + 1) % segs
            faces.append(bm.faces.new((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j])))
    if cap0:
        c = bm.verts.new((center[0], center[1], P[0].z))
        for j in range(segs):
            faces.append(bm.faces.new((rows[0][(j + 1) % segs], rows[0][j], c)))
    if cap1:
        c = bm.verts.new((center[0], center[1], P[n].z))
        for j in range(segs):
            faces.append(bm.faces.new((rows[n][j], rows[n][(j + 1) % segs], c)))
    _tag(faces, mi, smooth)
    return faces


def ball(bm, c, r, mi=0, scale=(1, 1, 1), seg=16, smooth=True, ico=0):
    M = Matrix.Translation(c) @ Matrix.Diagonal((*scale, 1))
    if ico:
        res = bmesh.ops.create_icosphere(bm, subdivisions=ico, radius=r, matrix=M)
    else:
        res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg * 2 // 3), radius=r, matrix=M)
    faces = {f for v in res['verts'] for f in v.link_faces}
    _tag(faces, mi, smooth)
    return res['verts']


def torus(bm, c, R, r, mi=0, axis='Y', major=48, minor=8, smooth=True, flat=1.0):
    """圆环。axis 是环的法线方向。"""
    c = Vector(c)
    if axis == 'Y':
        U, V, W = Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))
    elif axis == 'Z':
        U, V, W = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    else:
        U, V, W = Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))
    rows = []
    for i in range(major):
        a = TAU * i / major
        d = U * math.cos(a) + V * math.sin(a)
        rows.append([bm.verts.new(c + d * (R + math.cos(TAU * j / minor) * r) + W * (math.sin(TAU * j / minor) * r * flat)) for j in range(minor)])
    faces = []
    for i in range(major):
        for j in range(minor):
            a, b = rows[i], rows[(i + 1) % major]
            k = (j + 1) % minor
            faces.append(bm.faces.new((a[j], b[j], b[k], a[k])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    _tag(faces, mi, smooth)
    return faces


def absorb(dst, src, M=None, flip=False, mi=None):
    """把 src 并入 dst，可带变换；镜像时 flip=True 翻回法线。"""
    me = bpy.data.meshes.new('tmp')
    src.to_mesh(me)
    src.free()
    nv, nf = len(dst.verts), len(dst.faces)
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)
    dst.verts.ensure_lookup_table()
    dst.faces.ensure_lookup_table()
    verts = dst.verts[nv:]
    faces = dst.faces[nf:]
    if M is not None:
        bmesh.ops.transform(dst, matrix=M, verts=verts)
    if flip:
        bmesh.ops.reverse_faces(dst, faces=faces)
    if mi is not None:
        for f in faces:
            f.material_index = mi
    return verts, faces


MIRROR_X = Matrix.Diagonal((-1, 1, 1, 1))


def both_sides(dst, build):
    """build(bm) 画右侧（+X）的部件，自动镜像出左侧。"""
    for s in (1, -1):
        tb = bmesh.new()
        build(tb)
        absorb(dst, tb, MIRROR_X if s < 0 else None, flip=s < 0)


def skin_mesh(nodes, edges, levels=2, root=0):
    """蒙皮修改器 + 细分，得到一个圆润连贯的躯干网格。nodes: [((x,y,z), r 或 (rx,ry))]"""
    me = bpy.data.meshes.new('skin')
    me.from_pydata([p for p, _ in nodes], edges, [])
    ob = bpy.data.objects.new('skin', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN')
    if not me.skin_vertices:
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.mesh.customdata_skin_add()
    for i, (_, r) in enumerate(nodes):
        sv = me.skin_vertices[0].data[i]
        sv.radius = r if isinstance(r, (tuple, list)) else (r, r)
        sv.use_root = i == root
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    out = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return out


def add_skin(bm, nodes, edges, mi=0, levels=2, smooth=True):
    me = skin_mesh(nodes, edges, levels)
    nv, nf = len(bm.verts), len(bm.faces)
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    faces = bm.faces[nf:]
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    _tag(faces, mi, smooth)
    return bm.verts[nv:], faces


def displace(bm, verts, amp, freq, seed=0.0, amp2=0.0, freq2=0.0):
    bm.normal_update()
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in verts:
        d = noise.noise(v.co * freq + off) * amp
        if amp2:
            d += noise.noise(v.co * freq2 - off) * amp2
        v.co += v.normal * d


def sharpen(bm, angle=40):
    lim = math.radians(angle)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
            e.smooth = False


def finish(name, bm, mats, origin=(0, 0, 0), sharp=40):
    """bmesh → 物体。origin 是这个部件的枢轴（翅膀根、光环中心）。"""
    if sharp:
        sharpen(bm, sharp)
    o = Vector(origin)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=-o)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = o
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ───────────── 翅膀 ─────────────

def _feather(bm, base, d, w, L, W, mi, bend=0.0, rows=5):
    """一根羽毛：叶片形薄面，中脉略隆起。d 是长度方向，w 是宽度方向。"""
    nrm = d.cross(w)
    prev = None
    faces = []
    for i in range(rows + 1):
        u = i / rows
        prof = math.sin(math.pi * min(1.0, u * 0.97 + 0.03) ** 0.75) ** 0.8
        ww = W * (0.25 + 0.75 * prof) if u < 0.5 else W * prof
        c = base + d * (L * u) + nrm * (bend * L * u * u)
        row = (bm.verts.new(c - w * ww * 0.5), bm.verts.new(c + nrm * (ww * 0.18)), bm.verts.new(c + w * ww * 0.5))
        if prev:
            faces.append(bm.faces.new((prev[0], prev[1], row[1], row[0])))
            faces.append(bm.faces.new((prev[1], prev[2], row[2], row[1])))
        prev = row
    _tag(faces, mi, True)


def feather_wing(bm, span, mi_long, mi_short, mi_arm, seed=1, counts=(15, 13, 10), droop=1.0):
    """羽翼。局部坐标：根在原点，X 向外，Z 向上，-Y 是正面。三层羽毛 + 翼臂。"""
    rnd = random.Random(seed)
    k = span * 0.6
    arm_pts = [Vector((0, 0, 0)), Vector((0.24 * k, 0, 0.24 * k)), Vector((0.5 * k, 0, 0.36 * k)), Vector((0.78 * k, 0, 0.32 * k)), Vector((1.0 * k, 0, 0.2 * k))]
    arm = cr(arm_pts, 40)

    def at(t):
        return arm[min(40, max(0, int(round(t * 40))))]

    layers = [
        # 层：数量、长度(根→梢)、宽度比、y 偏移、材质、角度范围
        (counts[0], (0.34, 0.5), 0.22, 0.0, mi_long, (4, 96)),
        (counts[1], (0.2, 0.26), 0.3, -0.016, mi_short, (8, 88)),
        (counts[2], (0.11, 0.13), 0.42, -0.03, mi_short, (14, 80)),
        (counts[1], (0.19, 0.24), 0.3, 0.016, mi_short, (8, 86)),
        (counts[2], (0.1, 0.12), 0.42, 0.03, mi_short, (14, 80)),
    ]
    for cnt, (l0, l1), wr, yo, mi, (a0, a1) in layers:
        for i in range(cnt):
            t = i / (cnt - 1)
            th = math.radians((a0 + (a1 - a0) * t ** 1.25) * droop + rnd.uniform(-3, 3))
            d = Vector((math.sin(th), 0, -math.cos(th)))
            w = Vector((math.cos(th), 0, math.sin(th)))
            L = span * (l0 + (l1 - l0) * t) * rnd.uniform(0.93, 1.05)
            base = at(0.04 + 0.96 * t) + Vector((0, yo * span + rnd.uniform(-0.004, 0.004), 0)) - d * (L * 0.06)
            _feather(bm, base, d, w, L, L * wr, mi, bend=rnd.uniform(0.02, 0.08))
    tube(bm, [tuple(p + Vector((0, -0.02 * span, 0.012 * span))) for p in arm_pts], [0.055 * span, 0.05 * span, 0.04 * span, 0.028 * span, 0.012 * span], mi_arm, segs=8, flat=0.7)
    # 整体微微前拢，像一只真的翅膀而不是一块板
    for v in bm.verts:
        x = max(0.0, v.co.x) / span
        v.co.y += -0.22 * span * x * x + 0.05 * span * x


def bat_wing(bm, span, mi_bone, mi_membrane, ragged=0.0, seed=1):
    """蝠翼。局部坐标同 feather_wing。臂骨 + 指骨 + 指间带下垂弧度的翼膜。"""
    rnd = random.Random(seed)
    S = Vector((0, 0, 0))
    E = Vector((0.33, 0, 0.3)) * span
    Wr = Vector((0.52, 0, 0.64)) * span
    tips = [Vector((1.0, 0, 0.6)), Vector((0.96, 0, 0.08)), Vector((0.7, 0, -0.34)), Vector((0.2, 0, -0.42))]
    tips = [t * span for t in tips] + [S + Vector((0, 0, -0.12 * span))]
    nu, nv = 7, 6
    for a, b in zip(tips[:-1], tips[1:]):
        grid = []
        for i in range(nu + 1):
            u = i / nu
            row = []
            for j in range(nv + 1):
                v = j / nv
                p = Wr + ((a - Wr).lerp(b - Wr, v)) * u * (1 - 0.3 * u * u * math.sin(math.pi * v) - ragged * u ** 3 * abs(math.sin(math.pi * v * 3 + rnd.random())) * 0.25)
                p.y += 0.035 * span * math.sin(math.pi * v) * u
                row.append(bm.verts.new(p))
            grid.append(row)
        faces = []
        for i in range(nu):
            for j in range(nv):
                faces.append(bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])))
        _tag(faces, mi_membrane, True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
    tube(bm, [S, E, Wr], [0.05 * span, 0.04 * span, 0.032 * span], mi_bone, segs=7, n=8)
    for t in tips[:4]:
        mid = Wr.lerp(t, 0.5) + Vector((0, -0.012 * span, 0.03 * span))
        tube(bm, [Wr, mid, t], [0.026 * span, 0.016 * span, 0.004 * span], mi_bone, segs=6, n=8)
    spike(bm, Wr, Wr + Vector((0.06, -0.02, 0.2)) * span, 0.024 * span, mi_bone)
    ball(bm, Wr, 0.04 * span, mi_bone, seg=8)
    ball(bm, E, 0.045 * span, mi_bone, seg=8)


def wing_matrix(lift_deg, sweep_deg, roll_deg=0.0):
    """lift：翼尖抬高；sweep：翼尖向后收。"""
    return Matrix.Rotation(math.radians(sweep_deg), 4, 'Z') @ Matrix.Rotation(-math.radians(lift_deg), 4, 'Y') @ Matrix.Rotation(math.radians(roll_deg), 4, 'X')


def add_wing_pair(name, mats, root, M, build, sharp=0):
    """build(bm) 在局部坐标画一只右翼；生成 wing_R_/wing_L_ 两个物体，枢轴在翼根。"""
    obs = []
    for s, tag in ((1, 'R'), (-1, 'L')):
        bm = bmesh.new()
        build(bm)
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts[:])
        if s < 0:
            bmesh.ops.transform(bm, matrix=MIRROR_X, verts=bm.verts[:])
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        obs.append(finish(f'wing_{tag}_{name}', bm, mats, origin=(0, 0, 0), sharp=sharp))
        obs[-1].location = Vector((s * root[0], root[1], root[2]))
    return obs


# ───────────── AO、导出、预览 ─────────────

def bake_ao(objects, samples=24, floor=0.5):
    """把环境光遮蔽烘进顶点色，游戏里不靠实时阴影也有体积感。"""
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new('w')
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.target = 'VERTEX_COLORS'
    try:
        scene.world.light_settings.distance = 0.6
    except Exception:
        pass
    for ob in objects:
        me = ob.data
        attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
    for ob in objects:
        bpy.context.view_layer.update()
        for o in objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO')
        attr = ob.data.color_attributes['Col']
        for d in attr.data:
            c = d.color
            g = floor + (1 - floor) * (c[0] ** 0.85)
            d.color = (g, g, g, 1)


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_cameras=False, export_lights=False, export_animations=False)


def wire_vertex_color():
    """预览渲染用：把顶点色乘进底色（导出之后再做，不影响 GLB）。"""
    for m in bpy.data.materials:
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b:
            continue
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = b.inputs['Base Color'].default_value
        nt.links.new(vc.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])


def render_preview(path, height=2.2, key='#fff1dc', rim='#6aa8ff', bg=(0.012, 0.012, 0.02), back=False):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 560
    scene.render.resolution_y = 620
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('w')
    try:
        scene.world.use_nodes = True
    except Exception:
        pass
    bgn = next((n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bgn:
        bgn.inputs[0].default_value = (*bg, 1)
        bgn.inputs[1].default_value = 1.0
    sgn = -1 if not back else 1
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 60
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    target = Vector((0, 0, height * 0.5))
    cam.location = Vector((1.05 * height, sgn * 1.9 * height, height * 0.8))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for nm, col, energy, pos in (('key', key, 4.0, (2.5, sgn * 4, 5)), ('rim', rim, 5.0, (-3, -sgn * 4, 3)), ('fill', '#8890b0', 1.2, (-4, sgn * 3, 1))):
        ld = bpy.data.lights.new(nm, 'SUN')
        ld.energy = energy
        ld.color = srgb(col)
        lo = bpy.data.objects.new(nm, ld)
        lo.location = pos
        lo.rotation_euler = (Vector((0, 0, 1)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in [cam] + [o for o in scene.collection.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)


# ───────────── 第二批积木：硬表面、披风、机翼、藤蔓、人形骨架 ─────────────

from mathutils import Euler  # noqa: E402


def rot(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z))).to_matrix().to_4x4()


def box(bm, c, size, mi=0, R=None, taper=1.0, smooth=False):
    """长方体；taper<1 时顶面收窄"""
    vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
    for v in vs:
        if v.co.z > 0:
            v.co.x *= taper
            v.co.y *= taper
    M = Matrix.Translation(c) @ (R or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=vs)
    _tag({f for v in vs for f in v.link_faces}, mi, smooth)
    return vs


def cyl(bm, a, b, r, mi=0, segs=10, r2=None, smooth=True, caps=True):
    return tube(bm, [a, b], [r, r if r2 is None else r2], mi, segs=segs, n=1, cap0=caps, cap1=caps, smooth=smooth)


def plate(bm, pts, thick, mi=0, smooth=False):
    """把一个平面多边形挤成薄板"""
    P = [Vector(p) for p in pts]
    n = Vector((0, 0, 0))
    for i in range(1, len(P) - 1):
        n += (P[i] - P[0]).cross(P[i + 1] - P[0])
    n.normalize()
    f = [bm.verts.new(p + n * thick / 2) for p in P]
    b = [bm.verts.new(p - n * thick / 2) for p in P]
    faces = [bm.faces.new(f), bm.faces.new(list(reversed(b)))]
    for i in range(len(P)):
        j = (i + 1) % len(P)
        faces.append(bm.faces.new((f[j], f[i], b[i], b[j])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    _tag(faces, mi, smooth)
    return faces


def disc(bm, c, r, thick, mi=0, axis='Y', segs=24, dome=0.0):
    """圆盘（盾、托盘、锯片）。axis 是盘面法线；dome 让正面鼓起。"""
    c = Vector(c)
    ax = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
    tube(bm, [c - ax * thick / 2, c + ax * thick / 2], [r, r], mi, segs=segs, n=1)
    if dome:
        ball(bm, c - ax * thick * 0.4, r * 0.96, mi, scale=tuple(1 if a == 0 else dome for a in ax), seg=segs)


def cape(bm, p_l, p_r, length, mi, flare=1.5, waves=3, back=0.25, nu=12, nv=9):
    """披风：从肩线垂下的一片布，向后鼓起并带波褶。材质需双面。"""
    p_l, p_r = Vector(p_l), Vector(p_r)
    mid = (p_l + p_r) / 2
    rows = []
    for i in range(nv + 1):
        v = i / nv
        row = []
        for j in range(nu + 1):
            u = j / nu
            top = p_l.lerp(p_r, u)
            x = mid.x + (top.x - mid.x) * (1 + (flare - 1) * v)
            y = top.y + back * v ** 1.5 + 0.05 * math.sin(u * math.pi * waves * 2) * v + 0.1 * math.sin(math.pi * u) * v
            z = top.z - length * v * (1 - 0.07 * math.sin(u * math.pi * waves * 2 + 1))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    faces = []
    for i in range(nv):
        for j in range(nu):
            faces.append(bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j])))
    _tag(faces, mi, True)


def panel_wing(bm, span, mi_panel, mi_glow, n=4, a0=65, a1=-25):
    """机械翼：几片刀形面板呈扇形展开，边上嵌发光条。局部坐标同 feather_wing。"""
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.0
        th = math.radians(a0 + (a1 - a0) * t)
        d = Vector((math.cos(th), 0, math.sin(th)))
        w = Vector((-math.sin(th), 0, math.cos(th)))
        Lg = span * (1.0 - 0.2 * t)
        W = span * 0.2
        base = d * span * 0.08 + Vector((0, 0.022 * i * span, 0))
        poly = [(0.0, 0.25), (0.25, 0.5), (0.85, 0.32), (1.0, 0.0), (0.85, -0.2), (0.2, -0.5), (0.0, -0.25)]
        plate(bm, [base + d * (u * Lg) + w * (v * W) for u, v in poly], 0.022 * span, mi_panel)
        for off in (-0.015, 0.015):
            strip = [(0.25, -0.02), (0.82, 0.02), (0.82, -0.1), (0.25, -0.2)]
            plate(bm, [base + Vector((0, off * span, 0)) + d * (u * Lg) + w * (v * W) for u, v in strip], 0.01 * span, mi_glow)
    ball(bm, (0, 0, 0), 0.075 * span, mi_panel, ico=1, smooth=False)


def scrap_wing(bm, span, mi_a, mi_b, mi_pipe, seed=1):
    """废铁翼：一根管架上挂着几块大小不一的破铁皮"""
    rnd = random.Random(seed)
    arm = [Vector((0, 0, 0)), Vector((0.42, 0, 0.36)) * span, Vector((1.0, 0, 0.42)) * span]
    tube(bm, arm, [0.04 * span, 0.035 * span, 0.02 * span], mi_pipe, segs=6, n=8)
    for i in range(5):
        u0 = 0.1 + 0.17 * i
        u1 = u0 + 0.16
        def top(u):
            return arm[0].lerp(arm[1], u / 0.42) if u < 0.42 else arm[1].lerp(arm[2], (u - 0.42) / 0.58)
        a, b = top(u0), top(u1)
        ln = span * rnd.uniform(0.45, 0.8) * (1 - 0.08 * i)
        yo = Vector((0, (0.018 if i % 2 else -0.018) * span, 0))
        pts = [a + yo, b + yo, b + yo + Vector((rnd.uniform(-0.03, 0.05) * span, 0, -ln * rnd.uniform(0.75, 1.0))), a + yo + Vector((rnd.uniform(-0.03, 0.04) * span, 0, -ln))]
        plate(bm, pts, 0.016 * span, mi_a if i % 2 == 0 else mi_b)
        ball(bm, a.lerp(b, 0.5) + yo, 0.022 * span, mi_pipe, seg=6)


def vine(bm, pts, r, mi, mi_thorn, every=2, seed=1, n=None):
    """荆棘：一根藤加上沿途的刺"""
    rnd = random.Random(seed)
    n = n or (len(pts) - 1) * 5
    tube(bm, pts, [r, r, r * 0.6], mi, segs=6, n=n)
    C = cr(pts, n)
    for i in range(1, n, every):
        t = (C[i + 1] - C[i - 1]).normalized()
        o = t.orthogonal().normalized()
        o.rotate(Matrix.Rotation(rnd.uniform(0, TAU), 3, t))
        spike(bm, C[i], C[i] + o * r * 4.5 + t * r, r * 0.9, mi_thorn, segs=4)


POSES = {
    # 右臂的 (肘, 手)；左臂镜像
    'pray': ((0.31, -0.1, 1.2), (0.1, -0.25, 1.27)),
    'hold': ((0.3, -0.12, 1.16), (0.15, -0.3, 1.2)),
    'open': ((0.4, -0.04, 1.2), (0.52, -0.2, 1.1)),
    'raise': ((0.38, -0.1, 1.38), (0.46, -0.26, 1.62)),
    'point': ((0.36, -0.14, 1.3), (0.5, -0.4, 1.32)),
    'down': ((0.31, 0.0, 1.15), (0.32, -0.06, 0.9)),
    'play': ((0.3, -0.16, 1.24), (0.2, -0.44, 1.2)),
}


def _arm_pts(pose, s):
    e, h = POSES[pose] if isinstance(pose, str) else pose
    return Vector((s * e[0], e[1], e[2])), Vector((s * h[0], h[1], h[2]))


def robed(bm, mi, pose_r='pray', pose_l=None, profile=None, folds=9, fold_amp=0.11, wind=0.0, sleeve=(0.06, 0.1, 0.14),
          lining=None, torso=((0.15, 0.11), (0.17, 0.12)), segs=64):
    """穿长袍的人形：钟形下摆 + 躯干 + 双臂 + 喇叭袖。返回双手位置 {'R','L'}。"""
    profile = profile or [(0.37, 0.14), (0.35, 0.36), (0.28, 0.68), (0.19, 0.96), (0.155, 1.06)]
    faces = lathe(bm, profile, mi, segs=segs,
                  rfun=lambda a, t: 1 + (fold_amp * math.sin(a * folds + 0.6) + fold_amp * 0.35 * math.sin(a * (folds * 2 - 1))) * (1 - t) ** 1.3,
                  zfun=lambda a, t: 0.06 * math.sin(a * 5 + 1.0) * (1 - t) ** 2)
    if lining is not None:
        faces += lathe(bm, [(r * 0.84, z + 0.05) for r, z in profile[:-1]], lining, segs=32,
                       rfun=lambda a, t: 1 + fold_amp * 0.7 * math.sin(a * folds + 0.6) * (1 - t))
    if wind:
        for v in {v for f in faces for v in f.verts}:
            k = max(0.0, 1.0 - v.co.z) ** 2
            v.co.x += wind * k
            v.co.y += abs(wind) * 0.5 * k
    nodes = [((0, 0, 1.02), torso[0]), ((0, 0, 1.33), torso[1]), ((0, 0, 1.5), 0.05)]
    edges = [(0, 1), (1, 2)]
    hands = {}
    for s, pose, key in ((1, pose_r, 'R'), (-1, pose_l or pose_r, 'L')):
        e, h = _arm_pts(pose, s)
        i = len(nodes)
        nodes += [((s * (torso[1][0] + 0.03), 0, 1.42), 0.065), (tuple(e), 0.05), (tuple(h), 0.04)]
        edges += [(1, i), (i, i + 1), (i + 1, i + 2)]
        hands[key] = h
    add_skin(bm, nodes, edges, mi, levels=2)
    for s, pose in ((1, pose_r), (-1, pose_l or pose_r)):
        e, h = _arm_pts(pose, s)
        tube(bm, [e, e.lerp(h, 0.55), e.lerp(h, 0.92)], list(sleeve), mi, segs=14, cap0=False, cap1=False)
    return hands


def humanoid(bm, mi, pose_r='down', pose_l=None, bulk=1.0, levels=2, legs=True, stance=0.12):
    """有腿的人形（铠甲、紧身衣）。返回双手位置。"""
    b = bulk
    nodes = [((0, 0, 0.95), (0.15 * b, 0.11 * b)), ((0, 0, 1.33), (0.19 * b, 0.13 * b)), ((0, 0, 1.5), 0.055)]
    edges = [(0, 1), (1, 2)]
    hands = {}
    for s, pose, key in ((1, pose_r, 'R'), (-1, pose_l or pose_r, 'L')):
        e, h = _arm_pts(pose, s)
        i = len(nodes)
        nodes += [((s * 0.24 * b, 0, 1.42), 0.075 * b), (tuple(e), 0.055 * b), (tuple(h), 0.048 * b)]
        edges += [(1, i), (i, i + 1), (i + 1, i + 2)]
        hands[key] = h
        if legs:
            i = len(nodes)
            nodes += [((s * 0.1, 0, 0.88), 0.1 * b), ((s * stance, -0.04, 0.52), 0.072 * b), ((s * stance, 0.02, 0.13), 0.055 * b), ((s * (stance + 0.01), -0.12, 0.05), (0.062 * b, 0.04))]
            edges += [(0, i), (i, i + 1), (i + 1, i + 2), (i + 2, i + 3)]
    add_skin(bm, nodes, edges, mi, levels=levels)
    return hands
