"""
Configuration module for SkyMap data pipeline.
Contains URLs, file paths, and processing parameters.
"""

from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class MagnitudeLevel:
    """Defines a magnitude level for star output files."""
    mag_limit: float
    filename: str
    description: str


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
    MAGNITUDE_LEVELS: List[MagnitudeLevel] = [
        MagnitudeLevel(6.5, "stars_bright.json", "Naked eye stars (mag <= 6.5)"),
        MagnitudeLevel(8.0, "stars_medium.json", "Binocular stars (mag <= 8.0)"),
        MagnitudeLevel(12.0, "stars_all.json", "All catalog stars (mag <= 12.0)"),
    ]

    # Catalog URLs
    HYG_URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv"
    OPENNGC_URL = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv"
    CONSTELLATION_LINES_URL = "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/constellationship.fab"

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
    "And": "Andromeda", "Ant": "Antlia", "Aps": "Apus", "Aqr": "Aquarius",
    "Aql": "Aquila", "Ara": "Ara", "Ari": "Aries", "Aur": "Auriga",
    "Boo": "Bootes", "Cae": "Caelum", "Cam": "Camelopardalis", "Cnc": "Cancer",
    "CVn": "CanesVenatici", "CMa": "CanisMajor", "CMi": "CanisMinor",
    "Cap": "Capricornus", "Car": "Carina", "Cas": "Cassiopeia", "Cen": "Centaurus",
    "Cep": "Cepheus", "Cet": "Cetus", "Cha": "Chamaeleon", "Cir": "Circinus",
    "Col": "Columba", "Com": "ComaBerenices", "CrA": "CoronaAustralis",
    "CrB": "CoronaBorealis", "Crv": "Corvus", "Crt": "Crater", "Cru": "Crux",
    "Cyg": "Cygnus", "Del": "Delphinus", "Dor": "Dorado", "Dra": "Draco",
    "Equ": "Equuleus", "Eri": "Eridanus", "For": "Fornax", "Gem": "Gemini",
    "Gru": "Grus", "Her": "Hercules", "Hor": "Horologium", "Hya": "Hydra",
    "Hyi": "Hydrus", "Ind": "Indus", "Lac": "Lacerta", "Leo": "Leo",
    "LMi": "LeoMinor", "Lep": "Lepus", "Lib": "Libra", "Lup": "Lupus",
    "Lyn": "Lynx", "Lyr": "Lyra", "Men": "Mensa", "Mic": "Microscopium",
    "Mon": "Monoceros", "Mus": "Musca", "Nor": "Norma", "Oct": "Octans",
    "Oph": "Ophiuchus", "Ori": "Orion", "Pav": "Pavo", "Peg": "Pegasus",
    "Per": "Perseus", "Phe": "Phoenix", "Pic": "Pictor", "Psc": "Pisces",
    "PsA": "PiscisAustrinus", "Pup": "Puppis", "Pyx": "Pyxis", "Ret": "Reticulum",
    "Sge": "Sagitta", "Sgr": "Sagittarius", "Sco": "Scorpius", "Scl": "Sculptor",
    "Sct": "Scutum", "Ser": "Serpens", "Sex": "Sextans", "Tau": "Taurus",
    "Tel": "Telescopium", "Tri": "Triangulum", "TrA": "TriangulumAustrale",
    "Tuc": "Tucana", "UMa": "UrsaMajor", "UMi": "UrsaMinor", "Vel": "Vela",
    "Vir": "Virgo", "Vol": "Volans", "Vul": "Vulpecula",
}
