"""
Astronomy utilities for SkyMap data pipeline.
Contains coordinate conversions, magnitude filtering, and data transformations.
"""

import math
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import numpy as np


def ra_hms_to_degrees(hours: float, minutes: float = 0, seconds: float = 0) -> float:
    """
    Convert Right Ascension from hours/minutes/seconds to degrees.

    Args:
        hours: Hours component (0-24)
        minutes: Minutes component (0-60)
        seconds: Seconds component (0-60)

    Returns:
        RA in degrees (0-360)
    """
    total_hours = hours + minutes / 60 + seconds / 3600
    return total_hours * 15.0  # 1 hour = 15 degrees


def dec_dms_to_degrees(degrees: float, arcmin: float = 0, arcsec: float = 0) -> float:
    """
    Convert Declination from degrees/arcminutes/arcseconds to decimal degrees.

    Args:
        degrees: Degrees component (-90 to +90)
        arcmin: Arcminutes component (0-60)
        arcsec: Arcseconds component (0-60)

    Returns:
        Dec in decimal degrees
    """
    sign = -1 if degrees < 0 else 1
    return sign * (abs(degrees) + arcmin / 60 + arcsec / 3600)


def degrees_to_ra_hms(ra_degrees: float) -> Tuple[int, int, float]:
    """
    Convert RA from degrees to hours/minutes/seconds.

    Args:
        ra_degrees: RA in degrees (0-360)

    Returns:
        Tuple of (hours, minutes, seconds)
    """
    total_hours = ra_degrees / 15.0
    hours = int(total_hours)
    minutes_float = (total_hours - hours) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    return hours, minutes, seconds


def degrees_to_dec_dms(dec_degrees: float) -> Tuple[int, int, float]:
    """
    Convert Dec from decimal degrees to degrees/arcminutes/arcseconds.

    Args:
        dec_degrees: Dec in decimal degrees

    Returns:
        Tuple of (degrees, arcminutes, arcseconds)
    """
    sign = -1 if dec_degrees < 0 else 1
    dec_abs = abs(dec_degrees)
    degrees = int(dec_abs)
    arcmin_float = (dec_abs - degrees) * 60
    arcmin = int(arcmin_float)
    arcsec = (arcmin_float - arcmin) * 60
    return sign * degrees, arcmin, arcsec


def filter_by_magnitude(
    objects: List[Dict[str, Any]],
    mag_limit: float,
    mag_key: str = "mag",
    include_null: bool = False,
) -> List[Dict[str, Any]]:
    """
    Filter celestial objects by magnitude limit.

    Args:
        objects: List of object dictionaries
        mag_limit: Maximum magnitude to include
        mag_key: Key for magnitude value in dictionaries
        include_null: Whether to include objects with null/missing magnitude

    Returns:
        Filtered list of objects
    """
    result = []
    for obj in objects:
        mag = obj.get(mag_key)
        if mag is None:
            if include_null:
                result.append(obj)
        elif mag <= mag_limit:
            result.append(obj)
    return result


def filter_dataframe_by_magnitude(
    df: pd.DataFrame,
    mag_limit: float,
    mag_column: str = "mag",
) -> pd.DataFrame:
    """
    Filter a pandas DataFrame by magnitude limit (vectorized).

    Args:
        df: DataFrame with magnitude column
        mag_limit: Maximum magnitude to include
        mag_column: Name of magnitude column

    Returns:
        Filtered DataFrame
    """
    mask = df[mag_column].isna() | (df[mag_column] <= mag_limit)
    return df[mask].copy()


def dataframe_to_star_dicts(
    df: pd.DataFrame,
    ra_col: str = "ra",
    dec_col: str = "dec",
    mag_col: str = "mag",
    hip_col: str = "hip",
    name_col: str = "proper",
    ci_col: str = "ci",
    spect_col: str = "spect",
) -> List[Dict[str, Any]]:
    """
    Convert a star DataFrame to list of dictionaries (vectorized).

    Args:
        df: DataFrame with star data
        ra_col: Column name for Right Ascension
        dec_col: Column name for Declination
        mag_col: Column name for magnitude
        hip_col: Column name for Hipparcos ID
        name_col: Column name for proper name
        ci_col: Column name for color index
        spect_col: Column name for spectral type

    Returns:
        List of star dictionaries
    """
    # Create a copy to avoid modifying original
    df = df.copy()

    # Replace NaN with None for cleaner JSON
    df = df.where(pd.notnull(df), None)

    # Build list of dictionaries efficiently
    stars = []
    for _, row in df.iterrows():
        star = {
            "ra": row[ra_col],
            "dec": row[dec_col],
            "mag": row[mag_col],
        }

        # Only add optional fields if they have values
        if row[hip_col] is not None:
            star["hip"] = int(row[hip_col])

        if row[name_col] is not None and str(row[name_col]).strip():
            star["proper"] = str(row[name_col]).strip()

        if row[ci_col] is not None:
            star["ci"] = row[ci_col]

        if row[spect_col] is not None and str(row[spect_col]).strip():
            star["spect"] = str(row[spect_col]).strip()

        stars.append(star)

    return stars


def angular_distance(
    ra1: float, dec1: float,
    ra2: float, dec2: float,
) -> float:
    """
    Calculate angular distance between two points on the celestial sphere.

    Uses the Haversine formula for numerical stability.

    Args:
        ra1, dec1: First position in degrees
        ra2, dec2: Second position in degrees

    Returns:
        Angular distance in degrees
    """
    ra1_rad = math.radians(ra1)
    dec1_rad = math.radians(dec1)
    ra2_rad = math.radians(ra2)
    dec2_rad = math.radians(dec2)

    d_ra = ra2_rad - ra1_rad
    d_dec = dec2_rad - dec1_rad

    a = (
        math.sin(d_dec / 2) ** 2 +
        math.cos(dec1_rad) * math.cos(dec2_rad) * math.sin(d_ra / 2) ** 2
    )

    c = 2 * math.asin(math.sqrt(a))
    return math.degrees(c)


def parse_coordinate_string(coord_str: str) -> Optional[float]:
    """
    Parse a coordinate string in various formats.

    Supports:
    - Decimal degrees: "12.345"
    - Degrees:minutes:seconds: "12:30:45"
    - Degrees minutes seconds: "12 30 45"

    Args:
        coord_str: Coordinate string

    Returns:
        Decimal degrees or None if parsing fails
    """
    if not coord_str:
        return None

    coord_str = coord_str.strip()

    # Try decimal first
    try:
        return float(coord_str)
    except ValueError:
        pass

    # Try DMS formats
    for sep in [":", " "]:
        parts = coord_str.split(sep)
        if len(parts) >= 2:
            try:
                d = float(parts[0])
                m = float(parts[1]) if len(parts) > 1 else 0
                s = float(parts[2]) if len(parts) > 2 else 0
                sign = -1 if d < 0 or coord_str.startswith("-") else 1
                return sign * (abs(d) + m / 60 + s / 3600)
            except (ValueError, IndexError):
                continue

    return None


def normalize_ra(ra: float) -> float:
    """Normalize RA to range [0, 360)."""
    ra = ra % 360
    if ra < 0:
        ra += 360
    return ra


def normalize_dec(dec: float) -> float:
    """Clamp Dec to range [-90, 90]."""
    return max(-90, min(90, dec))


def calculate_star_count_by_magnitude(
    stars: List[Dict[str, Any]],
    mag_key: str = "mag",
) -> Dict[float, int]:
    """
    Calculate cumulative star counts at different magnitude limits.

    Args:
        stars: List of star dictionaries
        mag_key: Key for magnitude value

    Returns:
        Dictionary mapping magnitude limit to cumulative count
    """
    magnitudes = [6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0]
    counts = {}

    for mag_limit in magnitudes:
        count = sum(
            1 for s in stars
            if s.get(mag_key) is not None and s[mag_key] <= mag_limit
        )
        counts[mag_limit] = count

    return counts


def inject_supplementary_objects(
    objects: List[Dict[str, Any]],
    supplementary: List[Dict[str, Any]],
    key: str = "messier",
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Inject supplementary objects into a list if not already present.

    Checks for duplicates based on a unique key (e.g., Messier number).

    Args:
        objects: Existing list of objects
        supplementary: Objects to add if not present
        key: Dictionary key to check for duplicates

    Returns:
        Tuple of (combined list, count of objects added)
    """
    existing_keys = {obj[key] for obj in objects if obj.get(key) is not None}
    added = []

    for supp in supplementary:
        if supp.get(key) is not None and supp[key] not in existing_keys:
            added.append(supp)

    return objects + added, len(added)
