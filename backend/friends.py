"""Account friendships and opt-in location sharing, independent of event rooms."""
import time

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class FriendRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$")


class FriendLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy: float = Field(ge=0, le=100000, allow_inf_nan=False)


class Friends:
    def __init__(self, connect, accounts, ttl=900, help_required=None, fresh_seconds=120):
        self.connect, self.accounts, self.ttl = connect, accounts, ttl
        self.fresh_seconds = fresh_seconds
        self.help_required=help_required

    def migrate(self):
        with self.connect() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS friendships (
              user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
              created INTEGER NOT NULL,
              PRIMARY KEY(user_a,user_b), CHECK(user_a<user_b),
              CHECK(requested_by=user_a OR requested_by=user_b)
            );
            CREATE INDEX IF NOT EXISTS friendships_user_b ON friendships(user_b);
            CREATE TABLE IF NOT EXISTS friend_locations (
              user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL NOT NULL,
              located INTEGER NOT NULL
            );
            """)

    def install(self, app):
        @app.get('/api/friends')
        def snapshot(request: Request):
            uid = self.accounts.current_user(request)['id']
            stamp = int(time.time())
            result = {'friends': [], 'incoming': [], 'outgoing': [], 'sharing': False}
            with self.connect() as c:
                own = c.execute('SELECT located FROM friend_locations WHERE user=?', (uid,)).fetchone()
                result['sharing'] = bool(own and own['located'] >= stamp-self.ttl)
                rows = c.execute('''SELECT u.id,u.username,u.nickname,f.status,f.requested_by,
                  p.lat,p.lng,p.accuracy,p.located,a.digest AS avatar_digest FROM friendships f
                  JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
                  LEFT JOIN friend_locations p ON p.user=u.id
                  LEFT JOIN profile_media a ON a.user=u.id AND a.kind='avatar'
                  WHERE f.user_a=? OR f.user_b=? ORDER BY u.nickname,u.id''', (uid, uid, uid))
                for row in rows:
                    person = {k: row[k] for k in ('id', 'username', 'nickname')}
                    person['avatar_url'] = f"/api/profiles/{row['id']}/media/avatar?v={row['avatar_digest']}" if row['avatar_digest'] else None
                    if row['status'] == 'accepted':
                        visible = row['located'] is not None and row['located'] >= stamp-self.ttl
                        person['location_visible'] = visible
                        person['location_status'] = ('live' if row['located'] >= stamp-self.fresh_seconds else 'last_known') if visible else None
                        for key in ('lat', 'lng', 'accuracy', 'located'):
                            person[key] = row[key] if visible else None
                        result['friends'].append(person)
                    else:
                        result['outgoing' if row['requested_by'] == uid else 'incoming'].append(person)
            return result

        @app.post('/api/friends/requests')
        def invite(body: FriendRequest, request: Request):
            uid = self.accounts.current_user(request)['id']
            self.accounts.limit('friend-invite', uid, 30, 3600)
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                target = c.execute('SELECT id FROM users WHERE username=? COLLATE NOCASE', (body.username,)).fetchone()
                if target is None:
                    raise HTTPException(404, '找不到這個帳號，請確認好友的帳號名稱。')
                other = target['id']
                if uid == other:
                    raise HTTPException(409, '不能加入自己為好友。')
                pair = tuple(sorted((uid, other)))
                existing = c.execute('SELECT status,requested_by FROM friendships WHERE user_a=? AND user_b=?', pair).fetchone()
                if existing:
                    message = '你們已經是好友。' if existing['status'] == 'accepted' else '已送出邀請，等待對方接受。' if existing['requested_by'] == uid else '對方已邀請你，請在收到的邀請中接受。'
                    raise HTTPException(409, message)
                c.execute('INSERT INTO friendships VALUES(?,?,?,?,?)', (*pair, uid, 'pending', int(time.time())))
            return {'ok': True}

        @app.put('/api/friends/location')
        def locate(body: FriendLocation, request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                if self.help_required and self.help_required(c,uid):
                    raise HTTPException(409,'求助期間須持續分享給求助所在遠征隊；請先刪除求助任務。')
                c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL WHERE user=?",(uid,))
                c.execute('''INSERT INTO friend_locations(user,lat,lng,accuracy,located) VALUES(?,?,?,?,?)
                  ON CONFLICT(user) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,
                  accuracy=excluded.accuracy,located=excluded.located''',
                  (uid, body.lat, body.lng, body.accuracy, int(time.time())))
            return {'ok': True}

        @app.delete('/api/friends/location')
        def stop(request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('DELETE FROM friend_locations WHERE user=?', (uid,))
            return {'ok': True}

        @app.post('/api/friends/{other}/accept')
        def accept(other: str, request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                changed = c.execute('''UPDATE friendships SET status='accepted'
                  WHERE user_a=? AND user_b=? AND requested_by=? AND status='pending' ''',
                  (*sorted((uid, other)), other)).rowcount
                if not changed:
                    raise HTTPException(404, '這份好友邀請已失效。')
            return {'ok': True}

        @app.delete('/api/friends/{other}')
        def remove(other: str, request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('DELETE FROM friendships WHERE user_a=? AND user_b=?', tuple(sorted((uid, other))))
            return {'ok': True}
