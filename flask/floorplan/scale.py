"""Real-world scale resolution (pixels -> meters)."""

DEFAULT_METERS_PER_PIXEL = 0.05


def resolve_scale(bin_img, requested=None):
    """Prefer the user-supplied scale, else fall back to a sensible default.

    bin_img is accepted for future scale-bar / dimension-label detection.
    """
    if requested is not None:
        try:
            value = float(requested)
            if value > 0:
                return value, "user"
        except (TypeError, ValueError):
            pass
    return DEFAULT_METERS_PER_PIXEL, "default"