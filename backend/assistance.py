"""Explicit help-task broadcasts, limited to the task's own expedition."""
import time
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class HelpLocation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    lat: float=Field(ge=-90,le=90,allow_inf_nan=False)
    lng: float=Field(ge=-180,le=180,allow_inf_nan=False)
    accuracy: float=Field(ge=0,le=100000,allow_inf_nan=False)


class Assistance:
    def __init__(self,connect,accounts,ttl=900):
        self.connect,self.accounts,self.ttl=connect,accounts,ttl

    def migrate(self):
        with self.connect() as c:
            if 'help_active' not in {r['name'] for r in c.execute('PRAGMA table_info(tasks)')}:
                c.execute('ALTER TABLE tasks ADD COLUMN help_active INTEGER NOT NULL DEFAULT 0')
            c.execute('''CREATE TABLE IF NOT EXISTS help_locations (
                user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expedition TEXT NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
                lat REAL NOT NULL,lng REAL NOT NULL,accuracy REAL NOT NULL,located INTEGER NOT NULL,
                PRIMARY KEY(user,expedition))''')

    def rooms(self,c,uid):
        return [dict(r) for r in c.execute('''SELECT e.id,e.name,COUNT(*) AS tasks FROM tasks t
            JOIN expeditions e ON e.id=t.expedition JOIN members m ON m.expedition=e.id AND m.user=t.owner
            WHERE t.owner=? AND t.kind='help' AND t.help_active=1 AND t.status IN ('open','accepted')
            GROUP BY e.id,e.name''',(uid,))]

    def required(self,c,uid):
        return bool(self.rooms(c,uid))

    def positions(self,c,eid):
        return {r['user']:dict(r) for r in c.execute('''SELECT h.* FROM help_locations h JOIN members m
            ON m.user=h.user AND m.expedition=h.expedition WHERE h.expedition=? AND h.located>=?
            AND EXISTS(SELECT 1 FROM tasks t WHERE t.owner=h.user AND t.expedition=h.expedition
              AND t.help_active=1 AND t.kind='help' AND t.status IN ('open','accepted'))''',(eid,int(time.time())-self.ttl))}

    def prune(self,c,uid):
        c.execute('''DELETE FROM help_locations WHERE user=? AND NOT EXISTS(
            SELECT 1 FROM tasks t JOIN members m ON m.user=t.owner AND m.expedition=t.expedition
            WHERE t.owner=help_locations.user AND t.expedition=help_locations.expedition
            AND t.help_active=1 AND t.kind='help' AND t.status IN ('open','accepted'))''',(uid,))

    def install(self,app):
        @app.put('/api/help/location')
        def locate(body:HelpLocation,request:Request):
            uid=self.accounts.current_user(request)['id'];stamp=int(time.time())
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                self.accounts.require_active(c,uid)
                rooms=self.rooms(c,uid)
                if not rooms:raise HTTPException(409,'目前沒有持續中的求助任務。')
                self.prune(c,uid)
                for room in rooms:
                    c.execute('''INSERT INTO help_locations VALUES(?,?,?,?,?,?) ON CONFLICT(user,expedition)
                        DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,located=excluded.located''',
                        (uid,room['id'],body.lat,body.lng,body.accuracy,stamp))
            return {'ok':True}

        @app.delete('/api/help/location')
        def withdraw(request:Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:c.execute('DELETE FROM help_locations WHERE user=?',(uid,))
            return {'ok':True}
