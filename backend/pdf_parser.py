"""PDF Parser for 'Ocenění rodinného domu' form.

Extracts key fields from the standardized ČS property valuation PDF:
- Year of construction completion
- Property condition
- Number of floors
- Roof type
- Basement (yes/no)
- Total floor area
- Heating type
- Address
"""
import io
import re
from dataclasses import dataclass, asdict
from typing import Optional

import pdfplumber


@dataclass
class PropertyData:
    """Structured data extracted from the valuation PDF."""
    stavba_dokoncena: Optional[str] = None       # e.g. "1980"
    stav_rodinneho_domu: Optional[str] = None    # e.g. "dobře udržovaný"
    pocet_podlazi: Optional[str] = None          # e.g. "2"
    typ_strechy: Optional[str] = None            # e.g. "sedlová"
    podsklepeni: Optional[str] = None            # e.g. "ANO" / "NE"
    celkova_podlahova_plocha: Optional[str] = None  # e.g. "175 m²"
    typ_vytapeni: Optional[str] = None           # e.g. "lokální - Plynový standardní kotel (starší), WAW"
    adresa: Optional[str] = None                 # e.g. "Květná 1740, 68001 Boskovice"

    def to_dict(self) -> dict:
        return asdict(self)

    def is_empty(self) -> bool:
        """Check if all fields are None/empty."""
        return all(v is None or v == "" for v in asdict(self).values())


# Regex patterns for each field – tuned to the ČS valuation form layout
_PATTERNS = {
    "stavba_dokoncena": [
        re.compile(r"Stavba\s+dokon[čc]ena\s+v\s+r\.?\s*:?\s*(\d{4})", re.IGNORECASE),
        re.compile(r"dokon[čc]ena\s+v\s+r\.?\s*:?\s*(\d{4})", re.IGNORECASE),
    ],
    "stav_rodinneho_domu": [
        re.compile(r"Stav\s+rodinn[ée]ho\s+domu\s+(.+)", re.IGNORECASE),
    ],
    "pocet_podlazi": [
        re.compile(r"Po[čc]et\s+podla[žz][ií]\s+(\S+)", re.IGNORECASE),
    ],
    "typ_strechy": [
        re.compile(r"Typ\s+st[řr]echy\s+(.+)", re.IGNORECASE),
    ],
    "podsklepeni": [
        re.compile(r"Podsklepení\s+(ANO|NE|Ano|Ne|ano|ne)", re.IGNORECASE),
    ],
    "celkova_podlahova_plocha": [
        re.compile(r"Celkov[áa]\s+podlahov[áa]\s+plocha\s+(.+)", re.IGNORECASE),
    ],
    "typ_vytapeni": [
        re.compile(r"Vyt[áa]p[ěe]n[ií]\s+(.+)", re.IGNORECASE),
    ],
    "adresa": [
        re.compile(r"Adresa\s+nemovitosti\s+(.+)", re.IGNORECASE),
    ],
}


def parse_pdf(pdf_bytes: bytes) -> PropertyData:
    """Parse a property valuation PDF and extract key fields.

    Args:
        pdf_bytes: Raw bytes of the PDF file.

    Returns:
        PropertyData with extracted fields (None for fields not found).
    """
    data = PropertyData()

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = ""
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                full_text += page_text + "\n"

    if not full_text.strip():
        return data

    # Clean up multi-space sequences but keep newlines
    lines = full_text.split("\n")
    cleaned_lines = []
    for line in lines:
        cleaned = re.sub(r"[ \t]+", " ", line).strip()
        if cleaned:
            cleaned_lines.append(cleaned)

    full_cleaned = "\n".join(cleaned_lines)

    # Extract each field using regex patterns
    for field_name, patterns in _PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(full_cleaned)
            if match:
                value = match.group(1).strip()
                # Clean trailing whitespace and common artifacts
                value = re.sub(r"\s+$", "", value)
                if value:
                    setattr(data, field_name, value)
                break

    # Post-process: try to extract year from stavba_dokoncena if it's a full sentence
    if data.stavba_dokoncena:
        year_match = re.search(r"(\d{4})", data.stavba_dokoncena)
        if year_match:
            data.stavba_dokoncena = year_match.group(1)

    # Post-process: normalize podsklepeni to uppercase
    if data.podsklepeni:
        data.podsklepeni = data.podsklepeni.upper()

    return data


