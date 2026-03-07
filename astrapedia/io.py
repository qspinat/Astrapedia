"""
I/O utilities for Astrapedia data pipeline.
Handles file downloads, JSON reading/writing, and data validation.
"""

import json
import logging
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .config import Config

logger = logging.getLogger(__name__)


def download_file(
    url: str,
    dest_path: Path,
    timeout: int = Config.DOWNLOAD_TIMEOUT,
    chunk_size: int = Config.DOWNLOAD_CHUNK_SIZE,
    show_progress: bool = True,
) -> bool:
    """
    Download a file from URL with progress display.

    Args:
        url: URL to download from
        dest_path: Local file path to save to
        timeout: Download timeout in seconds
        chunk_size: Size of download chunks
        show_progress: Whether to show download progress

    Returns:
        True if download succeeded, False otherwise
    """
    try:
        if show_progress:
            logger.info("Downloading %s...", url)

        request = urllib.request.Request(
            url, headers={"User-Agent": "Astrapedia Data Pipeline/1.0"}
        )

        with urllib.request.urlopen(request, timeout=timeout) as response:
            total_size = response.headers.get("Content-Length")
            total_size = int(total_size) if total_size else None

            downloaded = 0
            with open(dest_path, "wb") as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if show_progress and total_size:
                        progress = downloaded / total_size * 100
                        sys.stdout.write(f"\r  Progress: {progress:.1f}%")
                        sys.stdout.flush()

            if show_progress:
                sys.stdout.write("\n")
                sys.stdout.flush()

        if show_progress:
            size_mb = dest_path.stat().st_size / (1024 * 1024)
            logger.info("Downloaded: %.2f MB", size_mb)

        return True

    except urllib.error.HTTPError as e:
        logger.error("HTTP Error downloading %s: %d %s", url, e.code, e.reason)
        return False
    except urllib.error.URLError as e:
        logger.error("URL Error downloading %s: %s", url, e.reason)
        return False
    except TimeoutError:
        logger.error("Timeout downloading %s", url)
        return False


def read_json(
    file_path: str | Path,
    default: Any | None = None,
) -> Any:
    """
    Read and parse a JSON file with error handling.

    Args:
        file_path: Path to JSON file
        default: Default value if file doesn't exist or is invalid

    Returns:
        Parsed JSON data or default value
    """
    path = Path(file_path)

    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(f"JSON file not found: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error("JSON decode error in %s: %s", path, e)
        if default is not None:
            return default
        raise


def write_json(
    data: Any,
    file_path: str | Path,
    indent: int = 2,
    ensure_ascii: bool = False,
    compact: bool = False,
) -> bool:
    """
    Write data to a JSON file.

    Args:
        data: Data to serialize
        file_path: Output file path
        indent: Indentation level (None for no indentation)
        ensure_ascii: If True, escape non-ASCII characters
        compact: If True, use minimal whitespace

    Returns:
        True if write succeeded
    """
    path = Path(file_path)

    # Ensure parent directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(path, "w", encoding="utf-8") as f:
            if compact:
                json.dump(data, f, ensure_ascii=ensure_ascii, separators=(",", ":"))
            else:
                json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)

        size_mb = path.stat().st_size / (1024 * 1024)
        logger.info("Wrote: %s (%.2f MB)", path, size_mb)
        return True

    except (IOError, OSError) as e:
        logger.error("Error writing %s: %s", path, e)
        return False


def validate_json_structure(
    data: Any,
    required_keys: list | None = None,
    expected_type: type | None = None,
) -> bool:
    """
    Validate JSON data structure.

    Args:
        data: Data to validate
        required_keys: List of required keys (for dict data)
        expected_type: Expected type of data

    Returns:
        True if valid
    """
    if expected_type is not None and not isinstance(data, expected_type):
        return False

    if required_keys is not None and isinstance(data, dict):
        for key in required_keys:
            if key not in data:
                return False

    return True


def ensure_directory(dir_path: str | Path) -> Path:
    """
    Ensure a directory exists, creating it if necessary.

    Args:
        dir_path: Directory path

    Returns:
        Path object for the directory
    """
    path = Path(dir_path)
    path.mkdir(parents=True, exist_ok=True)
    return path
