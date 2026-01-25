#!/usr/bin/env python3
"""
Sky Map Data Pipeline
Downloads and processes astronomical catalogs for the sky map app.

Refactored to use shared modules from skymap package.
"""

import json
import sys
from pathlib import Path

import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from skymap.config import Config, DSO_TYPE_NAMES
from skymap.io import download_file, write_json
from skymap.astronomy import (
    filter_by_magnitude,
    inject_supplementary_objects,
    ra_hms_to_degrees,
)


def download_catalog(url: str, filename: str) -> Path | None:
    """Download a catalog file if it doesn't exist."""
    filepath = Config.get_data_path(filename)

    if filepath.exists():
        print(f"  {filename} already exists")
        return filepath

    if download_file(url, filepath, show_progress=True):
        return filepath
    return None


def process_hyg_stars(
    max_magnitude: float = Config.MAX_MAGNITUDE_LIMIT,
) -> dict | None:
    """Process HYG star database and create filtered JSON."""
    print("\n=== Processing HYG Star Database ===")

    # Download HYG database
    hyg_file = download_catalog(Config.HYG_URL, "hygdata_v41.csv")
    if not hyg_file:
        print("Failed to download HYG database")
        return None

    # Read CSV
    print(f"  Reading {hyg_file.name}...")
    df = pd.read_csv(hyg_file)

    # Filter by magnitude
    df_filtered = df[df["mag"] <= max_magnitude].copy()
    print(f"  Filtered {len(df_filtered)} stars (magnitude <= {max_magnitude})")

    # Create star data structure
    stars = []
    for _, row in df_filtered.iterrows():
        star = {
            "id": int(row["id"]),
            "hip": int(row["hip"]) if pd.notna(row["hip"]) else None,
            "hd": int(row["hd"]) if pd.notna(row["hd"]) else None,
            "hr": int(row["hr"]) if pd.notna(row["hr"]) else None,
            "gl": row["gl"] if pd.notna(row["gl"]) else None,
            "proper": row["proper"] if pd.notna(row["proper"]) else None,
            "ra": float(row["ra"]) * Config.HOURS_TO_DEGREES,
            "dec": float(row["dec"]),
            "mag": float(row["mag"]),
            "absmag": float(row["absmag"]) if pd.notna(row["absmag"]) else None,
            "spect": row["spect"] if pd.notna(row["spect"]) else None,
            "dist": float(row["dist"]) if pd.notna(row["dist"]) else None,
            "ci": float(row["ci"]) if pd.notna(row["ci"]) else None,
        }
        stars.append(star)

    # Create magnitude bins for statistics
    magnitude_bins = {
        "very_bright": len([s for s in stars if s["mag"] <= 2.0]),
        "bright": len([s for s in stars if 2.0 < s["mag"] <= 4.0]),
        "visible": len([s for s in stars if 4.0 < s["mag"] <= 6.0]),
        "faint": len([s for s in stars if 6.0 < s["mag"] <= 8.0]),
        "very_faint": len([s for s in stars if s["mag"] > 8.0]),
    }

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

    # Save to JSON (compact to reduce file size and diff noise)
    output_file = Config.get_data_path("constellations.json")
    write_json(constellations, output_file, compact=True)

    return constellations


def parse_ra_to_degrees(ra_str) -> float | None:
    """Convert RA from hours:minutes:seconds to degrees."""
    try:
        if pd.isna(ra_str):
            return None
        parts = str(ra_str).split(":")
        hours = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0
        return ra_hms_to_degrees(hours, minutes, seconds)
    except (ValueError, IndexError):
        return None


def parse_dec_to_degrees(dec_str) -> float | None:
    """Convert Dec from degrees:minutes:seconds to degrees."""
    try:
        if pd.isna(dec_str):
            return None
        dec_str = str(dec_str).replace("+", "")
        parts = dec_str.split(":")
        degrees = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0
        sign = -1 if degrees < 0 else 1
        return degrees + sign * (minutes / 60 + seconds / 3600)
    except (ValueError, IndexError):
        return None


def process_deep_sky_objects() -> dict | None:
    """Download and process OpenNGC deep sky objects."""
    print("\n=== Processing Deep Sky Objects ===")

    # Download OpenNGC database
    ngc_file = download_catalog(Config.OPENNGC_URL, "NGC.csv")
    if not ngc_file:
        print("Failed to download OpenNGC database")
        return None

    # Read CSV (with delimiter ';')
    print(f"  Reading {ngc_file.name}...")
    df = pd.read_csv(ngc_file, delimiter=";")

    # Filter out objects without coordinates
    df = df[pd.notna(df["RA"]) & pd.notna(df["Dec"])].copy()

    # Convert coordinates
    df["ra_deg"] = df["RA"].apply(parse_ra_to_degrees)
    df["dec_deg"] = df["Dec"].apply(parse_dec_to_degrees)

    # Filter out failed conversions
    df = df[pd.notna(df["ra_deg"]) & pd.notna(df["dec_deg"])].copy()

    # Filter by magnitude
    df = df[pd.notna(df["V-Mag"]) & (df["V-Mag"] <= Config.MAX_MAGNITUDE_LIMIT)].copy()

    # Create deep sky objects list
    dso_list = []
    for _, row in df.iterrows():
        dso = {
            "name": row["Name"],
            "type": row["Type"] if pd.notna(row["Type"]) else "Unknown",
            "ra": float(row["ra_deg"]),
            "dec": float(row["dec_deg"]),
            "mag": float(row["V-Mag"]) if pd.notna(row["V-Mag"]) else None,
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
    dso_list, added_count = inject_supplementary_objects(
        dso_list, supplementary_messier, key="messier"
    )

    # Log which objects were added
    existing_messiers = (
        {dso["messier"] for dso in dso_list[:-added_count] if dso.get("messier")}
        if added_count > 0
        else set()
    )
    for supp in supplementary_messier:
        if supp["messier"] not in existing_messiers:
            print(f"  Added M{supp['messier']} ({supp['common_names'][0]})")

    print(f"  Total: {len(dso_list)} deep sky objects ({added_count} supplementary)")

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

    # Create index
    index = {}
    for star in named_stars_sorted:
        index[star["proper"]] = {
            "id": star["id"],
            "hip": star["hip"],
            "ra": star["ra"],
            "dec": star["dec"],
            "mag": star["mag"],
        }

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
    print("Sky Map Data Pipeline")
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
