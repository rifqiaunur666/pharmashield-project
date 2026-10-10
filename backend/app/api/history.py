"""
app/api/history.py
Re-exports endpoints.router for backwards compatibility.
"""
from app.api.endpoints import (
    router,
    get_history,
    get_stats,
    delete_history_item,
    clear_all_history,
)

__all__ = ["router", "get_history", "get_stats", "delete_history_item", "clear_all_history"]
