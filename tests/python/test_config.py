"""
Tests for skymap.config module.
"""

from pathlib import Path
import pytest

from skymap.config import (
    Config,
    MagnitudeLevel,
    DSO_TYPE_NAMES,
    CONSTELLATION_ABBREVS,
)


class TestMagnitudeLevel:
    """Tests for MagnitudeLevel dataclass."""

    def test_creates_magnitude_level(self):
        level = MagnitudeLevel(6.5, "stars_bright.json", "Naked eye stars")
        assert level.mag_limit == 6.5
        assert level.filename == "stars_bright.json"
        assert level.description == "Naked eye stars"


class TestConfig:
    """Tests for Config class."""

    def test_data_dir_is_path(self):
        assert isinstance(Config.DATA_DIR, Path)

    def test_output_files_has_required_keys(self):
        required = ["stars", "dsos", "constellations", "named_objects"]
        for key in required:
            assert key in Config.OUTPUT_FILES

    def test_magnitude_levels_exist(self):
        assert len(Config.MAGNITUDE_LEVELS) >= 3
        for level in Config.MAGNITUDE_LEVELS:
            assert isinstance(level, MagnitudeLevel)
            assert level.mag_limit > 0
            assert level.filename.endswith(".json")

    def test_magnitude_levels_ascending(self):
        limits = [level.mag_limit for level in Config.MAGNITUDE_LEVELS]
        assert limits == sorted(limits)

    def test_catalog_urls_valid(self):
        assert Config.HYG_URL.startswith("https://")
        assert Config.OPENNGC_URL.startswith("https://")
        assert Config.CONSTELLATION_LINES_URL.startswith("https://")

    def test_download_settings_positive(self):
        assert Config.DOWNLOAD_TIMEOUT > 0
        assert Config.DOWNLOAD_CHUNK_SIZE > 0

    def test_default_location_valid(self):
        assert -90 <= Config.DEFAULT_LATITUDE <= 90
        assert -180 <= Config.DEFAULT_LONGITUDE <= 180

    def test_get_data_path(self):
        path = Config.get_data_path("test.json")
        assert isinstance(path, Path)
        assert path.name == "test.json"
        assert path.parent == Config.DATA_DIR

    def test_ensure_data_dir(self, tmp_path, monkeypatch):
        # Temporarily change DATA_DIR
        test_dir = tmp_path / "test_data"
        monkeypatch.setattr(Config, "DATA_DIR", test_dir)

        Config.ensure_data_dir()
        assert test_dir.exists()
        assert test_dir.is_dir()


class TestDsoTypeNames:
    """Tests for DSO type name mappings."""

    def test_common_types_exist(self):
        common_types = ["G", "PN", "GCl", "OCl", "Neb", "HII", "EmN"]
        for type_code in common_types:
            assert type_code in DSO_TYPE_NAMES
            assert len(DSO_TYPE_NAMES[type_code]) > 0

    def test_galaxy_type(self):
        assert DSO_TYPE_NAMES["G"] == "Galaxy"

    def test_planetary_nebula_type(self):
        assert DSO_TYPE_NAMES["PN"] == "Planetary Nebula"

    def test_cluster_types(self):
        assert DSO_TYPE_NAMES["GCl"] == "Globular Cluster"
        assert DSO_TYPE_NAMES["OCl"] == "Open Cluster"


class TestConstellationAbbrevs:
    """Tests for constellation abbreviation mappings."""

    def test_has_88_constellations(self):
        assert len(CONSTELLATION_ABBREVS) == 88

    def test_common_constellations(self):
        assert CONSTELLATION_ABBREVS["Ori"] == "Orion"
        assert CONSTELLATION_ABBREVS["UMa"] == "UrsaMajor"
        assert CONSTELLATION_ABBREVS["Cyg"] == "Cygnus"
        assert CONSTELLATION_ABBREVS["Sco"] == "Scorpius"

    def test_all_abbreviations_three_chars(self):
        for abbrev in CONSTELLATION_ABBREVS:
            assert len(abbrev) == 3

    def test_all_names_non_empty(self):
        for name in CONSTELLATION_ABBREVS.values():
            assert len(name) > 0
