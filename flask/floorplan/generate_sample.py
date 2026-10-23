"""Generate a synthetic orthogonal floor plan for pipeline testing.

Layout: outer rectangle divided into 4 rooms by an internal cross wall.
Symbols follow standard conventions:
  - doors: gap in the wall + leaf line + quarter-circle swing arc
  - windows: gap in the wall + two thin parallel strokes across it
"""
import cv2
import numpy as np

W, H = 900, 700
OT = 8  # outer wall thickness (px)
IT = 6  # inner wall thickness (px)


def make_floorplan(path="sample_floorplan.png"):
    img = np.full((H, W, 3), 255, dtype=np.uint8)

    def line(p1, p2, t=OT):
        cv2.line(img, p1, p2, (0, 0, 0), t)

    # --- outer walls (left open at the two window gaps) ---
    line((100, 100), (220, 100), OT)          # top wall, left of window
    line((290, 100), (800, 100), OT)          # top wall, right of window
    line((800, 100), (800, 200), OT)          # right wall, above window
    line((800, 270), (800, 600), OT)          # right wall, below window
    line((100, 600), (800, 600), OT)          # bottom wall
    line((100, 100), (100, 600), OT)          # left wall

    # --- internal walls (gaps are doors) ---
    # vertical divider x=400, y=100..600, with a door in the top and bottom half
    line((400, 100), (400, 230), IT)          # above top door
    line((400, 300), (400, 470), IT)          # between top and bottom doors
    line((400, 540), (400, 600), IT)          # below bottom door
    # horizontal divider y=400, x=100..800, with two door gaps
    line((100, 400), (170, 400), IT)          # left of door
    line((240, 400), (520, 400), IT)          # between doors
    line((590, 400), (800, 400), IT)          # right of door

    # --- door symbols ---
    # door on the vertical divider, top (hinge at (400,300), opens right)
    cv2.ellipse(img, (400, 300), (70, 70), 0, 0, 90, (0, 0, 0), 2)
    cv2.line(img, (400, 300), (470, 300), (0, 0, 0), 2)
    # door on the vertical divider, bottom (hinge at (400,540), opens right)
    cv2.ellipse(img, (400, 540), (70, 70), 0, 0, 90, (0, 0, 0), 2)
    cv2.line(img, (400, 540), (470, 540), (0, 0, 0), 2)
    # door on the horizontal divider, left (hinge at (170,400), opens down)
    cv2.ellipse(img, (170, 400), (70, 70), 0, 90, 180, (0, 0, 0), 2)
    cv2.line(img, (170, 400), (170, 470), (0, 0, 0), 2)
    # door on the horizontal divider, right (hinge at (590,400), opens down)
    cv2.ellipse(img, (590, 400), (70, 70), 0, 90, 180, (0, 0, 0), 2)
    cv2.line(img, (590, 400), (590, 470), (0, 0, 0), 2)

    # --- window symbols (two thin parallel strokes inside the wall gap) ---
    cv2.line(img, (230, 96), (230, 104), (0, 0, 0), 2)   # top wall, left stroke
    cv2.line(img, (280, 96), (280, 104), (0, 0, 0), 2)   # top wall, right stroke
    cv2.line(img, (796, 210), (804, 210), (0, 0, 0), 2)  # right wall, upper stroke
    cv2.line(img, (796, 260), (804, 260), (0, 0, 0), 2)  # right wall, lower stroke

    for text, pos in [("Living", (150, 260)), ("Kitchen", (520, 260)),
                      ("Hall", (150, 510)), ("Bedroom", (520, 510))]:
        cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)

    cv2.imwrite(path, img)
    print("saved", path)


if __name__ == "__main__":
    make_floorplan()