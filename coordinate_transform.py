#!/usr/bin/env python3
"""
Coordinate Transformation Script
Converts celestial coordinates (RA/Dec) to observer-based coordinates (Alt/Az)
for real-time sky map updates.

Refactored to use shared modules from skymap package.
"""

import argparse
import logging
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import AltAz, EarthLocation, SkyCoord, get_body
from astropy.time import Time

# Configure logging for the script
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)

from skymap.config import Config
from skymap.io import read_json, write_json
from skymap.astronomy import filter_by_magnitude


def load_celestial_objects(data_dir: Path = Config.DATA_DIR) -> tuple:
    """Load stars and deep sky objects from JSON files."""
    stars_file = data_dir / "stars.json"
    dso_file = data_dir / "deep_sky_objects.json"

    stars = read_json(stars_file, default=[])
    deep_sky_objects = read_json(dso_file, default=[])

    return stars, deep_sky_objects


def transform_coordinates(
    objects: list[dict], observer_location: EarthLocation, obs_time: Time
) -> list[dict]:
    """
    Transform RA/Dec coordinates to Alt/Az for given observer and time.

    Parameters:
    -----------
    objects : list of dict
        Objects with 'ra' and 'dec' keys (in degrees)
    observer_location : EarthLocation
        Observer's location on Earth
    obs_time : Time
        Observation time

    Returns:
    --------
    list of dict : Objects with added 'alt', 'az', and 'visible' fields
    """
    if not objects:
        return []

    # Extract RA/Dec arrays
    ra_array = np.array([obj["ra"] for obj in objects])
    dec_array = np.array([obj["dec"] for obj in objects])

    # Create coordinate array
    coords = SkyCoord(ra=ra_array * u.deg, dec=dec_array * u.deg, frame="icrs")

    # Transform to Alt/Az
    altaz_frame = AltAz(obstime=obs_time, location=observer_location)
    coords_altaz = coords.transform_to(altaz_frame)

    # Add Alt/Az to objects
    transformed_objects = []
    for i, obj in enumerate(objects):
        new_obj = obj.copy()
        new_obj["alt"] = float(coords_altaz[i].alt.deg)
        new_obj["az"] = float(coords_altaz[i].az.deg)
        new_obj["visible"] = new_obj["alt"] > 0  # Above horizon
        transformed_objects.append(new_obj)

    return transformed_objects


def get_planetary_positions(
    observer_location: EarthLocation, obs_time: Time
) -> list[dict]:
    """
    Calculate positions of planets for given observer and time.

    Returns:
    --------
    list of dict : Planetary data with RA, Dec, Alt, Az coordinates
    """
    planets = [
        "sun",
        "moon",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
    ]

    # Angular sizes in degrees (approximate)
    angular_sizes = {
        "sun": 0.53,
        "moon": 0.52,
        "jupiter": 0.0125,
        "saturn": 0.005,
        "venus": 0.007,
        "mars": 0.005,
        "mercury": 0.003,
        "uranus": 0.001,
        "neptune": 0.001,
    }

    # Approximate magnitudes
    magnitudes = {
        "sun": -27,
        "moon": -12.7,
        "venus": -4.0,
        "jupiter": -2.5,
        "mars": 1.0,
        "mercury": 0.5,
        "saturn": 0.8,
        "uranus": 5.7,
        "neptune": 7.9,
    }

    planet_data = []

    for planet_name in planets:
        try:
            # Get planet coordinates
            planet_coord = get_body(planet_name, obs_time, observer_location)

            # Convert to Alt/Az
            altaz_frame = AltAz(obstime=obs_time, location=observer_location)
            planet_altaz = planet_coord.transform_to(altaz_frame)

            planet_info = {
                "name": planet_name.capitalize(),
                "type": "planet",
                "ra": float(planet_coord.ra.deg),
                "dec": float(planet_coord.dec.deg),
                "alt": float(planet_altaz.alt.deg),
                "az": float(planet_altaz.az.deg),
                "visible": float(planet_altaz.alt.deg) > 0,
                "angular_size": angular_sizes.get(planet_name, 0.001),
                "mag": magnitudes.get(planet_name, 0),
            }

            planet_data.append(planet_info)

        except Exception as e:
            print(f"Warning: Could not calculate position for {planet_name}: {e}")

    return planet_data


def calculate_horizon_line(
    observer_location: EarthLocation, obs_time: Time, num_points: int = 360
) -> list[dict]:
    """
    Calculate the horizon line in RA/Dec coordinates.

    Returns:
    --------
    list of dict : (ra, dec) points defining the horizon
    """
    # Create points around the horizon (altitude = 0, azimuth = 0-360)
    azimuths = np.linspace(0, 360, num_points) * u.deg
    altitudes = np.zeros(num_points) * u.deg

    # Create Alt/Az coordinates
    altaz_frame = AltAz(obstime=obs_time, location=observer_location)
    horizon_altaz = SkyCoord(az=azimuths, alt=altitudes, frame=altaz_frame)

    # Convert to ICRS (RA/Dec)
    horizon_icrs = horizon_altaz.transform_to("icrs")

    horizon_points = [
        {"ra": float(horizon_icrs[i].ra.deg), "dec": float(horizon_icrs[i].dec.deg)}
        for i in range(num_points)
    ]

    return horizon_points


def main():
    """Main function for coordinate transformation."""
    parser = argparse.ArgumentParser(
        description="Transform celestial coordinates for observer location"
    )
    parser.add_argument(
        "--lat", type=float, required=True, help="Observer latitude (degrees)"
    )
    parser.add_argument(
        "--lon", type=float, required=True, help="Observer longitude (degrees)"
    )
    parser.add_argument(
        "--height", type=float, default=0, help="Observer height (meters)"
    )
    parser.add_argument(
        "--time", type=str, default="now", help='Observation time (ISO format or "now")'
    )
    parser.add_argument(
        "--magnitude",
        type=float,
        default=Config.DEFAULT_MAGNITUDE_LIMIT,
        help="Maximum magnitude to include",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/transformed_sky.json",
        help="Output JSON file",
    )
    parser.add_argument(
        "--include-planets", action="store_true", help="Include planetary positions"
    )
    parser.add_argument(
        "--include-horizon", action="store_true", help="Include horizon line"
    )

    args = parser.parse_args()

    # Set up observer location
    observer_location = EarthLocation(
        lat=args.lat * u.deg, lon=args.lon * u.deg, height=args.height * u.m
    )

    # Set up observation time
    if args.time == "now":
        obs_time = Time.now()
    else:
        obs_time = Time(args.time)

    print(f"Observer Location: Lat={args.lat}, Lon={args.lon}, Height={args.height}m")
    print(f"Observation Time: {obs_time.iso}")
    print(f"Magnitude Limit: {args.magnitude}")
    print()

    # Load celestial objects
    print("Loading celestial objects...")
    stars, deep_sky_objects = load_celestial_objects()
    print(f"  Loaded {len(stars)} stars and {len(deep_sky_objects)} deep sky objects")

    # Filter by magnitude
    stars_filtered = filter_by_magnitude(stars, args.magnitude)
    dso_filtered = filter_by_magnitude(deep_sky_objects, args.magnitude)
    print(
        f"  Filtered to {len(stars_filtered)} stars and {len(dso_filtered)} DSOs (mag <= {args.magnitude})"
    )

    # Transform coordinates
    print("Transforming coordinates...")
    stars_transformed = transform_coordinates(
        stars_filtered, observer_location, obs_time
    )
    dso_transformed = transform_coordinates(dso_filtered, observer_location, obs_time)

    # Count visible objects
    stars_visible = sum(1 for s in stars_transformed if s["visible"])
    dso_visible = sum(1 for d in dso_transformed if d["visible"])
    print(f"  Visible objects: {stars_visible} stars, {dso_visible} DSOs")

    # Prepare output data
    output_data = {
        "observer": {
            "latitude": args.lat,
            "longitude": args.lon,
            "height": args.height,
            "time": obs_time.iso,
            "time_unix": float(obs_time.unix),
        },
        "stars": stars_transformed,
        "deep_sky_objects": dso_transformed,
        "magnitude_limit": args.magnitude,
    }

    # Add planetary positions if requested
    if args.include_planets:
        print("Calculating planetary positions...")
        planets = get_planetary_positions(observer_location, obs_time)
        output_data["planets"] = planets
        planets_visible = sum(1 for p in planets if p["visible"])
        print(f"  Visible planets: {planets_visible}/{len(planets)}")

    # Add horizon line if requested
    if args.include_horizon:
        print("Calculating horizon line...")
        horizon = calculate_horizon_line(observer_location, obs_time)
        output_data["horizon"] = horizon
        print(f"  Horizon line: {len(horizon)} points")

    # Save to JSON
    print(f"\nSaving to {args.output}...")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(output_data, output_path)

    print("Complete!")
    print(f"\nSummary:")
    print(f"  Total objects: {len(stars_transformed) + len(dso_transformed)}")
    print(f"  Visible objects: {stars_visible + dso_visible}")
    if args.include_planets:
        print(f"  Planets: {len(planets)} ({planets_visible} visible)")


if __name__ == "__main__":
    main()
