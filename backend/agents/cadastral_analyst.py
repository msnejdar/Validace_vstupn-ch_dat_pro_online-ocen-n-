"""Agent 7: CadastralAnalyst – LV Risk Analysis + Ortofoto Building Detection.

- Parses uploaded LV (List Vlastnictví) PDF
- Identifies banking risks: liens, easements, alienation bans, executions
- Fetches parcel geometry via ČÚZK REST API
- Downloads ortofoto from ČÚZK WMS
- AI analysis of ortofoto for unregistered buildings/extensions
"""
import json
import os
import httpx

from google import genai
from google.genai import types

from agents.base import BaseAgent, AgentResult, AgentStatus
from config import GEMINI_API_KEY, GEMINI_MODEL, CUZK_API_KEY, UPLOAD_DIR
from lv_parser import parse_lv, LVData

CUZK_API_BASE = "https://api-kn.cuzk.gov.cz"
CUZK_WMS_ORTOFOTO = "https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer"

ORTOFOTO_ANALYSIS_PROMPT = """Jsi expert na analýzu leteckých/satelitních snímků nemovitostí pro účely bankovních ocenění.

Dostáváš ORTOFOTO z katastru nemovitostí České republiky.
Zároveň dostáváš informace o parcelách z Listu vlastnictví (čísla, výměry, druhy pozemků, zapsané stavby).

TVŮJ ÚKOL:
Analyzuj ortofoto a hledej STAVBY na pozemcích, které NEJSOU zakresleny v katastru.

PRAVIDLA PRO DETEKCI:
1. **Vedlejší stavba > 45 m²**: Pokud na pozemku vidíš budovu/stavbu, která NENÍ uvedena v LV jako součást pozemku
   → RIZIKO STŘEDNÍ: "Nezakreslená vedlejší stavba se zastavěnou plochou nad 45 m² – podmínka zákresu do KN"
   → Poznámka: pokud dle fotek nemovitosti stavba NENÍ obytná ani vytápěná, riziko zůstává střední
   
2. **Přístavba k hlavní stavbě > 16 m²**: Pokud hlavní stavba na ortofoto vypadá větší než zastavěná plocha pozemku
   → RIZIKO STŘEDNÍ: "Nezakreslená přístavba k hlavní stavbě se zastavěnou plochou nad 16 m² – podmínka zákresu do KN"

3. Pokud NEVIDÍŠ žádné podezřelé stavby → "Žádná rizika nezjištěna"

ODPOVÍDEJ ČESKY, POUZE V JSON:
{
  "buildings_detected": [
    {
      "description": "Popis stavby/přístavby",
      "estimated_area_m2": 60,
      "risk_level": "střední",
      "risk_description": "Popis rizika",
      "recommendation": "Doporučení"
    }
  ],
  "overall_assessment": "Celkové hodnocení ortofota – co vidíte na pozemcích",
  "notes": "Případné poznámky"
}
"""

LV_RISK_ANALYSIS_PROMPT = """Jsi expert na právní analýzu listu vlastnictví pro účely bankovních hypotečních úvěrů.

Analyzuj následující data z Listu vlastnictví a identifikuj RIZIKA PRO BANKU.

HLEDEJ TYTO RIZIKOVÉ FAKTORY:
1. **Zástavní práva** – existující hypotéky, věřitelé, nesplacené dluhy, výše pohledávek
2. **Věcná břemena** – služebnosti, užívací práva třetích osob (osobní i reálná)
3. **Zákazy zcizení** – blokace prodeje/převodu nemovitosti
4. **Exekuce/insolvence** – nařízení exekuce, insolvenční řízení
5. **Plomby** – probíhající řízení v katastru
6. **Spoluvlastnictví** – více vlastníků, komplikované podíly
7. **BPEJ/zemědělský půdní fond** – pozemky v ZPF (omezení stavby)

Pro každé riziko uveď:
- severity: "vysoké" / "střední" / "nízké"
- description: co přesně bylo nalezeno
- recommendation: doporučení pro banku

ODPOVÍDEJ ČESKY, POUZE V JSON:
{
  "risks": [
    {"severity": "...", "category": "...", "description": "...", "recommendation": "..."}
  ],
  "overall_risk_level": "vysoké" / "střední" / "nízké" / "žádné",
  "summary": "Celkové shrnutí rizik pro banku"
}
"""


class CadastralAnalystAgent(BaseAgent):
    """Agent 7: CadastralAnalyst – LV + ortofoto analysis."""

    def __init__(self):
        super().__init__(
            name="CadastralAnalyst",
            description="Analýza listu vlastnictví – rizika pro banku + ortofoto kontrola staveb",
            system_prompt=LV_RISK_ANALYSIS_PROMPT,
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    async def run(self, context: dict) -> AgentResult:
        lv_pdf_path = context.get("lv_pdf_path")
        selected_parcels = context.get("selected_parcels")  # list of parcel numbers
        session_id = context.get("session_id", "unknown")
        images = context.get("images", [])

        if not lv_pdf_path:
            self.log("List vlastnictví nebyl nahrán – přeskakuji.", "info")
            return AgentResult(
                status=AgentStatus.WARN,
                summary="List vlastnictví nebyl nahrán.",
                details={"skipped": True},
                warnings=["LV nebylo nahráno – analýza katastru přeskočena."],
            )

        # ── Step 1: Parse LV PDF ──
        self.log("Parsování Listu vlastnictví...", "thinking")
        try:
            with open(lv_pdf_path, "rb") as f:
                lv_bytes = f.read()
            lv_data = parse_lv(lv_bytes)
            self.log(f"LV {lv_data.lv_number} – kat.ú. {lv_data.kat_uzemi_nazev}: "
                     f"{len(lv_data.parcels)} parcel, {len(lv_data.owners)} vlastníků, "
                     f"{len(lv_data.encumbrances)} záznamů v sekci C")
        except Exception as e:
            self.log(f"Chyba parsování LV: {e}", "error")
            return AgentResult(
                status=AgentStatus.FAIL,
                summary=f"Chyba při čtení LV: {e}",
                errors=[str(e)],
            )

        # Filter parcels by user selection
        if selected_parcels:
            lv_data.parcels = [
                p for p in lv_data.parcels
                if p.parcel_number in selected_parcels
            ]
            self.log(f"Funkční celek: {len(lv_data.parcels)} vybraných parcel")

        # ── Step 2: AI Risk Analysis of LV ──
        self.log("AI analýza rizik z LV...", "thinking")
        lv_risks = None
        if self.client:
            lv_risks = await self._analyze_lv_risks(lv_data)

        # ── Step 3: Fetch parcel geometry from ČÚZK API ──
        parcel_geometries = {}
        bbox = None
        if CUZK_API_KEY and lv_data.kat_uzemi_kod and lv_data.parcels:
            self.log("Získávání geometrie parcel z ČÚZK...", "thinking")
            parcel_geometries, bbox = await self._fetch_parcel_geometries(lv_data)

        # ── Step 4: Download ortofoto ──
        ortofoto_path = None
        ortofoto_url = None
        if bbox:
            self.log("Stahování ortofota z ČÚZK WMS...", "thinking")
            ortofoto_path, ortofoto_url = await self._download_ortofoto(bbox, session_id)

        # ── Step 5: AI analysis of ortofoto ──
        ortofoto_analysis = None
        if ortofoto_path and self.client:
            self.log("AI analýza ortofota – hledání nezakreslených staveb...", "thinking")
            ortofoto_analysis = await self._analyze_ortofoto(ortofoto_path, lv_data, images)

        # ── Step 6: Build result ──
        warnings = []
        errors = []
        all_risks = []

        if lv_risks:
            all_risks.extend(lv_risks.get("risks", []))
        if ortofoto_analysis:
            for bd in ortofoto_analysis.get("buildings_detected", []):
                all_risks.append({
                    "severity": bd.get("risk_level", "střední"),
                    "category": "nezakreslená stavba",
                    "description": bd.get("risk_description", bd.get("description", "")),
                    "recommendation": bd.get("recommendation", ""),
                })

        high_risks = sum(1 for r in all_risks if r.get("severity") == "vysoké")
        medium_risks = sum(1 for r in all_risks if r.get("severity") == "střední")
        low_risks = sum(1 for r in all_risks if r.get("severity") == "nízké")

        if high_risks > 0:
            status = AgentStatus.FAIL
        elif medium_risks > 0:
            status = AgentStatus.WARN
        else:
            status = AgentStatus.SUCCESS

        overall_risk = lv_risks.get("overall_risk_level", "neznámé") if lv_risks else "neznámé"
        summary_text = (
            f"LV {lv_data.lv_number} – {lv_data.kat_uzemi_nazev}: "
            f"{high_risks} vysokých, {medium_risks} středních, {low_risks} nízkých rizik"
        )

        self.log(f"Výsledek: {summary_text}")

        return AgentResult(
            status=status,
            summary=summary_text,
            details={
                "lv_data": lv_data.to_dict(),
                "risks": all_risks,
                "overall_risk_level": overall_risk,
                "lv_risk_summary": lv_risks.get("summary", "") if lv_risks else "",
                "ortofoto_url": ortofoto_url,
                "ortofoto_analysis": ortofoto_analysis,
                "parcel_geometries": parcel_geometries,
                "bbox": bbox,
            },
            warnings=[r["description"] for r in all_risks if r.get("severity") in ("vysoké", "střední")],
            errors=[r["description"] for r in all_risks if r.get("severity") == "vysoké"],
        )

    # ─── AI Risk Analysis ──────────────────────────────────────────────
    async def _analyze_lv_risks(self, lv_data: LVData) -> dict | None:
        """Use Gemini to analyze LV data for banking risks."""
        try:
            lv_summary = json.dumps(lv_data.to_dict(), ensure_ascii=False, indent=2)

            response = await self.client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=f"Analyzuj tento List vlastnictví a identifikuj rizika pro banku:\n\n{lv_summary}",
                config=types.GenerateContentConfig(
                    system_instruction=LV_RISK_ANALYSIS_PROMPT,
                    response_mime_type="application/json",
                    max_output_tokens=3000,
                ),
            )
            result = json.loads(response.text)
            self.log(f"LV rizika: {result.get('overall_risk_level', '?')}")
            return result
        except Exception as e:
            self.log(f"Chyba AI analýzy LV: {e}", "warn")
            return None

    # ─── ČÚZK Parcel Geometry ───────────────────────────────────────────
    async def _fetch_parcel_geometries(self, lv_data: LVData) -> tuple[dict, list | None]:
        """Fetch parcel boundaries from ČÚZK REST API and compute bounding box."""
        headers = {"ApiKey": CUZK_API_KEY, "Accept": "application/json"}
        geometries = {}
        all_coords = []

        async with httpx.AsyncClient(timeout=15) as client:
            for parcel in lv_data.parcels:
                try:
                    # Parse parcel number: "1951/12" → kmenove=1951, poddeleni=12
                    parts = parcel.parcel_number.split("/")
                    kmenove = parts[0]
                    poddeleni = parts[1] if len(parts) > 1 else "0"

                    # ČÚZK API: search parcel by kat. území + parcel number
                    resp = await client.get(
                        f"{CUZK_API_BASE}/Parcela/Vyhledani",
                        params={
                            "katastralniUzemiKod": lv_data.kat_uzemi_kod,
                            "kmenoveCisloParcely": kmenove,
                            "poddeleniCislaParcely": poddeleni,
                        },
                        headers=headers,
                    )

                    if resp.status_code == 200:
                        data = resp.json()
                        items = data.get("data", [])
                        if items:
                            item = items[0]
                            parcel_id = item.get("id")

                            # Get detailed parcel info with geometry
                            if parcel_id:
                                detail_resp = await client.get(
                                    f"{CUZK_API_BASE}/Parcela/{parcel_id}",
                                    headers=headers,
                                )
                                if detail_resp.status_code == 200:
                                    detail = detail_resp.json().get("data", {})
                                    geom = detail.get("definicniBod", {})
                                    lat = geom.get("souradniceY")
                                    lon = geom.get("souradniceX")
                                    if lat and lon:
                                        # Note: ČÚZK uses JTSK (EPSG:5514), definicniBod may be in WGS84
                                        geometries[parcel.parcel_number] = {
                                            "lat": lat, "lon": lon,
                                            "area_m2": parcel.area_m2,
                                        }
                                        all_coords.append((lat, lon))
                                        self.log(f"Parcela {parcel.parcel_number}: ({lat}, {lon})")

                    elif resp.status_code == 404:
                        self.log(f"Parcela {parcel.parcel_number} nenalezena v ČÚZK.", "warn")
                    else:
                        self.log(f"ČÚZK API {resp.status_code} pro {parcel.parcel_number}", "warn")

                except Exception as e:
                    self.log(f"Chyba ČÚZK pro {parcel.parcel_number}: {e}", "warn")

        # Compute bounding box from all coordinates
        bbox = None
        if all_coords:
            lats = [c[0] for c in all_coords]
            lons = [c[1] for c in all_coords]
            # Add buffer (~100m ≈ 0.001 deg)
            buffer = 0.002
            bbox = [
                min(lons) - buffer,  # minlon
                min(lats) - buffer,  # minlat
                max(lons) + buffer,  # maxlon
                max(lats) + buffer,  # maxlat
            ]
            self.log(f"BBox: {bbox}")

        return geometries, bbox

    # ─── Ortofoto download ──────────────────────────────────────────────
    async def _download_ortofoto(self, bbox: list, session_id: str) -> tuple[str | None, str | None]:
        """Download ortofoto from ČÚZK WMS for the given bounding box."""
        try:
            # WMS GetMap request — EPSG:4326 (WGS84)
            params = {
                "SERVICE": "WMS",
                "VERSION": "1.3.0",
                "REQUEST": "GetMap",
                "LAYERS": "0",
                "CRS": "EPSG:4326",
                "BBOX": f"{bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]}",  # lat,lon order for WMS 1.3.0
                "WIDTH": "1024",
                "HEIGHT": "1024",
                "FORMAT": "image/jpeg",
                "STYLES": "",
            }

            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(CUZK_WMS_ORTOFOTO, params=params)

                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
                    session_dir = os.path.join(UPLOAD_DIR, session_id)
                    os.makedirs(session_dir, exist_ok=True)
                    ortofoto_path = os.path.join(session_dir, "ortofoto_cuzk.jpg")
                    with open(ortofoto_path, "wb") as f:
                        f.write(resp.content)
                    ortofoto_url = f"/uploads/{session_id}/ortofoto_cuzk.jpg"
                    self.log(f"Ortofoto staženo ({len(resp.content)} B)")
                    return ortofoto_path, ortofoto_url
                else:
                    self.log(f"Ortofoto nedostupné (status {resp.status_code})", "warn")
                    return None, None

        except Exception as e:
            self.log(f"Chyba stahování ortofota: {e}", "warn")
            return None, None

    # ─── Ortofoto AI Analysis ───────────────────────────────────────────
    async def _analyze_ortofoto(self, ortofoto_path: str, lv_data: LVData, images: list) -> dict | None:
        """Analyze ortofoto with Gemini to detect unregistered buildings."""
        try:
            with open(ortofoto_path, "rb") as f:
                ortofoto_bytes = f.read()

            # Build parcel info for context
            parcel_info = "\n".join([
                f"- Parcela {p.parcel_number}: {p.area_m2} m², {p.land_type}"
                for p in lv_data.parcels
            ])
            building_info = "\n".join([
                f"- {b.part_of} (na pozemku {b.on_parcel})"
                for b in lv_data.buildings
            ]) or "Žádné stavby v LV"

            parts = [
                f"ORTOFOTO pozemků z katastrálního území {lv_data.kat_uzemi_nazev} "
                f"(LV {lv_data.lv_number}):\n\n",
                types.Part.from_bytes(data=ortofoto_bytes, mime_type="image/jpeg"),
                f"\n\nINFORMACE Z LV:\n\nParcely:\n{parcel_info}\n\n"
                f"Zapsané stavby:\n{building_info}\n\n"
                f"Analyzuj ortofoto a hledej stavby, které NEJSOU v LV zapsány.",
            ]

            response = await self.client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=parts,
                config=types.GenerateContentConfig(
                    system_instruction=ORTOFOTO_ANALYSIS_PROMPT,
                    response_mime_type="application/json",
                    max_output_tokens=2000,
                ),
            )

            result = json.loads(response.text)
            detected = result.get("buildings_detected", [])
            self.log(f"Ortofoto analýza: {len(detected)} nezakreslených staveb detekováno")
            return result

        except Exception as e:
            self.log(f"Chyba AI analýzy ortofota: {e}", "warn")
            return None
