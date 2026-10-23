"""Image decoding + binarization for floor-plan photos."""
import base64
import re

import cv2
import numpy as np


def decode_image(payload):
    """Decode a base64 data URI (or raw bytes) into a BGR image."""
    if isinstance(payload, str):
        if payload.startswith("data:"):
            match = re.match(r"data:[^;]+;base64,(.*)$", payload, re.S)
            if not match:
                raise ValueError("Unsupported data URI")
            raw = base64.b64decode(match.group(1))
        else:
            raw = base64.b64decode(payload)
    else:
        raw = bytes(payload)

    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def to_gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def binarize(gray):
    """Black-lines-on-white -> white-lines-on-black binary image."""
    _, bin_img = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    # If the image turned out mostly white lines (dark background), invert.
    if np.mean(bin_img) > 127:
        bin_img = 255 - bin_img
    # Remove isolated specks.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    bin_img = cv2.morphologyEx(bin_img, cv2.MORPH_OPEN, kernel)
    return bin_img