"""
Tests for astrapedia.astronomy module.
"""

import math
import pytest
import pandas as pd

from astrapedia.astronomy import (
    ra_hms_to_degrees,
    filter_by_magnitude,
    parse_dec_string,
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


class TestParseDecString:
    """Tests for declination string parsing."""

    def test_decimal_string(self):
        assert parse_dec_string("-0.0133") == pytest.approx(-0.0133)

    def test_positive_dms(self):
        # +12:30:00 = 12.5
        assert parse_dec_string("+12:30:00") == pytest.approx(12.5)

    def test_negative_dms(self):
        assert parse_dec_string("-45:30:00") == pytest.approx(-45.5)

    def test_small_negative_dec_keeps_sign(self):
        # Regression: float("-00") is -0.0, so "-00:30:00" must NOT flip north.
        assert parse_dec_string("-00:30:00") == pytest.approx(-0.5)

    def test_none_input(self):
        assert parse_dec_string(None) is None


