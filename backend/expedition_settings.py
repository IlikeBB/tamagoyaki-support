"""Leader-controlled room settings, password admission, and configuration copies."""
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr


def room_is_listed(c, room):
    if 'discoverable' in room.keys() and not room['discoverable']:
        return False
    settings = c.execute('SELECT time_zone FROM expedition_settings WHERE expedition=?', (room['id'],)).fetchone()
    zone = settings['time_zone'] if settings else 'Asia/Taipei' if room['venue']=='taiwan' else 'Asia/Tokyo'
    today = str(datetime.now(timezone(timedelta(hours=8 if zone=='Asia/Taipei' else 9))).date())
    last_day = room['event_end_date'] or room['event_date']
    return not last_day or last_day >= today


def event_dates(start, end):
    if end and not start:
        raise HTTPException(422, '請先設定開始日期，再選擇結束日期。')
    if end and end < start:
        raise HTTPException(422, '結束日期不能早於開始日期。')
    return start.isoformat() if start else '', end.isoformat() if end and end != start else ''


class JoinPassword(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: SecretStr | None = Field(default=None, max_length=128)


class SettingsInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    event_date: date | None = None
    event_end_date: date | None = None
    event_time: str = Field(default='', pattern=r'^(?:[0-2][0-9]:[0-5][0-9])?$')
    time_zone: Literal['Asia/Tokyo', 'Asia/Taipei'] = 'Asia/Tokyo'
    privacy: Literal['public', 'password', 'invite']
    pin_policy: Literal['free', 'approval']
    password: SecretStr | None = Field(default=None, min_length=8, max_length=128)


class CopyInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)


class ExpeditionSettings:
    def __init__(self, connect, accounts, managers, profiles, make_code):
        self.connect, self.accounts, self.managers = connect, accounts, managers
        self.profiles, self.make_code = profiles, make_code
        self.router = APIRouter()
        self.router.add_api_route('/api/expeditions/{eid}/settings', self.get, methods=['GET'])
        self.router.add_api_route('/api/expeditions/{eid}/settings', self.update, methods=['PUT'])
        self.router.add_api_route('/api/expeditions/{eid}/copy', self.copy, methods=['POST'])

    def migrate(self):
        with self.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS expedition_settings (
              expedition TEXT PRIMARY KEY REFERENCES expeditions(id) ON DELETE CASCADE,
              privacy TEXT NOT NULL CHECK(privacy IN ('public','password','invite')),
              password_hash TEXT,pin_policy TEXT NOT NULL CHECK(pin_policy IN ('free','approval')),
              event_time TEXT NOT NULL DEFAULT '',time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo')''')

    @staticmethod
    def read(c, room):
        row = c.execute('SELECT * FROM expedition_settings WHERE expedition=?', (room['id'],)).fetchone()
        discoverable = room['discoverable'] if 'discoverable' in room.keys() else 1
        return dict(row) if row else {'privacy': 'public' if discoverable else 'invite',
             'password_hash': None, 'pin_policy': 'free', 'event_time': '',
             'time_zone': 'Asia/Taipei' if room['venue'] == 'taiwan' else 'Asia/Tokyo'}

    def annotate(self, c, rooms):
        for room in rooms:
            settings = self.read(c, room)
            room.update({key: settings[key] for key in ('privacy', 'pin_policy', 'event_time', 'time_zone')})

    def leader(self, c, eid, uid):
        room, role = self.managers.manager(c, eid, uid)
        if role != 'leader':
            raise HTTPException(403, '只有團長可以調整遠征隊設定。')
        return dict(c.execute('SELECT * FROM expeditions WHERE id=?', (eid,)).fetchone())

    def get(self, eid: str, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN')
            room = self.leader(c, eid, uid)
            settings = self.read(c, room)
            joined = bool(c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?', (uid, eid)).fetchone())
        settings.pop('expedition', None)
        settings['has_password'] = bool(settings.pop('password_hash'))
        return {'room': {key: room[key] for key in ('id', 'name', 'event_date', 'event_end_date')}, 'joined': joined, **settings}

    def update(self, eid: str, body: SettingsInput, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            self.leader(c, eid, uid)
        if body.password:
            self.accounts.limit('room-password-change', uid, 30, 300)
        encoded = self.accounts.hash_password(body.password.get_secret_value()) if body.password else None
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.accounts.require_active(c, uid)
            room = self.leader(c, eid, uid)
            end = body.event_end_date
            # Older open clients can still save unrelated settings without dropping a range.
            if 'event_end_date' not in body.model_fields_set and body.event_date and body.event_date.isoformat() == room['event_date']:
                end = date.fromisoformat(room['event_end_date']) if room['event_end_date'] else None
            event_date, event_end_date = event_dates(body.event_date, end)
            today = datetime.now(timezone(timedelta(hours=8 if body.time_zone=='Asia/Taipei' else 9))).date()
            if body.event_date and event_date != room['event_date'] and not today-timedelta(days=1) <= body.event_date <= today+timedelta(days=730):
                raise HTTPException(422, '活動日期需介於昨天與未來兩年。')
            if end and event_end_date != room['event_end_date'] and not today-timedelta(days=1) <= end <= today+timedelta(days=730):
                raise HTTPException(422, '結束日期需介於昨天與未來兩年。')
            if body.event_time and (not event_date or int(body.event_time[:2]) > 23):
                raise HTTPException(422, '開始時間需搭配活動日期，且使用 00:00–23:59。')
            previous = self.read(c, room)
            password_hash = encoded or previous['password_hash'] if body.privacy == 'password' else None
            if body.privacy == 'password' and not password_hash:
                raise HTTPException(422, '密碼遠征隊需要設定 8–128 個字元的密碼。')
            c.execute('''INSERT INTO expedition_settings VALUES(?,?,?,?,?,?) ON CONFLICT(expedition)
              DO UPDATE SET privacy=excluded.privacy,password_hash=excluded.password_hash,
              pin_policy=excluded.pin_policy,event_time=excluded.event_time,time_zone=excluded.time_zone''',
              (eid, body.privacy, password_hash, body.pin_policy, body.event_time, body.time_zone))
            discoverable = int(body.privacy != 'invite')
            c.execute('UPDATE expeditions SET event_date=?,event_end_date=?,discoverable=? WHERE id=?', (event_date, event_end_date, discoverable, eid))
            c.execute('UPDATE expedition_records SET event_date=?,event_end_date=?,discoverable=? WHERE id=?', (event_date, event_end_date, discoverable, eid))
        return {'ok': True}

    def admit(self, c, room, uid, password=None, public=False):
        self.accounts.require_active(c, uid)
        settings = self.read(c, room)
        if public and settings['privacy'] == 'invite':
            raise HTTPException(404, '這支遠征隊僅限邀請加入。')
        if room['owner'] == uid or c.execute('SELECT 1 FROM members WHERE expedition=? AND user=?', (room['id'], uid)).fetchone():
            return
        if settings['privacy'] == 'password':
            if not password:
                raise HTTPException(428, '這支遠征隊需要輸入加入密碼。')
            if not self.accounts.verify_password(settings['password_hash'], password.get_secret_value()):
                raise HTTPException(403, '遠征隊密碼不正確。')

    def copy(self, eid: str, body: CopyInput, request: Request):
        import secrets, time
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.accounts.require_active(c, uid)
            original = self.leader(c, eid, uid)
            if c.execute('SELECT COUNT(*) FROM expeditions WHERE owner=?', (uid,)).fetchone()[0] >= 30:
                raise HTTPException(409, '每個使用者最多建立 30 個遠征隊。')
            room = {**original, 'id': secrets.token_hex(12), 'code': self.make_code(), 'name': body.name, 'created': int(time.time())}
            c.execute('''INSERT INTO expeditions(id,code,name,venue,event_date,event_end_date,owner,created,discoverable)
              VALUES(:id,:code,:name,:venue,:event_date,:event_end_date,:owner,:created,:discoverable)''', room)
            settings = self.read(c, original)
            c.execute('INSERT INTO expedition_settings VALUES(?,?,?,?,?,?)', (room['id'], settings['privacy'], settings['password_hash'], settings['pin_policy'], settings['event_time'], settings['time_zone']))
            c.execute('INSERT INTO members(user,expedition,seen) VALUES(?,?,?)', (uid, room['id'], room['created']))
            self.profiles.joined(c, uid, room['id'])
            self.annotate(c, [room])
        return room
