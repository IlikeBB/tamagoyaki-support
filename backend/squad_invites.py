"""Send a squad invitation only to an accepted friend, through an existing DM."""
from fastapi import HTTPException,Request
from pydantic import BaseModel,ConfigDict,Field


class SquadInvitation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    friend_id:str=Field(min_length=1,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    client_id:str=Field(min_length=8,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')


class SquadInvites:
    def __init__(self,connect,accounts,chat,origin):
        self.connect,self.accounts,self.chat,self.origin=connect,accounts,chat,origin.rstrip('/')

    @staticmethod
    def current(c,uid,eid,sid):
        row=c.execute('''SELECT s.name,s.code,e.name AS room_name,e.code AS room_code FROM squads s
          JOIN expeditions e ON e.id=s.expedition JOIN members m ON m.expedition=e.id AND m.squad=s.id
          WHERE s.id=? AND e.id=? AND m.user=?''',(sid,eid,uid)).fetchone()
        if not row:raise HTTPException(403,'你已不在這個小隊，請重新開啟邀請視窗。')
        return row

    @staticmethod
    def authorize_join(c,uid,eid,sid):
        if c.execute('SELECT 1 FROM members WHERE user=? AND expedition=? AND squad=?',(uid,eid,sid)).fetchone():return
        friend=c.execute('''SELECT 1 FROM friendships f JOIN members m
          ON m.user=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
          WHERE (f.user_a=? OR f.user_b=?) AND f.status='accepted' AND m.expedition=? AND m.squad=? LIMIT 1''',(uid,uid,uid,eid,sid)).fetchone()
        if not friend:raise HTTPException(403,'加入小隊需要與其中一位目前成員互為好友，請先添加好友。')

    def install(self,app):
        @app.get('/api/expeditions/{eid}/squads/{sid}/invitees')
        def invitees(eid:str,sid:str,request:Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN');self.current(c,uid,eid,sid)
                rows=c.execute('''SELECT u.id,u.username,u.nickname,a.digest AS avatar_digest,
                  m.user IS NOT NULL AS in_expedition,COALESCE(m.squad=?,0) AS in_squad FROM friendships f
                  JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
                  LEFT JOIN members m ON m.user=u.id AND m.expedition=?
                  LEFT JOIN profile_media a ON a.user=u.id AND a.kind='avatar'
                  WHERE (f.user_a=? OR f.user_b=?) AND f.status='accepted' ORDER BY u.nickname,u.id''',(sid,uid,eid,uid,uid))
                people=[]
                for row in rows:
                    person=dict(row);digest=person.pop('avatar_digest')
                    person['avatar_url']=f"/api/profiles/{person['id']}/media/avatar?v={digest}" if digest else None
                    people.append(person)
                return {'friends':people}

        @app.post('/api/expeditions/{eid}/squads/{sid}/invites')
        def send(eid:str,sid:str,body:SquadInvitation,request:Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE');squad=self.current(c,uid,eid,sid)
                self.chat.authorize(c,uid,'friend',body.friend_id)
                previous=c.execute('SELECT 1 FROM chat_messages WHERE sender=? AND client_id=?',(uid,body.client_id)).fetchone()
                if not previous and c.execute('SELECT 1 FROM members WHERE user=? AND expedition=? AND squad=?',(body.friend_id,eid,sid)).fetchone():
                    raise HTTPException(409,'這位好友已經在同一個小隊。')
                text=f"邀請你加入小隊「{squad['name']}」\n遠征隊：{squad['room_name']}\n開啟連結並確認後加入：\n{self.origin}/?join={squad['room_code']}&squad={squad['code']}"
                return self.chat.send_message(c,uid,'friend',body.friend_id,text,body.client_id)
