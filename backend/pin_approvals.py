"""Pending map pins stay private until a leader or deputy approves them."""
import time
from typing import Literal
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict


class PinDecision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision: Literal['approve', 'reject']


class PinApprovals:
    def __init__(self, connect, accounts, settings, reputation):
        self.connect, self.accounts, self.settings, self.reputation = connect, accounts, settings, reputation
        self.router = APIRouter()
        self.router.add_api_route('/api/expeditions/{eid}/pin-submissions', self.listing, methods=['GET'])
        self.router.add_api_route('/api/expeditions/{eid}/pin-submissions/{pid}', self.review, methods=['PUT'])
        self.router.add_api_route('/api/expeditions/{eid}/pin-submissions/{pid}', self.withdraw, methods=['DELETE'])

    def migrate(self):
        with self.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS pin_submissions (
              id TEXT PRIMARY KEY,expedition TEXT NOT NULL,owner TEXT NOT NULL,title TEXT NOT NULL,
              description TEXT NOT NULL,kind TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,
              created INTEGER NOT NULL,expires INTEGER,
              FOREIGN KEY(owner,expedition) REFERENCES members(user,expedition) ON DELETE CASCADE)''')
            c.execute('CREATE INDEX IF NOT EXISTS pin_submissions_room ON pin_submissions(expedition,created)')

    def context(self, c, uid, eid):
        self.accounts.require_active(c, uid)
        room = c.execute('SELECT * FROM expeditions WHERE id=?', (eid,)).fetchone()
        member = c.execute('SELECT deputy FROM members WHERE user=? AND expedition=?', (uid, eid)).fetchone()
        if not room or not member and room['owner']!=uid:
            raise HTTPException(403, '請先加入這支遠征隊。')
        return room, room['owner'] == uid or bool(member and member['deputy'])

    def submit(self, c, pin):
        self.accounts.require_publish(c, pin['owner'], pin['expedition'])
        room, manager = self.context(c, pin['owner'], pin['expedition'])
        if self.settings.read(c, room)['pin_policy'] != 'approval' or manager:
            return False
        c.execute('''INSERT INTO pin_submissions VALUES(:id,:expedition,:owner,:title,:description,:kind,:lat,:lng,:created,:expires)''', pin)
        return True

    def listing(self, eid: str, request: Request, offset: int = Query(default=0, ge=0, le=1000000)):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN')
            _, manager = self.context(c, uid, eid)
            args = (eid, int(manager), uid, int(time.time()))
            clause = 'FROM pin_submissions p WHERE expedition=? AND (?=1 OR owner=?) AND (expires IS NULL OR expires>?)'
            total = c.execute('SELECT COUNT(*) '+clause, args).fetchone()[0]
            items = [dict(row) for row in c.execute('SELECT p.*,(SELECT nickname FROM users WHERE id=p.owner) AS owner_name '+clause+' ORDER BY created,id LIMIT 50 OFFSET ?', (*args, offset))]
        return {'items': items, 'can_review': manager, 'total': total, 'next_offset': offset+len(items) if offset+len(items)<total else None}

    def review(self, eid: str, pid: str, body: PinDecision, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            _, manager = self.context(c, uid, eid)
            if not manager:
                raise HTTPException(403, '只有團長或副團長可以審核圖釘。')
            row = c.execute('SELECT * FROM pin_submissions WHERE id=? AND expedition=?', (pid, eid)).fetchone()
            if not row:
                raise HTTPException(404, '這個圖釘已處理或撤回。')
            pin = dict(row)
            if body.decision == 'approve':
                author=c.execute('SELECT m.muted,u.suspended FROM members m JOIN users u ON u.id=m.user WHERE m.user=? AND m.expedition=?',(pin['owner'],eid)).fetchone()
                if not author or author['muted'] or author['suspended']:
                    raise HTTPException(409, '圖釘作者已被禁言或停用，暫時無法核准。')
                if pin['expires'] is not None and pin['expires'] <= int(time.time()):
                    raise HTTPException(409, '這個圖釘已到期。')
                if c.execute('SELECT COUNT(*) FROM pins WHERE expedition=? AND (expires IS NULL OR expires>?)', (eid, int(time.time()))).fetchone()[0] >= 500:
                    raise HTTPException(409, '此遠征隊的地標已達上限。')
                c.execute('INSERT INTO pins VALUES(:id,:expedition,:owner,:title,:description,:kind,:lat,:lng,:created,:expires)', pin)
                self.reputation.record(c, pin)
            c.execute('DELETE FROM pin_submissions WHERE id=?', (pid,))
        return {'ok': True}

    def withdraw(self, eid: str, pid: str, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            _, manager = self.context(c, uid, eid)
            row = c.execute('SELECT owner FROM pin_submissions WHERE id=? AND expedition=?', (pid, eid)).fetchone()
            if not row:
                raise HTTPException(404, '這個圖釘已處理或撤回。')
            if row['owner'] != uid and not manager:
                raise HTTPException(403, '只能撤回自己送審的圖釘。')
            c.execute('DELETE FROM pin_submissions WHERE id=?', (pid,))
        return {'ok': True}
