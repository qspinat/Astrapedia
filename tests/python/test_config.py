"""
Tests for astrapedia.config module.
"""

from pathlib import Path
import warnings
import pytest

from astrapedia.config import (
    Config,
    MagnitudeLevel,
    CatalogSource,
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


class TestCatalogSource:
    """Tests for CatalogSource dataclass."""

    def test_creates_catalog_source_with_checksum(self):
        source = CatalogSource(
            url="https://example.com/data.csv",
            expected_sha256="abc123",
            description="Test catalog",
        )
        assert source.url == "https://example.com/data.csv"
        assert source.expected_sha256 == "abc123"
        assert source.description == "Test catalog"

    def test_creates_catalog_source_without_checksum(self):
        source = CatalogSource(url="https://example.com/data.csv")
        assert source.url == "https://example.com/data.csv"
        assert source.expected_sha256 is None
        assert source.description == ""


class TestChecksumVerification:
    """Tests for checksum verification functionality."""

    def test_compute_sha256_known_value(self):
        # SHA256 of "hello" is well-known
        data = b"hello"
        expected = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        assert Config.compute_sha256(data) == expected

    def test_compute_sha256_empty_data(self):
        # SHA256 of empty string
        data = b""
        expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        assert Config.compute_sha256(data) == expected

    def test_verify_checksum_matching(self, monkeypatch):
        # Set up a catalog with known checksum
        test_data = b"test data"
        test_hash = Config.compute_sha256(test_data)

        test_sources = {
            "test_catalog": CatalogSource(
                url="https://example.com/test.csv",
                expected_sha256=test_hash,
            ),
        }
        monkeypatch.setattr(Config, "CATALOG_SOURCES", test_sources)

        # Should return True when checksum matches
        assert Config.verify_checksum(test_data, "test_catalog") is True

    def test_verify_checksum_mismatch_warn_only(self, monkeypatch):
        test_sources = {
            "test_catalog": CatalogSource(
                url="https://example.com/test.csv",
                expected_sha256="wrong_hash",
            ),
        }
        monkeypatch.setattr(Config, "CATALOG_SOURCES", test_sources)

        # Should return False and emit warning when warn_only=True
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            result = Config.verify_checksum(b"test data", "test_catalog", warn_only=True)
            assert result is False
            assert len(w) == 1
            assert "Checksum mismatch" in str(w[0].message)

    def test_verify_checksum_mismatch_raise(self, monkeypatch):
        test_sources = {
            "test_catalog": CatalogSource(
                url="https://example.com/test.csv",
                expected_sha256="wrong_hash",
            ),
        }
        monkeypatch.setattr(Config, "CATALOG_SOURCES", test_sources)

        # Should raise ValueError when warn_only=False
        with pytest.raises(ValueError) as exc_info:
            Config.verify_checksum(b"test data", "test_catalog", warn_only=False)
        assert "Checksum mismatch" in str(exc_info.value)

    def test_verify_checksum_no_checksum_configured(self, monkeypatch):
        test_sources = {
            "test_catalog": CatalogSource(
                url="https://example.com/test.csv",
                expected_sha256=None,
            ),
        }
        monkeypatch.setattr(Config, "CATALOG_SOURCES", test_sources)

        # Should return True when no checksum is configured
        assert Config.verify_checksum(b"any data", "test_catalog") is True

    def test_verify_checksum_unknown_catalog(self):
        # Should return True for unknown catalog names
        assert Config.verify_checksum(b"data", "nonexistent_catalog") is True

    def test_get_catalog_url_exists(self):
        # Test that we can get URLs for configured catalogs
        url = Config.get_catalog_url("hyg")
        assert url is not None
        assert url.startswith("https://")

    def test_get_catalog_url_not_found(self):
        url = Config.get_catalog_url("nonexistent")
        assert url is None

    def test_catalog_sources_have_urls(self):
        # All configured catalog sources should have valid URLs
        for name, source in Config.CATALOG_SOURCES.items():
            assert source.url.startswith("https://"), f"{name} has invalid URL"

    def test_catalog_sources_checksums_format(self):
        # Checksums should be valid hex strings (64 chars for SHA256)
        for name, source in Config.CATALOG_SOURCES.items():
            if source.expected_sha256 is not None:
                assert len(source.expected_sha256) == 64, \
                    f"{name} has invalid checksum length"
                assert all(c in "0123456789abcdef" for c in source.expected_sha256), \
                    f"{name} has invalid checksum characters"
