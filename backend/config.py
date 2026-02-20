"""Configuration for the AI Validation Pipeline."""
import os
from dotenv import load_dotenv

load_dotenv()

# Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# Mapy.cz
MAPY_CZ_API_KEY = os.getenv("MAPY_CZ_API_KEY", "")

# Image Processing
MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tiff", ".bmp"}
SUPPORTED_PDF_EXTENSIONS = {".pdf"}
OUTPUT_FORMAT = "JPEG"
JPEG_QUALITY = 85

# Agent Thresholds – Guardian (BR-G4)
MIN_TOTAL_PHOTOS = 9
MIN_EXTERIOR_PHOTOS = 2
MIN_INTERIOR_PHOTOS = 3

# Agent Thresholds – Forensic (BR-G5)
MANIPULATION_SCORE_THRESHOLD = 0.7
CONFIDENCE_THRESHOLD = 0.8

# Agent Thresholds – Inspector
INSPECTOR_MAX_SCORE = 30

# Upload
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Reference year for age calculations
REFERENCE_YEAR = 2026

# Data Matrix for Strategist
# Rows: effective age ranges, Columns: AI score ranges
# Values: (category, match_type)
# match_type: "shoda" = match, "varovani" = warning, "konflikt" = conflict
DATA_MATRIX = {
    "0-5": {
        "27-30": (1, "shoda"),
        "22-26": (2, "varovani"),
        "16-21": (3, "konflikt"),
        "8-15": (4, "konflikt"),
        "0-7": (5, "konflikt"),
    },
    "6-15": {
        "27-30": (1, "varovani"),
        "22-26": (2, "shoda"),
        "16-21": (3, "varovani"),
        "8-15": (4, "konflikt"),
        "0-7": (5, "konflikt"),
    },
    "16-30": {
        "27-30": (2, "konflikt"),
        "22-26": (2, "varovani"),
        "16-21": (3, "shoda"),
        "8-15": (4, "varovani"),
        "0-7": (5, "konflikt"),
    },
    "31-50": {
        "27-30": (2, "konflikt"),
        "22-26": (3, "varovani"),
        "16-21": (3, "varovani"),
        "8-15": (4, "shoda"),
        "0-7": (5, "shoda"),
    },
    "51+": {
        "27-30": (3, "konflikt"),
        "22-26": (3, "konflikt"),
        "16-21": (3, "varovani"),
        "8-15": (4, "shoda"),
        "0-7": (5, "shoda"),
    },
}


def get_age_range_key(effective_age: int) -> str:
    """Map effective age to matrix row key."""
    if effective_age <= 5:
        return "0-5"
    elif effective_age <= 15:
        return "6-15"
    elif effective_age <= 30:
        return "16-30"
    elif effective_age <= 50:
        return "31-50"
    else:
        return "51+"


def get_score_range_key(score: int) -> str:
    """Map AI inspection score to matrix column key."""
    if score <= 7:
        return "0-7"
    elif score <= 15:
        return "8-15"
    elif score <= 21:
        return "16-21"
    elif score <= 26:
        return "22-26"
    else:
        return "27-30"
