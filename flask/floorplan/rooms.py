"""Room detection: rasterize solid walls, flood-fill the exterior, label enclosed cells."""
import cv2
import numpy as np

PAD = 20  # border padding so the exterior is always reachable from the image edge
MIN_AREA = 400  # minimum room area in px


def detect_rooms(bin_img, walls, thickness):
    h, w = bin_img.shape[:2]
    canvas = np.zeros((h + 2 * PAD, w + 2 * PAD), np.uint8)
    line_th = max(3, int(round(thickness)))
    for wall in walls:
        x1, y1, x2, y2 = wall[:4]
        cv2.line(canvas, (int(x1) + PAD, int(y1) + PAD),
                 (int(x2) + PAD, int(y2) + PAD), 255, line_th)

    # Close tiny junction gaps so rooms seal properly.
    canvas = cv2.dilate(canvas, np.ones((3, 3), np.uint8), iterations=1)

    # Flood-fill the exterior region.
    fill = canvas.copy()
    mask = np.zeros((h + 2 * PAD + 2, w + 2 * PAD + 2), np.uint8)
    for bx, by in [(0, 0), (w + 2 * PAD - 1, 0), (0, h + 2 * PAD - 1),
                   (w + 2 * PAD - 1, h + 2 * PAD - 1)]:
        if fill[by, bx] == 0:
            cv2.floodFill(fill, mask, (bx, by), 127)

    room_mask = ((fill == 0) * 255).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(room_mask, 8)

    rooms = []
    for i in range(1, num):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < MIN_AREA:
            continue
        comp = ((labels == i) * 255).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        cnt = max(cnts, key=cv2.contourArea)
        eps = 0.02 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
        polygon = [(float(p[0] - PAD), float(p[1] - PAD)) for p in approx]
        rooms.append({"polygon": polygon, "area_px": float(area)})
    return rooms