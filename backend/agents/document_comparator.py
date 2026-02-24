"""Agent: DocumentComparator – porovnání dat z PDF formuláře s fotodokumentací.

Sends property data (from PDF or manual input) alongside uploaded photos to Gemini,
which evaluates whether the photos match the declared property characteristics.
"""
import json
from google import genai
from google.genai import types

from agents.base import BaseAgent, AgentResult, AgentStatus
from config import GEMINI_API_KEY, GEMINI_MODEL

COMPARATOR_SYSTEM_PROMPT = """Jsi expert na validaci nemovitostí. Tvým úkolem je porovnat údaje z formuláře
ocenění rodinného domu s přiloženou fotodokumentací.

Dostaneš:
1. Údaje z formuláře (JSON): stav domu, počet podlaží, typ střechy, podsklepení, celková podlahová plocha, vytápění, rok dokončení
2. Fotografie nemovitosti

Na základě fotografií ověř, zda odpovídají údajům z formuláře. Konkrétně hodnoť KAŽDÝ z těchto bodů:

1. **Počet podlaží** – Odpovídá vizuálně počet pater na fotkách (přízemí, patro, podkroví, suterén) deklarovanému počtu? Počítej všechna viditelná podlaží včetně podkroví, pokud je obytné (střešní okna, vikýře).
2. **Celková podlahová plocha** – Odhadni přibližnou podlahovou plochu z fotografií. Zohledni viditelný půdorys domu (šířka × hloubka), počet podlaží, a porovnej s deklarovanou hodnotou. Pokud je rozdíl větší než 20 %, označ jako neshodu.
3. **Typ střechy** – Shoduje se typ střechy na fotkách (sedlová, valbová, plochá, mansardová) s deklarovaným?
4. **Stav domu** – Odpovídá vizuální stav domu (fasáda, okna, celkový dojem) deklarovanému stavu?
5. **Podsklepení** – Jsou na fotkách viditelné známky sklepa (suterénní okna, anglické dvorky, schody dolů)?
6. **Typ vytápění** – Jsou na fotkách viditelné prvky vytápění (komín, plynový kotel, tepelné čerpadlo, solární panely)?
7. **Celkový dojem** – Celkové zhodnocení souladu formuláře a fotek.

Vrať výsledek jako JSON:
{
  "verdict": "SHODA" | "ČÁSTEČNÁ_SHODA" | "NESHODA",
  "confidence": 0.0-1.0,
  "overall_summary": "Celkové shrnutí porovnání...",
  "checks": [
    {
      "field": "počet podlaží",
      "declared": "hodnota z formuláře",
      "observed": "co je vidět na fotkách",
      "match": true/false,
      "note": "Podrobný komentář..."
    },
    {
      "field": "celková podlahová plocha",
      "declared": "hodnota z formuláře v m²",
      "observed": "odhadovaná plocha z fotek v m²",
      "match": true/false,
      "note": "Jak jsi k odhadu dospěl, proč se shoduje/neshoduje..."
    },
    ...
  ],
  "warnings": ["Případná varování..."],
  "recommendations": ["Doporučení..."]
}

Odpověz POUZE validním JSON. Buď objektivní a pečlivý v hodnocení. Vždy zahrň kontrolu podlahové plochy a počtu podlaží.
"""


class DocumentComparatorAgent(BaseAgent):
    """Compares declared property data (from PDF/manual input) with photo evidence."""

    def __init__(self):
        super().__init__(
            name="DocumentComparator",
            description="Porovnání údajů z formuláře s fotodokumentací",
            system_prompt=COMPARATOR_SYSTEM_PROMPT,
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    async def run(self, context: dict) -> AgentResult:
        property_data = context.get("property_data")
        images = context.get("images", [])

        # Skip if no property data provided
        if not property_data:
            self.log("Žádná data z formuláře – přeskakuji porovnání.", "info")
            return AgentResult(
                status=AgentStatus.SUCCESS,
                summary="Přeskočeno – nebyla poskytnuta data z formuláře.",
                details={"skipped": True, "reason": "no_property_data"},
            )

        self.log(f"Porovnávám data z formuláře s {len(images)} fotografiemi...", "thinking")

        if not self.client:
            self.log("Gemini API key not configured.", "warn")
            return AgentResult(
                status=AgentStatus.WARN,
                summary="Porovnání není dostupné – chybí API klíč.",
                details={"skipped": True, "reason": "no_api_key"},
                warnings=["Gemini API klíč není nakonfigurován."],
            )

        if not images:
            self.log("Žádné fotografie pro porovnání.", "warn")
            return AgentResult(
                status=AgentStatus.WARN,
                summary="Porovnání není možné – žádné fotografie.",
                details={"skipped": True, "reason": "no_images"},
                warnings=["Nebyla poskytnuta žádná fotodokumentace."],
            )

        try:
            # Build prompt with property data
            property_json = json.dumps(property_data, ensure_ascii=False, indent=2)
            parts = [
                f"Údaje z formuláře ocenění rodinného domu:\n```json\n{property_json}\n```\n\n"
                f"Porovnej tyto údaje s následujícími {len(images)} fotografiemi nemovitosti:\n"
            ]

            # Attach photos (max 10 to stay within limits)
            photos_to_send = images[:10]
            for img in photos_to_send:
                try:
                    with open(img["processed_path"], "rb") as f:
                        image_bytes = f.read()
                    parts.append(types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))
                    parts.append(f"Photo ID: {img['id']}")
                except Exception as e:
                    self.log(f"Error reading image {img.get('id', '?')}: {e}", "warn")

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
            self.log("AI porovnání dokončeno.", "info")
            ai_result = json.loads(result_text)

            verdict = ai_result.get("verdict", "UNKNOWN")
            confidence = ai_result.get("confidence", 0.0)
            checks = ai_result.get("checks", [])
            ai_warnings = ai_result.get("warnings", [])
            recommendations = ai_result.get("recommendations", [])
            overall_summary = ai_result.get("overall_summary", "")

            # Count matches/mismatches from actual check data
            matches = sum(1 for c in checks if c.get("match", False))
            mismatches = len(checks) - matches

            # Override AI verdict with actual check results to prevent inconsistency
            # (AI sometimes says ČÁSTEČNÁ_SHODA while all checks show match=True)
            if checks:
                if mismatches == 0:
                    verdict = "SHODA"
                elif matches == 0:
                    verdict = "NESHODA"
                else:
                    verdict = "ČÁSTEČNÁ_SHODA"

            # Determine status based on (corrected) verdict
            if verdict == "SHODA":
                status = AgentStatus.SUCCESS
            elif verdict == "ČÁSTEČNÁ_SHODA":
                status = AgentStatus.WARN
            else:
                status = AgentStatus.FAIL

            self.log(f"Výsledek: {verdict} (confidence: {confidence})")

            return AgentResult(
                status=status,
                summary=f"{verdict}: {matches} shod, {mismatches} neshod (spolehlivost {confidence:.0%})",
                details={
                    "verdict": verdict,
                    "confidence": confidence,
                    "overall_summary": overall_summary,
                    "checks": checks,
                    "recommendations": recommendations,
                    "property_data": property_data,
                },
                warnings=ai_warnings,
            )

        except Exception as e:
            self.log(f"Chyba při porovnání: {str(e)}", "error")
            return AgentResult(
                status=AgentStatus.WARN,
                summary=f"Porovnání selhalo: {str(e)}",
                details={"error": str(e)},
                warnings=[f"Porovnání dokumentů nebylo možné provést: {str(e)}"],
            )
