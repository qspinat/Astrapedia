"""
Tests for skymap.io module.
"""

import json
from pathlib import Path

import pytest

from skymap.io import (
    read_json,
    write_json,
    validate_json_structure,
    ensure_directory,
)


class TestReadJson:
    """Tests for JSON file reading."""

    def test_reads_valid_json(self, tmp_path):
        file_path = tmp_path / "test.json"
        data = {"key": "value", "number": 42}
        file_path.write_text(json.dumps(data))

        result = read_json(file_path)
        assert result == data

    def test_reads_list_json(self, tmp_path):
        file_path = tmp_path / "test.json"
        data = [1, 2, 3, "four"]
        file_path.write_text(json.dumps(data))

        result = read_json(file_path)
        assert result == data

    def test_returns_default_for_missing_file(self, tmp_path):
        file_path = tmp_path / "nonexistent.json"
        result = read_json(file_path, default={"default": True})
        assert result == {"default": True}

    def test_raises_for_missing_file_no_default(self, tmp_path):
        file_path = tmp_path / "nonexistent.json"
        with pytest.raises(FileNotFoundError):
            read_json(file_path)

    def test_returns_default_for_invalid_json(self, tmp_path):
        file_path = tmp_path / "invalid.json"
        file_path.write_text("not valid json {")

        result = read_json(file_path, default=[])
        assert result == []

    def test_raises_for_invalid_json_no_default(self, tmp_path):
        file_path = tmp_path / "invalid.json"
        file_path.write_text("not valid json {")

        with pytest.raises(json.JSONDecodeError):
            read_json(file_path)

    def test_accepts_string_path(self, tmp_path):
        file_path = tmp_path / "test.json"
        file_path.write_text('{"key": "value"}')

        result = read_json(str(file_path))
        assert result == {"key": "value"}


class TestWriteJson:
    """Tests for JSON file writing."""

    def test_writes_dict(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = {"key": "value", "number": 42}

        result = write_json(data, file_path)
        assert result is True
        assert file_path.exists()

        with open(file_path) as f:
            loaded = json.load(f)
        assert loaded == data

    def test_writes_list(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = [1, 2, 3]

        write_json(data, file_path)

        with open(file_path) as f:
            loaded = json.load(f)
        assert loaded == data

    def test_creates_parent_directories(self, tmp_path):
        file_path = tmp_path / "nested" / "dir" / "output.json"
        data = {"nested": True}

        write_json(data, file_path)
        assert file_path.exists()

    def test_writes_with_indent(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = {"key": "value"}

        write_json(data, file_path, indent=4)

        content = file_path.read_text()
        assert "    " in content  # 4-space indentation

    def test_writes_compact(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = {"key": "value"}

        write_json(data, file_path, compact=True)

        content = file_path.read_text()
        assert content == '{"key":"value"}'

    def test_handles_unicode(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = {"name": "星座"}

        write_json(data, file_path, ensure_ascii=False)

        content = file_path.read_text(encoding="utf-8")
        assert "星座" in content

    def test_accepts_string_path(self, tmp_path):
        file_path = tmp_path / "output.json"
        data = {"key": "value"}

        write_json(data, str(file_path))
        assert file_path.exists()


class TestValidateJsonStructure:
    """Tests for JSON structure validation."""

    def test_validates_expected_type_dict(self):
        assert validate_json_structure({"key": "value"}, expected_type=dict) is True
        assert validate_json_structure([], expected_type=dict) is False

    def test_validates_expected_type_list(self):
        assert validate_json_structure([1, 2, 3], expected_type=list) is True
        assert validate_json_structure({}, expected_type=list) is False

    def test_validates_required_keys(self):
        data = {"name": "test", "value": 123}
        assert validate_json_structure(data, required_keys=["name", "value"]) is True
        assert validate_json_structure(data, required_keys=["name", "missing"]) is False

    def test_validates_both_type_and_keys(self):
        data = {"name": "test"}
        assert validate_json_structure(
            data, expected_type=dict, required_keys=["name"]
        ) is True
        assert validate_json_structure(
            data, expected_type=list, required_keys=["name"]
        ) is False

    def test_no_validation_criteria(self):
        assert validate_json_structure({"any": "data"}) is True
        assert validate_json_structure([1, 2, 3]) is True
        assert validate_json_structure("string") is True


class TestEnsureDirectory:
    """Tests for directory creation."""

    def test_creates_directory(self, tmp_path):
        new_dir = tmp_path / "new_directory"
        result = ensure_directory(new_dir)
        assert new_dir.exists()
        assert new_dir.is_dir()
        assert result == new_dir

    def test_creates_nested_directories(self, tmp_path):
        nested_dir = tmp_path / "a" / "b" / "c"
        result = ensure_directory(nested_dir)
        assert nested_dir.exists()
        assert nested_dir.is_dir()

    def test_handles_existing_directory(self, tmp_path):
        existing = tmp_path / "existing"
        existing.mkdir()

        result = ensure_directory(existing)
        assert result == existing
        assert existing.exists()

    def test_accepts_string_path(self, tmp_path):
        new_dir = tmp_path / "string_path"
        result = ensure_directory(str(new_dir))
        assert isinstance(result, Path)
        assert new_dir.exists()
