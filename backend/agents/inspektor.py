"""Agent 4: Inspektor – Defect Detection & Scoring.

Visual analysis of technical condition:
- Scoring 0-30 (Element age, Maintenance, Defects)
- Critical overrides: structural cracks, collapsed roof, structural damage → immediate FAIL/Cat. 5
- Severity classification: Minor, Medium, Severe, Critical
"""
import json
from google import genai
from google.genai import types

from agents.base import BaseAgent, AgentResult, AgentStatus
from config import GEMINI_API_KEY, GEMINI_MODEL, INSPECTOR_MAX_SCORE


INSPECTOR_SYSTEM_PROMPT = """Jsi stavební expert na technickou inspekci rodinných domů z fotografií.

HODNOTÍŠ TŘI OBLASTI (každá 0-10 bodů, celkem max 30 bodů):
Vyšší score = lepší stav.

1. **VĚK PRVKŮ (0-10):**
   - 0-2: Velmi staré prvky, viditelné opotřebení
   - 3-5: Starší prvky, průměrný stav
   - 6-8: Moderní prvky, dobrý stav
   - 9-10: Nové/renovované prvky, výborný stav

2. **ÚDRŽBA (0-10):**
   - 0-2: Zanedbáno, bez údržby
   - 3-5: Průměrná údržba
   - 6-8: Dobrá údržba
   - 9-10: Výborná, pravidelná údržba

3. **VADY (0-10):**
   - 0-2: Závažné vady, ohrožení bezpečnosti
   - 3-5: Střední vady, nutná oprava
   - 6-8: Drobné vady, kosmetické
   - 9-10: Bez viditelných vad

KRITICKÉ OVERRIDY (okamžitý FAIL a Kat. 5 – nevhodné pro online ocenění):
- Nutnost OCHOTNÉ REKONSTRUKCE / PROBÍHAJÍCÍ REKONSTRUKCE (Dům není obyvatelný v aktuálním stavu a vyžaduje masivní zásahy)
- Statické trhliny v nosných zdech
- Propadlá nebo výrazně poškozená střecha
- Konstrukční poškození (vyboulení, naklonění)
- Viditelné narušení statiky

Poznámka: Drobné dodělávky (např. chybějící jedna lišta) nevadí. Zásadní ale je patrný nutný rozsáhlý stavební zásah.

KLASIFIKACE ZÁVAŽNOSTI VAD:
- DROBNÁ: Kosmetické, neovlivňují funkčnost (oloupaná barva, drobné praskliny v omítce)
- STŘEDNÍ: Vyžadují opravu v blízké době (netěsnící okna, opotřebovaná podlaha)
- ZÁVAŽNÁ: Významně ovlivňují hodnotu nebo bezpečnost (vlhkost, plísně, poškozená elektroinstalace)
- KRITICKÁ: Ohrožují bezpečnost nebo statiku (viz kritické overridy)

VRAŤ JSON:
{
  "scoring": {
    "element_age": {"score": 7, "notes": "Moderní okna, starší střecha"},
    "maintenance": {"score": 8, "notes": "Dobrá údržba fasády i interiéru"},
    "defects": {"score": 6, "notes": "Drobné praskliny v omítce"}
  },
  "total_score": 21,
  "critical_override": false,
  "critical_override_reason": null,
  "defects_found": [
    {
      "description": "Prasklina v omítce nad oknem v 1.NP",
      "severity": "DROBNÁ",
      "location": "Fasáda, 1.NP",
      "photo_id": "xxx"
    }
  ],
  "overall_assessment": "Dům je v dobrém stavu s drobnými kosmetickými vadami."
}

Odpověz POUZE validním JSON.
"""


class InspektorAgent(BaseAgent):
    """Agent 4: Inspektor - visual defect detection and scoring."""

    def __init__(self):
        super().__init__(
            name="Inspektor",
            description="Detekce vad a bodování technického stavu",
            system_prompt=INSPECTOR_SYSTEM_PROMPT,
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    async def run(self, context: dict) -> AgentResult:
        images = context.get("images", [])
        self.log(f"Inspecting {len(images)} images for technical condition.")

        if not self.client:
            self.log("Gemini API key not configured.", "warn")
            return AgentResult(
                status=AgentStatus.WARN,
                summary="Inspekce nedostupná (chybí API klíč)",
                score=0,
                warnings=["AI inspekce nedostupná."],
            )

        try:
            self.log("Sending images for technical inspection...", "thinking")

            parts = [
                f"Proveď technickou inspekci tohoto rodinného domu. Analyzuj {len(images)} fotografií:\n"
            ]

            for img in images:
                with open(img["processed_path"], "rb") as f:
                    image_bytes = f.read()
                parts.append(types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))
                parts.append(f"Photo ID: {img['id']}")

            response = await self.client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=parts,
                config=types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    response_mime_type="application/json",
                    max_output_tokens=3000,
                ),
            )

            result_text = response.text
            ai_result = json.loads(result_text)
            self.log("Inspection analysis received.", "info")

            total_score = ai_result.get("total_score", 0)
            critical_override = ai_result.get("critical_override", False)
            defects = ai_result.get("defects_found", [])
            scoring = ai_result.get("scoring", {})

            self.log(f"Score: {total_score}/{INSPECTOR_MAX_SCORE}, Critical: {critical_override}")

            warnings = []
            errors = []

            if critical_override:
                reason = ai_result.get("critical_override_reason", "Kritický nález")
                errors.append(f"KRITICKÝ OVERRIDE: {reason}")
                self.log(f"CRITICAL OVERRIDE: {reason}", "error")

            # Classify defects by severity
            severe_count = sum(1 for d in defects if d.get("severity") in ("ZÁVAŽNÁ", "KRITICKÁ"))
            if severe_count > 0:
                warnings.append(f"Nalezeno {severe_count} závažných/kritických vad.")

            if critical_override:
                status = AgentStatus.FAIL
            elif total_score < 8:
                status = AgentStatus.FAIL
                errors.append(f"Velmi nízké hodnocení: {total_score}/{INSPECTOR_MAX_SCORE}")
            elif total_score < 16:
                status = AgentStatus.WARN
                warnings.append(f"Nízké hodnocení: {total_score}/{INSPECTOR_MAX_SCORE}")
            else:
                status = AgentStatus.SUCCESS

            return AgentResult(
                status=status,
                score=total_score,
                summary=ai_result.get("overall_assessment", f"Score: {total_score}/{INSPECTOR_MAX_SCORE}"),
                details={
                    "scoring": scoring,
                    "total_score": total_score,
                    "max_score": INSPECTOR_MAX_SCORE,
                    "critical_override": critical_override,
                    "critical_override_reason": ai_result.get("critical_override_reason"),
                    "defects_found": defects,
                },
                warnings=warnings,
                errors=errors,
            )

        except Exception as e:
            self.log(f"Inspection error: {str(e)}", "error")
            return AgentResult(
                status=AgentStatus.WARN,
                summary=f"Chyba inspekce: {str(e)}",
                score=0,
                warnings=[f"Inspekce selhala: {str(e)}"],
            )
