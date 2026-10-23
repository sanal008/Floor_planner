"""Assemble the parsed floor plan into a Building JSON structure."""


def build_model(walls, rooms, openings_by_wall, meters_per_pixel, img_h):
    def to_world(u, v):
        # image u (right) -> world x ; image v (down) -> world z (flipped)
        return (float(u) * meters_per_pixel,
                float(img_h - v) * meters_per_pixel)

    model = {
        "scale": {"metersPerPixel": meters_per_pixel},
        "walls": [],
        "rooms": [],
        "doors": [],
        "windows": [],
    }

    for w in walls:
        wx1, wz1 = to_world(w["x1"], w["y1"])
        wx2, wz2 = to_world(w["x2"], w["y2"])
        model["walls"].append({
            "x1": wx1, "z1": wz1, "x2": wx2, "z2": wz2,
            "thickness": float(w["thickness"]) * meters_per_pixel,
        })

    for i, room in enumerate(rooms):
        polygon = [list(to_world(u, v)) for (u, v) in room["polygon"]]
        model["rooms"].append({
            "name": f"Room {i + 1}",
            "polygon": polygon,
            "area": room["area_px"] * meters_per_pixel ** 2,
        })

    for w_idx, opens in openings_by_wall.items():
        for o in opens:
            rec = {
                "wall": w_idx,
                "offset": o["offset"] * meters_per_pixel,
                "width": o["width"] * meters_per_pixel,
            }
            if o["kind"] == "window":
                rec.update({"kind": "window", "height": 1.2, "sill": 0.9})
                model["windows"].append(rec)
            else:
                rec.update({"kind": "door", "height": 2.1})
                model["doors"].append(rec)

    return model