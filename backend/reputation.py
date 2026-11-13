"""Temporary-landmark feedback, retained without retaining map coordinates."""
import time
from typing import Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict


class LandmarkVote(BaseModel):
    model_config = ConfigDict(extra='forbid')
    value: Literal[-1, 0, 1]


class Reputation:
    def __init__(self, connect, accounts):
        self.connect, self.accounts = connect, accounts

    def migrate(self):
        with self.connect() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS landmark_records (
              pin TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expedition TEXT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,
              room_name TEXT NOT NULL,venue TEXT NOT NULL,event_date TEXT NOT NULL,
              created INTEGER NOT NULL,expires INTEGER NOT NULL,
              invalidated INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS landmark_records_owner ON landmark_records(owner,created);
            CREATE INDEX IF NOT EXISTS landmark_records_expedition ON landmark_records(expedition);
            CREATE TABLE IF NOT EXISTS landmark_reviews (
              pin TEXT NOT NULL REFERENCES landmark_records(pin) ON DELETE CASCADE,
              voter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              value INTEGER NOT NULL CHECK(value IN (-1,1)),created INTEGER NOT NULL,updated INTEGER NOT NULL,
              PRIMARY KEY(pin,voter)
            );
            CREATE INDEX IF NOT EXISTS landmark_reviews_voter ON landmark_reviews(voter,updated);
            ''')
            c.execute('BEGIN IMMEDIATE')
            columns={row['name'] for row in c.execute('PRAGMA table_info(landmark_records)')}
            if 'invalidated' not in columns:
                c.execute('ALTER TABLE landmark_records ADD COLUMN invalidated INTEGER NOT NULL DEFAULT 0')
            c.execute('''INSERT OR IGNORE INTO landmark_records
              (pin,owner,expedition,title,kind,room_name,venue,event_date,created,expires)
              SELECT p.id,p.owner,p.expedition,p.title,p.kind,e.name,e.venue,e.event_date,p.created,p.expires
              FROM pins p JOIN expeditions e ON e.id=p.expedition WHERE p.expires IS NOT NULL''')
            c.execute('''UPDATE landmark_records SET invalidated=1 WHERE pin IN (
              SELECT p.id FROM pins p JOIN landmark_reviews v ON v.pin=p.id
              WHERE p.expires IS NOT NULL GROUP BY p.id HAVING SUM(v.value)<0)''')
            c.execute('''DELETE FROM pins WHERE expires IS NOT NULL AND id IN (
              SELECT pin FROM landmark_records WHERE invalidated=1)''')

    @staticmethod
    def record(c, pin):
        if pin['expires'] is not None:
            c.execute('''INSERT OR IGNORE INTO landmark_records
              (pin,owner,expedition,title,kind,room_name,venue,event_date,created,expires)
              SELECT ?,?,?,?, ?,e.name,e.venue,e.event_date,?,? FROM expeditions e WHERE e.id=?''',
              (pin['id'],pin['owner'],pin['expedition'],pin['title'],pin['kind'],pin['created'],pin['expires'],pin['expedition']))

    @staticmethod
    def totals(c, uid):
        row=c.execute('''SELECT COALESCE(SUM(v.value=1),0) AS likes,COALESCE(SUM(v.value=-1),0) AS dislikes
          FROM landmark_records r LEFT JOIN landmark_reviews v ON v.pin=r.pin WHERE r.owner=?''',(uid,)).fetchone()
        return {**dict(row),'landmarks':c.execute('SELECT COUNT(*) FROM landmark_records WHERE owner=?',(uid,)).fetchone()[0]}

    @staticmethod
    def pin_votes(c, pid, uid):
        row=c.execute('''SELECT COALESCE(SUM(value=1),0) AS likes,COALESCE(SUM(value=-1),0) AS dislikes,
          COALESCE(MAX(CASE WHEN voter=? THEN value END),0) AS my_vote FROM landmark_reviews WHERE pin=?''',(uid,pid)).fetchone()
        return dict(row)

    def annotate(self, c, pins, uid):
        for pin in pins:
            pin.update(self.pin_votes(c,pin['id'],uid) if pin['expires'] is not None else {'likes':0,'dislikes':0,'my_vote':0})
            pin['can_vote']=pin['expires'] is not None and pin['expires']>int(time.time()) and pin['owner']!=uid

    def install(self, app):
        @app.put('/api/expeditions/{eid}/pins/{pid}/vote')
        def vote(eid: str, pid: str, body: LandmarkVote, request: Request):
            uid=self.accounts.current_user(request)['id'];stamp=int(time.time())
            self.accounts.limit('landmark-vote',uid,120,60)
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                record=c.execute('SELECT * FROM landmark_records WHERE pin=? AND expedition=?',(pid,eid)).fetchone()
                pin=c.execute('SELECT * FROM pins WHERE id=? AND expedition=?',(pid,eid)).fetchone()
                member=c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(uid,eid)).fetchone()
                if body.value==0 and record:
                    # Users may always retract their own historical feedback.
                    c.execute('DELETE FROM landmark_reviews WHERE pin=? AND voter=?',(pid,uid))
                else:
                    if not member:raise HTTPException(403,'只有這支遠征隊的目前成員可以評價地標。')
                    if not pin:raise HTTPException(404,'這個地標已移除。')
                    if pin['expires'] is None:raise HTTPException(422,'目前只有臨時地標提供有效／無效回饋。')
                    if pin['expires']<=stamp:raise HTTPException(409,'這個臨時地標已到期。')
                    if pin['owner']==uid:raise HTTPException(403,'不能為自己的地標評價。')
                    self.record(c,dict(pin))
                    if body.value:
                        c.execute('''INSERT INTO landmark_reviews VALUES(?,?,?,?,?) ON CONFLICT(pin,voter)
                          DO UPDATE SET value=excluded.value,updated=excluded.updated''',(pid,uid,body.value,stamp,stamp))
                    else:c.execute('DELETE FROM landmark_reviews WHERE pin=? AND voter=?',(pid,uid))
                result={'ok':True}
                if pin and pin['expires'] is not None:
                    feedback=self.pin_votes(c,pid,uid)
                    removed=feedback['dislikes']>feedback['likes']
                    if removed:
                        c.execute('UPDATE landmark_records SET invalidated=1 WHERE pin=?',(pid,))
                        c.execute('DELETE FROM pins WHERE id=?',(pid,))
                    if member and pin['expires']>stamp:
                        result.update(feedback,removed=removed)
                return result
