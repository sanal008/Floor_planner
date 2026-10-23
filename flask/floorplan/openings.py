"""Opening detection (doors / windows) along detected wall centerlines."""
from .walls import wall_profile


def detect_openings(bin_img, wall, min_px=8, max_px=120, cov_thresh=0.35,
                    bridge=3):
    """Return a list of {offset, width, kind} gaps along a wall (px units).

    Thin window strokes inside a gap produce 1-2px "solid" spikes in the
    coverage profile; those are bridged so the whole opening reads as one gap.
    """
    prof = wall_profile(bin_img, wall[0], wall[1], wall[2], wall[3])
    n = len(prof)

    runs = []
    i = 0
    while i < n:
        if prof[i][1] < cov_thresh:
            j = i
            while j < n and prof[j][1] < cov_thresh:
                j += 1
            runs.append([i, j - 1])
            i = j
        else:
            i += 1

    # Merge runs separated by a very short "solid" span (a window stroke).
    merged = []
    for run in runs:
        if merged and run[0] - merged[-1][1] - 1 <= bridge:
            merged[-1][1] = run[1]
        else:
            merged.append([run[0], run[1]])

    openings = []
    for (s, e) in merged:
        length = e - s + 1
        if length < min_px or length > max_px:
            continue
        mid = (s + e) / 2.0
        kind = _classify_open(bin_img, wall, prof, s, e)
        openings.append({"offset": float(mid), "width": float(length), "kind": kind})
    return openings


def _classify_open(bin_img, wall, prof, s, e):
    """Door gaps are empty; window gaps contain thin parallel strokes.

    Counts isolated coverage spikes (the double-line strokes) inside the
    low-coverage gap: zero spikes = door, one or more = window.
    """
    strokes = 0
    in_stroke = False
    for i in range(s, e + 1):
        solid = prof[i][1] > 0.4
        if solid and not in_stroke:
            strokes += 1
            in_stroke = True
        elif not solid:
            in_stroke = False
    return "window" if strokes >= 1 else "door"