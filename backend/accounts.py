"""Password accounts and revocable server-side sessions; no plaintext secrets in SQLite."""
import hashlib
import secrets
import sqlite3
import threading
import time

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$")
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class Registration(Credentials):
    nickname: str = Field(min_length=1, max_length=24)
    password: SecretStr = Field(min_length=15, max_length=128)

    @field_validator("nickname", mode="before")
    @classmethod
    def trim_nickname(cls, value):
        return value.strip() if isinstance(value, str) else value


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr = Field(min_length=1, max_length=128)
    new_password: SecretStr = Field(min_length=15, max_length=128)


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def client_address(request):
    address = request.client.host if request.client else "local"
    # Only the loopback-bound origin trusts Cloudflare's overwritten client header.
    if address in ("127.0.0.1", "::1"):
        address = request.headers.get("cf-connecting-ip", address)
    return address


class Accounts:
    def __init__(self, connect, origin, session_days=30):
        self.connect = connect
        self.origin = origin
        self.lifetime = session_days * 86400
        self.hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, type=Type.ID)
        self.hash_slots = threading.BoundedSemaphore(4)
        self.dummy_hash = self.hasher.hash(secrets.token_urlsafe(32))

    def migrate(self):
        with self.connect() as c:
            columns = {row["name"] for row in c.execute("PRAGMA table_info(users)")}
            for name, kind in (("username", "TEXT"), ("password_hash", "TEXT"), ("registered", "INTEGER"), ("suspended", "INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0,1))")):
                if name not in columns:
                    c.execute(f"ALTER TABLE users ADD COLUMN {name} {kind}")
            c.executescript("""
            CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY, user TEXT NOT NULL, created INTEGER NOT NULL,
              expires INTEGER NOT NULL, FOREIGN KEY(user) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);
            CREATE TABLE IF NOT EXISTS auth_attempts (
              key TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS site_admin_owner (
              singleton INTEGER PRIMARY KEY CHECK(singleton=1),
              user TEXT UNIQUE NOT NULL REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS user_blocks (
              owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created INTEGER NOT NULL,
              PRIMARY KEY(owner,blocked),CHECK(owner<>blocked)
            );
            CREATE INDEX IF NOT EXISTS user_blocks_target ON user_blocks(blocked,owner);
            """)
            c.execute("INSERT OR IGNORE INTO site_admin_owner(singleton,user) SELECT 1,id FROM users WHERE username='momo' COLLATE NOCASE")

    def public(self, u):
        with self.connect() as c:
            admin = bool(c.execute('SELECT 1 FROM site_admin_owner WHERE user=?', (u['id'],)).fetchone())
        return {"id": u["id"], "username": u["username"], "nickname": u["nickname"], "site_admin": admin}

    @staticmethod
    def require_active(c, uid):
        if not c.execute('SELECT 1 FROM users WHERE id=? AND suspended=0', (uid,)).fetchone():
            raise HTTPException(401, '此帳號已停用，請聯絡管理員。')

    @staticmethod
    def blocked_ids(c, uid):
        return {row[0] for row in c.execute('SELECT blocked FROM user_blocks WHERE owner=? UNION SELECT owner FROM user_blocks WHERE blocked=?', (uid, uid))}

    @staticmethod
    def require_unblocked(c, uid, other):
        if c.execute('SELECT 1 FROM user_blocks WHERE (owner=? AND blocked=?) OR (owner=? AND blocked=?)', (uid, other, other, uid)).fetchone():
            raise HTTPException(403, '目前無法與這位使用者互動。')

    @staticmethod
    def require_publish(c, uid, eid):
        Accounts.require_active(c, uid)
        membership = c.execute('SELECT muted FROM members WHERE user=? AND expedition=?', (uid, eid)).fetchone()
        if not membership:
            raise HTTPException(403, '請先加入這支遠征隊。')
        if membership['muted']:
            raise HTTPException(403, '你在這支遠征隊已被禁言，暫時無法發布內容。')

    def current_user(self, request):
        token = request.cookies.get("tamago_session", "")
        with self.connect() as c:
            row = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user WHERE s.token_hash=? AND s.expires>? AND u.username IS NOT NULL AND u.suspended=0", (token_hash(token), int(time.time()))).fetchone()
        if row is None:
            raise HTTPException(401, "請先登入帳號。")
        return dict(row)

    def limit(self, category, subject, maximum, seconds):
        key = token_hash(category + ":" + subject)
        stamp = int(time.time())
        with self.connect() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT window,attempts FROM auth_attempts WHERE key=?", (key,)).fetchone()
            count = row["attempts"] if row and row["window"] > stamp-seconds else 0
            start = row["window"] if count else stamp
            if count >= maximum:
                raise HTTPException(429, "嘗試次數過多，請稍後再試。", headers={"Retry-After": str(max(1,start+seconds-stamp))})
            c.execute("INSERT INTO auth_attempts VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET window=excluded.window,attempts=excluded.attempts", (key,start,count+1))

    def hash_password(self, password):
        if not self.hash_slots.acquire(blocking=False):
            raise HTTPException(429, "登入服務忙碌，請稍後再試。")
        try:
            return self.hasher.hash(password)
        finally:
            self.hash_slots.release()

    def verify_password(self, encoded, password):
        if not self.hash_slots.acquire(blocking=False):
            raise HTTPException(429, "登入服務忙碌，請稍後再試。")
        try:
            try:
                return self.hasher.verify(encoded or self.dummy_hash, password)
            except (VerificationError, InvalidHashError):
                return False
        finally:
            self.hash_slots.release()

    def issue(self, c, user_id, response, previous_token=""):
        self.require_active(c, user_id)
        stamp = int(time.time())
        c.execute("DELETE FROM sessions WHERE token_hash=? OR expires<=?", (token_hash(previous_token),stamp))
        token = secrets.token_urlsafe(32)
        c.execute("INSERT INTO sessions VALUES(?,?,?,?)", (token_hash(token),user_id,stamp,stamp+self.lifetime))
        response.set_cookie("tamago_session", token, max_age=self.lifetime, httponly=True, secure=self.origin.startswith("https:"), samesite="lax")

    def install(self, app):
        @app.post("/api/auth/register", status_code=201)
        def register(body: Registration, request: Request, response: Response):
            self.limit("register-ip",client_address(request),30,3600)
            try:
                self.current_user(request)
            except HTTPException as e:
                if e.status_code != 401:
                    raise
            else:
                raise HTTPException(409,"請先登出，再註冊另一個帳號。")
            encoded = self.hash_password(body.password.get_secret_value())
            previous = request.cookies.get("tamago_session", "")
            with self.connect() as c:
                c.execute("BEGIN IMMEDIATE")
                legacy = c.execute("SELECT id FROM users WHERE token=? AND expires>? AND username IS NULL", (previous,int(time.time()))).fetchone()
                user_id = legacy["id"] if legacy else secrets.token_hex(12)
                try:
                    if legacy:
                        c.execute("UPDATE users SET username=?,password_hash=?,nickname=?,registered=?,token=? WHERE id=?", (body.username,encoded,body.nickname,int(time.time()),secrets.token_urlsafe(32),user_id))
                    else:
                        c.execute("INSERT INTO users(id,token,nickname,expires,username,password_hash,registered) VALUES(?,?,?,?,?,?,?)", (user_id,secrets.token_urlsafe(32),body.nickname,int(time.time())+self.lifetime,body.username,encoded,int(time.time())))
                except sqlite3.IntegrityError:
                    raise HTTPException(409,"這個帳號名稱無法使用，請換一個。") from None
                self.issue(c,user_id,response,previous)
                result = dict(c.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone())
            return self.public(result)

        @app.post("/api/auth/login")
        def login(body: Credentials, request: Request, response: Response):
            self.limit("login-ip",client_address(request),60,300)
            self.limit("login-user",body.username,10,900)
            with self.connect() as c:
                row = c.execute("SELECT * FROM users WHERE username=?", (body.username,)).fetchone()
            encoded = row["password_hash"] if row else None
            valid = self.verify_password(encoded,body.password.get_secret_value())
            if row is None or not valid:
                raise HTTPException(401,"帳號或密碼不正確。")
            replacement = self.hash_password(body.password.get_secret_value()) if self.hasher.check_needs_rehash(encoded) else encoded
            with self.connect() as c:
                c.execute("BEGIN IMMEDIATE")
                self.require_active(c, row['id'])
                # Reject a concurrent password change that happened during verification.
                current = c.execute("SELECT password_hash FROM users WHERE id=?",(row["id"],)).fetchone()
                if current["password_hash"] != encoded:
                    raise HTTPException(401,"帳號或密碼不正確。")
                c.execute("UPDATE users SET password_hash=? WHERE id=?",(replacement,row["id"]))
                c.execute("DELETE FROM auth_attempts WHERE key=?",(token_hash("login-user:"+body.username),))
                self.issue(c,row["id"],response,request.cookies.get("tamago_session", ""))
            return self.public(dict(row))

        @app.post("/api/auth/logout")
        def logout(request: Request, response: Response):
            token = request.cookies.get("tamago_session", "")
            with self.connect() as c:
                row = c.execute("SELECT user FROM sessions WHERE token_hash=?",(token_hash(token),)).fetchone()
                if row:
                    c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=?", (row["user"],))
                    c.execute("DELETE FROM friend_locations WHERE user=?", (row["user"],))
                    c.execute('DELETE FROM help_locations WHERE user=?',(row['user'],))
                c.execute("DELETE FROM sessions WHERE token_hash=?",(token_hash(token),))
            response.delete_cookie("tamago_session",httponly=True,secure=self.origin.startswith("https:"),samesite="lax")
            return {"ok":True}

        @app.post("/api/auth/password")
        def change_password(body: PasswordChange, request: Request, response: Response):
            u = self.current_user(request)
            self.limit("password-user",u["id"],10,900)
            if not self.verify_password(u["password_hash"],body.current_password.get_secret_value()):
                raise HTTPException(401,"目前密碼不正確。")
            encoded = self.hash_password(body.new_password.get_secret_value())
            with self.connect() as c:
                c.execute("BEGIN IMMEDIATE")
                changed = c.execute("UPDATE users SET password_hash=? WHERE id=? AND password_hash=?",(encoded,u["id"],u["password_hash"])).rowcount
                if not changed:
                    raise HTTPException(409,"密碼已變更，請重新登入。")
                c.execute("DELETE FROM sessions WHERE user=?",(u["id"],))
                c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=?",(u["id"],))
                c.execute("DELETE FROM friend_locations WHERE user=?", (u["id"],))
                c.execute('DELETE FROM help_locations WHERE user=?',(u['id'],))
                self.issue(c,u["id"],response)
            return {"ok":True}
