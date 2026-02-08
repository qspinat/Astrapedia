#!/usr/bin/env python3
"""
Create optimized, smaller data files for faster initial loading.

This script creates magnitude-filtered star files for different use cases:
- stars_bright.json: ~9K stars visible to naked eye (mag <= 6.5)
- stars_medium.json: ~40K stars (mag <= 8.0)
- stars_all.json: Full dataset (mag <= 12.0)
"""

import json
import os

from astrapedia.config import Config


def create_optimized_stars():
    """Create smaller star files for different magnitude levels."""
    print("Loading full star database...")
    with open('data/stars.json', 'r') as f:
        all_stars = json.load(f)

    print(f"Total stars: {len(all_stars)}")

    # Use centralized magnitude levels from Config
    for level in Config.MAGNITUDE_LEVELS:
        mag_limit = level.mag_limit
        filename = level.filename
        filtered_stars = [s for s in all_stars if s['mag'] <= mag_limit]

        output_file = f'data/{filename}'
        with open(output_file, 'w') as f:
            json.dump(filtered_stars, f)

        # Get file size
        file_size = os.path.getsize(output_file) / 1024 / 1024
        print(f"✓ Created {filename}: {len(filtered_stars)} stars ({file_size:.1f} MB)")

if __name__ == "__main__":
    create_optimized_stars()
