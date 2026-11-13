"""Only the pinned momo identity can count, suspend, or restore registered accounts."""
from unittest import mock
from fastapi.testclient import TestClient
from tests import test_app


class SiteAdminTest(test_app.RendezvousTest):
    def setUp(self):
        super().setUp()
        with self.module.connect() as db:
            db.execute('DELETE FROM site_admin_owner')
            db.execute("UPDATE users SET username='former_admin_'||id WHERE username='momo'")
            db.execute("UPDATE users SET username='momo' WHERE id=?",(self.users[0]['id'],))
        self.module.accounts.migrate()

    def status(self,client,uid,suspended=True):
        return client.put('/api/admin/users/'+uid+'/status',json={'suspended':suspended})

    def test_only_pinned_admin_can_list_and_change_accounts(self):
        aid,bid=self.users[0]['id'],self.users[1]['id']
        self.assertTrue(self.a.get('/api/me').json()['user']['site_admin'])
        self.assertFalse(self.b.get('/api/me').json()['user']['site_admin'])
        self.assertEqual(TestClient(self.module.app).get('/api/admin/users').status_code,401)
        self.assertEqual(self.b.get('/api/admin/users').status_code,403)
        self.assertEqual(self.status(self.b,bid).status_code,403)
        self.assertEqual(self.status(self.a,aid).status_code,403)
        self.assertEqual(self.status(self.a,'missing').status_code,404)
        self.assertEqual(self.a.put('/api/admin/users/'+bid+'/status',json={'suspended':'true'}).status_code,422)
        self.assertEqual(self.a.put('/api/admin/users/'+bid+'/status',json={'suspended':True,'admin':True}).status_code,422)
        with self.module.connect() as db:
            db.execute("UPDATE users SET username='renamed_momo' WHERE id=?",(aid,))
            db.execute("UPDATE users SET username='momo',nickname='momo' WHERE id=?",(bid,))
        self.module.accounts.migrate()
        self.assertEqual(self.a.get('/api/admin/users').status_code,200)
        self.assertEqual(self.b.get('/api/admin/users').status_code,403)

    def test_suspension_revokes_all_sessions_and_sharing_but_preserves_content(self):
        bid=self.users[1]['id']
        other=TestClient(self.module.app,headers={'X-Tamago-Client':'web'})
        self.assertEqual(other.post('/api/auth/login',json={'username':self.usernames[1],'password':self.password}).status_code,200)
        old_token=other.cookies.get('tamago_session')
        self.b.put('/api/friends/location',json={'lat':25,'lng':121,'accuracy':5})
        pin=self.b.post(self.path+'/pins',json={'title':'保留情報','kind':'meet','hours':0,'lat':25,'lng':121}).json()
        with self.module.connect() as db:
            stale=dict(db.execute('SELECT * FROM users WHERE id=?',(bid,)).fetchone())
            db.execute('INSERT INTO help_locations VALUES(?,?,?,?,?,?)',(bid,self.room['id'],25,121,5,self.module.now()))
        self.assertEqual(self.status(self.a,bid).status_code,200)
        self.assertIsNone(self.b.get('/api/me').json()['user'])
        self.assertEqual(other.get(self.path).status_code,401)
        self.assertEqual(other.post('/api/auth/login',json={'username':self.usernames[1],'password':self.password}).status_code,401)
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions WHERE user=?',(bid,)).fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM friend_locations WHERE user=?',(bid,)).fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM help_locations WHERE user=?',(bid,)).fetchone()[0],0)
            self.assertIsNotNone(db.execute('SELECT 1 FROM pins WHERE id=?',(pin['id'],)).fetchone())
            row=db.execute('SELECT scope,lat,seen FROM members WHERE user=? AND expedition=?',(bid,self.room['id'])).fetchone()
            self.assertEqual(tuple(row),('off',None,0))
        with mock.patch.object(self.module.accounts,'current_user',return_value=stale):
            point={'lat':25,'lng':121,'accuracy':5}
            self.assertEqual(other.put('/api/friends/location',json=point).status_code,401)
            self.assertEqual(other.put('/api/location',json=point).status_code,401)
            self.assertEqual(other.put('/api/help/location',json=point).status_code,401)
        self.assertEqual(self.status(self.a,bid,False).status_code,200)
        self.assertIsNone(other.get('/api/me',headers={'Cookie':'tamago_session='+old_token}).json()['user'])
        self.assertEqual(other.post('/api/auth/login',json={'username':self.usernames[1],'password':self.password}).status_code,200)
        self.assertEqual(other.get(self.path).status_code,200)

    def test_registered_count_search_pagination_and_safe_fields(self):
        with self.module.connect() as db:
            before=db.execute('SELECT COUNT(*) FROM users WHERE username IS NOT NULL').fetchone()[0]
            db.execute('INSERT INTO users(id,token,nickname,expires) VALUES(?,?,?,?)',(self.room['id']+'legacy',self.room['id']+'legacy','訪客',self.module.now()+3600))
            for index in range(53):
                uid=self.room['id']+'page'+str(index)
                db.execute('INSERT INTO users(id,token,nickname,expires,username,registered) VALUES(?,?,?,?,?,?)',(uid,uid,'page-'+self.room['id'],self.module.now()+3600,uid,self.module.now()))
        first=self.a.get('/api/admin/users?search=page-'+self.room['id']).json()
        self.assertEqual(first['total'],before+53);self.assertEqual(first['matched'],53)
        self.assertEqual(len(first['items']),50)
        second=self.a.get('/api/admin/users?search=page-'+self.room['id']+'&offset=50').json()
        self.assertEqual(len(second['items']),3);self.assertIsNone(second['next_offset'])
        self.assertEqual(len({p['id'] for p in first['items']+second['items']}),53)
        self.assertEqual(set(first['items'][0]),{'id','username','nickname','registered','suspended','is_admin'})
        self.assertEqual(self.a.get('/api/admin/users?offset=-1').status_code,422)
        self.assertEqual(self.a.get('/api/admin/users?search='+'x'*81).status_code,422)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(SiteAdminTest,name,None)
