"""
Tests for astrapedia.astronomy module.
"""

import math
import pytest
import pandas as pd

from astrapedia.astronomy import (
    ra_hms_to_degrees,
    dec_dms_to_degrees,
    degrees_to_ra_hms,
    degrees_to_dec_dms,
    filter_by_magnitude,
    filter_dataframe_by_magnitude,
    dataframe_to_star_dicts,
    angular_distance,
    parse_coordinate_string,
    normalize_ra,
    normalize_dec,
    calculate_star_count_by_magnitude,
)


class TestRaHmsToDegrees:
    """Tests for RA hours/minutes/seconds to degrees conversion."""

    def test_zero_hours(self):
        assert ra_hms_to_degrees(0) == 0.0

    def test_six_hours(self):
        assert ra_hms_to_degrees(6) == 90.0

    def test_twelve_hours(self):
        assert ra_hms_to_degrees(12) == 180.0

    def test_twenty_four_hours(self):
        assert ra_hms_to_degrees(24) == 360.0

    def test_hours_minutes(self):
        # 6h 30m = 6.5h = 97.5 degrees
        assert ra_hms_to_degrees(6, 30) == 97.5

    def test_hours_minutes_seconds(self):
        # 12h 30m 30s = 12 + 30/60 + 30/3600 hours
        expected = (12 + 30 / 60 + 30 / 3600) * 15
        assert ra_hms_to_degrees(12, 30, 30) == pytest.approx(expected, rel=1e-9)

    def test_polaris_ra(self):
        # Polaris: RA ~2h 31m 49s = ~37.95 degrees
        result = ra_hms_to_degrees(2, 31, 49)
        assert result == pytest.approx(37.95, abs=0.1)


class TestDecDmsToDegrees:
    """Tests for Dec degrees/arcmin/arcsec to decimal degrees conversion."""

    def test_zero_degrees(self):
        assert dec_dms_to_degrees(0) == 0.0

    def test_positive_degrees(self):
        assert dec_dms_to_degrees(45) == 45.0

    def test_negative_degrees(self):
        assert dec_dms_to_degrees(-45) == -45.0

    def test_degrees_arcmin(self):
        # 45d 30' = 45.5 degrees
        assert dec_dms_to_degrees(45, 30) == 45.5

    def test_negative_degrees_arcmin(self):
        # -45d 30' = -45.5 degrees
        assert dec_dms_to_degrees(-45, 30) == -45.5

    def test_degrees_arcmin_arcsec(self):
        # 45d 30' 30" = 45 + 30/60 + 30/3600
        expected = 45 + 30 / 60 + 30 / 3600
        assert dec_dms_to_degrees(45, 30, 30) == pytest.approx(expected, rel=1e-9)

    def test_polaris_dec(self):
        # Polaris: Dec ~89d 15' 51" = ~89.26 degrees
        result = dec_dms_to_degrees(89, 15, 51)
        assert result == pytest.approx(89.26, abs=0.01)


class TestDegreesToRaHms:
    """Tests for RA degrees to hours/minutes/seconds conversion."""

    def test_zero_degrees(self):
        h, m, s = degrees_to_ra_hms(0)
        assert h == 0
        assert m == 0
        assert s == pytest.approx(0, abs=0.001)

    def test_ninety_degrees(self):
        h, m, s = degrees_to_ra_hms(90)
        assert h == 6
        assert m == 0
        assert s == pytest.approx(0, abs=0.001)

    def test_round_trip(self):
        original = 123.456
        h, m, s = degrees_to_ra_hms(original)
        result = ra_hms_to_degrees(h, m, s)
        assert result == pytest.approx(original, rel=1e-6)


class TestDegreesToDecDms:
    """Tests for Dec decimal degrees to degrees/arcmin/arcsec conversion."""

    def test_zero_degrees(self):
        d, m, s = degrees_to_dec_dms(0)
        assert d == 0
        assert m == 0
        assert s == pytest.approx(0, abs=0.001)

    def test_positive_degrees(self):
        d, m, s = degrees_to_dec_dms(45.5)
        assert d == 45
        assert m == 30
        assert s == pytest.approx(0, abs=0.001)

    def test_negative_degrees(self):
        d, m, s = degrees_to_dec_dms(-45.5)
        assert d == -45
        assert m == 30
        assert s == pytest.approx(0, abs=0.001)

    def test_round_trip(self):
        original = 67.891
        d, m, s = degrees_to_dec_dms(original)
        result = dec_dms_to_degrees(d, m, s)
        assert result == pytest.approx(original, rel=1e-6)


class TestFilterByMagnitude:
    """Tests for magnitude filtering of object lists."""

    def test_filters_bright_objects(self):
        objects = [
            {"name": "A", "mag": 1.0},
            {"name": "B", "mag": 5.0},
            {"name": "C", "mag": 10.0},
        ]
        result = filter_by_magnitude(objects, 6.0)
        assert len(result) == 2
        assert result[0]["name"] == "A"
        assert result[1]["name"] == "B"

    def test_excludes_faint_objects(self):
        objects = [
            {"name": "A", "mag": 1.0},
            {"name": "B", "mag": 8.0},
        ]
        result = filter_by_magnitude(objects, 6.0)
        assert len(result) == 1
        assert result[0]["name"] == "A"

    def test_excludes_null_by_default(self):
        objects = [
            {"name": "A", "mag": 1.0},
            {"name": "B", "mag": None},
        ]
        result = filter_by_magnitude(objects, 6.0)
        assert len(result) == 1
        assert result[0]["name"] == "A"

    def test_includes_null_when_requested(self):
        objects = [
            {"name": "A", "mag": 1.0},
            {"name": "B", "mag": None},
        ]
        result = filter_by_magnitude(objects, 6.0, include_null=True)
        assert len(result) == 2

    def test_custom_mag_key(self):
        objects = [
            {"name": "A", "magnitude": 1.0},
            {"name": "B", "magnitude": 10.0},
        ]
        result = filter_by_magnitude(objects, 6.0, mag_key="magnitude")
        assert len(result) == 1

    def test_empty_list(self):
        result = filter_by_magnitude([], 6.0)
        assert result == []


class TestFilterDataframeByMagnitude:
    """Tests for vectorized DataFrame magnitude filtering."""

    def test_filters_dataframe(self):
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "mag": [1.0, 5.0, 10.0],
        })
        result = filter_dataframe_by_magnitude(df, 6.0)
        assert len(result) == 2
        assert list(result["name"]) == ["A", "B"]

    def test_includes_nan(self):
        df = pd.DataFrame({
            "name": ["A", "B"],
            "mag": [1.0, float("nan")],
        })
        result = filter_dataframe_by_magnitude(df, 6.0)
        # NaN values are included
        assert len(result) == 2


class TestDataframeToStarDicts:
    """Tests for DataFrame to star dictionary conversion."""

    def test_basic_conversion(self):
        df = pd.DataFrame({
            "ra": [10.0, 20.0],
            "dec": [30.0, 40.0],
            "mag": [1.0, 2.0],
            "hip": [1234, 5678],
            "proper": ["Star1", "Star2"],
            "ci": [0.5, 0.6],
            "spect": ["G2V", "K0III"],
        })
        result = dataframe_to_star_dicts(df)
        assert len(result) == 2
        assert result[0]["ra"] == 10.0
        assert result[0]["dec"] == 30.0
        assert result[0]["mag"] == 1.0
        assert result[0]["hip"] == 1234
        assert result[0]["proper"] == "Star1"

    def test_handles_null_values(self):
        df = pd.DataFrame({
            "ra": [10.0],
            "dec": [30.0],
            "mag": [1.0],
            "hip": [None],
            "proper": [None],
            "ci": [None],
            "spect": [None],
        })
        result = dataframe_to_star_dicts(df)
        assert len(result) == 1
        assert "hip" not in result[0]
        assert "proper" not in result[0]


class TestAngularDistance:
    """Tests for angular distance calculation."""

    def test_same_position(self):
        dist = angular_distance(45, 30, 45, 30)
        assert dist == pytest.approx(0, abs=1e-6)

    def test_pole_to_equator(self):
        dist = angular_distance(0, 0, 0, 90)
        assert dist == pytest.approx(90, abs=1e-6)

    def test_opposite_equator(self):
        dist = angular_distance(0, 0, 180, 0)
        assert dist == pytest.approx(180, abs=1e-6)

    def test_ra_wrap_around(self):
        dist1 = angular_distance(350, 0, 10, 0)
        dist2 = angular_distance(10, 0, 350, 0)
        assert dist1 == pytest.approx(20, abs=0.1)
        assert dist2 == pytest.approx(20, abs=0.1)

    def test_polaris_to_vega(self):
        # Polaris: RA ~37.95, Dec ~89.26
        # Vega: RA ~279.23, Dec ~38.78
        dist = angular_distance(37.95, 89.26, 279.23, 38.78)
        assert dist > 50 and dist < 60


class TestParseCoordinateString:
    """Tests for coordinate string parsing."""

    def test_decimal_string(self):
        result = parse_coordinate_string("123.456")
        assert result == pytest.approx(123.456)

    def test_colon_separated(self):
        # 12:30:45 = 12 + 30/60 + 45/3600
        result = parse_coordinate_string("12:30:45")
        expected = 12 + 30 / 60 + 45 / 3600
        assert result == pytest.approx(expected)

    def test_space_separated(self):
        result = parse_coordinate_string("12 30 45")
        expected = 12 + 30 / 60 + 45 / 3600
        assert result == pytest.approx(expected)

    def test_negative_value(self):
        result = parse_coordinate_string("-45:30:00")
        assert result == pytest.approx(-45.5)

    def test_empty_string(self):
        result = parse_coordinate_string("")
        assert result is None

    def test_none_input(self):
        result = parse_coordinate_string(None)
        assert result is None


class TestNormalizeRa:
    """Tests for RA normalization."""

    def test_in_range(self):
        assert normalize_ra(180) == 180

    def test_zero(self):
        assert normalize_ra(0) == 0

    def test_over_360(self):
        assert normalize_ra(400) == 40

    def test_negative(self):
        assert normalize_ra(-10) == 350

    def test_double_wrap(self):
        assert normalize_ra(720) == 0


class TestNormalizeDec:
    """Tests for Dec normalization (clamping)."""

    def test_in_range(self):
        assert normalize_dec(45) == 45

    def test_zero(self):
        assert normalize_dec(0) == 0

    def test_over_90(self):
        assert normalize_dec(100) == 90

    def test_under_minus_90(self):
        assert normalize_dec(-100) == -90

    def test_boundary(self):
        assert normalize_dec(90) == 90
        assert normalize_dec(-90) == -90


class TestCalculateStarCountByMagnitude:
    """Tests for cumulative star count calculation."""

    def test_counts_correctly(self):
        stars = [
            {"mag": 5.0},
            {"mag": 6.5},
            {"mag": 7.5},
            {"mag": 8.5},
            {"mag": 10.0},
        ]
        counts = calculate_star_count_by_magnitude(stars)
        assert counts[6.0] == 1
        assert counts[7.0] == 2
        assert counts[8.0] == 3
        assert counts[9.0] == 4
        assert counts[10.0] == 5

    def test_skips_null(self):
        stars = [
            {"mag": 5.0},
            {"mag": None},
        ]
        counts = calculate_star_count_by_magnitude(stars)
        assert counts[6.0] == 1

    def test_empty_list(self):
        counts = calculate_star_count_by_magnitude([])
        assert counts[6.0] == 0
