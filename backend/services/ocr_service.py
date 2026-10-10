"""
services/ocr_service.py
Re-exports from app.services.ocr_service for backward compatibility.
"""
from app.services.ocr_service import (
    extract_medicine_info,
    parse_dates_from_text,
    ExtractedMedicine,
)

__all__ = ["extract_medicine_info", "parse_dates_from_text", "ExtractedMedicine"]
