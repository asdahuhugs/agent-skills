"""WAF 旋转拼图：从拼图图片 + guardword 定位候选缺口，输出 JSON。

用法: python guard_solve_pos.py <image.png> <guardword>
输出: {"candidates":[{"center":[x,y],"angle":deg,"rot":deg,"pct":p,"diff":deg}, ...]}
      candidates 按"朝向匹配度"升序（越靠前越可能是真缺口）
"""
import sys
import json
import math
from collections import deque

try:
    from PIL import Image
except ImportError:
    print(json.dumps({"candidates": [], "error": "PIL 不可用"}))
    sys.exit(0)

SPRITE_BASE = 45.0   # 拼图块精灵自身基角（实测：精灵里的块是斜的）
WHITE = 225          # 虚线描边阈值
LIMIT = 340          # 背景区宽度
DILATE = 3           # 连接断开的虚线
MIN_PIX = 200        # 最小连通域
RADIUS_TOL = 12      # 到圆弧半径容差


def main():
    img_path, gw = sys.argv[1], sys.argv[2]
    a, b, c, ix, iy, f = [int(v) for v in gw.split('_')]
    start = math.degrees(math.atan2(iy - b, ix - a))
    is_up = iy > b

    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    px = im.load()

    pts = [(x, y) for y in range(H) for x in range(min(LIMIT, W))
           if px[x, y][0] > WHITE and px[x, y][1] > WHITE and px[x, y][2] > WHITE]
    mask = set()
    for p in pts:
        for dy in range(-DILATE, DILATE + 1):
            for dx in range(-DILATE, DILATE + 1):
                mask.add((p[0] + dx, p[1] + dy))

    seen = set()
    comps = []
    for p in list(mask):
        if p in seen:
            continue
        q = deque([p]); seen.add(p); comp = []
        while q:
            cur = q.popleft(); comp.append(cur)
            for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (cur[0] + d[0], cur[1] + d[1])
                if n in mask and n not in seen:
                    seen.add(n); q.append(n)
        if len(comp) > MIN_PIX:
            comps.append(comp)

    def hull(ps):
        ps = sorted(set(ps))
        if len(ps) < 3:
            return ps
        def cr(o, p, q):
            return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
        lo = []
        for p in ps:
            while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0:
                lo.pop()
            lo.append(p)
        up = []
        for p in reversed(ps):
            while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0:
                up.pop()
            up.append(p)
        return lo[:-1] + up[:-1]

    def edge_angle(ps):
        """用 Hough 找正方形边的朝向（比最小外接矩形更抗虚线断裂）"""
        h = hull(ps)
        if len(h) < 3:
            return 0.0
        best, best_score = 0.0, -1
        for deg in range(0, 180):
            rad = math.radians(deg)
            ca, sa = math.cos(-rad), math.sin(-rad)
            proj = [p[0] * sa + p[1] * ca for p in h]
            lo, hi = min(proj), max(proj)
            if hi - lo < 1:
                continue
            bins = {}
            step = (hi - lo) / 60.0
            for v in proj:
                k = int((v - lo) / step)
                bins[k] = bins.get(k, 0) + 1
            # 直线边缘会让投影集中在少数 bin
            score = sum(v * v for v in bins.values())
            if score > best_score:
                best_score, best = score, deg
        return best % 90

    cands = []
    lo_a, hi_a = sorted([start, start - f if is_up else start + f])
    for comp in comps:
        xs = [p[0] for p in comp]; ys = [p[1] for p in comp]
        cx, cy = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
        dx, dy = cx - a, cy - b
        rad = math.hypot(dx, dy)
        if abs(rad - c) > RADIUS_TOL:
            continue
        th = math.degrees(math.atan2(dy, dx))
        if not (lo_a - 4 <= th <= hi_a + 4):
            continue
        rot = th - start
        pct = (start - th) / f if is_up else (th - start) / f
        if not (-0.02 <= pct <= 1.02):
            continue
        meas = edge_angle(comp)
        expect = (SPRITE_BASE + rot) % 90
        diff = abs((meas - expect + 45) % 90 - 45)
        cands.append({
            "center": [round(cx, 1), round(cy, 1)],
            "angle": round(th, 2),
            "rot": round(rot, 2),
            "pct": round(pct, 4),
            "meas_mod90": round(meas, 2),
            "expect_mod90": round(expect, 2),
            "diff": round(diff, 2),
        })

    cands.sort(key=lambda x: x["diff"])
    print(json.dumps({
        "guardword": gw, "center": [a, b], "radius": c,
        "start_angle": round(start, 2), "sweep": f, "is_up": is_up,
        "candidates": cands,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
