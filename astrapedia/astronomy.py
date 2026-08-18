"""
Astronomy utilities for Astrapedia data pipeline.
Contains coordinate conversions, magnitude filtering, and data transformations.
"""

import math
from typing import Any

import pandas as pd


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


def filter_by_magnitude(
    objects: list[dict[str, Any]],
    mag_limit: float,
    mag_key: str = "mag",
    include_null: bool = False,
) -> list[dict[str, Any]]:
    """
    Filter celestial objects by magnitude limit.

    Args:
        objects: list of object dictionaries
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


def parse_ra_string(ra_str: str | None) -> float | None:
    """
    Parse RA from hours:minutes:seconds string to degrees.

    Handles pandas NA values and various separators.

    Args:
        ra_str: RA string in "HH:MM:SS" or "HH MM SS" format

    Returns:
        RA in degrees (0-360) or None if parsing fails
    """
    if ra_str is None or (hasattr(ra_str, "__class__") and pd.isna(ra_str)):
        return None

    try:
        ra_str = str(ra_str).strip()

        # Try decimal first (already in hours)
        try:
            hours = float(ra_str)
            return hours * 15.0
        except ValueError:
            pass

        # Try HMS formats
        for sep in [":", " "]:
            parts = ra_str.split(sep)
            if len(parts) >= 2:
                try:
                    hours = float(parts[0])
                    minutes = float(parts[1]) if len(parts) > 1 else 0
                    seconds = float(parts[2]) if len(parts) > 2 else 0
                    return ra_hms_to_degrees(hours, minutes, seconds)
                except (ValueError, IndexError):
                    continue

        return None
    except (ValueError, TypeError):
        return None


def parse_dec_string(dec_str: str | None) -> float | None:
    """
    Parse Dec from degrees:arcmin:arcsec string to decimal degrees.

    Handles pandas NA values, sign prefix, and various separators.

    Args:
        dec_str: Dec string in "+DD:MM:SS" or "DD MM SS" format

    Returns:
        Dec in decimal degrees (-90 to +90) or None if parsing fails
    """
    if dec_str is None or (hasattr(dec_str, "__class__") and pd.isna(dec_str)):
        return None

    try:
        raw = str(dec_str).strip()
        # Capture the sign before parsing: float("-00") is -0.0, and
        # -0.0 < 0 is False, which would flip a small southern dec positive.
        negative = raw.startswith("-")
        dec_str = raw.replace("+", "")

        # Try decimal first
        try:
            return float(dec_str)
        except ValueError:
            pass

        # Try DMS formats
        for sep in [":", " "]:
            parts = dec_str.split(sep)
            if len(parts) >= 1:
                try:
                    degrees = float(parts[0])
                    minutes = float(parts[1]) if len(parts) > 1 else 0
                    seconds = float(parts[2]) if len(parts) > 2 else 0
                    sign = -1 if (degrees < 0 or negative) else 1
                    return sign * (abs(degrees) + minutes / 60 + seconds / 3600)
                except (ValueError, IndexError):
                    continue

        return None
    except (ValueError, TypeError):
        return None


def inject_supplementary_objects(
    objects: list[dict[str, Any]],
    supplementary: list[dict[str, Any]],
    key: str = "messier",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Inject supplementary objects into a list if not already present.

    Checks for duplicates based on a unique key (e.g., Messier number).

    Args:
        objects: Existing list of objects
        supplementary: Objects to add if not present
        key: dictionary key to check for duplicates

    Returns:
        tuple of (combined list, list of objects that were added)
    """
    existing_keys = {obj[key] for obj in objects if obj.get(key) is not None}
    added = []

    for supp in supplementary:
        if supp.get(key) is not None and supp[key] not in existing_keys:
            added.append(supp)

    return objects + added, added
