"""PDF Parser for ČS property valuation forms.

Supports BOTH form formats:
  1. Old: "Ocenění rodinného domu" – vertical key-value layout
  2. New: "Zadané údaje pro on-line ocenění rodinného domu" – table layout

Extracts key fields:
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


# Known label prefixes used to truncate greedy (.+) captures in table layouts
# where two fields appear on the same line (e.g. "Typ střechy: sedlová Typ konstrukce: jiná").
_KNOWN_LABELS = [
    r"Typ\s+konstrukce", r"Po[čc]et\s+nadzemn", r"Po[čc]et\s+podla",
    r"Podskle", r"Vyu[žz]it[ií]", r"Typ\s+st[řr]echy", r"Rok\s+dokon",
    r"Stav\s+rodinn", r"Rok\s+rekonstrukce", r"Rozsah\s+rekonstrukce",
    r"Voda", r"Celkov[áa]\s+podlahov", r"Celkov[áa]\s+plocha",
    r"Zastav[ěe]n[áa]\s+plocha", r"Kanalizace", r"P[řr][ií]pojka",
    r"P[řr][ií]jezd", r"Po[čc]et\s+gar[áa]", r"Katastr[áa]ln[ií]",
    r"[ČC][ií]slo\s+popisn", r"PS[ČC]", r"Obec", r"Ulice",
    r"Obytné\s+podkrov", r"Um[ií]st[ěe]n[ií]", r"Je\s+zateplen",
    r"Jak[áa]\s+m[áa]\s+d[ůu]m", r"M[áa]\s+d[ůu]m",
    r"Hlavn[ií]\s+zdroj", r"V\s+jak[ýy]ch\s+prostor",
    r"M[áa]te\s+sol", r"Jak\s+vyu[žz][ií]v", r"Kolik\s+m[áa]te",
    r"Jak\s+dlouho", r"V[ýy]kon\s+st[áa]vaj",
    r"P[řr][ií]pojka\s+plyn", r"P[řr][ií]pojka\s+elektro",
]

_LABEL_BOUNDARY_RE = re.compile(
    r"\s+(?=" + "|".join(_KNOWN_LABELS) + r")", re.IGNORECASE
)


def _truncate_at_next_label(value: str) -> str:
    """Truncate a value string at the start of any known field label.

    In the new table format, pdfplumber often places two columns on one line:
      'Typ střechy: sedlová Typ konstrukce: jiná'
    This function returns 'sedlová' by cutting at the next recognized label.
    """
    m = _LABEL_BOUNDARY_RE.search(value)
    if m:
        return value[:m.start()].strip()
    return value


# Regex patterns for each field – covers both old and new ČS form layouts.
# Patterns are tried in order; the first match wins.
_PATTERNS = {
    "stavba_dokoncena": [
        # Old: "Stavba dokončena v r.: 1980"
        re.compile(r"Stavba\s+dokon[čc]ena\s+v\s+r\.?\s*:?\s*(\d{4})", re.IGNORECASE),
        re.compile(r"dokon[čc]ena\s+v\s+r\.?\s*:?\s*(\d{4})", re.IGNORECASE),
        # New: "Rok dokončení: 2026"
        re.compile(r"Rok\s+dokon[čc]en[ií]\s*:?\s*(\d{4})", re.IGNORECASE),
    ],
    "stav_rodinneho_domu": [
        # Both: "Stav rodinného domu  výborně udržovaný"
        re.compile(r"Stav\s+rodinn[ée]ho\s+domu\s*:?\s*(.+)", re.IGNORECASE),
    ],
    "pocet_podlazi": [
        # New: "Počet nadzemních podlaží: 1" (more specific, checked first)
        re.compile(r"Po[čc]et\s+nadzemn[ií]ch\s+podla[žz][ií]\s*:?\s*(\S+)", re.IGNORECASE),
        # Old: "Počet podlaží 2"
        re.compile(r"Po[čc]et\s+podla[žz][ií]\s*:?\s*(\S+)", re.IGNORECASE),
    ],
    "typ_strechy": [
        # Both: "Typ střechy sedlová"
        re.compile(r"Typ\s+st[řr]echy\s*:?\s*(.+)", re.IGNORECASE),
    ],
    "podsklepeni": [
        # Old: "Podsklepení ANO" / "Podsklepení NE"
        re.compile(r"Podsklepení\s*:?\s*(ANO|NE|Ano|Ne|ano|ne)", re.IGNORECASE),
        # New: "Podsklepeno: ano" / "Podsklepeno: ne"
        re.compile(r"Podsklepeno\s*:?\s*(ano|ne|ANO|NE|Ano|Ne)", re.IGNORECASE),
    ],
    "celkova_podlahova_plocha": [
        # Both: "Celková podlahová plocha 175 m2" or "Celková podlahová plocha: 60 m²"
        re.compile(r"Celkov[áa]\s+podlahov[áa]\s+plocha\s*:?\s*(.+)", re.IGNORECASE),
    ],
    "typ_vytapeni": [
        # New: "Typ vytápění: lokální - Elektrické tepelné čerpadlo vzduch/voda"
        re.compile(r"Typ\s+vyt[áa]p[ěe]n[ií]\s*:?\s*(.+)", re.IGNORECASE),
        # Old: "Vytápění lokální - Plynový standardní kotel"
        re.compile(r"Vyt[áa]p[ěe]n[ií]\s*:?\s*(.+)", re.IGNORECASE),
    ],
    "adresa": [
        # Old: "Adresa nemovitosti Květná 1740, 68001 Boskovice"
        re.compile(r"Adresa\s+nemovitosti\s*:?\s*(.+)", re.IGNORECASE),
    ],
}

# Patterns for composing address from separate fields (new form format)
_ADDRESS_PARTS = {
    "ulice": re.compile(r"Ulice\s*:?\s*(.+)", re.IGNORECASE),
    "cislo_popisne": re.compile(r"[ČC][ií]slo\s+popisn[ée]\s*:?\s*(\d+)", re.IGNORECASE),
    "obec": re.compile(r"Obec\s*:?\s*(.+)", re.IGNORECASE),
    "psc": re.compile(r"PS[ČC]\s*:?\s*(\d+)", re.IGNORECASE),
}


def parse_pdf(pdf_bytes: bytes) -> PropertyData:
    """Parse a property valuation PDF and extract key fields.

    Supports both old and new ČS form layouts. Fields not found remain None.

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
                # Truncate at the next known label (handles table two-column lines)
                value = _truncate_at_next_label(value)
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

    # Post-process: compose address from separate fields if not found directly
    # (new form has Ulice, Číslo popisné, Obec, PSČ as separate fields)
    if not data.adresa:
        parts = {}
        for part_name, pattern in _ADDRESS_PARTS.items():
            match = pattern.search(full_cleaned)
            if match:
                val = _truncate_at_next_label(match.group(1).strip())
                if val:
                    parts[part_name] = val

        if parts:
            addr_parts = []
            # "Ulice číslo_popisné" or just "Ulice"
            street = parts.get("ulice", "")
            cislo = parts.get("cislo_popisne", "")
            if street:
                addr_parts.append(f"{street} {cislo}".strip() if cislo else street)
            elif cislo:
                addr_parts.append(cislo)

            # "PSČ Obec" or just "Obec"
            psc = parts.get("psc", "")
            obec = parts.get("obec", "")
            if psc and obec:
                addr_parts.append(f"{psc} {obec}")
            elif obec:
                addr_parts.append(obec)
            elif psc:
                addr_parts.append(psc)

            if addr_parts:
                data.adresa = ", ".join(addr_parts)

    return data
