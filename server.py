"""Single-process launch entry point; use scripts/start-public.ps1 in production."""
import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=int(os.environ.get("TAMAGO_PORT", "8078")), access_log=False)
