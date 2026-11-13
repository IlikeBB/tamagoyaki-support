"""Private management of a user's existing landmarks and ground messages."""
import time
from typing import Literal

from fastapi import HTTPException, Query, Request


class ProfileContent:
    def __init__(self,connect,accounts,reputation):
        self.connect,self.accounts,self.reputation=connect,accounts,reputation

    def install(self,app):
        @app.get('/api/profiles/me/content')
        def listing(request: Request,kind: Literal['landmark','message']='landmark',offset: int=Query(default=0,ge=0)):
            uid=self.accounts.current_user(request)['id'];stamp=int(time.time())
            category="p.kind='message'" if kind=='message' else "p.kind<>'message'"
            clause='FROM pins p JOIN expeditions e ON e.id=p.expedition WHERE p.owner=? AND '+category
            with self.connect() as c:
                c.execute('BEGIN')
                total=c.execute('SELECT COUNT(*) '+clause,(uid,)).fetchone()[0]
                items=[dict(row) for row in c.execute('''SELECT p.id,p.expedition,p.title,p.description,p.kind,p.created,p.expires,
                  e.name AS room_name,e.venue,e.event_date,
                  EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=p.expedition) AS participating '''+
                  clause+' ORDER BY p.created DESC,p.id DESC LIMIT 12 OFFSET ?',(uid,uid,offset))]
                for item in items:
                    item['active']=item['expires'] is None or item['expires']>stamp
                    item['can_view']=bool(item.pop('participating')) and item['active']
                    item['can_delete']=True
                    votes=self.reputation.pin_votes(c,item['id'],uid)
                    item.update(likes=votes['likes'],dislikes=votes['dislikes'])
            return {'items':items,'total':total,'next_offset':offset+len(items) if offset+len(items)<total else None}

        @app.delete('/api/profiles/me/content/{pid}')
        def remove(pid: str,request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                pin=c.execute('SELECT * FROM pins WHERE id=? AND owner=?',(pid,uid)).fetchone()
                if pin is None:
                    raise HTTPException(404,'找不到你發布的這筆內容，可能已被刪除。')
                # Keep the feedback archive and XP, including legacy unarchived rows.
                self.reputation.record(c,dict(pin))
                c.execute('DELETE FROM pins WHERE id=? AND owner=?',(pid,uid))
            return {'ok':True}
