"""Private lists of authored tasks, landmarks and messages."""
import time
from typing import Literal

from fastapi import HTTPException, Query, Request


class ProfileContent:
    def __init__(self,connect,accounts,reputation):
        self.connect,self.accounts,self.reputation=connect,accounts,reputation

    def install(self,app):
        @app.get('/api/profiles/me/content')
        def listing(request: Request,kind: Literal['task','landmark','message']='landmark',offset: int=Query(default=0,ge=0)):
            uid=self.accounts.current_user(request)['id'];stamp=int(time.time())
            if kind=='task':
                return self.tasks(uid,stamp,offset)
            category="p.kind='message'" if kind=='message' else "p.kind<>'message'"
            selection='''SELECT p.id,'pin' AS source,p.id AS parent_pin,p.expedition,p.title,p.description,p.kind,p.created,p.expires,
              e.name AS room_name,e.venue,e.event_date,0 AS parent_removed,
              EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=p.expedition) AS participating
              FROM pins p JOIN expeditions e ON e.id=p.expedition WHERE p.owner=? AND '''+category
            params=[uid,uid]
            if kind=='message':
                selection+=''' UNION ALL SELECT r.id,'report' AS source,r.pin AS parent_pin,a.expedition,a.title,r.body AS description,
                  'report' AS kind,r.created,p.expires,a.room_name,a.venue,a.event_date,p.id IS NULL AS parent_removed,
                  EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=a.expedition) AS participating
                  FROM landmark_reports r JOIN landmark_records a ON a.pin=r.pin LEFT JOIN pins p ON p.id=r.pin WHERE r.owner=?'''
                params.extend((uid,uid))
            with self.connect() as c:
                c.execute('BEGIN')
                total=c.execute('SELECT COUNT(*) FROM ('+selection+')',params).fetchone()[0]
                items=[dict(row) for row in c.execute('SELECT * FROM ('+selection+') ORDER BY created DESC,id DESC,source LIMIT 12 OFFSET ?',(*params,offset))]
                for item in items:
                    item['active']=not item['parent_removed'] and (item['expires'] is None or item['expires']>stamp)
                    item['can_view']=bool(item.pop('participating')) and item['active']
                    item['can_delete']=True
                    votes=self.reputation.pin_votes(c,item['id'],uid) if item['source']=='pin' else {'likes':0,'dislikes':0}
                    item.update(likes=votes['likes'],dislikes=votes['dislikes'])
            return {'items':items,'total':total,'next_offset':offset+len(items) if offset+len(items)<total else None}

        @app.delete('/api/profiles/me/content/{pid}')
        def remove(pid: str,request: Request,source: Literal['pin','report']='pin'):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                if source=='report':
                    changed=c.execute('DELETE FROM landmark_reports WHERE id=? AND owner=?',(pid,uid)).rowcount
                    if not changed:raise HTTPException(404,'找不到你發布的這筆回報，可能已被刪除。')
                    return {'ok':True}
                pin=c.execute('SELECT * FROM pins WHERE id=? AND owner=?',(pid,uid)).fetchone()
                if pin is None:
                    raise HTTPException(404,'找不到你發布的這筆內容，可能已被刪除。')
                # Keep the feedback archive and XP, including legacy unarchived rows.
                self.reputation.record(c,dict(pin))
                c.execute('DELETE FROM pins WHERE id=? AND owner=?',(pid,uid))
            return {'ok':True}

    def tasks(self,uid,stamp,offset):
        # Authored lists do not expose GPS, assignees or invitation credentials.
        selection='''FROM tasks t JOIN expeditions e ON e.id=t.expedition
          WHERE t.owner=? AND t.status IN ('open','accepted') AND (t.expires>? OR t.help_active=1)'''
        with self.connect() as c:
            c.execute('BEGIN')
            total=c.execute('SELECT COUNT(*) '+selection,(uid,stamp)).fetchone()[0]
            items=[dict(row) for row in c.execute('''SELECT t.id,'task' AS source,t.expedition,t.title,t.description,
              t.kind,t.status,t.created,t.expires,t.help_active,e.name AS room_name,e.venue,e.event_date,
              EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=t.expedition) AS can_view
              '''+selection+' ORDER BY t.created DESC,t.id DESC LIMIT 12 OFFSET ?',(uid,uid,stamp,offset))]
            for item in items:
                item['can_view']=bool(item['can_view'])
                item['can_delete']=False
        return {'items':items,'total':total,'next_offset':offset+len(items) if offset+len(items)<total else None}
