"""Single-process launch entry point; use scripts/start-public.ps1 in production."""
import os
from pathlib import Path
import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.app:app", app_dir=str(Path(__file__).resolve().parents[1]),
                host="127.0.0.1", port=int(os.environ.get("TAMAGO_PORT", "8078")), access_log=False)
