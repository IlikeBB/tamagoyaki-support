"""Member-only status reports attached to landmarks, without GPS data."""
import secrets
import time

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class ReportInput(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    body: str=Field(min_length=1,max_length=600)
    client_id: str=Field(min_length=8,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')


class LandmarkReports:
    def __init__(self,connect,accounts,media):
        self.connect,self.accounts,self.media=connect,accounts,media

    def migrate(self):
        with self.connect() as c:
            c.executescript('''CREATE TABLE IF NOT EXISTS landmark_reports (
              id TEXT PRIMARY KEY,pin TEXT NOT NULL REFERENCES landmark_records(pin) ON DELETE CASCADE,
              owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,
              created INTEGER NOT NULL,client_id TEXT NOT NULL,UNIQUE(owner,client_id));
              CREATE INDEX IF NOT EXISTS landmark_reports_pin ON landmark_reports(pin,created,id);
              CREATE INDEX IF NOT EXISTS landmark_reports_owner ON landmark_reports(owner,created,id);''')
            c.execute('''INSERT OR IGNORE INTO landmark_follows
              SELECT r.owner,p.owner,MIN(r.created) FROM landmark_reports r JOIN landmark_records p ON p.pin=r.pin
              WHERE r.owner<>p.owner GROUP BY r.owner,p.owner''')

    @staticmethod
    def authorize(c,uid,eid,pid):
        room=c.execute('SELECT e.owner FROM expeditions e JOIN members m ON m.expedition=e.id WHERE e.id=? AND m.user=?',(eid,uid)).fetchone()
        if room is None:raise HTTPException(403,'請先加入這支遠征隊。')
        pin=c.execute('SELECT id FROM pins WHERE id=? AND expedition=? AND (expires IS NULL OR expires>?)',(pid,eid,int(time.time()))).fetchone()
        if pin is None:raise HTTPException(404,'情報點已到期或移除，無法查看留言板。')
        return room['owner']==uid

    def public(self,c,row,uid,admin):
        return {'id':row['id'],'body':row['body'],'author':row['owner'],'author_name':row['nickname'],
                'author_avatar_url':self.media.urls(c,row['owner'])['avatar_url'],'created':row['created'],
                'can_delete':admin or row['owner']==uid}

    def install(self,app):
        @app.get('/api/expeditions/{eid}/pins/{pid}/reports')
        def listing(eid: str,pid: str,request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN');admin=self.authorize(c,uid,eid,pid)
                total=c.execute('SELECT COUNT(*) FROM landmark_reports WHERE pin=?',(pid,)).fetchone()[0]
                rows=c.execute('SELECT r.*,u.nickname FROM landmark_reports r JOIN users u ON u.id=r.owner WHERE r.pin=? ORDER BY r.created DESC,r.id DESC LIMIT 20',(pid,))
                return {'items':[self.public(c,row,uid,admin) for row in rows],'total':total}

        @app.post('/api/expeditions/{eid}/pins/{pid}/reports')
        def publish(eid: str,pid: str,body: ReportInput,request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE');admin=self.authorize(c,uid,eid,pid)
                self.accounts.require_publish(c,uid,eid)
                old=c.execute('SELECT * FROM landmark_reports WHERE owner=? AND client_id=?',(uid,body.client_id)).fetchone()
                if old:
                    if old['pin']!=pid or old['body']!=body.body:raise HTTPException(409,'這筆回報已使用，請重新輸入內容。')
                    rid=old['id']
                else:
                    rid=secrets.token_hex(10)
                    c.execute('INSERT INTO landmark_reports VALUES(?,?,?,?,?,?)',(rid,pid,uid,body.body,int(time.time()),body.client_id))
                author=c.execute('SELECT owner FROM pins WHERE id=?',(pid,)).fetchone()['owner']
                if author!=uid:c.execute('INSERT OR IGNORE INTO landmark_follows VALUES(?,?,?)',(uid,author,int(time.time())))
                row=c.execute('SELECT r.*,u.nickname FROM landmark_reports r JOIN users u ON u.id=r.owner WHERE r.id=?',(rid,)).fetchone()
                return self.public(c,row,uid,admin)

        @app.delete('/api/expeditions/{eid}/pins/{pid}/reports/{rid}')
        def remove(eid: str,pid: str,rid: str,request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE');admin=self.authorize(c,uid,eid,pid)
                report=c.execute('SELECT owner FROM landmark_reports WHERE id=? AND pin=?',(rid,pid)).fetchone()
                if report is None:raise HTTPException(404,'回報已被刪除。')
                if report['owner']!=uid and not admin:raise HTTPException(403,'只有本人或隊長可以刪除此回報。')
                c.execute('DELETE FROM landmark_reports WHERE id=? AND pin=?',(rid,pid))
            return {'ok':True}
