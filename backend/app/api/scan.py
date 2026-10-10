"""
app/api/scan.py
Re-exports endpoints.router for backwards compatibility.
"""
from app.api.endpoints import router, scan_medicine

__all__ = ["router", "scan_medicine"]