"""Account administration bound to the existing momo account's immutable ID."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, StrictBool


class AccountStatus(BaseModel):
    model_config = ConfigDict(extra='forbid')
    suspended: StrictBool


class SiteAdmin:
    def __init__(self, connect, accounts):
        self.connect, self.accounts = connect, accounts
        self.router = APIRouter()
        self.router.add_api_route('/api/admin/users', self.users, methods=['GET'])
        self.router.add_api_route('/api/admin/users/{uid}/status', self.status, methods=['PUT'])

    @staticmethod
    def authorize(c, uid):
        if not c.execute('''SELECT 1 FROM site_admin_owner a JOIN users u ON u.id=a.user
          WHERE a.user=? AND u.suspended=0''', (uid,)).fetchone():
            raise HTTPException(403, '只有 momo 可以管理網站帳號。')

    def users(self, request: Request, offset: int = Query(default=0, ge=0, le=1000000), search: str = Query(default='', max_length=80)):
        actor = self.accounts.current_user(request)['id']
        query = search.strip().lower()
        with self.connect() as c:
            c.execute('BEGIN')
            self.authorize(c, actor)
            total, suspended = c.execute('SELECT COUNT(*),COALESCE(SUM(suspended),0) FROM users WHERE username IS NOT NULL').fetchone()
            clause = "username IS NOT NULL AND (instr(lower(username),?)>0 OR instr(lower(nickname),?)>0)"
            matched = c.execute('SELECT COUNT(*) FROM users WHERE '+clause, (query, query)).fetchone()[0]
            items = [dict(row) for row in c.execute('''SELECT id,username,nickname,registered,suspended,
              EXISTS(SELECT 1 FROM site_admin_owner a WHERE a.user=users.id) AS is_admin FROM users WHERE '''+clause+
              ' ORDER BY registered DESC,id LIMIT 50 OFFSET ?', (query, query, offset))]
        return {'total': total, 'active': total-suspended, 'suspended': suspended, 'matched': matched, 'items': items,
                'next_offset': offset+len(items) if offset+len(items)<matched else None}

    def status(self, uid: str, body: AccountStatus, request: Request):
        actor = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.authorize(c, actor)
            if uid == actor or c.execute('SELECT 1 FROM site_admin_owner WHERE user=?', (uid,)).fetchone():
                raise HTTPException(403, '不能停用管理員帳號。')
            target = c.execute('SELECT suspended FROM users WHERE id=? AND username IS NOT NULL', (uid,)).fetchone()
            if not target:
                raise HTTPException(404, '找不到這個帳號。')
            c.execute('UPDATE users SET suspended=? WHERE id=?', (int(body.suspended), uid))
            if body.suspended:
                c.execute('DELETE FROM sessions WHERE user=?', (uid,))
                c.execute("UPDATE members SET scope='off',lat=NULL,lng=NULL,accuracy=NULL,located=NULL,seen=0 WHERE user=?", (uid,))
                c.execute('DELETE FROM friend_locations WHERE user=?', (uid,))
                c.execute('DELETE FROM help_locations WHERE user=?', (uid,))
        return {'ok': True, 'suspended': body.suspended}
