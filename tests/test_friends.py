"""Friendship and location privacy checks, using a temporary database only."""
import concurrent.futures
import importlib
import os
from pathlib import Path
import secrets
import tempfile
import unittest

from fastapi.testclient import TestClient


class FriendsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.module = importlib.import_module('backend.app')
        cls.original_db = cls.module.DB
        cls.module.DB = Path(cls.temp.name) / 'friends.sqlite3'
        cls.ctx = TestClient(cls.module.app)
        cls.ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)
        cls.module.DB = cls.original_db
        cls.temp.cleanup()

    def setUp(self):
        with self.module.connect() as c:
            c.execute('DELETE FROM auth_attempts')
        self.clients = [TestClient(self.module.app, headers={'X-Tamago-Client': 'web'}) for _ in range(3)]
        self.password = 'Friend privacy test password 2026!'
        self.names = ['friend_'+secrets.token_hex(6) for _ in self.clients]
        self.users = [c.post('/api/auth/register', json={'username': name, 'nickname': '好友'+str(i), 'password': self.password}).json()
                      for i, (c, name) in enumerate(zip(self.clients, self.names))]
        self.a, self.b, self.c = self.clients
        self.point = {'lat': 25.033, 'lng': 121.5654, 'accuracy': 12}

    def invite(self):
        return self.a.post('/api/friends/requests', json={'username': self.names[1].upper()})

    def accept(self):
        self.assertEqual(self.invite().status_code, 200)
        self.assertEqual(self.b.post('/api/friends/'+self.users[0]['id']+'/accept').status_code, 200)

    def test_mutual_acceptance_without_any_expedition(self):
        self.assertEqual(self.a.get('/api/me').json()['expeditions'], [])
        self.assertEqual(self.a.put('/api/friends/location', json=self.point).status_code, 200)
        self.assertEqual(self.invite().status_code, 200)
        pending = self.b.get('/api/friends').json()
        self.assertEqual(pending['friends'], [])
        self.assertEqual(pending['incoming'][0]['id'], self.users[0]['id'])
        self.assertNotIn('lat', pending['incoming'][0])
        self.assertEqual(self.a.post('/api/friends/'+self.users[1]['id']+'/accept').status_code, 404)
        self.assertEqual(self.c.post('/api/friends/'+self.users[0]['id']+'/accept').status_code, 404)
        self.assertEqual(self.b.post('/api/friends/'+self.users[0]['id']+'/accept').status_code, 200)
        visible = self.b.get('/api/friends').json()['friends'][0]
        self.assertTrue(visible['location_visible'])
        self.assertEqual((visible['lat'], visible['lng']), (25.033, 121.5654))
        self.assertFalse(self.a.get('/api/friends').json()['friends'][0]['location_visible'])
        self.assertEqual(self.c.get('/api/friends').json()['friends'], [])
        self.assertEqual(self.b.get('/api/me').json()['expeditions'], [])

    def test_revocation_expiry_and_reacceptance(self):
        self.accept()
        self.a.put('/api/friends/location', json=self.point)
        self.assertTrue(self.b.get('/api/friends').json()['friends'][0]['location_visible'])
        with self.module.connect() as c:
            c.execute('UPDATE friend_locations SET located=? WHERE user=?', (self.module.now()-121, self.users[0]['id']))
        self.module.cleanup()
        stale = self.b.get('/api/friends').json()['friends'][0]
        self.assertTrue(stale['location_visible'])
        self.assertEqual(stale['location_status'],'last_known')
        self.assertEqual(stale['lat'],self.point['lat'])
        with self.module.connect() as c:
            c.execute('UPDATE friend_locations SET located=? WHERE user=?', (self.module.now()-899, self.users[0]['id']))
        self.assertTrue(self.b.get('/api/friends').json()['friends'][0]['location_visible'])
        with self.module.connect() as c:
            c.execute('UPDATE friend_locations SET located=? WHERE user=?', (self.module.now()-901, self.users[0]['id']))
        stale = self.b.get('/api/friends').json()['friends'][0]
        self.assertFalse(stale['location_visible'])
        self.assertTrue(all(stale[k] is None for k in ('lat', 'lng', 'accuracy', 'located')))
        self.a.put('/api/friends/location', json=self.point)
        self.a.delete('/api/friends/location')
        self.assertIsNone(self.b.get('/api/friends').json()['friends'][0]['lat'])
        self.a.put('/api/friends/location', json=self.point)
        self.b.delete('/api/friends/'+self.users[0]['id'])
        self.assertEqual(self.b.get('/api/friends').json()['friends'], [])
        self.assertEqual(self.a.get('/api/friends').json()['friends'], [])
        self.assertEqual(self.invite().status_code, 200)
        self.assertEqual(self.b.get('/api/friends').json()['friends'], [])

    def test_only_recipient_can_reject_pending_invitation(self):
        self.assertEqual(self.invite().status_code,200)
        pending=self.b.get('/api/friends').json()['incoming'][0]
        self.assertIsInstance(pending['requested_at'],int)
        self.assertNotIn('lat',pending)
        path='/api/friends/'+self.users[0]['id']+'/reject'
        self.assertEqual(TestClient(self.module.app,headers={'X-Tamago-Client':'web'}).post(path).status_code,401)
        self.assertEqual(self.c.post(path).status_code,404)
        self.assertEqual(self.a.post('/api/friends/'+self.users[1]['id']+'/reject').status_code,404)
        self.assertEqual(len(self.b.get('/api/friends').json()['incoming']),1)
        self.assertEqual(self.b.post(path).status_code,200)
        self.assertEqual(self.b.get('/api/friends').json()['incoming'],[])
        self.assertEqual(self.a.get('/api/friends').json()['outgoing'],[])
        self.assertEqual(self.invite().status_code,200)
        self.assertEqual(self.b.post('/api/friends/'+self.users[0]['id']+'/accept').status_code,200)
        self.assertEqual(self.b.post(path).status_code,404)
        self.assertEqual(len(self.b.get('/api/friends').json()['friends']),1)

    def test_invite_validation_permissions_and_atomic_duplicates(self):
        self.assertEqual(TestClient(self.module.app).get('/api/friends').status_code, 401)
        self.assertEqual(self.a.post('/api/friends/requests', json={'username': self.names[0]}).status_code, 409)
        self.assertEqual(self.a.post('/api/friends/requests', json={'username': 'missing_'+secrets.token_hex(4)}).status_code, 404)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            statuses = list(pool.map(lambda _: self.invite().status_code, range(2)))
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(self.b.post('/api/friends/requests', json={'username': self.names[0]}).status_code, 409)
        self.assertEqual(self.c.delete('/api/friends/'+self.users[0]['id']).status_code, 200)
        self.assertEqual(len(self.b.get('/api/friends').json()['incoming']), 1)
        self.assertEqual(self.a.put('/api/friends/location', json={**self.point, 'lat': 91}).status_code, 422)
        self.assertEqual(self.a.put('/api/friends/location', json=self.point, headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.assertEqual(self.a.get('/api/friends').headers['cache-control'], 'no-store')

    def test_logout_and_password_change_revoke_location(self):
        self.accept()
        self.a.put('/api/friends/location', json=self.point)
        self.assertEqual(self.a.post('/api/auth/password', json={'current_password': self.password, 'new_password': self.password+' updated'}).status_code, 200)
        self.assertIsNone(self.b.get('/api/friends').json()['friends'][0]['lat'])
        self.a.put('/api/friends/location', json=self.point)
        self.assertEqual(self.a.post('/api/auth/logout').status_code, 200)
        self.assertIsNone(self.b.get('/api/friends').json()['friends'][0]['lat'])
        self.assertEqual(self.a.get('/api/friends').status_code, 401)


if __name__ == '__main__':
    unittest.main()
