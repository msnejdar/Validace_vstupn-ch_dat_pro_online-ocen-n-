"""Agent 5: Strategist – Aggregation Logic & Routing.

Final decision-maker:
- Tracks precedence: BR-G4 (completeness) has highest priority
- Warning counting: 0 = ONLINE, 1-2 = SUPERVISED, 3+ or any FAIL = RETURN TO CLIENT
- Compares AI result vs user input using 2D matrix
- Generates human-readable report via Gemini
"""
import json
from google import genai
from google.genai import types

from agents.base import BaseAgent, AgentResult, AgentStatus
from config import (
    GEMINI_API_KEY, GEMINI_MODEL,
    DATA_MATRIX, get_age_range_key, get_score_range_key,
)


REPORT_PROMPT = """Jsi senior analytik nemovitostí. Na základě výsledků automatické validace napiš stručný, čitelný report.

Piš česky, profesionálně ale srozumitelně – jako by to psal zkušený kolega pro svého nadřízeného.
Nepoužívej technický žargon. Nepiš o „agentech" – piš o kontrolách a zjištěních.

STRUKTURA REPORTU:
1. **Shrnutí** (2-3 věty – celkový verdikt, nejdůležitější zjištění)
2. **Fotodokumentace** (kompletnost, kvalita dodaných fotek)
3. **Stav nemovitosti** (technický stav, nalezené vady)
4. **Věk a kategorizace** (efektivní věk, přiřazená kategorie)
5. **Ověření autentičnosti** (manipulace fotek, GPS ověření lokace)
6. **Porovnání dokumentů** (shoda/neshoda dat z formuláře s fotodokumentací – pokud byla data z PDF k dispozici, popiš jak se dokumentace shoduje s realitou na fotkách)
7. **Doporučení** (co doporučuješ jako další krok)

Piš stručně – každá sekce max 2-3 věty.
Pokud jsou problémy, jasně je pojmenuj. Pokud je vše v pořádku, řekni jasně „bez nálezu".
Nepiš "Agent zjistil" ale "Bylo ověřeno" nebo "Kontrola ukázala" apod.

Vrať POUZE text reportu, bez markdownu ani JSON.
"""


class StrategistAgent(BaseAgent):
    """Agent 5: Strategist - final aggregation and routing decision."""

    def __init__(self):
        super().__init__(
            name="Strategist",
            description="Agregační logika a finální rozhodnutí (Semafor)",
            system_prompt=REPORT_PROMPT,
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    async def run(self, context: dict) -> AgentResult:
        agent_results = context.get("agent_results", {})

        guardian = agent_results.get("Guardian")
        forensic = agent_results.get("Forensic")
        historian = agent_results.get("Historian")
        inspector = agent_results.get("Inspector")
        geovalidator = agent_results.get("GeoValidator")

        self.log("Agregace výsledků všech kontrol...")

        # Count warnings and fails
        total_warns = 0
        has_fail = False
        all_warnings = []
        all_errors = []
        agent_summaries = {}

        for name, result in agent_results.items():
            if result is None or name == "Strategist":
                continue
            agent_summaries[name] = {
                "status": result.status.value,
                "summary": result.summary,
                "warnings": result.warnings,
                "errors": result.errors,
                "details": result.details,
                "score": result.score,
                "category": result.category,
            }
            total_warns += len(result.warnings)
            all_warnings.extend(result.warnings)
            all_errors.extend(result.errors)
            if result.status == AgentStatus.FAIL:
                has_fail = True
                self.log(f"FAIL: {name} – {result.summary}", "error")
            elif result.warnings:
                self.log(f"WARN: {name} – {len(result.warnings)} varování", "warn")
            else:
                self.log(f"OK: {name}")

        # Priority check: Guardian FAIL is blocking
        guardian_fail = guardian and guardian.status == AgentStatus.FAIL
        if guardian_fail:
            self.log("BLOKUJÍCÍ: Neúplná fotodokumentace", "error")

        # Matrix evaluation
        matrix_result = None
        matrix_match_type = None
        effective_age = None
        ai_score = None
        age_category = None

        if historian and historian.details.get("effective_age") is not None:
            effective_age = historian.details["effective_age"]
        if inspector and inspector.score is not None:
            ai_score = int(inspector.score)

        if effective_age is not None and ai_score is not None:
            age_key = get_age_range_key(effective_age)
            score_key = get_score_range_key(ai_score)
            if age_key in DATA_MATRIX and score_key in DATA_MATRIX[age_key]:
                matrix_result = DATA_MATRIX[age_key][score_key]
                matrix_match_type = matrix_result[1]
                age_category = matrix_result[0]
                self.log(f"Matice: věk={effective_age}, score={ai_score} → Kat. {matrix_result[0]} ({matrix_match_type})")

                if matrix_match_type == "konflikt":
                    total_warns += 1
                    self.log("Matice: KONFLIKT – přidáno varování", "warn")

        # Determine final category
        final_category = None
        if age_category is not None:
            final_category = age_category
        elif historian and historian.category is not None:
            final_category = historian.category

        # Critical override from Inspector
        if inspector and inspector.details.get("critical_override"):
            final_category = 5
            has_fail = True
            self.log("Kritický nález inspektora → Kat. 5", "error")

        # Determine semaphore
        if has_fail or guardian_fail or total_warns >= 3:
            semaphore = "VRÁTIT KLIENTOVI"
            semaphore_color = "red"
        elif total_warns >= 1:
            semaphore = "SUPERVISED"
            semaphore_color = "orange"
        else:
            semaphore = "ONLINE"
            semaphore_color = "green"

        self.log(f"Verdikt: {semaphore} | Kategorie: {final_category}")

        # Generate human-readable report via Gemini
        human_report = await self._generate_report(
            agent_summaries, semaphore, final_category,
            effective_age, ai_score, total_warns, has_fail,
        )

        # Build status
        status = AgentStatus.FAIL if semaphore == "VRÁTIT KLIENTOVI" else (
            AgentStatus.WARN if semaphore == "SUPERVISED" else AgentStatus.SUCCESS
        )

        return AgentResult(
            status=status,
            category=final_category,
            summary=human_report,
            details={
                "semaphore": semaphore,
                "semaphore_color": semaphore_color,
                "final_category": final_category,
                "total_warnings": total_warns,
                "has_fail": has_fail,
                "human_report": human_report,
                "matrix_result": {
                    "effective_age": effective_age,
                    "ai_score": ai_score,
                    "category": age_category,
                    "match_type": matrix_match_type,
                } if matrix_result else None,
                "agent_summaries": agent_summaries,
            },
            warnings=all_warnings,
            errors=all_errors,
        )

    async def _generate_report(
        self,
        agent_summaries: dict,
        semaphore: str,
        category: int | None,
        effective_age: int | None,
        ai_score: int | None,
        total_warns: int,
        has_fail: bool,
    ) -> str:
        """Generate a human-readable report using Gemini."""
        if not self.client:
            return self._fallback_report(agent_summaries, semaphore, category)

        try:
            self.log("Generuji závěrečný report...", "thinking")

            data_context = json.dumps({
                "verdikt": semaphore,
                "kategorie": category,
                "efektivni_vek": effective_age,
                "ai_score_stav": ai_score,
                "pocet_varovani": total_warns,
                "ma_fail": has_fail,
                "vysledky_kontrol": {
                    name: {
                        "stav": s.get("status"),
                        "shrnuti": s.get("summary"),
                        "varovani": s.get("warnings", []),
                        "chyby": s.get("errors", []),
                    }
                    for name, s in agent_summaries.items()
                },
            }, ensure_ascii=False, indent=2)

            response = await self.client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=f"Napiš stručný report na základě těchto dat:\n\n{data_context}",
                config=types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    max_output_tokens=1500,
                ),
            )

            report = response.text.strip()
            self.log("Report vygenerován.")
            return report

        except Exception as e:
            self.log(f"Chyba generování reportu: {e}", "warn")
            return self._fallback_report(agent_summaries, semaphore, category)

    def _fallback_report(self, summaries: dict, semaphore: str, category: int | None) -> str:
        """Fallback report when AI is unavailable."""
        lines = [f"Verdikt: {semaphore}"]
        if category:
            lines.append(f"Přiřazená kategorie: {category}")
        lines.append("")
        for name, s in summaries.items():
            lines.append(f"{name}: {s.get('summary', '–')}")
        return "\n".join(lines)
