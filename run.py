import os
import sys

# Ensure backend directory is in python search path
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, base_dir)
backend_dir = os.path.join(base_dir, "backend")
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)

import uvicorn

if __name__ == "__main__":
    raw_port = os.environ.get("PORT", "8000")
    try:
        port = int(raw_port)
    except (ValueError, TypeError):
        port = 8000

    print(f"==================================================")
    print(f"  PharmaShield API starting on 0.0.0.0:{port}     ")
    print(f"==================================================")

    uvicorn.run("app.main:app", host="0.0.0.0", port=port, workers=1)
