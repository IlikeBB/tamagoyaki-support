"""Verify HTTPS session cookies with one temporary identity, then remove that identity."""
from pathlib import Path
import secrets
import sqlite3
import httpx

origin = "https://tamagoyaki-support.modoubletw.com"
nickname = "QA-" + secrets.token_hex(8)
username = "qa_" + secrets.token_hex(8)
password = secrets.token_urlsafe(32)
identity = None
try:
    with httpx.Client(base_url=origin, timeout=20, headers={"X-Tamago-Client":"web", "Origin":origin}) as client:
        health = client.get("/api/health")
        health.raise_for_status()
        assert health.json()["name"] == "tamagoyaki_support"
        assert health.json()["version"] == "1.1.0"
        response = client.post("/api/auth/register",json={"username":username,"password":password,"nickname":nickname})
        response.raise_for_status()
        identity = response.json()["id"]
        cookie = response.headers["set-cookie"].lower()
        assert all(flag in cookie for flag in ("secure", "httponly", "samesite=lax"))
        assert client.get("/api/me").json()["user"]["id"] == identity
        blocked = client.post("/api/profile",json={"nickname":nickname},headers={"Origin":"https://invalid.example"})
        assert blocked.status_code == 403
        assert client.get("/api/me").headers["cache-control"] == "no-store"
        token = client.cookies.get("tamago_session")
        client.post("/api/auth/logout").raise_for_status()
        assert client.get("/api/me").json()["user"] is None
        signed_out = client.get("/api/me",headers={"Cookie":"tamago_session="+token})
        assert signed_out.json()["user"] is None
        client.post("/api/auth/login",json={"username":username,"password":password}).raise_for_status()
        assert client.get("/api/me").json()["user"]["id"] == identity
        client.post("/api/auth/logout").raise_for_status()
        print("HTTPS registration/login/logout, Secure/HttpOnly/SameSite cookie, revoked session and foreign-origin rejection: PASS")
finally:
    if identity:
        database = Path(__file__).resolve().parents[1]/"data"/"tamagoyaki.sqlite3"
        with sqlite3.connect(database) as db:
            db.execute("PRAGMA foreign_keys=ON")
            # Remove only the exact disposable identity created by this run.
            db.execute("DELETE FROM users WHERE id=? AND nickname=? AND id NOT IN (SELECT user FROM members)", (identity,nickname))
