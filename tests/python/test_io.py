"""
Tests for astrapedia.io module.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from astrapedia.io import (
    download_file,
    read_json,
    write_json,
)


class _FakeResponse:
    """Minimal stand-in for urlopen's context manager."""

    def __init__(self, body: bytes, content_length: int | None):
        self._body = body
        self._offset = 0
        self.headers = (
            {} if content_length is None
            else {"Content-Length": str(content_length)}
        )

    def read(self, size):
        chunk = self._body[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class TestDownloadFile:
    """Tests for download_file."""

    def test_writes_a_complete_download(self, tmp_path):
        dest = tmp_path / "catalog.csv"
        body = b"a,b,c\n1,2,3\n"

        with patch("urllib.request.urlopen",
                   return_value=_FakeResponse(body, len(body))):
            assert download_file("http://example.test/x", dest,
                                 show_progress=False) is True

        assert dest.read_bytes() == body

    def test_rejects_a_truncated_download(self, tmp_path):
        """http.client returns b"" on an early close instead of raising, so
        only a byte-count check catches a short read."""
        dest = tmp_path / "catalog.csv"

        with patch("urllib.request.urlopen",
                   return_value=_FakeResponse(b"only-200-bytes", 1200)):
            assert download_file("http://example.test/x", dest,
                                 show_progress=False) is False

    def test_leaves_no_file_behind_when_truncated(self, tmp_path):
        """A partial file at dest_path would be reused forever, because
        download_catalog skips anything that already exists."""
        dest = tmp_path / "catalog.csv"

        with patch("urllib.request.urlopen",
                   return_value=_FakeResponse(b"short", 5000)):
            download_file("http://example.test/x", dest, show_progress=False)

        assert not dest.exists()

    def test_does_not_clobber_a_good_file_with_a_truncated_one(self, tmp_path):
        dest = tmp_path / "catalog.csv"
        dest.write_bytes(b"the good copy")

        with patch("urllib.request.urlopen",
                   return_value=_FakeResponse(b"short", 5000)):
            download_file("http://example.test/x", dest, show_progress=False)

        assert dest.read_bytes() == b"the good copy"

    def test_accepts_a_response_without_content_length(self, tmp_path):
        """Chunked responses omit it; there is nothing to verify against."""
        dest = tmp_path / "catalog.csv"

        with patch("urllib.request.urlopen",
                   return_value=_FakeResponse(b"body", None)):
            assert download_file("http://example.test/x", dest,
                                 show_progress=False) is True

        assert dest.read_bytes() == b"body"


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


