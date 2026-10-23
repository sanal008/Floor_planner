"""End-to-end floor-plan -> Building JSON pipeline with a debug overlay."""
import cv2
import numpy as np

from . import openings, preprocess, rooms, scale, walls
from .model import build_model


def _flatten(openings_by_wall):
    for opens in openings_by_wall.values():
        for o in opens:
            yield o


def process_image(payload, meters_per_pixel=None):
    img = preprocess.decode_image(payload)
    gray = preprocess.to_gray(img)
    bin_img = preprocess.binarize(gray)

    segs = walls.detect_segments(bin_img)
    merged = walls.merge_collinear(segs)
    groups = walls.wall_groups(merged, gap_tol=130.0)
    junctions = walls.compute_junctions(groups)
    snapped = walls.snap_to_junctions(groups, junctions)
    junctions = walls.compute_junctions(snapped)
    snapped = walls.filter_isolated(snapped, junctions)

    thicknesses = [w[4] for w in snapped] if snapped else []
    med_thick = float(np.median(thicknesses)) if thicknesses else 6.0

    wall_records = [
        {"x1": w[0], "y1": w[1], "x2": w[2], "y2": w[3], "thickness": w[4]}
        for w in snapped
    ]

    room_list = rooms.detect_rooms(bin_img, snapped, med_thick)

    openings_by_wall = {}
    for i, w in enumerate(snapped):
        found = openings.detect_openings(bin_img, w)
        if found:
            openings_by_wall[i] = found

    mpp, mpp_src = scale.resolve_scale(bin_img, meters_per_pixel)

    model = build_model(wall_records, room_list, openings_by_wall, mpp,
                        bin_img.shape[0])

    all_opens = list(_flatten(openings_by_wall))
    info = {
        "segments": len(segs),
        "merged": len(merged),
        "walls": len(wall_records),
        "rooms": len(room_list),
        "doors": sum(1 for o in all_opens if o["kind"] == "door"),
        "windows": sum(1 for o in all_opens if o["kind"] == "window"),
        "scaleSource": mpp_src,
        "metersPerPixel": mpp,
    }

    debug = _build_debug(img, wall_records, room_list, openings_by_wall)
    return model, debug, info


def _build_debug(img, wall_records, room_list, openings_by_wall):
    vis = img.copy()
    for w in wall_records:
        cv2.line(vis, (int(w["x1"]), int(w["y1"])), (int(w["x2"]), int(w["y2"])),
                 (255, 90, 90), 3)
    for i, r in enumerate(room_list):
        pts = np.array(r["polygon"], dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(vis, [pts], True, (90, 220, 130), 2)
        cx = int(np.mean([p[0] for p in r["polygon"]]))
        cy = int(np.mean([p[1] for p in r["polygon"]]))
        cv2.putText(vis, f"Room {i + 1}", (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (90, 220, 130), 2)
    for i, opens in openings_by_wall.items():
        w = wall_records[i]
        d = np.array([w["x2"] - w["x1"], w["y2"] - w["y1"]], float)
        L = float(np.hypot(*d))
        d = d / max(L, 1e-9)
        for o in opens:
            c = (int(w["x1"] + d[0] * o["offset"]),
                 int(w["y1"] + d[1] * o["offset"]))
            if o["kind"] == "window":
                cv2.circle(vis, c, 10, (255, 180, 80), -1)
            else:
                cv2.circle(vis, c, 10, (80, 240, 255), -1)
    return cv2.imencode(".png", vis)[1].tobytes()


if __name__ == "__main__":
    import json
    import sys

    path = sys.argv[1]
    mpp_arg = float(sys.argv[2]) if len(sys.argv) > 2 else None
    with open(path, "rb") as f:
        model, debug, info = process_image(f.read(), mpp_arg)
    with open(path + ".debug.png", "wb") as f:
        f.write(debug)
    print(json.dumps({"info": info, "model": model}, indent=2))