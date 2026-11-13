"""Account profiles, participation walls, and permission-filtered feedback history."""
import time
from typing import Literal

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field


class ProfileDetails(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    nickname: str=Field(min_length=1,max_length=24)
    bio: str=Field(default='',max_length=160)


class Profiles:
    def __init__(self,connect,accounts,media,reputation,venues):
        self.connect,self.accounts,self.media,self.reputation,self.venues=connect,accounts,media,reputation,venues

    def migrate(self):
        with self.connect() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS user_profiles (
              user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,bio TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS expedition_records (
              id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              name TEXT NOT NULL,venue TEXT NOT NULL,event_date TEXT NOT NULL,discoverable INTEGER NOT NULL
            );
            ''')
            c.execute('BEGIN IMMEDIATE')
            c.execute('''INSERT OR IGNORE INTO expedition_records
              SELECT id,owner,name,venue,event_date,discoverable FROM expeditions''')
            legacy=any(row['table']=='expeditions' for row in c.execute('PRAGMA foreign_key_list(expedition_history)'))
            if legacy:c.execute('ALTER TABLE expedition_history RENAME TO expedition_history_legacy')
            c.execute('''CREATE TABLE IF NOT EXISTS expedition_history (
              user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expedition TEXT NOT NULL REFERENCES expedition_records(id) ON DELETE CASCADE,
              first_joined INTEGER NOT NULL,last_joined INTEGER NOT NULL,PRIMARY KEY(user,expedition))''')
            if legacy:
                c.execute('INSERT INTO expedition_history SELECT * FROM expedition_history_legacy')
                c.execute('DROP TABLE expedition_history_legacy')
            c.execute('INSERT OR IGNORE INTO expedition_history SELECT owner,id,created,created FROM expeditions')
            stamp=int(time.time())
            c.execute('INSERT OR IGNORE INTO expedition_history SELECT user,expedition,?,? FROM members',(stamp,stamp))

    @staticmethod
    def archive_room(c,eid):
        c.execute('''INSERT OR IGNORE INTO expedition_records
          SELECT id,owner,name,venue,event_date,discoverable FROM expeditions WHERE id=?''',(eid,))

    @staticmethod
    def joined(c,uid,eid):
        stamp=int(time.time())
        Profiles.archive_room(c,eid)
        c.execute('''INSERT INTO expedition_history VALUES(?,?,?,?) ON CONFLICT(user,expedition)
          DO UPDATE SET last_joined=excluded.last_joined''',(uid,eid,stamp,stamp))

    @staticmethod
    def target(c,uid):
        row=c.execute('SELECT id,username,nickname,registered FROM users WHERE id=? AND username IS NOT NULL',(uid,)).fetchone()
        if not row:raise HTTPException(404,'找不到這個個人檔案。')
        return dict(row)

    def public(self,c,uid):
        return self.media.urls(c,uid)

    def wall(self,c,uid,viewer,offset=0):
        # Public room cards reveal only fields already in the public catalogue.
        clause='''FROM expedition_history h JOIN expedition_records e ON e.id=h.expedition
          WHERE h.user=? AND (?=? OR e.discoverable=1 OR EXISTS(
            SELECT 1 FROM members m WHERE m.user=? AND m.expedition=e.id))'''
        params=(uid,uid,viewer,viewer)
        total=c.execute('SELECT COUNT(*) '+clause,params).fetchone()[0]
        rows=[dict(r) for r in c.execute('''SELECT e.id,e.name,e.venue,e.event_date,
          NOT EXISTS(SELECT 1 FROM expeditions live WHERE live.id=e.id) AS removed,
          (e.owner=? AND EXISTS(SELECT 1 FROM expeditions live WHERE live.id=e.id)) AS can_delete,
          EXISTS(SELECT 1 FROM members m WHERE m.user=h.user AND m.expedition=e.id) AS participating,
          EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=e.id) AS can_enter '''+clause+
          ' ORDER BY e.event_date DESC,h.last_joined DESC,e.id LIMIT 12 OFFSET ?',(viewer,viewer,*params,offset))]
        for row in rows:
            row['venue_name']=next((v['name'] for v in self.venues if v['id']==row['venue']),row['venue'])
        return {'items':rows,'total':total,'next_offset':offset+len(rows) if offset+len(rows)<total else None}

    def install(self,app):
        @app.get('/api/profiles/{uid}')
        def snapshot(uid: str,request: Request):
            viewer=self.accounts.current_user(request)['id'];uid=viewer if uid=='me' else uid
            with self.connect() as c:
                c.execute('BEGIN');profile=self.target(c,uid);profile.update(self.public(c,uid))
                bio=c.execute('SELECT bio FROM user_profiles WHERE user=?',(uid,)).fetchone()
                profile.update(bio=bio['bio'] if bio else '',own=uid==viewer)
                return {'profile':profile,'reputation':self.reputation.totals(c,uid),'wall':self.wall(c,uid,viewer)}

        @app.patch('/api/profiles/me')
        def update(body: ProfileDetails,request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:
                c.execute('UPDATE users SET nickname=? WHERE id=?',(body.nickname,uid))
                c.execute('''INSERT INTO user_profiles VALUES(?,?) ON CONFLICT(user) DO UPDATE SET bio=excluded.bio''',(uid,body.bio))
            return {'ok':True}

        @app.get('/api/profiles/{uid}/wall')
        def wall(uid: str,request: Request,offset: int=Query(default=0,ge=0)):
            viewer=self.accounts.current_user(request)['id'];uid=viewer if uid=='me' else uid
            with self.connect() as c:
                c.execute('BEGIN');self.target(c,uid)
                return self.wall(c,uid,viewer,offset)

        @app.get('/api/profiles/{uid}/feedback')
        def feedback(uid: str,request: Request,kind: Literal['received','given']='received',offset: int=Query(default=0,ge=0)):
            viewer=self.accounts.current_user(request)['id'];uid=viewer if uid=='me' else uid
            if kind=='given' and viewer!=uid:raise HTTPException(403,'只有本人可以查看自己給出的評價。')
            with self.connect() as c:
                c.execute('BEGIN');self.target(c,uid)
                if kind=='received':
                    clause='''FROM landmark_records r LEFT JOIN pins p ON p.id=r.pin WHERE r.owner=?
                      AND (r.invalidated=1 OR EXISTS(SELECT 1 FROM landmark_reviews v WHERE v.pin=r.pin))
                      AND (?=? OR EXISTS(SELECT 1 FROM members m WHERE m.user=? AND m.expedition=r.expedition))'''
                    params=(uid,uid,viewer,viewer)
                    extra=''
                else:
                    clause='''FROM landmark_records r JOIN landmark_reviews v ON v.pin=r.pin
                      LEFT JOIN pins p ON p.id=r.pin WHERE v.voter=?'''
                    params=(uid,);extra=',v.value,v.updated'
                total=c.execute('SELECT COUNT(*) '+clause,params).fetchone()[0]
                rows=[dict(r) for r in c.execute('''SELECT r.pin,r.owner,r.expedition,r.title,r.kind,r.room_name,
                  r.venue,r.event_date,r.created,r.invalidated,COALESCE(p.expires,r.expires) AS expires,
                  p.id IS NULL AS removed,
                  COALESCE((SELECT SUM(value=1) FROM landmark_reviews WHERE pin=r.pin),0) AS likes,
                  COALESCE((SELECT SUM(value=-1) FROM landmark_reviews WHERE pin=r.pin),0) AS dislikes'''+extra+' '+clause+
                  (' ORDER BY v.updated DESC,r.pin' if kind=='given' else ' ORDER BY r.created DESC,r.pin')+' LIMIT 12 OFFSET ?',(*params,offset))]
                for row in rows:
                    row['active']=not row['removed'] and row['expires']>int(time.time())
                    row['can_view']=bool(c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(viewer,row['expedition'])).fetchone())
                    # Own historical votes stay retractable after leaving, but
                    # the old room's live feedback totals must not leak out.
                    if kind=='given' and viewer!=row['owner'] and not row['can_view']:
                        row.pop('likes');row.pop('dislikes')
                return {'items':rows,'total':total,'next_offset':offset+len(rows) if offset+len(rows)<total else None}
