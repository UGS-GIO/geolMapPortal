"""Normalize the index-map page photograph into a working raster."""

from pathlib import Path

from PIL import Image, ImageOps


def load_oriented(path: str) -> Image.Image:
    """Open an image, apply its EXIF orientation, return it as RGB.

    Raises FileNotFoundError if the path does not exist. Pillow would raise a
    less obvious error later, so fail here where the cause is clear.
    """
    if not Path(path).exists():
        raise FileNotFoundError(f"source image not found: {path}")
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def write_working_raster(src: str, dst: str) -> tuple[int, int]:
    """Write the oriented image as a lossless PNG for downstream measurement.

    PNG rather than JPEG: every later step measures pixel positions of thin
    printed rules, and JPEG ringing around high-contrast edges would bias
    sub-pixel corner refinement.
    """
    img = load_oriented(src)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="PNG")
    return img.size
