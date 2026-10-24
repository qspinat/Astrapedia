#!/usr/bin/env python3
"""
Create optimized, smaller data files for faster initial loading.

Re-runs only the magnitude-split step of data_pipeline.py from an existing
data/stars.json, producing one file per Config.MAGNITUDE_LEVELS entry:
- stars_bright.json: ~9K stars visible to naked eye (mag <= 6.5)
- stars_medium.json: ~40K stars (mag <= 8.0)
- stars_all.json: Full dataset (mag <= 12.0)
"""

from astrapedia.config import Config
from astrapedia.io import read_json
from data_pipeline import create_optimized_files


def create_optimized_stars() -> None:
    """Create smaller star files for different magnitude levels."""
    print("Loading full star database...")
    all_stars = read_json(Config.get_output_path("stars"), default=[])
    print(f"Total stars: {len(all_stars)}")
    create_optimized_files(all_stars)


if __name__ == "__main__":
    create_optimized_stars()
