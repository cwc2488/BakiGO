#!/usr/bin/env python3
"""Extract gold portrait-frame overlays from the approved Recognition masters.

This is layer separation, not a redesign. Interiors and exterior navy are made
transparent so the renderer can stack: master → photo → gold frame.
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "public" / "recognition" / "masters"
OUT = ROOT / "public" / "recognition" / "frames"
SX = 10.0 / 1448.0
SY = 7.5 / 1086.0
INSET_PX = 5  # photo viewport slightly inside the inner gold edge


def px_to_in(x: float, y: float, w: float, h: float) -> dict[str, float]:
    return {
        "x": round(x * SX, 4),
        "y": round(y * SY, 4),
        "w": round(w * SX, 4),
        "h": round(h * SY, 4),
    }


def is_gold(p: np.ndarray) -> bool:
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    return r > 120 and g > 70 and r > b + 12 and g > b - 5 and (r + g) > 200


def is_navy_bg(p: np.ndarray) -> bool:
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    if is_gold(p):
        return False
    luma = r + g + b
    if luma < 110:
        return True
    if b > r + 8 and r < 90:
        return True
    if r < 70 and g < 80:
        return True
    return False


def flood_transparent(rgba: np.ndarray, seeds: list[tuple[int, int]]) -> None:
    h, w = rgba.shape[:2]
    seen = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x, y in seeds:
        if 0 <= x < w and 0 <= y < h:
            q.append((x, y))
            seen[y, x] = True
    while q:
        x, y = q.popleft()
        if not is_navy_bg(rgba[y, x, :3]):
            continue
        rgba[y, x, 3] = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))


def punch_rect(rgba: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> None:
    rgba[y0 : y1 + 1, x0 : x1 + 1, 3] = 0


def extract_sprite(rgb: np.ndarray, inner: tuple[int, int, int, int], pad: int) -> tuple[np.ndarray, dict]:
    h, w = rgb.shape[:2]
    ix0, iy0, ix1, iy1 = inner
    ox0 = max(0, ix0 - pad)
    oy0 = max(0, iy0 - pad)
    ox1 = min(w - 1, ix1 + pad)
    oy1 = min(h - 1, iy1 + pad)
    crop = np.dstack([rgb[oy0 : oy1 + 1, ox0 : ox1 + 1], np.full((oy1 - oy0 + 1, ox1 - ox0 + 1), 255, np.uint8)])
    # photo hole: inner gold edge, keep the gold ring
    punch_rect(crop, ix0 - ox0, iy0 - oy0, ix1 - ox0, iy1 - oy0)
    seeds = []
    ch, cw = crop.shape[:2]
    for x in range(cw):
        seeds.append((x, 0))
        seeds.append((x, ch - 1))
    for y in range(ch):
        seeds.append((0, y))
        seeds.append((cw - 1, y))
    flood_transparent(crop, seeds)
    # trim to opaque bounds
    ys, xs = np.where(crop[:, :, 3] > 0)
    if len(xs) == 0:
        raise RuntimeError("frame extraction produced an empty sprite")
    tx0, ty0, tx1, ty1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    sprite = crop[ty0 : ty1 + 1, tx0 : tx1 + 1]
    abs_x0 = ox0 + tx0
    abs_y0 = oy0 + ty0
    overlay = px_to_in(abs_x0, abs_y0, sprite.shape[1], sprite.shape[0])
    photo = px_to_in(ix0 + INSET_PX, iy0 + INSET_PX, (ix1 - ix0 + 1) - 2 * INSET_PX, (iy1 - iy0 + 1) - 2 * INSET_PX)
    inner_in = px_to_in(ix0, iy0, ix1 - ix0 + 1, iy1 - iy0 + 1)
    return sprite, {
        "overlay": overlay,
        "inner": inner_in,
        "photo": photo,
        "px": {"inner": [ix0, iy0, ix1, iy1], "overlay": [abs_x0, abs_y0, abs_x0 + sprite.shape[1] - 1, abs_y0 + sprite.shape[0] - 1]},
    }


def full_slide_overlay(rgb: np.ndarray, inners: list[tuple[int, int, int, int]]) -> np.ndarray:
    rgba = np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)])
    for ix0, iy0, ix1, iy1 in inners:
        punch_rect(rgba, ix0, iy0, ix1, iy1)
    h, w = rgba.shape[:2]
    seeds = []
    for x in range(0, w, 8):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(0, h, 8):
        seeds.append((0, y))
        seeds.append((w - 1, y))
    flood_transparent(rgba, seeds)
    return rgba


def cover_baked_frames(rgb: np.ndarray, inners: list[tuple[int, int, int, int]], pad: int) -> np.ndarray:
    """Hide baked gold frames with the master's own interior navy. Not a new design."""
    out = np.dstack([rgb.copy(), np.zeros(rgb.shape[:2], np.uint8)])
    h, w = rgb.shape[:2]
    fill = rgb[inners[0][1] + 40, inners[0][0] + 40]
    for ix0, iy0, ix1, iy1 in inners:
        x0, y0 = max(0, ix0 - pad), max(0, iy0 - pad)
        x1, y1 = min(w - 1, ix1 + pad), min(h - 1, iy1 + pad)
        patch = out[y0 : y1 + 1, x0 : x1 + 1]
        patch[:, :, :3] = fill
        patch[:, :, 3] = 255
        out[y0 : y1 + 1, x0 : x1 + 1] = patch
    return out


def save_png(arr: np.ndarray, path: Path) -> None:
    Image.fromarray(arr, mode="RGBA").save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} {arr.shape[1]}x{arr.shape[0]}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    geo: dict = {}

    hero1 = np.array(Image.open(MASTERS / "hero-1.png").convert("RGB"))
    hero23 = np.array(Image.open(MASTERS / "hero-2-3.png").convert("RGB"))
    wall = np.array(Image.open(MASTERS / "wall-4-12.png").convert("RGB"))
    million = np.array(Image.open(MASTERS / "million-lifetime.png").convert("RGB"))

    # Measured inner dark rectangles (inclusive photo-hole, inside gold).
    hero1_inner = (502, 263, 940, 871)
    hero23_inners = [
        (169, 320, 486, 828),
        (562, 320, 876, 828),
        (955, 320, 1279, 828),
    ]
    wall_inners = [
        (122, 278, 275, 513),
        (326, 278, 480, 513),
        (530, 278, 687, 513),
        (740, 278, 898, 513),
        (950, 278, 1109, 513),
        (1161, 278, 1318, 513),
        (122, 572, 275, 809),
        (327, 572, 480, 809),
        (530, 572, 687, 809),
        (740, 572, 898, 809),
        (950, 572, 1109, 809),
        (1161, 572, 1318, 809),
    ]
    million_inner = (479, 237, 970, 722)

    # Full-slide gold overlays with interiors punched — exact master artwork.
    save_png(full_slide_overlay(hero1, [hero1_inner]), OUT / "hero-1-frames.png")
    save_png(full_slide_overlay(hero23, hero23_inners), OUT / "hero-2-3-frames.png")
    save_png(full_slide_overlay(wall, wall_inners), OUT / "wall-frames.png")
    save_png(full_slide_overlay(million, [million_inner]), OUT / "million-ring.png")

    # Single hero-2-3 frame sprite from the center slot (canonical pair size).
    sprite, sprite_geo = extract_sprite(hero23, hero23_inners[1], pad=28)
    save_png(sprite, OUT / "hero-portrait-frame.png")
    geo["heroPortraitFrame"] = sprite_geo

    save_png(cover_baked_frames(hero23, hero23_inners, pad=26), OUT / "hero-2-3-clear-frames.png")

    def photo_from_inner(inner: tuple[int, int, int, int]) -> dict[str, float]:
        ix0, iy0, ix1, iy1 = inner
        return px_to_in(ix0 + INSET_PX, iy0 + INSET_PX, (ix1 - ix0 + 1) - 2 * INSET_PX, (iy1 - iy0 + 1) - 2 * INSET_PX)

    def inner_in(inner: tuple[int, int, int, int]) -> dict[str, float]:
        ix0, iy0, ix1, iy1 = inner
        return px_to_in(ix0, iy0, ix1 - ix0 + 1, iy1 - iy0 + 1)

    geo["hero1"] = {"inner": inner_in(hero1_inner), "photo": photo_from_inner(hero1_inner)}
    geo["hero3"] = [{"inner": inner_in(i), "photo": photo_from_inner(i)} for i in hero23_inners]
    geo["wall"] = [{"inner": inner_in(i), "photo": photo_from_inner(i)} for i in wall_inners]
    geo["million"] = {"inner": inner_in(million_inner), "photo": photo_from_inner(million_inner)}
    print(json.dumps(geo, indent=2))


if __name__ == "__main__":
    main()
