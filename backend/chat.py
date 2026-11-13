"""Plain-text friend, expedition and squad chats, authorized on every request."""
import time
from typing import Literal

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

ChatKind = Literal['friend', 'expedition', 'squad']


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    body: str = Field(min_length=1, max_length=2000)
    client_id: str = Field(min_length=8, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')

    @field_validator('body', mode='before')
    @classmethod
    def normalize(cls, value):
        if not isinstance(value, str):
            return value
        value = value.replace('\r\n', '\n').replace('\r', '\n')
        if any(ord(char)<32 and char not in '\n\t' for char in value):
            raise ValueError('訊息含有不支援的控制字元。')
        return value


class ChatRead(BaseModel):
    model_config = ConfigDict(extra='forbid')
    last_id: int = Field(ge=1)


class Chat:
    def __init__(self, connect, accounts):
        self.connect, self.accounts = connect, accounts

    def migrate(self):
        schemas = {
            'chat_messages': '''CREATE TABLE {table} (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL CHECK(kind IN ('friend','expedition','squad')),
              thread TEXT NOT NULL, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
              client_id TEXT NOT NULL, created INTEGER NOT NULL,
              UNIQUE(sender,client_id))''',
            'chat_reads': '''CREATE TABLE {table} (
              user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK(kind IN ('friend','expedition','squad')),
              thread TEXT NOT NULL,last_id INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY(user,kind,thread))''',
        }
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            for table, schema in schemas.items():
                existing = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()
                if existing is None:
                    c.execute(schema.format(table=table))
                elif "'squad'" not in existing['sql']:
                    sequence = c.execute('SELECT seq FROM sqlite_sequence WHERE name=?',(table,)).fetchone() if table=='chat_messages' else None
                    upgraded = table+'_upgrade'
                    c.execute(schema.format(table=upgraded))
                    c.execute(f'INSERT INTO {upgraded} SELECT * FROM {table}')
                    c.execute(f'DROP TABLE {table}')
                    c.execute(f'ALTER TABLE {upgraded} RENAME TO {table}')
                    if sequence is not None:
                        changed = c.execute('UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?',(sequence['seq'],table)).rowcount
                        if not changed:
                            c.execute('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)',(table,sequence['seq']))
            c.execute('CREATE INDEX IF NOT EXISTS chat_thread_messages ON chat_messages(kind,thread,id)')
            c.execute('CREATE INDEX IF NOT EXISTS chat_sender_time ON chat_messages(sender,created)')

    @staticmethod
    def thread(uid, kind, target):
        return ':'.join(sorted((uid, target))) if kind == 'friend' else target

    def authorize(self, c, uid, kind, target):
        if kind == 'friend':
            allowed = c.execute("SELECT 1 FROM friendships WHERE user_a=? AND user_b=? AND status='accepted'",
                                tuple(sorted((uid, target)))).fetchone()
            if not allowed:
                raise HTTPException(403, '只有已互相接受邀請的好友可以私訊。')
        elif kind == 'squad':
            if not c.execute('''SELECT 1 FROM members m JOIN squads s ON s.id=m.squad AND s.expedition=m.expedition
              WHERE m.user=? AND s.id=?''',(uid,target)).fetchone():
                raise HTTPException(403,'只有這支小隊目前的成員可以查看或傳送訊息。')
        elif not c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?', (uid, target)).fetchone():
            raise HTTPException(403, '只有這支遠征隊目前的成員可以查看或傳送訊息。')
        return self.thread(uid, kind, target)

    @staticmethod
    def message(c, mid):
        row=c.execute('''SELECT m.id,m.sender,u.nickname AS sender_name,m.body,m.created,a.digest AS avatar_digest
          FROM chat_messages m JOIN users u ON u.id=m.sender
          LEFT JOIN profile_media a ON a.user=u.id AND a.kind='avatar' WHERE m.id=?''', (mid,)).fetchone()
        return Chat.present(row)

    @staticmethod
    def present(row):
        message=dict(row)
        digest=message.pop('avatar_digest')
        message['sender_avatar_url']=f"/api/profiles/{message['sender']}/media/avatar?v={digest}" if digest else None
        return message

    def install(self, app):
        @app.get('/api/chat')
        def conversations(request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN')
                contacts = [dict(r) for r in c.execute('''SELECT 'friend' AS kind,u.id AS target,
                  u.nickname AS title,'@'||u.username AS subtitle,a.digest AS avatar_digest FROM friendships f
                  JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
                  LEFT JOIN profile_media a ON a.user=u.id AND a.kind='avatar'
                  WHERE (f.user_a=? OR f.user_b=?) AND f.status='accepted' ''', (uid, uid, uid))]
                contacts += [dict(r) for r in c.execute('''SELECT 'expedition' AS kind,e.id AS target,
                  e.name AS title,'遠征隊群聊' AS subtitle FROM members m JOIN expeditions e ON e.id=m.expedition
                  WHERE m.user=?''', (uid,))]
                contacts += [dict(r) for r in c.execute('''SELECT 'squad' AS kind,s.id AS target,
                  s.name AS title,e.name||' · 小隊群聊' AS subtitle FROM members m
                  JOIN squads s ON s.id=m.squad AND s.expedition=m.expedition
                  JOIN expeditions e ON e.id=m.expedition WHERE m.user=?''',(uid,))]
                for contact in contacts:
                    kind, target = contact['kind'], contact['target']
                    digest=contact.pop('avatar_digest',None)
                    contact['avatar_url']=f"/api/profiles/{target}/media/avatar?v={digest}" if kind=='friend' and digest else None
                    thread = self.thread(uid, kind, target)
                    contact['id'] = kind+':'+target
                    latest = c.execute('''SELECT m.id,m.sender,u.nickname AS sender_name,
                      substr(m.body,1,160) AS body,m.created FROM chat_messages m JOIN users u ON u.id=m.sender
                      WHERE m.kind=? AND m.thread=? ORDER BY m.id DESC LIMIT 1''', (kind, thread)).fetchone()
                    contact['latest'] = dict(latest) if latest else None
                    contact['unread'] = c.execute('''SELECT COUNT(*) FROM chat_messages WHERE kind=? AND thread=?
                      AND sender<>? AND id>COALESCE((SELECT last_id FROM chat_reads WHERE user=? AND kind=? AND thread=?),0)''',
                      (kind, thread, uid, uid, kind, thread)).fetchone()[0]
            contacts.sort(key=lambda row: (-(row['latest']['id'] if row['latest'] else 0), row['title'], row['id']))
            return {'conversations': contacts, 'unread': sum(row['unread'] for row in contacts)}

        @app.get('/api/chat/{kind}/{target}/messages')
        def history(kind: ChatKind, target: str, request: Request,
                    before: int | None = Query(default=None, ge=1), after: int | None = Query(default=None, ge=0)):
            if before is not None and after is not None:
                raise HTTPException(422, '一次只能選擇較早或較新的訊息。')
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN')
                thread = self.authorize(c, uid, kind, target)
                clause, params = '', [kind, thread]
                if before is not None:
                    clause = ' AND m.id<?'; params.append(before)
                if after is not None:
                    clause = ' AND m.id>?'; params.append(after)
                order = 'ASC' if after is not None else 'DESC'
                rows = [self.present(r) for r in c.execute('''SELECT m.id,m.sender,u.nickname AS sender_name,m.body,m.created,a.digest AS avatar_digest
                  FROM chat_messages m JOIN users u ON u.id=m.sender
                  LEFT JOIN profile_media a ON a.user=u.id AND a.kind='avatar' WHERE m.kind=? AND m.thread=?'''+clause+
                  ' ORDER BY m.id '+order+' LIMIT 51', params)]
            more = len(rows)>50
            rows = rows[:50]
            if after is None:
                rows.reverse()
            return {'messages': rows, 'has_more': more}

        @app.post('/api/chat/{kind}/{target}/messages')
        def send(kind: ChatKind, target: str, body: ChatMessage, request: Request):
            uid = self.accounts.current_user(request)['id']
            stamp = int(time.time())
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                thread = self.authorize(c, uid, kind, target)
                previous = c.execute('SELECT * FROM chat_messages WHERE sender=? AND client_id=?',
                                     (uid, body.client_id)).fetchone()
                if previous:
                    if (previous['kind'], previous['thread'], previous['body']) != (kind, thread, body.body):
                        raise HTTPException(409, '這則訊息的重試內容已改變，請重新傳送。')
                    return self.message(c, previous['id'])
                count = c.execute('SELECT COUNT(*) FROM chat_messages WHERE sender=? AND created>?', (uid, stamp-60)).fetchone()[0]
                if count >= 60:
                    raise HTTPException(429, '訊息傳送太快，請稍後再試。', headers={'Retry-After': '60'})
                mid = c.execute('INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES(?,?,?,?,?,?)',
                                (kind, thread, uid, body.body, body.client_id, stamp)).lastrowid
                return self.message(c, mid)

        @app.post('/api/chat/{kind}/{target}/read')
        def read(kind: ChatKind, target: str, body: ChatRead, request: Request):
            uid = self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                thread = self.authorize(c, uid, kind, target)
                if not c.execute('SELECT 1 FROM chat_messages WHERE id=? AND kind=? AND thread=?', (body.last_id, kind, thread)).fetchone():
                    raise HTTPException(404, '找不到這則對話訊息。')
                c.execute('''INSERT INTO chat_reads VALUES(?,?,?,?) ON CONFLICT(user,kind,thread)
                  DO UPDATE SET last_id=MAX(chat_reads.last_id,excluded.last_id)''', (uid, kind, thread, body.last_id))
                unread = c.execute('''SELECT COUNT(*) FROM chat_messages WHERE kind=? AND thread=? AND sender<>?
                  AND id>(SELECT last_id FROM chat_reads WHERE user=? AND kind=? AND thread=?)''',
                  (kind, thread, uid, uid, kind, thread)).fetchone()[0]
            return {'ok': True, 'unread': unread}
