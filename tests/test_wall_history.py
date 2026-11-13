import concurrent.futures

from fastapi.testclient import TestClient
from tests import test_app


class WallHistoryTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()
        self.remove='/api/profiles/me/wall/'+self.room['id']

    def wall(self,client,uid='me'):
        return client.get('/api/profiles/'+uid+'/wall').json()

    def test_only_own_past_record_can_be_removed(self):
        mine=next(item for item in self.wall(self.b)['items'] if item['id']==self.room['id'])
        self.assertFalse(mine['can_remove'])
        self.assertEqual(self.b.delete(self.remove).status_code,409)
        self.assertEqual(self.outsider.delete(self.remove).status_code,404)
        self.b.delete(self.path+'/membership')
        self.assertTrue(next(item for item in self.wall(self.b)['items'] if item['id']==self.room['id'])['can_remove'])
        self.assertFalse(next(item for item in self.wall(self.a,self.users[1]['id'])['items'] if item['id']==self.room['id'])['can_remove'])
        self.assertEqual(self.b.delete(self.remove).status_code,200)
        self.assertEqual(self.b.delete(self.remove).status_code,200)
        self.assertEqual(self.wall(self.b)['total'],0)
        self.assertEqual(self.wall(self.a,self.users[1]['id'])['total'],0)
        self.assertEqual(self.wall(self.a)['total'],1)
        self.assertEqual(self.wall(self.c)['total'],1)
        self.assertEqual(self.a.get(self.path).status_code,200)
        self.assertEqual(len(self.a.get(self.path).json()['members']),2)
        self.assertIn(TestClient(self.module.app).delete(self.remove).status_code,(401,403))
        forged='/api/profiles/'+self.users[0]['id']+'/wall/'+self.room['id']
        self.assertIn(self.b.delete(forged).status_code,(404,405))

    def test_migration_keeps_removed_owner_history_hidden_and_rejoining_restores_it(self):
        self.a.delete(self.path+'/membership')
        self.assertEqual(self.a.delete(self.remove).status_code,200)
        for _ in range(2):self.module.profiles.migrate()
        self.assertEqual(self.wall(self.a)['total'],0)
        self.assertEqual(self.a.post('/api/join',json={'code':self.room['code']}).status_code,200)
        current=self.wall(self.a)['items']
        self.assertEqual(len(current),1);self.assertTrue(current[0]['participating']);self.assertFalse(current[0]['can_remove'])
        self.assertEqual(self.a.delete(self.remove).status_code,409)

    def test_deleted_room_history_removal_keeps_other_profiles_and_feedback(self):
        pin=self.a.post(self.path+'/pins',json={'title':'歷史地標','kind':'meet','hours':2,'lat':25,'lng':121}).json()
        self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':1})
        self.a.delete(self.path)
        self.assertTrue(self.wall(self.a)['items'][0]['can_remove'])
        self.assertEqual(self.a.delete(self.remove).status_code,200)
        self.assertEqual(self.wall(self.a)['total'],0)
        self.assertEqual(self.wall(self.b)['total'],1)
        self.assertEqual(self.a.get('/api/profiles/me').json()['reputation']['likes'],1)
        self.assertEqual(self.a.get('/api/profiles/me/feedback').json()['total'],1)
        self.module.profiles.migrate()
        self.assertEqual(self.wall(self.a)['total'],0)
        with self.module.connect() as db:self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_join_and_remove_serialize_without_hiding_a_current_membership(self):
        self.b.delete(self.path+'/membership')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            removal=pool.submit(self.b.delete,self.remove)
            joining=pool.submit(self.b.post,'/api/join',json={'code':self.room['code']})
            self.assertIn(removal.result().status_code,(200,409))
            self.assertEqual(joining.result().status_code,200)
        current=self.wall(self.b)['items']
        self.assertEqual(len(current),1);self.assertTrue(current[0]['participating'])
        with self.module.connect() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM profile_wall_removals WHERE user=? AND expedition=?',(self.users[1]['id'],self.room['id'])).fetchone())

    def test_removals_update_wall_totals_and_pagination(self):
        with self.module.connect() as db:
            for index in range(14):
                eid='archived-'+self.room['id']+'-'+str(index)
                db.execute('INSERT INTO expedition_records(id,owner,name,venue,event_date,discoverable) VALUES(?,?,?,?,?,?)',(eid,self.users[0]['id'],'歷史場次 '+str(index),'taiwan','',1))
                db.execute('INSERT INTO expedition_history VALUES(?,?,?,?)',(self.users[1]['id'],eid,index,index))
        before=self.wall(self.b);self.assertEqual(before['total'],15);self.assertEqual(len(before['items']),12)
        past=next(item for item in before['items'] if item['can_remove'])
        self.assertEqual(self.b.delete('/api/profiles/me/wall/'+past['id']).status_code,200)
        first=self.wall(self.b);second=self.b.get('/api/profiles/me/wall?offset=12').json()
        self.assertEqual(first['total'],14);self.assertEqual(first['next_offset'],12);self.assertEqual(len(second['items']),2)
        self.assertNotIn(past['id'],[item['id'] for item in first['items']+second['items']])


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(WallHistoryTest,name,None)
