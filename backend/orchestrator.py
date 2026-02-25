"""Pipeline Orchestrator – runs agents in parallel waves with real-time WebSocket updates."""
import asyncio
import json
import time
import uuid
from typing import Optional

from fastapi import WebSocket

from agents.base import AgentStatus, AgentResult
from agents.guardian import GuardianAgent
from agents.forensic import ForensicAgent
from agents.historian import HistorianAgent
from agents.inspector import InspectorAgent
from agents.geovalidator import GeoValidatorAgent
from agents.document_comparator import DocumentComparatorAgent
from agents.cadastral_analyst import CadastralAnalystAgent
from agents.strategist import StrategistAgent


class PipelineOrchestrator:
    """Orchestrates the sequential execution of all validation agents."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.pipeline_id = str(uuid.uuid4())[:8]

        # Initialize agents
        self.agents = {
            "Guardian": GuardianAgent(),
            "Forensic": ForensicAgent(),
            "Historian": HistorianAgent(),
            "Inspector": InspectorAgent(),
            "GeoValidator": GeoValidatorAgent(),
            "DocumentComparator": DocumentComparatorAgent(),
            "CadastralAnalyst": CadastralAnalystAgent(),
            "Strategist": StrategistAgent(),
        }
        self.agent_order = ["Guardian", "Forensic", "Historian", "Inspector", "GeoValidator", "DocumentComparator", "CadastralAnalyst", "Strategist"]
        self.active_connections: list[WebSocket] = []
        self.is_running = False
        self.results = {}

    async def broadcast(self, message: dict):
        """Broadcast a message to all WebSocket connections."""
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def _notify_status(self, agent_name: str, status: str, extra: dict = None):
        """Send agent status update via WebSocket."""
        msg = {
            "type": "agent_status",
            "pipeline_id": self.pipeline_id,
            "agent": agent_name,
            "status": status,
            "timestamp": time.time(),
        }
        if extra:
            msg.update(extra)
        await self.broadcast(msg)

    async def _notify_log(self, agent_name: str, message: str, level: str = "info"):
        """Send agent log via WebSocket."""
        await self.broadcast({
            "type": "agent_log",
            "pipeline_id": self.pipeline_id,
            "agent": agent_name,
            "message": message,
            "level": level,
            "timestamp": time.time(),
        })

    async def run_pipeline(self, context: dict) -> dict:
        """Execute the full pipeline sequentially."""
        self.is_running = True
        start_time = time.time()

        await self.broadcast({
            "type": "pipeline_start",
            "pipeline_id": self.pipeline_id,
            "session_id": self.session_id,
            "timestamp": start_time,
            "agents": self.agent_order,
        })

        agent_results = {}

        # ── Semaphore-limited parallel execution ──
        # Max 2 agents run concurrently to stay within 512MB RAM (Render free tier).
        # GeoValidator depends on Guardian, Strategist depends on all others.
        concurrency_limit = asyncio.Semaphore(2)

        async def _run_agent(agent_name: str, extra_results: dict = None):
            """Run a single agent with concurrency limit."""
            async with concurrency_limit:
                agent = self.agents[agent_name]

                if context.get("custom_prompts", {}).get(agent_name):
                    agent.system_prompt = context["custom_prompts"][agent_name]

                await self._notify_status(agent_name, "processing")
                await self._notify_log(agent_name, f"Agent {agent_name} starting...")

                run_context = {**context, "agent_results": {**agent_results, **(extra_results or {})}}
                result = await agent.execute(run_context)

                for log_entry in agent.logs:
                    await self._notify_log(agent_name, log_entry.message, log_entry.level)

                await self._notify_status(
                    agent_name,
                    result.status.value,
                    {"elapsed_time": agent.get_elapsed_time()},
                )

                self.results[agent_name] = agent.to_dict()
                return agent_name, result

        # Wave 1: Independent agents (max 2 at a time via semaphore)
        wave1_names = ["Guardian", "Forensic", "Historian", "Inspector", "DocumentComparator", "CadastralAnalyst"]
        wave1_tasks = [_run_agent(name) for name in wave1_names]
        wave1_results = await asyncio.gather(*wave1_tasks, return_exceptions=True)

        for i, item in enumerate(wave1_results):
            if isinstance(item, Exception):
                failed_name = wave1_names[i]
                await self._notify_log(failed_name, f"Agent selhal: {item}", "error")
                await self._notify_status(failed_name, "fail")
                self.results[failed_name] = {
                    "name": failed_name, "status": "fail",
                    "summary": f"Chyba: {item}", "errors": [str(item)],
                }
                continue
            name, result = item
            agent_results[name] = result

        # Wave 2: GeoValidator (depends on Guardian for front-photo classification)
        for name in ["GeoValidator"]:
            try:
                _, result = await _run_agent(name, agent_results)
                agent_results[name] = result
            except Exception as e:
                await self._notify_log(name, f"Agent selhal: {e}", "error")
                await self._notify_status(name, "fail")
                self.results[name] = {
                    "name": name, "status": "fail",
                    "summary": f"Chyba: {e}", "errors": [str(e)],
                }

        # Run Strategist with all previous results
        strategist = self.agents["Strategist"]
        strategist_context = {**context, "agent_results": agent_results}

        if context.get("custom_prompts", {}).get("Strategist"):
            strategist.system_prompt = context["custom_prompts"]["Strategist"]

        await self._notify_status("Strategist", "processing")
        await self._notify_log("Strategist", "Strategist aggregating all results...")

        try:
            strategist_result = await strategist.execute(strategist_context)
        except Exception as e:
            await self._notify_log("Strategist", f"Chyba Strategist: {e}", "error")
            strategist_result = AgentResult(
                status=AgentStatus.FAIL,
                summary=f"Strategist selhal: {e}",
                errors=[str(e)],
                details={"semaphore": "UNKNOWN", "semaphore_color": "gray"},
            )

        agent_results["Strategist"] = strategist_result

        for log_entry in strategist.logs:
            await self._notify_log("Strategist", log_entry.message, log_entry.level)

        await self._notify_status(
            "Strategist",
            strategist_result.status.value,
            {"elapsed_time": strategist.get_elapsed_time()},
        )

        self.results["Strategist"] = strategist.to_dict()

        total_time = round(time.time() - start_time, 2)
        self.is_running = False

        # Final pipeline result
        final_result = {
            "pipeline_id": self.pipeline_id,
            "session_id": self.session_id,
            "total_time": total_time,
            "semaphore": strategist_result.details.get("semaphore", "UNKNOWN"),
            "semaphore_color": strategist_result.details.get("semaphore_color", "gray"),
            "final_category": strategist_result.category,
            "agents": self.results,
        }

        await self.broadcast({
            "type": "pipeline_complete",
            "pipeline_id": self.pipeline_id,
            "result": final_result,
            "timestamp": time.time(),
        })

        return final_result

    def get_state(self) -> dict:
        """Get current pipeline state for API response."""
        return {
            "pipeline_id": self.pipeline_id,
            "session_id": self.session_id,
            "is_running": self.is_running,
            "agents": {
                name: agent.to_dict()
                for name, agent in self.agents.items()
            },
        }
