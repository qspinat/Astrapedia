"""
Configuration module for SkyMap data pipeline.
Contains URLs, file paths, and processing parameters.
"""

from pathlib import Path
from dataclasses import dataclass
import hashlib
import warnings


@dataclass
class MagnitudeLevel:
    """Defines a magnitude level for star output files."""

    mag_limit: float
    filename: str
    description: str


@dataclass
class CatalogSource:
    """Defines a catalog source with optional checksum verification."""

    url: str
    expected_sha256: str | None = None
    description: str = ""


class Config:
    """Configuration constants for the SkyMap data pipeline."""

    # Base directory (relative to script location)
    DATA_DIR = Path("data")

    # Output file names
    OUTPUT_FILES = {
        "stars": "stars.json",
        "stars_bright": "stars_bright.json",
        "stars_medium": "stars_medium.json",
        "stars_all": "stars_all.json",
        "dsos": "deep_sky_objects.json",
        "constellations": "constellations.json",
        "named_objects": "named_objects.json",
        "transformed": "transformed_sky.json",
    }

    # Magnitude levels for optimized star files
    MAGNITUDE_LEVELS: list[MagnitudeLevel] = [
        MagnitudeLevel(6.5, "stars_bright.json", "Naked eye stars (mag <= 6.5)"),
        MagnitudeLevel(8.0, "stars_medium.json", "Binocular stars (mag <= 8.0)"),
        MagnitudeLevel(12.0, "stars_all.json", "All catalog stars (mag <= 12.0)"),
    ]

    # Catalog URLs (legacy - prefer CATALOG_SOURCES for new code)
    HYG_URL = (
        "https://raw.githubusercontent.com/astronexus/"
        "HYG-Database/main/hyg/CURRENT/hygdata_v41.csv"
    )
    OPENNGC_URL = (
        "https://raw.githubusercontent.com/mattiaverga/"
        "OpenNGC/master/database_files/NGC.csv"
    )
    CONSTELLATION_LINES_URL = (
        "https://raw.githubusercontent.com/Stellarium/"
        "stellarium/master/skycultures/modern/constellationship.fab"
    )

    # Catalog sources with optional SHA256 checksums for integrity verification.
    #
    # CHECKSUM VERIFICATION:
    # - Checksums were last verified: January 2026
    # - Checksums may need updating when upstream catalogs are updated
    # - To regenerate/verify checksums: uv run python -m skymap.config --checksums
    # - A checksum mismatch will emit a warning but not block processing (warn_only=True)
    # - For strict verification, use Config.verify_checksum(data, name, warn_only=False)
    CATALOG_SOURCES: dict[str, CatalogSource] = {
        "hyg": CatalogSource(
            url=HYG_URL,
            expected_sha256=(
                "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd"
            ),
            description="HYG v4.1 star database",
        ),
        "openngc": CatalogSource(
            url=OPENNGC_URL,
            expected_sha256=(
                "d3a7aa38796a33c9fbd4966b392e02fd59b6fd04175c2a69f152a8097df2d535"
            ),
            description="OpenNGC deep sky objects catalog",
        ),
        "constellations": CatalogSource(
            url=CONSTELLATION_LINES_URL,
            # NOTE: No checksum configured because:
            # 1. Stellarium changed their sky culture format in 2024
            # 2. The legacy .fab format URL may be removed or changed
            # 3. We have a local fallback (data/constellations.json) if download fails
            # Consider migrating to the new Stellarium format or a dedicated source
            expected_sha256=None,
            description="IAU constellation line data from Stellarium (legacy .fab format)",
        ),
    }

    # Download settings
    DOWNLOAD_TIMEOUT = 60  # seconds
    DOWNLOAD_CHUNK_SIZE = 8192  # bytes

    # Default magnitude limits
    DEFAULT_MAGNITUDE_LIMIT = 8.0
    MAX_MAGNITUDE_LIMIT = 12.0

    # Default observer location (Paris, France)
    DEFAULT_LATITUDE = 48.8566
    DEFAULT_LONGITUDE = 2.3522
    DEFAULT_HEIGHT = 0.0

    # Coordinate conversion constants
    HOURS_TO_DEGREES = 15.0

    @classmethod
    def get_data_path(cls, filename: str) -> Path:
        """Get full path to a data file."""
        return cls.DATA_DIR / filename

    @classmethod
    def ensure_data_dir(cls) -> None:
        """Create data directory if it doesn't exist."""
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_sha256(data: bytes) -> str:
        """Compute SHA256 hash of data.

        Args:
            data: Bytes to hash

        Returns:
            Hex-encoded SHA256 hash
        """
        return hashlib.sha256(data).hexdigest()

    @classmethod
    def verify_checksum(
        cls, data: bytes, catalog_name: str, warn_only: bool = True
    ) -> bool:
        """Verify downloaded data against expected checksum.

        Args:
            data: Downloaded data bytes
            catalog_name: Name of catalog (key in CATALOG_SOURCES)
            warn_only: If True, only warn on mismatch; if False, raise exception

        Returns:
            True if checksum matches or no checksum configured

        Raises:
            ValueError: If checksum doesn't match and warn_only is False
        """
        source = cls.CATALOG_SOURCES.get(catalog_name)
        if not source or not source.expected_sha256:
            return True

        actual_hash = cls.compute_sha256(data)
        if actual_hash != source.expected_sha256:
            msg = (
                f"Checksum mismatch for {catalog_name}!\n"
                f"Expected: {source.expected_sha256}\n"
                f"Got: {actual_hash}\n"
                f"The catalog may have been updated or tampered with."
            )
            if warn_only:
                warnings.warn(msg, RuntimeWarning)
                return False
            raise ValueError(msg)

        return True

    @classmethod
    def get_catalog_url(cls, catalog_name: str) -> str | None:
        """Get URL for a catalog by name.

        Args:
            catalog_name: Name of catalog (key in CATALOG_SOURCES)

        Returns:
            URL string or None if not found
        """
        source = cls.CATALOG_SOURCES.get(catalog_name)
        return source.url if source else None


# DSO type mappings
DSO_TYPE_NAMES = {
    "G": "Galaxy",
    "GClstr": "Galaxy Cluster",
    "GPair": "Galaxy Pair",
    "GTrpl": "Galaxy Triplet",
    "GGroup": "Galaxy Group",
    "PN": "Planetary Nebula",
    "HII": "HII Region",
    "EmN": "Emission Nebula",
    "RfN": "Reflection Nebula",
    "SNR": "Supernova Remnant",
    "Nova": "Nova Remnant",
    "NonEx": "Non-Existent",
    "Neb": "Nebula",
    "Cl+N": "Cluster with Nebulosity",
    "GCl": "Globular Cluster",
    "OCl": "Open Cluster",
    "Star": "Star",
    "DrkN": "Dark Nebula",
    "Other": "Other",
    "Dup": "Duplicate",
    "*": "Star",
    "**": "Double Star",
    "*Ass": "Star Association",
}

# Constellation abbreviation mappings
CONSTELLATION_ABBREVS = {
    "And": "Andromeda",
    "Ant": "Antlia",
    "Aps": "Apus",
    "Aqr": "Aquarius",
    "Aql": "Aquila",
    "Ara": "Ara",
    "Ari": "Aries",
    "Aur": "Auriga",
    "Boo": "Bootes",
    "Cae": "Caelum",
    "Cam": "Camelopardalis",
    "Cnc": "Cancer",
    "CVn": "CanesVenatici",
    "CMa": "CanisMajor",
    "CMi": "CanisMinor",
    "Cap": "Capricornus",
    "Car": "Carina",
    "Cas": "Cassiopeia",
    "Cen": "Centaurus",
    "Cep": "Cepheus",
    "Cet": "Cetus",
    "Cha": "Chamaeleon",
    "Cir": "Circinus",
    "Col": "Columba",
    "Com": "ComaBerenices",
    "CrA": "CoronaAustralis",
    "CrB": "CoronaBorealis",
    "Crv": "Corvus",
    "Crt": "Crater",
    "Cru": "Crux",
    "Cyg": "Cygnus",
    "Del": "Delphinus",
    "Dor": "Dorado",
    "Dra": "Draco",
    "Equ": "Equuleus",
    "Eri": "Eridanus",
    "For": "Fornax",
    "Gem": "Gemini",
    "Gru": "Grus",
    "Her": "Hercules",
    "Hor": "Horologium",
    "Hya": "Hydra",
    "Hyi": "Hydrus",
    "Ind": "Indus",
    "Lac": "Lacerta",
    "Leo": "Leo",
    "LMi": "LeoMinor",
    "Lep": "Lepus",
    "Lib": "Libra",
    "Lup": "Lupus",
    "Lyn": "Lynx",
    "Lyr": "Lyra",
    "Men": "Mensa",
    "Mic": "Microscopium",
    "Mon": "Monoceros",
    "Mus": "Musca",
    "Nor": "Norma",
    "Oct": "Octans",
    "Oph": "Ophiuchus",
    "Ori": "Orion",
    "Pav": "Pavo",
    "Peg": "Pegasus",
    "Per": "Perseus",
    "Phe": "Phoenix",
    "Pic": "Pictor",
    "Psc": "Pisces",
    "PsA": "PiscisAustrinus",
    "Pup": "Puppis",
    "Pyx": "Pyxis",
    "Ret": "Reticulum",
    "Sge": "Sagitta",
    "Sgr": "Sagittarius",
    "Sco": "Scorpius",
    "Scl": "Sculptor",
    "Sct": "Scutum",
    "Ser": "Serpens",
    "Sex": "Sextans",
    "Tau": "Taurus",
    "Tel": "Telescopium",
    "Tri": "Triangulum",
    "TrA": "TriangulumAustrale",
    "Tuc": "Tucana",
    "UMa": "UrsaMajor",
    "UMi": "UrsaMinor",
    "Vel": "Vela",
    "Vir": "Virgo",
    "Vol": "Volans",
    "Vul": "Vulpecula",
}


def print_checksums() -> None:
    """Download catalogs and print their SHA256 checksums.

    Use this to update CATALOG_SOURCES checksums when upstream data changes.
    """
    import urllib.request

    print("Computing SHA256 checksums for catalog sources...\n")

    for name, source in Config.CATALOG_SOURCES.items():
        print(f"{name}:")
        print(f"  URL: {source.url}")
        try:
            with urllib.request.urlopen(
                source.url, timeout=Config.DOWNLOAD_TIMEOUT
            ) as response:
                data = response.read()
                checksum = Config.compute_sha256(data)
                print(f"  Size: {len(data):,} bytes")
                print(f"  SHA256: {checksum}")
                if source.expected_sha256:
                    if checksum == source.expected_sha256:
                        print("  Status: ✓ Matches expected checksum")
                    else:
                        print("  Status: ✗ MISMATCH!")
                        print(f"  Expected: {source.expected_sha256}")
                else:
                    print("  Status: No expected checksum configured")
        except Exception as e:
            print(f"  Error: {e}")
        print()


if __name__ == "__main__":
    import sys

    if "--checksums" in sys.argv:
        print_checksums()
    else:
        print("Usage: python -m skymap.config --checksums")
        print("  --checksums  Download catalogs and print SHA256 checksums")
