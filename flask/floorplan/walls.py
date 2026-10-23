"""Wall detection: directional morphology -> thin rectangles -> merged centerlines.

Orthogonal floor plans are drawn as thick straight lines, so we extract pure
horizontal and vertical strokes with long structuring elements and turn each
stroke into a centerline + thickness via minAreaRect. Thin markings (door arcs,
window strokes, text) are rejected by a minimum thickness filter.
"""
import cv2
import numpy as np

MIN_THICKNESS = 3.0
MIN_LEN = 40


def detect_segments(bin_img, min_len=MIN_LEN, min_thickness=MIN_THICKNESS):
    """Return [(x1, y1, x2, y2, thickness)] for every wall stroke."""
    segs = []
    kernels = {
        "horizontal": cv2.getStructuringElement(cv2.MORPH_RECT, (min_len, 1)),
        "vertical": cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_len)),
    }
    for kernel in kernels.values():
        opened = cv2.morphologyEx(bin_img, cv2.MORPH_OPEN, kernel)
        cnts, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in cnts:
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(cnt)
            length = max(rw, rh)
            thickness = min(rw, rh)
            if thickness < min_thickness or length < min_len:
                continue
            ang_deg = ang if rw >= rh else ang + 90.0
            rad = np.radians(ang_deg)
            d = np.array([np.cos(rad), np.sin(rad)])
            half = length / 2.0
            p = np.array([cx, cy]) - d * half
            q = np.array([cx, cy]) + d * half
            segs.append((float(p[0]), float(p[1]), float(q[0]), float(q[1]),
                         float(thickness)))
    return segs


def _angle_deg(seg):
    x1, y1, x2, y2 = seg[:4]
    return float(np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180.0)


def merge_collinear(segs, tol_deg=3.0, tol_off=10.0, max_gap=14.0):
    """Merge collinear overlapping/nearby strokes into clean centerlines."""
    clusters = []
    for s in segs:
        a = _angle_deg(s)
        best = None
        best_diff = 1e9
        for c in clusters:
            diff = abs(a - c["mean"])
            if diff > 90.0:
                diff = 180.0 - diff
            if diff < best_diff:
                best_diff = diff
                best = c
        if best is not None and best_diff <= tol_deg:
            n = best["count"] + 1
            best["mean"] += (a - best["mean"]) / n
            best["count"] = n
            best["segs"].append(s)
        else:
            clusters.append({"mean": a, "count": 1, "segs": [s]})

    merged = []
    for c in clusters:
        mean = np.radians(c["mean"])
        d = np.array([np.cos(mean), np.sin(mean)])
        n = np.array([-d[1], d[0]])
        items = []
        for s in c["segs"]:
            p = np.array([s[0], s[1]], float)
            q = np.array([s[2], s[3]], float)
            t0 = float(p @ d)
            t1 = float(q @ d)
            off = float(((p + q) / 2) @ n)
            items.append((min(t0, t1), max(t0, t1), off, s[4]))
        items.sort(key=lambda it: it[0])
        runs = []
        for t0, t1, off, thk in items:
            if runs and t0 <= runs[-1][1] + max_gap and abs(off - runs[-1][2]) <= tol_off:
                if t1 > runs[-1][1]:
                    runs[-1][1] = t1
            else:
                runs.append([t0, t1, off, thk])
        for t0, t1, off, thk in runs:
            if t1 - t0 < 6:
                continue
            p = t0 * d + off * n
            q = t1 * d + off * n
            merged.append((float(p[0]), float(p[1]), float(q[0]), float(q[1]),
                           float(thk)))
    return merged


def wall_groups(segments, gap_tol=130.0, tol_off=10.0, tol_deg=4.0):
    """Group collinear strokes on the same line into full-span walls.

    Strokes separated by a small gap (door/window opening) are joined so the
    opening can later be detected along the continuous wall.
    """
    lines = []
    for s in segments:
        dx = s[2] - s[0]
        dy = s[3] - s[1]
        L = float(np.hypot(dx, dy))
        if L < 1e-6:
            continue
        d = np.array([dx, dy]) / L
        n = np.array([-d[1], d[0]])
        a = np.array([s[0], s[1]], float)
        b = np.array([s[2], s[3]], float)
        t0, t1 = float(a @ d), float(b @ d)
        off = float(((a + b) / 2) @ n)
        placed = False
        for g in lines:
            if abs(np.degrees(np.arccos(np.clip(abs(d @ g["d"]), 0, 1)))) > tol_deg:
                continue
            if abs(off - g["off"]) > tol_off:
                continue
            g["members"].append((min(t0, t1), max(t0, t1), s[4]))
            placed = True
            break
        if not placed:
            lines.append({"d": d, "n": n, "off": off,
                          "members": [(min(t0, t1), max(t0, t1), s[4])]})

    walls = []
    for g in lines:
        members = sorted(g["members"])
        subgroups = []
        cur = None
        for (t0, t1, thk) in members:
            if cur is None or t0 > cur[1] + gap_tol:
                if cur is not None:
                    subgroups.append(cur)
                cur = [t0, t1, thk]
            else:
                if t1 > cur[1]:
                    cur[1] = t1
        if cur is not None:
            subgroups.append(cur)
        for (t0, t1, thk) in subgroups:
            if t1 - t0 < 6:
                continue
            p0 = t0 * g["d"] + g["off"] * g["n"]
            p1 = t1 * g["d"] + g["off"] * g["n"]
            walls.append((float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1]),
                          float(thk)))
    return walls


def _seg_intersect(a, b):
    """Intersection of two infinite segments; returns (px, py, ta, tb) or None."""
    x1, y1, x2, y2 = a[:4]
    x3, y3, x4, y4 = b[:4]
    d1x, d1y = x2 - x1, y2 - y1
    d2x, d2y = x4 - x3, y4 - y3
    denom = d1x * d2y - d1y * d2x
    if abs(denom) < 1e-9:
        return None
    ta = ((x3 - x1) * d2y - (y3 - y1) * d2x) / denom
    tb = ((x3 - x1) * d1y - (y3 - y1) * d1x) / denom
    px = x1 + ta * d1x
    py = y1 + ta * d1y
    return (px, py, ta, tb)


def compute_junctions(walls, tol=8.0):
    """Candidate corner/junction points where non-parallel walls cross."""
    candidates = []
    n = len(walls)
    for i in range(n):
        for j in range(i + 1, n):
            r = _seg_intersect(walls[i], walls[j])
            if r is None:
                continue
            px, py, ta, tb = r
            if (-tol <= ta <= 1 + tol) and (-tol <= tb <= 1 + tol):
                candidates.append((px, py))
    return _cluster_points(candidates, 6.0)


def _cluster_points(points, tol=6.0):
    if not points:
        return []
    clusters = []
    for p in points:
        placed = False
        for c in clusters:
            if np.hypot(p[0] - c[0], p[1] - c[1]) <= tol:
                n = c[2] + 1
                c[0] += (p[0] - c[0]) / n
                c[1] += (p[1] - c[1]) / n
                c[2] = n
                placed = True
                break
        if not placed:
            clusters.append([p[0], p[1], 1])
    return [(float(c[0]), float(c[1])) for c in clusters]


def _snap(pt, junctions, tol=8.0):
    best = None
    best_d = tol
    for j in junctions:
        dist = np.hypot(pt[0] - j[0], pt[1] - j[1])
        if dist <= best_d:
            best_d = dist
            best = j
    return best if best is not None else pt


def snap_to_junctions(walls, junctions, tol=8.0):
    out = []
    for w in walls:
        p = _snap((w[0], w[1]), junctions, tol)
        q = _snap((w[2], w[3]), junctions, tol)
        if np.hypot(p[0] - q[0], p[1] - q[1]) < 4.0:
            continue
        out.append((p[0], p[1], q[0], q[1], w[4]))
    return out


def filter_isolated(walls, junctions, min_free_len=90.0):
    """Drop short segments that connect to nothing (stray strokes)."""
    keep = []
    for w in walls:
        L = np.hypot(w[2] - w[0], w[3] - w[1])
        if L >= min_free_len:
            keep.append(w)
            continue
        p_free = all(np.hypot(w[0] - j[0], w[1] - j[1]) > 10 for j in junctions)
        q_free = all(np.hypot(w[2] - j[0], w[3] - j[1]) > 10 for j in junctions)
        if not (p_free and q_free):
            keep.append(w)
    return keep


def _center_run_width(col):
    """Width of the 1-run nearest the center of a 1-D profile."""
    runs = []
    start = None
    for k, v in enumerate(col):
        if v and start is None:
            start = k
        elif not v and start is not None:
            runs.append((start, k))
            start = None
    if start is not None:
        runs.append((start, len(col)))
    if not runs:
        return 0.0
    center = len(col) / 2.0
    best = min(runs, key=lambda r: abs((r[0] + r[1]) / 2.0 - center))
    return float(best[1] - best[0])


def wall_profile(bin_img, x1, y1, x2, y2, half_span=6):
    """Sample wall coverage and thickness along a wall's centerline.

    Returns a list of (t_px_from_start, coverage_ratio, thickness_px).
    """
    h, w = bin_img.shape[:2]
    dx = x2 - x1
    dy = y2 - y1
    L = float(np.hypot(dx, dy))
    if L < 1e-6:
        return []
    d = np.array([dx, dy]) / L
    n = np.array([-d[1], d[0]])
    n_samples = max(int(L), 8)
    prof = []
    for i in range(n_samples + 1):
        t = L * i / n_samples
        c = np.array([x1, y1], float) + d * t
        col = np.zeros(half_span * 2 + 1, dtype=np.uint8)
        for k in range(-half_span, half_span + 1):
            p = np.round(c + n * k).astype(int)
            if 0 <= p[0] < w and 0 <= p[1] < h:
                col[k + half_span] = 1 if bin_img[p[1], p[0]] > 127 else 0
        prof.append((t, float(col.mean()), _center_run_width(col)))
    return prof