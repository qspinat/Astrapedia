"""Generate data/milkyway.jpg, a soft Milky Way background in equatorial coordinates.

Source image: "The Milky Way panorama", ESO eso0932a
    https://www.eso.org/public/images/eso0932a/
    Large JPEG (6000x3000): https://cdn.eso.org/images/large/eso0932a.jpg
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
Credit (must be shown, wording unaltered): "ESO/S. Brunier"

Source projection: plate carree (equirectangular) in a galactic-like frame. The galactic
centre is near the middle of the image, longitude increases to the LEFT (as seen from inside
the sphere) and wraps at the left/right edges, latitude is +90 deg at the top row.
The panorama's frame is NOT exactly IAU galactic: matching its stars against our catalogue
shows a rigid rotation of ~3.8 deg (true (l, b) = (0, 0) lies at panorama (356.8, +1.7)).
PANORAMA_ROTATION corrects this; after it, stars agree to ~0.08 deg (median). Re-derive it
with --calibrate.

Output convention (data/milkyway.jpg, 4096x2048, ICRS / J2000 equirectangular):
    column x in 0..W-1 (pixel centres): RA  = (x + 0.5) / W * 360 deg, increasing with x
    row    y in 0..H-1 (pixel centres): Dec = 90 deg - (y + 0.5) / H * 180 deg
    (top row = north celestial pole)

Processing: point stars are removed with a grey morphological opening (the app renders its
own stars); larger compact blobs (bright-star halos, and planets frozen at their 2008-09
positions) are also removed unless a catalogued deep-sky object is there; a light blur
follows. The sky background floor is subtracted per channel so that empty sky is near
black, and highlights are gently compressed.

Usage (Pillow is not a project dependency, so pull it in ephemerally):
    uv run --with pillow python scripts/make_milkyway.py path/to/eso0932a.jpg
    uv run --with pillow python scripts/make_milkyway.py path/to/eso0932a.jpg --calibrate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / 'data' / 'milkyway.jpg'
STARS_PATH = REPO_ROOT / 'data' / 'stars_medium.json'
DSO_PATH = REPO_ROOT / 'data' / 'deep_sky_objects.json'

OUT_WIDTH = 4096
OUT_HEIGHT = 2048
JPEG_QUALITY = 85

# Rotation taking an IAU galactic unit vector (x towards l=0, z towards b=+90) to the
# panorama's own frame. Fitted with --calibrate against data/stars_medium.json.
PANORAMA_ROTATION = np.array([
    [0.99799475, 0.05623200, -0.02905925],
    [-0.05570945, 0.99827580, 0.01848990],
    [0.03004887, -0.01683394, 0.99940667],
])

# Star removal, in source pixels (6000 px / 360 deg = 0.06 deg per pixel).
OPENING_SIZE = 7
BLOB_OPENING_SIZE = 31
BLOB_THRESHOLD = 0.12
BLOB_MAX_AREA = 450
BLOB_RADIUS = 30
DSO_KEEP_MAG = 7.0
DSO_KEEP_RADIUS_DEG = 1.0
DSO_SKIP_TYPES = {'*', '**', '*Ass', 'Nova'}
EXTRA_KEEP_RADEC = [(80.894, -69.756)]  # Large Magellanic Cloud (absent from OpenNGC)
BLUR_SIGMA = 3.0

# Tone mapping.
BLACK_PERCENTILE = 30.0
WHITE_PERCENTILE = 99.9
TOE = 0.02  # soft toe (fraction of white) that sinks residual background noise to black
HIGHLIGHT_STRENGTH = 1.2
OUTPUT_GAIN = 0.92

Image.MAX_IMAGE_PIXELS = 50_000_000


# --- Geometry -------------------------------------------------------------------------------


def unit_vector(lon_deg: np.ndarray, lat_deg: np.ndarray) -> np.ndarray:
    """Converts longitude/latitude in degrees to unit vectors of shape (..., 3)."""
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)


def lon_lat(vec: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Converts unit vectors (..., 3) to longitude [0, 360) and latitude in degrees."""
    lon = np.degrees(np.arctan2(vec[..., 1], vec[..., 0])) % 360.0
    lat = np.degrees(np.arcsin(np.clip(vec[..., 2], -1.0, 1.0)))
    return lon, lat


def radec_to_source_pixel(
    ra_deg: np.ndarray, dec_deg: np.ndarray, width: int, height: int,
    rotation: np.ndarray = PANORAMA_ROTATION,
) -> tuple[np.ndarray, np.ndarray]:
    """Maps ICRS (RA, Dec) to fractional source pixel coordinates (x, y)."""
    gal = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame='icrs').galactic
    vec = unit_vector(gal.l.deg, gal.b.deg) @ rotation.T
    return panorama_to_pixel(*lon_lat(vec), width, height)


def panorama_to_pixel(
    lon_deg: np.ndarray, lat_deg: np.ndarray, width: int, height: int
) -> tuple[np.ndarray, np.ndarray]:
    """Maps panorama-frame (lon, lat) to fractional pixel coordinates (x, y).

    Pixel centre i has longitude l' = 180 - (i + 0.5) / W * 360 (l' wrapped to (-180, 180]),
    so longitude 0 is at the image centre and grows leftwards.
    """
    wrapped = (lon_deg + 180.0) % 360.0 - 180.0
    x = (0.5 - wrapped / 360.0) * width - 0.5
    y = (0.5 - lat_deg / 180.0) * height - 0.5
    return x, y


def pixel_to_panorama(
    x: np.ndarray, y: np.ndarray, width: int, height: int
) -> tuple[np.ndarray, np.ndarray]:
    """Inverse of panorama_to_pixel."""
    return (180.0 - (x + 0.5) / width * 360.0) % 360.0, 90.0 - (y + 0.5) / height * 180.0


def sample_bilinear(img: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Bilinearly samples a (H, W, C) image; x wraps around, y is clamped."""
    h, w = img.shape[:2]
    y = np.clip(y, 0.0, h - 1.0)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.minimum(np.floor(y).astype(np.int64), h - 2)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    x0 %= w
    x1 = (x0 + 1) % w
    y1 = y0 + 1
    top = img[y0, x0] * (1 - fx) + img[y0, x1] * fx
    bottom = img[y1, x0] * (1 - fx) + img[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


# --- Filters (numpy only; wrap horizontally, reflect vertically) ----------------------------


def _pad(img: np.ndarray, pad: int) -> np.ndarray:
    """Pads a (H, W, C) image: wrap horizontally (longitude), reflect vertically."""
    img = np.pad(img, ((0, 0), (pad, pad), (0, 0)), mode='wrap')
    return np.pad(img, ((pad, pad), (0, 0), (0, 0)), mode='reflect')


def _horizontal_reduce(img: np.ndarray, radii: np.ndarray, reducer: np.ufunc) -> np.ndarray:
    """Sliding min/max along rows with a per-row radius, wrapping around in longitude.

    Uses doubling windows so each group of equal-radius rows costs O(log radius) passes.
    """
    w = img.shape[1]
    out = np.empty_like(img)
    for radius in np.unique(radii):
        rows = radii == radius
        sub = img[rows]
        length = 2 * radius + 1
        level = np.concatenate([sub[:, w - radius:], sub, sub[:, :radius]], axis=1)
        span = 1
        while span * 2 <= length:
            level = reducer(level[:, :-span], level[:, span:])
            span *= 2
        out[rows] = reducer(level[:, :w], level[:, length - span:length - span + w])
    return out


def _sliding_reduce(img: np.ndarray, size: int, reducer: np.ufunc) -> np.ndarray:
    """Applies a separable min/max filter covering ~size x size source pixels of sky.

    The horizontal extent grows as 1/cos(latitude) so the window is roughly isotropic on
    the sphere; otherwise the stretched polar rows would see a smaller patch of sky.
    """
    pad = size // 2
    h, w = img.shape[:2]
    lat = 90.0 - (np.arange(h) + 0.5) * 180.0 / h
    radii = np.ceil(pad / np.maximum(np.cos(np.radians(lat)), 1e-6)).astype(int)
    rows = _horizontal_reduce(img, np.minimum(radii, w // 2 - 1), reducer)
    rows = np.pad(rows, ((pad, pad), (0, 0), (0, 0)), mode='reflect')
    out = rows[pad:pad + h].copy()
    for dy in range(-pad, pad + 1):
        if dy:
            reducer(out, rows[pad + dy:pad + dy + h], out=out)
    return out


def grey_opening(img: np.ndarray, size: int) -> np.ndarray:
    """Grey morphological opening (erosion then dilation) with a square element."""
    return _sliding_reduce(_sliding_reduce(img, size, np.minimum), size, np.maximum)


def gaussian_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur of a (H, W, C) image."""
    radius = int(np.ceil(3 * sigma))
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (offsets / sigma) ** 2)
    kernel /= kernel.sum()
    padded = _pad(img, radius)
    h, w = img.shape[:2]
    rows = sum(k * padded[:, radius + d:radius + d + w] for k, d in zip(kernel, offsets))
    return sum(k * rows[radius + d:radius + d + h] for k, d in zip(kernel, offsets))


def luminance(img: np.ndarray) -> np.ndarray:
    """Rec. 709 luminance of a (H, W, 3) image."""
    return img @ np.array([0.2126, 0.7152, 0.0722], dtype=img.dtype)


# --- Star removal ---------------------------------------------------------------------------


def _protected_pixels(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Source pixel positions of bright catalogued deep-sky objects that must be kept."""
    dsos = json.loads(DSO_PATH.read_text())
    radec = [
        (o['ra'], o['dec']) for o in dsos
        if o.get('mag') is not None and o['mag'] < DSO_KEEP_MAG
        and o.get('type') not in DSO_SKIP_TYPES
    ] + EXTRA_KEEP_RADEC
    ra, dec = np.array(radec).T
    return radec_to_source_pixel(ra, dec, width, height)


def remove_compact_blobs(opened: np.ndarray) -> np.ndarray:
    """Erases compact bright blobs that survive the small opening (star halos, planets).

    A blob is a local maximum of (small opening - large opening) luminance above
    BLOB_THRESHOLD whose half-maximum area is below BLOB_MAX_AREA pixels. Blobs within
    DSO_KEEP_RADIUS_DEG of a bright catalogued deep-sky object are kept.
    """
    h, w = opened.shape[:2]
    large = grey_opening(opened, BLOB_OPENING_SIZE)
    residual = luminance(opened) - luminance(large)
    local_max = _sliding_reduce(residual[..., None], 41, np.maximum)[..., 0]
    peak_y, peak_x = np.nonzero((residual == local_max) & (residual > BLOB_THRESHOLD))
    keep_x, keep_y = _protected_pixels(w, h)

    out = opened.copy()
    yy, xx = np.mgrid[-BLOB_RADIUS:BLOB_RADIUS + 1, -BLOB_RADIUS:BLOB_RADIUS + 1]
    dist = np.hypot(xx, yy) / BLOB_RADIUS
    feather = np.clip(1.5 - 1.5 * dist, 0.0, 1.0)[..., None]
    ring = (dist > 0.8) & (dist <= 1.0)
    removed = 0
    for py, px in zip(peak_y, peak_x):
        if not BLOB_RADIUS <= py < h - BLOB_RADIUS:
            continue
        cols = np.arange(px - BLOB_RADIUS, px + BLOB_RADIUS + 1) % w
        rows = slice(py - BLOB_RADIUS, py + BLOB_RADIUS + 1)
        if (residual[rows][:, cols] > residual[py, px] / 2).sum() > BLOB_MAX_AREA:
            continue
        dx = ((keep_x - px + w / 2) % w - w / 2) * np.cos(np.radians(90 - (py + 0.5) * 180 / h))
        if np.any(np.hypot(dx, keep_y - py) * 360 / w < DSO_KEEP_RADIUS_DEG):
            continue
        # Fill with the surrounding sky level (ring median), feathered into the original.
        window = out[rows][:, cols]
        fill = np.minimum(window, np.median(window[ring], axis=0))
        out[rows, cols] = window * (1 - feather) + fill * feather
        removed += 1
    print(f'removed {removed} compact blobs')
    return out


def remove_stars(img: np.ndarray) -> np.ndarray:
    """Removes point stars and star halos, keeping the diffuse glow, dust lanes and bulge."""
    opened = grey_opening(img, OPENING_SIZE)
    return gaussian_blur(remove_compact_blobs(opened), BLUR_SIGMA)


# --- Tone mapping ---------------------------------------------------------------------------


def weighted_percentile(values: np.ndarray, weights: np.ndarray, pct: float) -> float:
    """Returns the weighted percentile of a flat array."""
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    idx = np.searchsorted(cumulative, pct / 100.0 * cumulative[-1])
    return float(values[order][min(idx, len(values) - 1)])


def tone_map(img: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    """Subtracts the sky floor, sinks faint noise and compresses highlights, keeping hue.

    Percentiles are weighted by cos(Dec) so that over-sampled polar rows do not dominate.
    """
    weights = np.broadcast_to(np.cos(np.radians(dec_deg))[:, None], img.shape[:2]).ravel()
    floors = [
        weighted_percentile(img[..., c].ravel(), weights, BLACK_PERCENTILE) for c in range(3)
    ]
    img = np.clip(img - np.array(floors), 0.0, None)
    lum = luminance(img)
    white = weighted_percentile(lum.ravel(), weights, WHITE_PERCENTILE)
    x = lum / white
    toed = x * x / (x + TOE)
    k = HIGHLIGHT_STRENGTH
    compressed = (1.0 - np.exp(-k * toed)) / (1.0 - np.exp(-k))
    scale = np.where(lum > 0, compressed / np.maximum(x, 1e-9), 0.0)
    print(f'black point per channel (0-255): {[round(f * 255, 1) for f in floors]}')
    print(f'white point (luminance, 0-255): {white * 255:.1f}')
    return np.clip(img / white * scale[..., None] * OUTPUT_GAIN, 0.0, 1.0)


# --- Pipeline -------------------------------------------------------------------------------


def load_source(source: Path) -> np.ndarray:
    """Loads the panorama as float32 RGB in [0, 1]."""
    with Image.open(source) as im:
        return np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0


def make_milkyway(source: Path, output: Path) -> None:
    """Reprojects, cleans and writes the Milky Way background texture."""
    src = load_source(source)
    h, w = src.shape[:2]
    print(f'source: {w}x{h}')
    src = remove_stars(src)

    ra = (np.arange(OUT_WIDTH) + 0.5) / OUT_WIDTH * 360.0
    dec = 90.0 - (np.arange(OUT_HEIGHT) + 0.5) / OUT_HEIGHT * 180.0
    ra_grid, dec_grid = np.meshgrid(ra, dec)
    x, y = radec_to_source_pixel(ra_grid, dec_grid, w, h)
    out = tone_map(sample_bilinear(src, x, y), dec)

    output.parent.mkdir(parents=True, exist_ok=True)
    img8 = np.round(out * 255.0).astype(np.uint8)
    Image.fromarray(img8, 'RGB').save(
        output, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True
    )
    print(f'wrote {output} ({OUT_WIDTH}x{OUT_HEIGHT}, {output.stat().st_size / 1e6:.2f} MB)')


# --- Calibration ----------------------------------------------------------------------------


def _cross_correlate(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """Returns the sub-pixel (dx, dy) shift of image a relative to b, and a peak SNR."""
    a, b = a - a.mean(), b - b.mean()
    corr = np.fft.irfft2(np.fft.rfft2(a) * np.conj(np.fft.rfft2(b)), s=a.shape)
    iy, ix = np.unravel_index(corr.argmax(), corr.shape)
    ch, cw = corr.shape
    peak = corr[iy, ix]

    def parabola(minus: float, plus: float) -> float:
        denom = minus - 2 * peak + plus
        return 0.0 if denom == 0 else 0.5 * (minus - plus) / denom

    sx = parabola(corr[iy, (ix - 1) % cw], corr[iy, (ix + 1) % cw])
    sy = parabola(corr[(iy - 1) % ch, ix], corr[(iy + 1) % ch, ix])
    ix = ix - cw if ix > cw // 2 else ix
    iy = iy - ch if iy > ch // 2 else iy
    return ix + sx, iy + sy, peak / corr.std()


def _kabsch(p: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Best rotation R (proper, 3x3) such that R @ p_i ~ q_i."""
    u_mat, _, vt = np.linalg.svd(p.T @ q)
    d = np.sign(np.linalg.det(u_mat @ vt))
    return (u_mat @ np.diag([1.0, 1.0, d]) @ vt).T


def calibrate(source: Path, tile: int = 250, iterations: int = 3) -> np.ndarray:
    """Fits PANORAMA_ROTATION by cross-correlating the panorama's stars with the catalogue.

    The catalogue (mag < 6) is rendered into the panorama projection with the current
    rotation; each tile's cross-correlation shift gives a point correspondence, and the
    rotation is refined with a Kabsch fit.
    """
    src = load_source(source)
    h, w = src.shape[:2]
    lum = luminance(src)[..., None]
    stars_img = np.sqrt(np.clip(lum - grey_opening(lum, OPENING_SIZE), 0, None))[..., 0]
    cat = [s for s in json.loads(STARS_PATH.read_text()) if s['mag'] is not None]
    cat = [s for s in cat if s['mag'] < 6.0]
    ra = np.array([s['ra'] for s in cat])  # degrees
    dec = np.array([s['dec'] for s in cat])
    flux = np.sqrt(10 ** (-0.4 * (np.array([s['mag'] for s in cat]) - 6.0)))
    gal = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame='icrs').galactic
    cat_vec = unit_vector(gal.l.deg, gal.b.deg)

    rotation = np.eye(3)
    for it in range(iterations):
        x, y = panorama_to_pixel(*lon_lat(cat_vec @ rotation.T), w, h)
        synth = np.zeros((h, w), dtype=np.float32)
        np.add.at(synth, (np.clip(np.round(y).astype(int), 0, h - 1),
                          np.round(x).astype(int) % w), flux)
        synth = gaussian_blur(synth[..., None], 1.5)[..., 0]
        model_pts, image_pts, offsets = [], [], []
        for ty in range(0, h - tile + 1, tile):
            if abs(90.0 - (ty + tile / 2) * 180.0 / h) > 70.0:
                continue
            for tx in range(0, w - tile + 1, tile):
                sl = (slice(ty, ty + tile), slice(tx, tx + tile))
                dx, dy, snr = _cross_correlate(stars_img[sl], synth[sl])
                if snr < 6 or max(abs(dx), abs(dy)) > tile / 4:
                    continue
                cx, cy = tx + tile / 2 - 0.5, ty + tile / 2 - 0.5
                lon0, lat0 = pixel_to_panorama(np.array(cx), np.array(cy), w, h)
                lon1, lat1 = pixel_to_panorama(np.array(cx + dx), np.array(cy + dy), w, h)
                model_pts.append(unit_vector(lon0, lat0))
                image_pts.append(unit_vector(lon1, lat1))
                offsets.append(np.hypot(dx * np.cos(np.radians(lat0)), dy) * 360.0 / w)
        print(f'iteration {it}: {len(offsets)} tiles, median offset '
              f'{np.median(offsets):.3f} deg, 90th pct {np.percentile(offsets, 90):.3f} deg')
        rotation = _kabsch(np.array(model_pts), np.array(image_pts)) @ rotation
    np.set_printoptions(precision=8, suppress=True)
    print(f'PANORAMA_ROTATION =\n{rotation!r}')
    gc = lon_lat(rotation @ unit_vector(np.array(0.0), np.array(0.0)))
    print(f'true galactic centre lies at panorama ({gc[0]:.2f}, {gc[1]:+.2f}) deg')
    return rotation


def main() -> None:
    """Command-line entry point."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('source', type=Path, help='ESO eso0932a panorama JPEG')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='output JPEG')
    parser.add_argument('--calibrate', action='store_true',
                        help='fit and print PANORAMA_ROTATION instead of writing the image')
    args = parser.parse_args()
    if args.calibrate:
        calibrate(args.source)
    else:
        make_milkyway(args.source, args.output)


if __name__ == '__main__':
    main()
