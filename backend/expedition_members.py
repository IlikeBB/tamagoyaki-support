"""Expedition leadership and membership operations; squad groups stay private."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict
from typing import Literal


class RoleInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['member', 'deputy']


class ExpeditionMembers:
    def __init__(self, connect, accounts, media, feedback, assistance, prune):
        self.connect, self.accounts, self.media = connect, accounts, media
        self.feedback, self.assistance, self.prune = feedback, assistance, prune
        self.router = APIRouter()
        self.router.add_api_route('/api/expeditions/{eid}/management', self.roster, methods=['GET'])
        self.router.add_api_route('/api/expeditions/{eid}/members/{uid}/role', self.set_role, methods=['PUT'])
        self.router.add_api_route('/api/expeditions/{eid}/members/{uid}', self.kick, methods=['DELETE'])

    def migrate(self):
        with self.connect() as c:
            if 'deputy' not in {row['name'] for row in c.execute('PRAGMA table_info(members)')}:
                c.execute('ALTER TABLE members ADD COLUMN deputy INTEGER NOT NULL DEFAULT 0 CHECK(deputy IN (0,1))')

    def manager(self, c, eid, uid):
        room = c.execute('SELECT id,name,owner FROM expeditions WHERE id=?', (eid,)).fetchone()
        if not room:
            raise HTTPException(404, '這支遠征隊已不存在。')
        membership = c.execute('SELECT deputy FROM members WHERE expedition=? AND user=?', (eid, uid)).fetchone()
        role = 'leader' if room['owner'] == uid else 'deputy' if membership and membership['deputy'] else 'member'
        if role == 'member':
            raise HTTPException(403, '只有團長或副團長可以管理成員。')
        return room, role

    @staticmethod
    def role(room, person):
        return 'leader' if person['user'] == room['owner'] else 'deputy' if person['deputy'] else 'member'

    def roster(self, eid: str, request: Request, offset: int = Query(default=0, ge=0, le=1000000)):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN')
            room, role = self.manager(c, eid, uid)
            total = c.execute('SELECT COUNT(*) FROM members WHERE expedition=?', (eid,)).fetchone()[0]
            rows = c.execute('''SELECT m.user,m.deputy,u.nickname FROM members m JOIN users u ON u.id=m.user
              WHERE m.expedition=? ORDER BY (m.user=?) DESC,m.deputy DESC,m.user LIMIT 50 OFFSET ?''',
                             (eid, room['owner'], offset)).fetchall()
            items = []
            for row in rows:
                target_role = self.role(room, row)
                items.append({'id': row['user'], 'nickname': row['nickname'],
                              'avatar_url': self.media.urls(c, row['user'])['avatar_url'], 'role': target_role,
                              'can_set_role': role == 'leader' and target_role != 'leader',
                              'can_kick': row['user'] != uid and target_role != 'leader' and (role == 'leader' or target_role == 'member')})
        return {'room': {'id': room['id'], 'name': room['name']}, 'my_role': role, 'items': items,
                'total': total, 'next_offset': offset + len(items) if offset + len(items) < total else None}

    def set_role(self, eid: str, uid: str, body: RoleInput, request: Request):
        actor = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            room, role = self.manager(c, eid, actor)
            if role != 'leader' or uid == room['owner']:
                raise HTTPException(403, '只有團長可以指派或取消副團長，團長由建立者擔任。')
            if not c.execute('UPDATE members SET deputy=? WHERE expedition=? AND user=?',
                             (int(body.role == 'deputy'), eid, uid)).rowcount:
                raise HTTPException(404, '這位成員已不在遠征隊。')
        return {'ok': True}

    def kick(self, eid: str, uid: str, request: Request):
        actor = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            room, role = self.manager(c, eid, actor)
            target = c.execute('SELECT user,deputy FROM members WHERE expedition=? AND user=?', (eid, uid)).fetchone()
            if not target:
                raise HTTPException(404, '這位成員已不在遠征隊。')
            target_role = self.role(room, target)
            if uid == actor or target_role == 'leader' or role == 'deputy' and target_role != 'member':
                raise HTTPException(403, '無法移除這位成員；副團長只能移除一般成員。')
            c.execute("UPDATE tasks SET status='cancelled' WHERE expedition=? AND owner=? AND status IN ('open','accepted')", (eid, uid))
            c.execute("UPDATE tasks SET status='open',assignee=NULL WHERE expedition=? AND assignee=? AND status='accepted'", (eid, uid))
            self.feedback.sync_room(c, eid)
            c.execute('DELETE FROM members WHERE expedition=? AND user=?', (eid, uid))
            self.prune(c, eid)
            self.assistance.prune(c, uid)
        return {'ok': True}
