"""
services/safety_evaluator.py
Re-exports from app.services.safety_evaluator for backward compatibility.
"""
from app.services.safety_evaluator import (
    evaluate_safety,
    SafetyResult,
    WARNING_THRESHOLD_DAYS,
)

__all__ = ["evaluate_safety", "SafetyResult", "WARNING_THRESHOLD_DAYS"]
