import os
import sys

# Ensure backend directory is in python search path
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, base_dir)

import uvicorn

if __name__ == "__main__":
    # Railway defaults to 8080 or injects PORT dynamically
    raw_port = os.environ.get("PORT", "8080")
    try:
        port = int(raw_port)
    except (ValueError, TypeError):
        port = 8080

    print("==================================================")
    print(f"  PharmaShield API starting on 0.0.0.0:{port}")
    print("==================================================", flush=True)

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_keep_alive=65,
        access_log=True,
    )
