#!/usr/bin/env python3
"""
Astrapedia Data Pipeline
Downloads and processes astronomical catalogs for the Astrapedia app.

Refactored to use shared modules from astrapedia package.
"""

import json
import logging
from pathlib import Path

import pandas as pd

# Configure logging for the pipeline
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)

from astrapedia.config import Config, DSO_TYPE_NAMES
from astrapedia.io import download_file, write_json
from astrapedia.astronomy import (
    filter_by_magnitude,
    inject_supplementary_objects,
    parse_ra_string,
    parse_dec_string,
)


def download_catalog(
    url: str, filename: str, catalog_name: str | None = None
) -> Path | None:
    """Download a catalog file if it doesn't exist, then verify its checksum.

    Args:
        url: URL to download from.
        filename: Local filename under the data directory.
        catalog_name: Key in Config.CATALOG_SOURCES for checksum verification.
            When omitted (or no checksum configured), verification is skipped.
    """
    filepath = Config.get_data_path(filename)

    if filepath.exists():
        print(f"  {filename} already exists")
    elif not download_file(url, filepath, show_progress=True):
        return None

    # Verify integrity: no-op when no checksum is configured. Runs on the
    # reused file too, so a previously corrupted catalog is caught.
    #
    # The result is acted on rather than discarded. A corrupt cached file would
    # otherwise be reused on every subsequent run — filepath.exists() short
    # circuits the download — so the pipeline would keep building output from
    # it until someone deleted it by hand. Discarding the file forces a fresh
    # download next time.
    if catalog_name and not Config.verify_checksum(
        filepath.read_bytes(), catalog_name
    ):
        print(f"  Checksum mismatch for {filename}; discarding it")
        filepath.unlink(missing_ok=True)
        return None

    return filepath


# Star record fields, in the order they appear in the JSON output.
_STAR_INT_COLUMNS = ("id", "hip", "hd", "hr")
_STAR_FLOAT_COLUMNS = ("absmag", "dist", "ci")
_STAR_STRING_COLUMNS = ("gl", "proper", "spect")
_STAR_FIELD_ORDER = (
    "id", "hip", "hd", "hr", "gl", "proper",
    "ra", "dec", "mag", "absmag", "spect", "dist", "ci",
)


def _stars_from_dataframe(df: pd.DataFrame) -> list[dict]:
    """
    Convert filtered HYG rows into star records.

    Works column by column so pandas does the per-row work in C. Missing
    values become None rather than NaN, which json.dump would otherwise emit
    as a bare NaN token that JSON.parse rejects.

    Parameters:
    -----------
    df : pd.DataFrame
        Magnitude-filtered HYG rows

    Returns:
    --------
    list of dict : Star records in JSON field order
    """
    columns: dict[str, list] = {}

    for name in _STAR_INT_COLUMNS:
        values = pd.to_numeric(df[name], errors="coerce")
        columns[name] = [int(v) if pd.notna(v) else None for v in values]

    for name in _STAR_FLOAT_COLUMNS:
        values = pd.to_numeric(df[name], errors="coerce")
        columns[name] = [float(v) if pd.notna(v) else None for v in values]

    for name in _STAR_STRING_COLUMNS:
        columns[name] = [v if pd.notna(v) else None for v in df[name]]

    # RA is stored in hours in the catalog and degrees in our output.
    columns["ra"] = (df["ra"].astype(float) * Config.HOURS_TO_DEGREES).tolist()
    columns["dec"] = df["dec"].astype(float).tolist()
    columns["mag"] = df["mag"].astype(float).tolist()

    ordered = [columns[name] for name in _STAR_FIELD_ORDER]
    return [dict(zip(_STAR_FIELD_ORDER, values)) for values in zip(*ordered)]

def process_hyg_stars(
    max_magnitude: float = Config.MAX_MAGNITUDE_LIMIT,
) -> dict | None:
    """Process HYG star database and create filtered JSON."""
    print("\n=== Processing HYG Star Database ===")

    # Download HYG database
    hyg_file = download_catalog(Config.HYG_URL, "hygdata_v41.csv", "hyg")
    if not hyg_file:
        print("Failed to download HYG database")
        return None

    # Read CSV
    print(f"  Reading {hyg_file.name}...")
    df = pd.read_csv(hyg_file)

    # Drop the Sun. HYG carries it as row id 0 with placeholder coordinates
    # (RA 0, Dec 0, distance 0) and magnitude -26.7, so the magnitude filter
    # keeps it and it ships as a catalogued star: a permanent max-brightness
    # point at the vernal equinox, and a "Sol" search result that flies the
    # camera there. The real Sun is drawn from ephemeris by PlanetRenderer.
    df = df[df["id"] != 0]

    # Filter by magnitude
    df_filtered = df[df["mag"] <= max_magnitude].copy()
    print(f"  Filtered {len(df_filtered)} stars (magnitude <= {max_magnitude})")

    # Build the records column-wise. iterrows() materialises a Series per row
    # and ran ~12 scalar pd.notna() calls on each, which over 118,000 rows is
    # about 1.4 million pandas calls; this is the same output an order of
    # magnitude faster.
    stars = _stars_from_dataframe(df_filtered)

    # Magnitude bins in a single pass rather than five list comprehensions
    # over the whole catalog.
    magnitude_bins = {
        "very_bright": 0,
        "bright": 0,
        "visible": 0,
        "faint": 0,
        "very_faint": 0,
    }
    for star in stars:
        mag = star["mag"]
        if mag <= 2.0:
            magnitude_bins["very_bright"] += 1
        elif mag <= 4.0:
            magnitude_bins["bright"] += 1
        elif mag <= 6.0:
            magnitude_bins["visible"] += 1
        elif mag <= 8.0:
            magnitude_bins["faint"] += 1
        else:
            magnitude_bins["very_faint"] += 1

    print("  Stars by brightness:")
    for category, count in magnitude_bins.items():
        print(f"    {category}: {count} stars")

    # Save to JSON (compact to reduce file size and diff noise)
    output_file = Config.get_data_path("stars.json")
    write_json(stars, output_file, compact=True)

    return {"stars": stars, "magnitude_bins": magnitude_bins, "count": len(stars)}


def process_constellation_lines() -> dict | None:
    """Download and process constellation line data."""
    print("\n=== Processing Constellation Lines ===")

    # Download constellation data from dcf21's repository (IAU standard)
    const_url = "https://raw.githubusercontent.com/dcf21/constellation-stick-figures/master/constellation_lines_iau.dat"
    const_file = download_catalog(const_url, "constellation_lines_iau.dat")

    if not const_file:
        print("Failed to download constellation data")
        return None

    # Parse constellation line data
    constellations = {}
    current_constellation = None

    with open(const_file, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # Constellation name line (format: "* Name")
            if line.startswith("* "):
                current_constellation = line[2:].strip()
                constellations[current_constellation] = {
                    "name": current_constellation,
                    "lines": [],
                }
            # JSON array format: ["hip1", "hip2", ...]
            elif line.startswith("[") and current_constellation:
                try:
                    hip_list = json.loads(line)
                    for i in range(len(hip_list) - 1):
                        hip1_str = str(hip_list[i]).rstrip("*")
                        hip2_str = str(hip_list[i + 1]).rstrip("*")
                        try:
                            hip1 = int(hip1_str)
                            hip2 = int(hip2_str)
                            constellations[current_constellation]["lines"].append(
                                [hip1, hip2]
                            )
                        except ValueError:
                            continue
                except json.JSONDecodeError:
                    continue
            # Old format: space-separated HIP pairs (fallback)
            elif line[0].isdigit() and current_constellation:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        hip1 = int(parts[0])
                        hip2 = int(parts[1])
                        constellations[current_constellation]["lines"].append(
                            [hip1, hip2]
                        )
                    except ValueError:
                        continue

    print(f"  Loaded {len(constellations)} constellations")

    # Never overwrite a good file with an empty parse. A download can succeed
    # and still be unparseable — an upstream format change, or a captive
    # portal returning HTML with a 200 — and this catalog is fetched without a
    # catalog_name, so no checksum guards it. Writing {} here would leave the
    # app with no constellation lines at all.
    if not constellations:
        print("  Parsed no constellations; keeping the existing file")
        return None

    # Save to JSON (compact to reduce file size and diff noise)
    output_file = Config.get_data_path("constellations.json")
    write_json(constellations, output_file, compact=True)

    return constellations


def process_deep_sky_objects() -> dict | None:
    """Download and process OpenNGC deep sky objects."""
    print("\n=== Processing Deep Sky Objects ===")

    # Download OpenNGC database
    ngc_file = download_catalog(Config.OPENNGC_URL, "NGC.csv", "openngc")
    if not ngc_file:
        print("Failed to download OpenNGC database")
        return None

    # Read CSV (with delimiter ';')
    print(f"  Reading {ngc_file.name}...")
    df = pd.read_csv(ngc_file, delimiter=";")

    # Filter out objects without coordinates
    df = df[pd.notna(df["RA"]) & pd.notna(df["Dec"])].copy()

    # Convert coordinates
    df["ra_deg"] = df["RA"].apply(parse_ra_string)
    df["dec_deg"] = df["Dec"].apply(parse_dec_string)

    # Filter out failed conversions
    df = df[pd.notna(df["ra_deg"]) & pd.notna(df["dec_deg"])].copy()

    # Use V-Mag where available, fall back to B-Mag for objects missing V-Mag
    df["mag"] = df["V-Mag"].fillna(df["B-Mag"])

    # Filter by magnitude
    df = df[pd.notna(df["mag"]) & (df["mag"] <= Config.MAX_MAGNITUDE_LIMIT)].copy()

    # Create deep sky objects list
    dso_list = []
    for _, row in df.iterrows():
        dso = {
            "name": row["Name"],
            "type": row["Type"] if pd.notna(row["Type"]) else "Unknown",
            "ra": float(row["ra_deg"]),
            "dec": float(row["dec_deg"]),
            "mag": float(row["mag"]) if pd.notna(row["mag"]) else None,
            "size_major": float(row["MajAx"]) if pd.notna(row["MajAx"]) else None,
            "size_minor": float(row["MinAx"]) if pd.notna(row["MinAx"]) else None,
            "pos_angle": float(row["PosAng"]) if pd.notna(row["PosAng"]) else None,
            "messier": row["M"] if pd.notna(row["M"]) else None,
            "common_names": (
                row["Common names"] if pd.notna(row["Common names"]) else None
            ),
        }
        dso_list.append(dso)

    print(f"  Processed {len(dso_list)} deep sky objects from OpenNGC")

    # Add Messier objects not in OpenNGC
    # These are objects that don't have NGC/IC designations or are not in the catalog
    supplementary_messier = [
        {
            "name": "Mel22",  # Melotte 22
            "type": "OCl",
            "ra": 56.87,  # 03h 47m
            "dec": 24.12,  # +24° 07'
            "mag": 1.6,
            "size_major": 110.0,  # Very large cluster
            "size_minor": 110.0,
            "pos_angle": None,
            "messier": 45,
            "common_names": ["Pleiades", "Seven Sisters", "Subaru"],
        },
        {
            "name": "WNC4",  # Winnecke 4
            "type": "**",  # Double star
            "ra": 185.55,  # 12h 22m 12.5s
            "dec": 58.08,  # +58° 05'
            "mag": 8.4,
            "size_major": None,
            "size_minor": None,
            "pos_angle": None,
            "messier": 40,
            "common_names": ["Winnecke 4"],
        },
        {
            "name": "NGC5866",  # M102 is disputed, commonly identified as NGC 5866
            "type": "G",
            "ra": 226.62,  # 15h 06m 29.5s
            "dec": 55.76,  # +55° 45' 48"
            "mag": 9.9,
            "size_major": 6.5,
            "size_minor": 3.1,
            "pos_angle": 128.0,
            "messier": 102,
            "common_names": ["Spindle Galaxy"],
        },
    ]

    # Inject supplementary Messier objects
    dso_list, added = inject_supplementary_objects(
        dso_list, supplementary_messier, key="messier"
    )

    # Log exactly which objects were added
    for supp in added:
        print(f"  Added M{supp['messier']} ({supp['common_names'][0]})")

    print(f"  Total: {len(dso_list)} deep sky objects ({len(added)} supplementary)")

    # Group by type for statistics
    dso_by_type = {}
    for dso in dso_list:
        obj_type = dso["type"]
        dso_by_type[obj_type] = dso_by_type.get(obj_type, 0) + 1

    print("  Deep sky objects by type:")
    for obj_type, count in sorted(
        dso_by_type.items(), key=lambda x: x[1], reverse=True
    ):
        type_name = DSO_TYPE_NAMES.get(obj_type, obj_type)
        print(f"    {type_name}: {count}")

    # Save to JSON (compact to reduce file size and diff noise)
    output_file = Config.get_data_path("deep_sky_objects.json")
    write_json(dso_list, output_file, compact=True)

    return {"objects": dso_list, "by_type": dso_by_type, "count": len(dso_list)}


def create_named_objects_index(stars: list[dict]) -> dict:
    """Create an index of named stars and their coordinates."""
    print("\n=== Creating Named Objects Index ===")

    named_stars = [s for s in stars if s.get("proper")]
    print(f"  Found {len(named_stars)} named stars")

    # Sort by magnitude (brightest first)
    named_stars_sorted = sorted(named_stars, key=lambda x: x["mag"])

    # Create index. Sorted brightest-first, so setdefault keeps the brightest
    # star when two share a proper name (e.g. 'p Eridani').
    index = {}
    for star in named_stars_sorted:
        index.setdefault(star["proper"], {
            "id": star["id"],
            "hip": star["hip"],
            "ra": star["ra"],
            "dec": star["dec"],
            "mag": star["mag"],
        })

    # Save to JSON
    output_file = Config.get_data_path("named_objects.json")
    write_json(index, output_file, indent=2)

    # Print brightest named stars
    print("\n  Brightest named stars:")
    for star in named_stars_sorted[:10]:
        print(f"    {star['proper']:20s} - mag {star['mag']:.2f}")

    return index


def create_optimized_files(stars: list[dict]) -> None:
    """Create optimized star files at different magnitude levels."""
    print("\n=== Creating Optimized Star Files ===")

    for level in Config.MAGNITUDE_LEVELS:
        filtered = filter_by_magnitude(stars, level.mag_limit)
        output_file = Config.get_data_path(level.filename)
        write_json(filtered, output_file, compact=True)
        print(f"  {level.description}: {len(filtered)} stars")


def main():
    """Main pipeline execution."""
    print("=" * 60)
    print("Astrapedia Data Pipeline")
    print("=" * 60)

    # Ensure data directory exists
    Config.ensure_data_dir()

    # Process all data
    star_data = process_hyg_stars(max_magnitude=Config.MAX_MAGNITUDE_LIMIT)
    constellation_data = process_constellation_lines()
    dso_data = process_deep_sky_objects()

    if star_data:
        create_named_objects_index(star_data["stars"])
        create_optimized_files(star_data["stars"])

    print("\n" + "=" * 60)
    print("Data Pipeline Complete!")
    print("=" * 60)
    print(f"  Stars: {star_data['count'] if star_data else 0}")
    print(f"  Constellations: {len(constellation_data) if constellation_data else 0}")
    print(f"  Deep Sky Objects: {dso_data['count'] if dso_data else 0}")
    print("\nData files created in 'data/' directory")
    print("=" * 60)


if __name__ == "__main__":
    main()
