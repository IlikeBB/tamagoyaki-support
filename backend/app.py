"""Tamagoyaki Support: invitation-only live-event rendezvous, Python + SQLite."""
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict, deque
import asyncio
import json
import os
import re
import secrets
import sqlite3
import time

from fastapi import FastAPI, HTTPException, Request, Response, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Literal
from .accounts import Accounts, client_address
from .friends import Friends
from .places import Places
from .assistance import Assistance
from .chat import Chat
from .reputation import Reputation
from .profile_media import ProfileMedia
from .profiles import Profiles

ROOT = Path(__file__).resolve().parents[1]
DB = Path(os.environ.get("TAMAGO_DB", str(ROOT / "data" / "tamagoyaki.sqlite3")))
PUBLIC_ORIGIN = os.environ.get("TAMAGO_ORIGIN", "http://127.0.0.1:8078")
SESSION_DAYS = 30
LIVE_SECONDS = 120
LOCATION_TTL_SECONDS = 15 * 60
VENUES = [
    # Venue pin linked by https://www.m-messe.co.jp/access/?hl=ja
    {"id": "makuhari", "name": "幕張メッセ", "short": "幕張", "lat": 35.6482, "lng": 140.0346703},
    # Centre from the map embedded by Yokohama's official visitors guide:
    # https://www.welcome.city.yokohama.jp/spot/details.php?bbid=885
    {"id": "k-arena", "name": "Kアリーナ横浜", "short": "K 橫", "lat": 35.4645775, "lng": 139.6306334},
    # MapFan venue point, checked against https://pia-arena-mm.jp/access/:
    # https://mapfan.com/spots/SC3AH%2CJ%2C1M0
    {"id": "pia", "name": "ぴあアリーナMM", "short": "PIA", "lat": 35.4557702, "lng": 139.6284058},
    # Venue pin linked by https://ariake-arena.tokyo/english/ (Google Map).
    {"id": "ariake", "name": "有明アリーナ", "short": "有明", "lat": 35.6433718, "lng": 139.7941814},
]
ACTIVITY_VENUES = VENUES + [
    {"id": "taiwan", "name": "台灣", "short": "台灣", "kind": "region"},
    {"id": "japan", "name": "日本", "short": "日本", "kind": "region"},
]


def map_settings():
    """Only expose the restricted browser key; never expose the local file itself."""
    if os.environ.get("TAMAGO_MAP_PROVIDER") == "leaflet":
        return {"provider": "leaflet"}
    path = Path(os.environ.get("TAMAGO_GOOGLE_MAPS_CONFIG", str(ROOT / "google-maps.local.json")))
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        key = data.get("apiKey", "").strip()
        if not re.fullmatch(r"AIza[A-Za-z0-9_-]{30,}", key):
            return {"provider": "leaflet"}
        language = data.get("language", "zh-TW")
        region = data.get("region", "JP")
        return {"provider": "google", "api_key": key,
                "language": language if isinstance(language, str) and re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z]{2,4})?", language) else "zh-TW",
                "region": region if isinstance(region, str) and re.fullmatch(r"[A-Z]{2}", region) else "JP"}
    except (OSError, ValueError, AttributeError, TypeError):
        return {"provider": "leaflet"}


def now():
    return int(time.time())


@contextmanager
def connect():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


accounts = Accounts(connect, PUBLIC_ORIGIN, SESSION_DAYS)
assistance = Assistance(connect, accounts, LOCATION_TTL_SECONDS)
friends = Friends(connect, accounts, LOCATION_TTL_SECONDS, help_required=assistance.required, fresh_seconds=LIVE_SECONDS)
places = Places(VENUES, PUBLIC_ORIGIN)
chat = Chat(connect, accounts)
reputation = Reputation(connect, accounts)
profile_media = ProfileMedia(connect, accounts)
profiles = Profiles(connect, accounts, profile_media, reputation, ACTIVITY_VENUES)


def prune_empty_squads(c, eid=None):
    c.execute('''DELETE FROM squads WHERE (? IS NULL OR expedition=?)
      AND NOT EXISTS (SELECT 1 FROM members WHERE members.squad=squads.id)''',(eid,eid))


def init_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL,
          expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS expeditions (
          id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          venue TEXT NOT NULL, event_date TEXT NOT NULL, owner TEXT NOT NULL,
          created INTEGER NOT NULL, FOREIGN KEY(owner) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS squads (
          id TEXT PRIMARY KEY, expedition TEXT NOT NULL, name TEXT NOT NULL,
          code TEXT UNIQUE NOT NULL, FOREIGN KEY(expedition) REFERENCES expeditions(id)
        );
        CREATE TABLE IF NOT EXISTS members (
          user TEXT NOT NULL, expedition TEXT NOT NULL, squad TEXT,
          scope TEXT NOT NULL DEFAULT 'off', lat REAL, lng REAL, accuracy REAL,
          located INTEGER, seen INTEGER NOT NULL,
          PRIMARY KEY(user, expedition), FOREIGN KEY(user) REFERENCES users(id),
          FOREIGN KEY(expedition) REFERENCES expeditions(id), FOREIGN KEY(squad) REFERENCES squads(id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, expedition TEXT NOT NULL, owner TEXT NOT NULL,
          title TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL,
          lat REAL NOT NULL, lng REAL NOT NULL, status TEXT NOT NULL DEFAULT 'open',
          assignee TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL,
          FOREIGN KEY(expedition) REFERENCES expeditions(id), FOREIGN KEY(owner) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS pins (
          id TEXT PRIMARY KEY, expedition TEXT NOT NULL, owner TEXT NOT NULL,
          title TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL,
          lat REAL NOT NULL, lng REAL NOT NULL, created INTEGER NOT NULL, expires INTEGER,
          FOREIGN KEY(expedition) REFERENCES expeditions(id), FOREIGN KEY(owner) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS tasks_expedition ON tasks(expedition);
        CREATE INDEX IF NOT EXISTS pins_expedition ON pins(expedition);
        CREATE INDEX IF NOT EXISTS members_squad ON members(squad);
        """)
        prune_empty_squads(c)
    accounts.migrate()
    friends.migrate()
    with connect() as c:
        columns = {row['name'] for row in c.execute('PRAGMA table_info(expeditions)')}
        if 'discoverable' not in columns:
            c.execute('ALTER TABLE expeditions ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 0')
        c.execute('CREATE INDEX IF NOT EXISTS expeditions_venue_public ON expeditions(venue,discoverable)')
        task_columns = {row['name'] for row in c.execute('PRAGMA table_info(tasks)')}
        if 'location_mode' not in task_columns:
            c.execute("ALTER TABLE tasks ADD COLUMN location_mode TEXT NOT NULL DEFAULT 'publisher' CHECK(location_mode IN ('publisher','fixed'))")
    assistance.migrate()
    chat.migrate()
    reputation.migrate()
    profile_media.migrate()
    profiles.migrate()


def cleanup():
    with connect() as c:
        c.execute("UPDATE members SET lat=NULL,lng=NULL,accuracy=NULL,located=NULL,scope='off' WHERE located < ?", (now()-LOCATION_TTL_SECONDS,))
        c.execute("DELETE FROM sessions WHERE expires<=?",(now(),))
        c.execute("DELETE FROM auth_attempts WHERE window<?",(now()-86400,))
        c.execute("DELETE FROM friend_locations WHERE located<?", (now()-LOCATION_TTL_SECONDS,))
        c.execute('DELETE FROM help_locations WHERE located<?',(now()-LOCATION_TTL_SECONDS,))
        c.execute("DELETE FROM users WHERE username IS NULL AND expires < ? AND id NOT IN (SELECT owner FROM expeditions UNION SELECT user FROM members UNION SELECT owner FROM tasks UNION SELECT owner FROM pins)", (now(),))


@asynccontextmanager
async def lifespan(app):
    init_db()
    async def maintain():
        while True:
            cleanup()
            await asyncio.sleep(60)
    worker = asyncio.create_task(maintain())
    yield
    worker.cancel()
    try:
        await worker
    except asyncio.CancelledError:
        pass


app = FastAPI(title="玉子燒支援隊", lifespan=lifespan, docs_url=None, redoc_url=None)
accounts.install(app)
friends.install(app)
assistance.install(app)
chat.install(app)
reputation.install(app)
profile_media.install(app)
profiles.install(app)
limits = defaultdict(deque)
last_prune = 0


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc):
    if request.url.path.startswith("/api/auth/"):
        return JSONResponse({"detail":"請檢查帳號格式、暱稱及密碼長度；新密碼需為 15–128 個字元。"},status_code=422)
    return await request_validation_exception_handler(request,exc)


@app.middleware("http")
async def protect(request: Request, call_next):
    global last_prune
    request.state.csp_nonce = secrets.token_urlsafe(24)
    if request.url.path.startswith("/api/"):
        key = client_address(request)
        bucket = limits[key]
        stamp = time.monotonic()
        while bucket and bucket[0] < stamp-60:
            bucket.popleft()
        if len(bucket) >= 600:
            return JSONResponse({"detail": "操作太快，請稍後再試。"}, status_code=429)
        bucket.append(stamp)
        if stamp-last_prune > 60:
            for k in list(limits):
                if not limits[k] or limits[k][-1] < stamp-60:
                    del limits[k]
            last_prune = stamp
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("x-tamago-client") != "web":
                return JSONResponse({"detail": "缺少請求驗證。"}, status_code=403)
            origin = request.headers.get("origin")
            allowed = {PUBLIC_ORIGIN, "http://127.0.0.1:8078", "http://localhost:8078"}
            if origin and origin not in allowed:
                return JSONResponse({"detail": "不允許的來源。"}, status_code=403)
        try:
            length = int(request.headers.get("content-length", "0") or "0")
        except ValueError:
            return JSONResponse({"detail": "無效的請求長度。"}, status_code=400)
        media_upload = request.method == 'PUT' and re.fullmatch(r'/api/profiles/me/media/(avatar|banner)',request.url.path)
        if length > (2_900_000 if media_upload else 16384):
            return JSONResponse({"detail": "內容太長。"}, status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=()"
    response.headers["Content-Security-Policy"] = (
        f"default-src 'self'; script-src 'nonce-{request.state.csp_nonce}' 'strict-dynamic'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; "
        "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com data: blob:; "
        "font-src 'self' https://fonts.gstatic.com; frame-src https://*.google.com; worker-src 'self' blob:; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Profile(Input):
    nickname: str = Field(min_length=1, max_length=24)


class ExpeditionInput(Input):
    name: str = Field(min_length=1, max_length=60)
    venue: str
    event_date: date | None = None
    discoverable: bool = True

    @field_validator('event_date',mode='before')
    @classmethod
    def empty_date(cls,value):
        return None if isinstance(value,str) and not value.strip() else value


class Join(Input):
    code: str = Field(min_length=6, max_length=12, pattern=r"^[A-Za-z0-9]+$")


class SquadInput(Input):
    name: str = Field(min_length=1, max_length=30)


class Position(Input):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class Location(Position):
    accuracy: float = Field(ge=0, le=100000, allow_inf_nan=False)
    scope: Literal["task", "expedition"]


class TaskInput(Position):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=600)
    kind: Literal["trade", "bounty", "giveaway", "help", "dining"]
    hours: int = Field(default=6, ge=1, le=72)
    location_mode: Literal["publisher", "fixed"] = "publisher"
    help_broadcast: bool = False
    accuracy: float | None = Field(default=None,ge=0,le=100000,allow_inf_nan=False)


class PinInput(Position):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=600)
    kind: Literal["booth", "toilet", "shop", "meet", "other", "message"]
    hours: int = Field(default=6, ge=0, le=168)


def user(request):
    return accounts.current_user(request)


def member(request, expedition):
    u = user(request)
    with connect() as c:
        row = c.execute("SELECT * FROM members WHERE user=? AND expedition=?", (u["id"], expedition)).fetchone()
    if row is None:
        raise HTTPException(403, "需要遠征隊邀請碼才能查看。")
    return u, dict(row)


def code():
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))


@app.get("/api/health")
def health():
    return {"ok": True, "name": "tamagoyaki_support", "version": "1.2.0"}


@app.get("/api/config")
def config():
    return {"venues": VENUES, "activity_venues": ACTIVITY_VENUES, "location_ttl": LOCATION_TTL_SECONDS, "location_fresh_seconds": LIVE_SECONDS, "poll_seconds": 5, "tile_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "maps": map_settings()}


@app.get('/api/places/search')
def search_places(q: str = Query(min_length=2,max_length=120)):
    return {'results':places.search(q)}


@app.get("/api/me")
def me(request: Request):
    try:
        u = user(request)
    except HTTPException:
        return {"user": None, "expeditions": []}
    with connect() as c:
        rooms = [dict(r) for r in c.execute("SELECT e.* FROM expeditions e JOIN members m ON m.expedition=e.id WHERE m.user=? ORDER BY e.created DESC", (u["id"],))]
        help_rooms=assistance.rooms(c,u['id'])
        account = {**accounts.public(u), **profiles.public(c,u['id'])}
    return {"user": account, "expeditions": rooms, "help_rooms":help_rooms}


@app.post("/api/profile")
def profile(body: Profile, request: Request, response: Response):
    u = user(request)
    with connect() as c:
        c.execute("UPDATE users SET nickname=? WHERE id=?", (body.nickname,u["id"]))
    return {"id": u["id"], "username":u["username"], "nickname": body.nickname}


@app.post("/api/expeditions")
def create_expedition(body: ExpeditionInput, request: Request):
    u = user(request)
    if body.venue not in {v["id"] for v in ACTIVITY_VENUES}:
        raise HTTPException(422, "請選擇會場。")
    japan_today = datetime.now(timezone(timedelta(hours=9))).date()
    if body.event_date is not None and not japan_today-timedelta(days=1) <= body.event_date <= japan_today+timedelta(days=730):
        raise HTTPException(422, "活動日期需介於昨天與未來兩年。")
    room = {"id": secrets.token_hex(12), "code": code(), "name": body.name, "venue": body.venue, "event_date": body.event_date.isoformat() if body.event_date else '', "owner": u["id"], "created": now(), "discoverable":int(body.discoverable)}
    with connect() as c:
        if c.execute("SELECT COUNT(*) FROM expeditions WHERE owner=?", (u["id"],)).fetchone()[0] >= 30:
            raise HTTPException(409, "每個使用者最多建立 30 個遠征隊。")
        c.execute("INSERT INTO expeditions(id,code,name,venue,event_date,owner,created,discoverable) VALUES(:id,:code,:name,:venue,:event_date,:owner,:created,:discoverable)", room)
        c.execute("INSERT INTO members(user,expedition,seen) VALUES(?,?,?)", (u["id"], room["id"], now()))
        profiles.joined(c,u['id'],room['id'])
    return room


@app.get('/api/expeditions/owned')
def owned_expeditions(request: Request):
    u=user(request)
    with connect() as c:
        rooms=[dict(row) for row in c.execute('''SELECT id,name,venue,event_date,owner FROM expeditions
          WHERE owner=? ORDER BY created DESC,id''',(u['id'],))]
    return {'expeditions':rooms}


@app.delete('/api/expeditions/{eid}')
def delete_expedition(eid: str,request: Request):
    u=user(request)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        room=c.execute('SELECT * FROM expeditions WHERE id=?',(eid,)).fetchone()
        if not room:raise HTTPException(404,'這支遠征隊已不存在。')
        if room['owner']!=u['id']:raise HTTPException(403,'只有建立這支遠征隊的隊長可以刪除。')
        profiles.archive_room(c,eid)
        stamp=now()
        c.execute('''INSERT OR IGNORE INTO expedition_history
          SELECT user,expedition,?,? FROM members WHERE expedition=?''',(stamp,stamp,eid))
        for pin in c.execute('SELECT * FROM pins WHERE expedition=?',(eid,)).fetchall():
            reputation.record(c,dict(pin))
        c.execute('DELETE FROM help_locations WHERE expedition=?',(eid,))
        c.execute('DELETE FROM tasks WHERE expedition=?',(eid,))
        c.execute('DELETE FROM pins WHERE expedition=?',(eid,))
        c.execute('DELETE FROM members WHERE expedition=?',(eid,))
        c.execute('DELETE FROM squads WHERE expedition=?',(eid,))
        c.execute("DELETE FROM chat_messages WHERE kind='expedition' AND thread=?",(eid,))
        c.execute("DELETE FROM chat_reads WHERE kind='expedition' AND thread=?",(eid,))
        c.execute('DELETE FROM expeditions WHERE id=?',(eid,))
        help_rooms=assistance.rooms(c,u['id'])
    return {'ok':True,'help_rooms':help_rooms}


@app.get('/api/venues/{vid}/expeditions')
def venue_expeditions(vid: str):
    if vid not in {v['id'] for v in ACTIVITY_VENUES}:
        raise HTTPException(404,'找不到這個場館。')
    today = str(datetime.now(timezone(timedelta(hours=9))).date())
    with connect() as c:
        rows = c.execute('''SELECT e.id,e.name,e.venue,e.event_date,
          (SELECT COUNT(*) FROM members m WHERE m.expedition=e.id) AS member_count
          FROM expeditions e WHERE e.venue=? AND e.discoverable=1 AND (e.event_date='' OR e.event_date>=?)
          ORDER BY (e.event_date=''),e.event_date,e.created DESC,e.id''',(vid,today))
        rooms = [dict(row) for row in rows]
    return {'expeditions':rooms}


@app.post('/api/expeditions/{eid}/join')
def join_public_expedition(eid: str, request: Request):
    u = user(request)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        room = c.execute('SELECT * FROM expeditions WHERE id=? AND discoverable=1',(eid,)).fetchone()
        if room is None:
            raise HTTPException(404,'找不到可公開加入的遠征隊，私人隊伍需使用邀請碼。')
        c.execute('INSERT OR IGNORE INTO members(user,expedition,seen) VALUES(?,?,?)',(u['id'],eid,now()))
        profiles.joined(c,u['id'],eid)
    return dict(room)


@app.post("/api/join")
def join(body: Join, request: Request):
    u = user(request)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        room = c.execute("SELECT * FROM expeditions WHERE code=?", (body.code.upper(),)).fetchone()
        if room is None:
            raise HTTPException(404, "找不到這個邀請碼，請向隊長確認。")
        c.execute("INSERT OR IGNORE INTO members(user,expedition,seen) VALUES(?,?,?)", (u["id"], room["id"], now()))
        profiles.joined(c,u['id'],room['id'])
    return dict(room)


@app.get("/api/expeditions/{eid}")
def snapshot(eid: str, request: Request):
    u, mine = member(request, eid)
    stamp = now()
    with connect() as c:
        c.execute("UPDATE members SET seen=? WHERE user=? AND expedition=?", (stamp, u["id"], eid))
        room = dict(c.execute("SELECT * FROM expeditions WHERE id=?", (eid,)).fetchone())
        members = []
        help_positions=assistance.positions(c,eid)
        help_rooms=assistance.rooms(c,u['id'])
        private_positions = {}
        for row in c.execute("SELECT m.*,u.nickname FROM members m JOIN users u ON u.id=m.user WHERE m.expedition=? ORDER BY m.seen DESC", (eid,)):
            p = dict(row)
            p['avatar_url'] = profile_media.urls(c,p['user'])['avatar_url']
            private_positions[p['user']] = dict(p)
            p["online"] = p["seen"] >= stamp-40
            # Membership alone never opts a user into location sharing.
            visible = (p['user'] != u['id'] and p['scope'] == 'expedition'
                       and p['located'] is not None and p['located'] >= stamp-LOCATION_TTL_SECONDS)
            p['location_visible'] = visible
            help_point=help_positions.get(p['user'])
            p['help_shared']=bool(help_point)
            if help_point and p['user']!=u['id']:
                p.update(lat=help_point['lat'],lng=help_point['lng'],accuracy=help_point['accuracy'],located=help_point['located'],scope='expedition',location_visible=True)
                visible=True
            if not visible:
                for key in ("lat", "lng", "accuracy", "located"):
                    p[key] = None
            if p['user'] != u['id'] and not visible:
                p['scope'] = 'off'
            p['location_status'] = ('live' if p['located'] >= stamp-LIVE_SECONDS else 'last_known') if visible else None
            members.append(p)
        squads = []
        for row in c.execute("SELECT * FROM squads WHERE expedition=?", (eid,)):
            squad = dict(row)
            if squad["id"] != mine["squad"]:
                squad.pop("code")
            squads.append(squad)
        tasks = []
        for row in c.execute("SELECT t.*,u.nickname AS owner_name,a.nickname AS assignee_name FROM tasks t JOIN users u ON u.id=t.owner LEFT JOIN users a ON a.id=t.assignee WHERE t.expedition=? AND (t.expires>? OR (t.help_active=1 AND t.status IN ('open','accepted'))) ORDER BY t.created DESC", (eid,stamp)):
            task = dict(row)
            task['owner_avatar_url'] = profile_media.urls(c,task['owner'])['avatar_url']
            help_point=help_positions.get(task['owner']) if task['help_active'] and task['status'] in ('open','accepted') else None
            visible = bool(help_point) if task['help_active'] else task['owner'] == u['id'] or (task['status'] == 'accepted' and task['assignee'] == u['id'])
            task['location_visible'] = visible
            task['location_source'] = None
            task['accuracy'] = None
            task['located'] = None
            task['location_status'] = None
            if visible:
                position = private_positions.get(task['owner'])
                if task['help_active']:
                    task.update(lat=help_point['lat'],lng=help_point['lng'],accuracy=help_point['accuracy'],located=help_point['located'],location_source='help')
                elif task['location_mode'] == 'fixed':
                    task.update(location_source='fixed',located=task['created'])
                elif position and position['scope'] in ('task','expedition') and position['located'] is not None and position['located']>=stamp-LOCATION_TTL_SECONDS:
                    task.update(lat=position['lat'],lng=position['lng'],accuracy=position['accuracy'],located=position['located'],location_source='live' if position['located']>=stamp-LIVE_SECONDS else 'last_known')
                else:
                    task.update(location_source='published',located=task['created'])
                if task['location_source'] in ('help','live','last_known'):
                    task['location_status'] = 'live' if task['located']>=stamp-LIVE_SECONDS else 'last_known'
            else:
                task['lat'] = None
                task['lng'] = None
            tasks.append(task)
        pins = [dict(r) for r in c.execute("SELECT p.*,u.nickname AS owner_name FROM pins p JOIN users u ON u.id=p.owner WHERE expedition=? AND (p.expires IS NULL OR p.expires>?) ORDER BY p.created DESC", (eid,stamp))]
        for pin in pins:
            pin['can_delete'] = u['id'] in (pin['owner'], room['owner'])
            pin['owner_avatar_url'] = profile_media.urls(c,pin['owner'])['avatar_url']
        reputation.annotate(c,pins,u['id'])
    return {"room": room, "me": mine, "members": members, "squads": squads, "tasks": tasks, "pins": pins, "server_time": stamp,"help_rooms":help_rooms}


@app.post("/api/expeditions/{eid}/squads")
def create_squad(eid: str, body: SquadInput, request: Request):
    u, _ = member(request, eid)
    squad = {"id": secrets.token_hex(10), "expedition": eid, "name": body.name, "code": code()}
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(u['id'],eid)).fetchone():
            raise HTTPException(403,'請先加入這支遠征隊。')
        if c.execute("SELECT COUNT(*) FROM squads WHERE expedition=?", (eid,)).fetchone()[0] >= 100:
            raise HTTPException(409, "小隊數量已達上限。")
        c.execute("INSERT INTO squads VALUES(:id,:expedition,:name,:code)", squad)
        c.execute("UPDATE members SET squad=?,scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=? AND expedition=?", (squad["id"], u["id"], eid))
        prune_empty_squads(c,eid)
    return squad


@app.post("/api/expeditions/{eid}/squads/join")
def join_squad(eid: str, body: Join, request: Request):
    u, _ = member(request, eid)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(u['id'],eid)).fetchone():
            raise HTTPException(403,'請先加入這支遠征隊。')
        s = c.execute("SELECT * FROM squads WHERE expedition=? AND code=?", (eid,body.code.upper())).fetchone()
        if s is None:
            raise HTTPException(404, "找不到這個小隊邀請碼。")
        c.execute("UPDATE members SET squad=?,scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=? AND expedition=?", (s["id"],u["id"],eid))
        prune_empty_squads(c,eid)
    return dict(s)


@app.delete('/api/expeditions/{eid}/squads/{sid}/membership')
def leave_squad(eid: str, sid: str, request: Request):
    u,_=member(request,eid)
    with connect() as c:
        changed=c.execute("""UPDATE members SET squad=NULL,scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL
          WHERE user=? AND expedition=? AND squad=?""",(u['id'],eid,sid)).rowcount
        if not changed:
            raise HTTPException(409,'目前小隊已變更，請重新整理後操作。')
        prune_empty_squads(c,eid)
    return {'ok':True}


@app.put("/api/expeditions/{eid}/location")
def locate(eid: str, body: Location, request: Request):
    u, m = member(request,eid)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        # Recheck membership inside the write transaction, including concurrent exits.
        if not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(u['id'],eid)).fetchone():
            raise HTTPException(403,'請先加入這支遠征隊。')
        if assistance.required(c,u['id']):
            raise HTTPException(409,'求助期間須持續分享給求助所在遠征隊；請先刪除求助任務。')
        active = c.execute("SELECT 1 FROM tasks WHERE expedition=? AND owner=? AND location_mode='publisher' AND status IN ('open','accepted') AND expires>? LIMIT 1",(eid,u['id'],now())).fetchone()
        if body.scope == 'task' and not active:
            raise HTTPException(409,'尚未發布進行中的任務，定位只需保留在本機。')
        c.execute('DELETE FROM friend_locations WHERE user=?',(u['id'],))
        c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=? AND expedition<>?",(u['id'],eid))
        c.execute("UPDATE members SET lat=?,lng=?,accuracy=?,scope=?,located=?,seen=? WHERE user=? AND expedition=?", (body.lat,body.lng,body.accuracy,body.scope,now(),now(),u["id"],eid))
    return {"ok":True}


@app.delete("/api/expeditions/{eid}/location")
def stop_location(eid: str, request: Request):
    u,_ = member(request,eid)
    with connect() as c:
        c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=? AND expedition=?", (u["id"],eid))
    return {"ok":True}


@app.delete('/api/location')
def stop_all_location(request: Request):
    u = user(request)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute('DELETE FROM friend_locations WHERE user=?',(u['id'],))
        c.execute('DELETE FROM help_locations WHERE user=?',(u['id'],))
        c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=?",(u['id'],))
    return {'ok': True}


@app.post("/api/expeditions/{eid}/tasks")
def create_task(eid: str, body: TaskInput, request: Request):
    u,_ = member(request,eid)
    is_help=body.kind=='help'
    if is_help and (not body.help_broadcast or body.accuracy is None):
        raise HTTPException(422,'發布求助須同意分享即時定位給這支遠征隊，並先取得 GPS 定位。')
    task = {"id":secrets.token_hex(10),"expedition":eid,"owner":u["id"],"title":body.title,"description":body.description,"kind":body.kind,"lat":body.lat,"lng":body.lng,"status":"open","assignee":None,"created":now(),"expires":now()+body.hours*3600,"location_mode":body.location_mode}
    task.update(help_active=int(is_help),location_mode='publisher' if is_help else body.location_mode)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(u['id'],eid)).fetchone():
            raise HTTPException(403,'請先加入這支遠征隊。')
        if c.execute("SELECT COUNT(*) FROM tasks WHERE owner=? AND status IN ('open','accepted') AND (expires>? OR help_active=1)",(u["id"],now())).fetchone()[0] >= 30:
            raise HTTPException(409,"進行中的任務已達 30 個。")
        c.execute("INSERT INTO tasks(id,expedition,owner,title,description,kind,lat,lng,status,assignee,created,expires,location_mode,help_active) VALUES(:id,:expedition,:owner,:title,:description,:kind,:lat,:lng,:status,:assignee,:created,:expires,:location_mode,:help_active)",task)
        if is_help:
            c.execute('DELETE FROM friend_locations WHERE user=?',(u['id'],))
            c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=?",(u['id'],))
            c.execute('''INSERT INTO help_locations VALUES(?,?,?,?,?,?) ON CONFLICT(user,expedition)
                DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,located=excluded.located''',
                (u['id'],eid,body.lat,body.lng,body.accuracy,now()))
    return task


@app.post("/api/expeditions/{eid}/tasks/{tid}/{action}")
def task_action(eid: str, tid: str, action: Literal["accept","release","complete","cancel"], request: Request):
    u,_ = member(request,eid)
    with connect() as c:
        c.execute("BEGIN IMMEDIATE")
        t = c.execute("SELECT * FROM tasks WHERE id=? AND expedition=? AND (expires>? OR help_active=1)",(tid,eid,now())).fetchone()
        if t is None:
            raise HTTPException(404,"任務不存在或已到期。")
        if t["status"] in ("done","cancelled"):
            raise HTTPException(409,"這個任務已結束。")
        if action == "accept":
            if t["owner"] == u["id"] or t["status"] != "open":
                raise HTTPException(409,"無法接取自己的任務，或任務已被接走。")
            c.execute("UPDATE tasks SET status='accepted',assignee=? WHERE id=?",(u["id"],tid))
        elif action == "release":
            if t["assignee"] != u["id"]:
                raise HTTPException(403,"只有接取者能放棄任務。")
            c.execute("UPDATE tasks SET status='open',assignee=NULL WHERE id=?",(tid,))
        elif action == "cancel":
            if t["owner"] != u["id"]:
                raise HTTPException(403,"只有發布者能撤回任務。")
            c.execute("UPDATE tasks SET status='cancelled' WHERE id=?",(tid,))
        else:
            if t['help_active']:
                raise HTTPException(409,'求助會持續定位至刪除，請由發布者使用「刪除求助」。')
            if u["id"] not in (t["owner"],t["assignee"]):
                raise HTTPException(403,"只有發布者或接取者能完成任務。")
            c.execute("UPDATE tasks SET status='done' WHERE id=?",(tid,))
        if action in ('complete','cancel') and not c.execute("SELECT 1 FROM tasks WHERE expedition=? AND owner=? AND location_mode='publisher' AND status IN ('open','accepted') AND expires>? LIMIT 1",(eid,t['owner'],now())).fetchone():
            c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE expedition=? AND user=? AND scope='task'",(eid,t['owner']))
        assistance.prune(c,t['owner'])
    return {"ok":True}


@app.post("/api/expeditions/{eid}/pins")
def create_pin(eid: str, body: PinInput, request: Request):
    u,_ = member(request,eid)
    pin = {"id":secrets.token_hex(10),"expedition":eid,"owner":u["id"],"title":body.title,"description":body.description,"kind":body.kind,"lat":body.lat,"lng":body.lng,"created":now(),"expires":now()+body.hours*3600 if body.hours else None}
    with connect() as c:
        if c.execute("SELECT COUNT(*) FROM pins WHERE expedition=? AND (expires IS NULL OR expires>?)",(eid,now())).fetchone()[0] >= 500:
            raise HTTPException(409,"此遠征隊的地標已達上限。")
        c.execute("INSERT INTO pins VALUES(:id,:expedition,:owner,:title,:description,:kind,:lat,:lng,:created,:expires)",pin)
        reputation.record(c,pin)
    return pin


@app.delete("/api/expeditions/{eid}/pins/{pid}")
def delete_pin(eid: str, pid: str, request: Request):
    u,_ = member(request,eid)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(u['id'],eid)).fetchone():
            raise HTTPException(403,'請先加入這支遠征隊。')
        p = c.execute("SELECT * FROM pins WHERE id=? AND expedition=?",(pid,eid)).fetchone()
        if not p:
            raise HTTPException(404,"找不到地標。")
        room = c.execute('SELECT owner FROM expeditions WHERE id=?',(eid,)).fetchone()
        if u['id'] not in (p['owner'], room['owner']):
            raise HTTPException(403,"只有地標建立者或遠征隊管理員（隊長）可以刪除。")
        c.execute("DELETE FROM pins WHERE id=? AND expedition=?",(pid,eid))
    return {"ok":True}


@app.delete("/api/expeditions/{eid}/membership")
def leave(eid: str, request: Request):
    u,_ = member(request,eid)
    with connect() as c:
        c.execute("UPDATE tasks SET status='cancelled' WHERE expedition=? AND owner=? AND status IN ('open','accepted')",(eid,u["id"]))
        c.execute("UPDATE tasks SET status='open',assignee=NULL WHERE expedition=? AND assignee=? AND status='accepted'",(eid,u["id"]))
        c.execute("DELETE FROM members WHERE expedition=? AND user=?",(eid,u["id"]))
        prune_empty_squads(c,eid)
        assistance.prune(c,u['id'])
        help_rooms=assistance.rooms(c,u['id'])
    return {"ok":True,"help_rooms":help_rooms}


@app.get("/")
def index(request: Request):
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("__CSP_NONCE__", request.state.csp_nonce), headers={"Cache-Control":"no-store"})


@app.get("/sw.js")
def service_worker():
    return FileResponse(ROOT / "static" / "sw.js", media_type="application/javascript", headers={"Cache-Control":"no-cache"})


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
