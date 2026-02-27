"""Agent 2: ForenzniAnalytik – Manipulation Detection (BR-G5).

Detects AI edits, retouching, and metadata inconsistencies:
- Calculates manipulation_score and confidence
- FAIL when score > threshold AND confidence > threshold
- Analyzes local artifacts, metadata mismatches, AI generation
"""
import json
from google import genai
from google.genai import types

from agents.base import BaseAgent, AgentResult, AgentStatus
from config import (
    GEMINI_API_KEY, GEMINI_MODEL,
    MANIPULATION_SCORE_THRESHOLD, CONFIDENCE_THRESHOLD,
)

FORENSIC_SYSTEM_PROMPT = """Jsi forenzní expert na analýzu fotografií nemovitostí. Tvým úkolem je detekovat jakékoliv manipulace, AI úpravy, retuše nebo nesrovnalosti.

ANALYZUJ KAŽDOU FOTOGRAFII NA:
1. **AI Generování**: Je foto generované umělou inteligencí? (podivné textury, nereálné odrazy, anomálie v detailech)
2. **Retuše a Úpravy**: Byly odstraněny nebo přidány objekty? (klonování, healing, content-aware fill)
3. **Lokální Artefakty**: Skoky v kompresi, nekonzistentní šum, blur/sharpen anomálie
4. **Metadata Nesoulad**: Nesoulad mezi vizuálním obsahem a metadaty (osvětlení vs. čas pořízení, GPS vs. zobrazený prostor)
5. **Manipulace Perspektivy**: Zkreslení perspektivy, nereálné úhly, postprodukční korekce

PRO KAŽDOU FOTOGRAFII VRAŤ:
- manipulation_score: 0.0-1.0 (0 = žádná manipulace, 1 = jasná manipulace)
- confidence: 0.0-1.0 (jak si jsi jistý svým hodnocením)
- findings: seznam nalezených problémů

VRAŤ JSON:
{
  "photos": [
    {
      "photo_id": "xxx",
      "manipulation_score": 0.15,
      "confidence": 0.85,
      "is_ai_generated": false,
      "findings": ["Mírná úprava jasu", "Žádné známky klonování"],
      "risk_level": "low"
    }
  ],
  "overall": {
    "avg_manipulation_score": 0.15,
    "max_manipulation_score": 0.3,
    "avg_confidence": 0.85,
    "flagged_count": 0,
    "summary": "Sada fotek nevykazuje známky významné manipulace."
  }
}

risk_level: "low" (score < 0.3), "medium" (0.3-0.6), "high" (0.6-0.8), "critical" (>0.8)

Odpověz POUZE validním JSON.
"""


class ForenzniAnalytikAgent(BaseAgent):
    """Agent 2: ForenzniAnalytik - detects manipulation and AI edits."""

    def __init__(self):
        super().__init__(
            name="ForenzniAnalytik",
            description="Detekce AI úprav a manipulací (BR-G5)",
            system_prompt=FORENSIC_SYSTEM_PROMPT,
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    async def run(self, context: dict) -> AgentResult:
        images = context.get("images", [])
        self.log(f"Analyzing {len(images)} images for manipulation.")

        if not self.client:
            self.log("Gemini API key not configured. Using fallback.", "warn")
            return AgentResult(
                status=AgentStatus.WARN,
                summary="Forenzní analýza nedostupná (chybí API klíč)",
                warnings=["AI analýza nedostupná."],
            )

        try:
            self.log("Sending images for forensic analysis...", "thinking")

            # Include metadata context
            metadata_info = []
            for img in images:
                meta = img.get("metadata", {})
                metadata_info.append({
                    "photo_id": img["id"],
                    "capture_date": meta.get("capture_date"),
                    "device_model": meta.get("device_model"),
                    "gps": f"{meta.get('gps_latitude')}, {meta.get('gps_longitude')}" if meta.get("gps_latitude") else None,
                })

            parts = [
                f"Analyzuj těchto {len(images)} fotografií na manipulace. Metadata:\n{json.dumps(metadata_info, indent=2, ensure_ascii=False)}\n"
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
            self.log("ForenzniAnalytik analysis received.", "info")

            # Parse results
            overall = ai_result.get("overall", {})
            photos = ai_result.get("photos", [])
            max_score = overall.get("max_manipulation_score", 0)
            flagged = overall.get("flagged_count", 0)

            warnings = []
            errors = []

            # Check for critical manipulations
            for photo in photos:
                score = photo.get("manipulation_score", 0)
                confidence = photo.get("confidence", 0)
                if score >= MANIPULATION_SCORE_THRESHOLD and confidence >= CONFIDENCE_THRESHOLD:
                    errors.append(
                        f"Photo {photo['photo_id']}: manipulation_score={score:.2f}, confidence={confidence:.2f} – "
                        f"překročen práh ({MANIPULATION_SCORE_THRESHOLD}/{CONFIDENCE_THRESHOLD})"
                    )
                elif score >= 0.4:
                    warnings.append(
                        f"Photo {photo['photo_id']}: podezření na manipulaci (score={score:.2f})"
                    )

            status = AgentStatus.FAIL if errors else (AgentStatus.WARN if warnings else AgentStatus.SUCCESS)

            self.log(f"ForenzniAnalytik result: {status.value} – flagged: {flagged}, max_score: {max_score:.2f}")

            return AgentResult(
                status=status,
                score=max_score,
                summary=overall.get("summary", f"Max manipulation score: {max_score:.2f}"),
                details={
                    "photos": photos,
                    "overall": overall,
                },
                warnings=warnings,
                errors=errors,
            )

        except Exception as e:
            self.log(f"ForenzniAnalytik analysis error: {str(e)}", "error")
            return AgentResult(
                status=AgentStatus.WARN,
                summary=f"Chyba forenzní analýzy: {str(e)}",
                warnings=[f"Analýza selhala: {str(e)}"],
            )
