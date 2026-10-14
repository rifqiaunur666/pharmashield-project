"""
app/services/scheduler_worker.py
PharmaShield — High-Precision In-Memory & Cron Scheduler Worker.

Runs every 60 seconds as an asynchronous background worker inside the FastAPI lifecycle,
evaluating precision reminder events and dispatching Meta Cloud API payloads.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.services.reminder_service import reminder_engine

logger = logging.getLogger(__name__)


class PrecisionSchedulerWorker:
    def __init__(self):
        self._is_running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        if self._is_running:
            return
        self._is_running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("[SchedulerWorker] High-precision background reminder worker started.")

    async def stop(self):
        self._is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("[SchedulerWorker] Background reminder worker stopped.")

    async def _worker_loop(self):
        while self._is_running:
            try:
                # Run evaluations for H-15M, H-0M, and Timeouts
                counts = await reminder_engine.evaluate_and_dispatch_reminders()
                if any(counts.values()):
                    logger.info("[SchedulerWorker] Tick executed: %s", counts)
            except Exception as exc:
                logger.error("[SchedulerWorker] Unexpected error in worker tick: %s", exc)

            # Sleep 30 seconds for higher precision matching
            await asyncio.sleep(30)


scheduler_worker = PrecisionSchedulerWorker()
