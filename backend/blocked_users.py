"""User-owned block lists; no blacklist is visible to its targets."""
import time
from fastapi import APIRouter, HTTPException, Request


class BlockedUsers:
    def __init__(self, connect, accounts, media):
        self.connect, self.accounts, self.media = connect, accounts, media
        self.router = APIRouter()
        self.router.add_api_route('/api/blocks', self.listing, methods=['GET'])
        self.router.add_api_route('/api/blocks/{other}', self.block, methods=['PUT'])
        self.router.add_api_route('/api/blocks/{other}', self.unblock, methods=['DELETE'])

    def listing(self, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            items = [{'id': row['id'], 'nickname': row['nickname'], 'username': row['username'],
                     'avatar_url': self.media.urls(c, row['id'])['avatar_url']} for row in c.execute('''SELECT u.id,u.nickname,u.username FROM user_blocks b
              JOIN users u ON u.id=b.blocked WHERE b.owner=? ORDER BY b.created DESC,b.blocked''', (uid,))]
        return {'items': items}

    def block(self, other: str, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.accounts.require_active(c, uid)
            if uid == other:
                raise HTTPException(409, '不能將自己加入黑名單。')
            if not c.execute('SELECT 1 FROM users WHERE id=? AND username IS NOT NULL', (other,)).fetchone():
                raise HTTPException(404, '找不到這個帳號。')
            c.execute('INSERT OR IGNORE INTO user_blocks VALUES(?,?,?)', (uid, other, int(time.time())))
            c.execute('DELETE FROM friendships WHERE user_a=? AND user_b=?', tuple(sorted((uid, other))))
        return {'ok': True}

    def unblock(self, other: str, request: Request):
        uid = self.accounts.current_user(request)['id']
        with self.connect() as c:
            c.execute('DELETE FROM user_blocks WHERE owner=? AND blocked=?', (uid, other))
        return {'ok': True}
