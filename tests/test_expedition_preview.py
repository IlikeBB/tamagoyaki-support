from fastapi.testclient import TestClient
from tests import test_app


class ExpeditionPreviewTest(test_app.RendezvousTest):
    def test_authenticated_nonmember_can_preview_public_roster_without_gps_or_joining(self):
        path=self.path+'/preview'
        with self.module.connect() as db:db.execute('UPDATE expeditions SET discoverable=0 WHERE id=?',(self.room['id'],))
        self.assertEqual(TestClient(self.module.app).get(path).status_code,401)
        self.assertEqual(self.outsider.get(path).status_code,404)
        self.a.put('/api/location',json={'lat':25.033,'lng':121.5654,'accuracy':8,'scope':'friends_squad'})
        with self.module.connect() as db:
            db.execute('UPDATE expeditions SET discoverable=1 WHERE id=?',(self.room['id'],))
            before=[tuple(row) for row in db.execute('SELECT * FROM members WHERE expedition=? ORDER BY user',(self.room['id'],))]
        response=self.outsider.get(path);self.assertEqual(response.status_code,200);data=response.json()
        self.assertEqual(response.headers['cache-control'],'no-store')
        self.assertEqual(data['total'],3);self.assertIsNone(data['next_offset'])
        self.assertEqual(set(data['room']),{'id','name'})
        self.assertTrue(all(set(row)=={'id','nickname','avatar_url'} for row in data['items']))
        self.assertEqual({row['id'] for row in data['items']},{user['id'] for user in self.users[:3]})
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        with self.module.connect() as db:
            after=[tuple(row) for row in db.execute('SELECT * FROM members WHERE expedition=? ORDER BY user',(self.room['id'],))]
            self.assertEqual(before,after)

    def test_private_and_past_rooms_only_allow_members_or_creator(self):
        path=self.path+'/preview'
        with self.module.connect() as db:db.execute('UPDATE expeditions SET discoverable=0 WHERE id=?',(self.room['id'],))
        self.assertEqual(self.b.get(path).status_code,200)
        self.b.delete(self.path+'/membership');self.assertEqual(self.b.get(path).status_code,404)
        self.a.delete(self.path+'/membership');self.assertEqual(self.a.get(path).status_code,200)
        with self.module.connect() as db:db.execute("UPDATE expeditions SET discoverable=1,event_date='2000-01-01' WHERE id=?",(self.room['id'],))
        self.assertEqual(self.outsider.get(path).status_code,404);self.assertEqual(self.c.get(path).status_code,200)
        self.a.delete(self.path);self.assertEqual(self.a.get(path).status_code,404)

    def test_roster_pagination_is_bounded_and_validated(self):
        with self.module.connect() as db:
            for index in range(103):
                uid=self.room['id']+'-preview-'+str(index).zfill(3)
                db.execute('INSERT INTO users(id,token,nickname,expires) VALUES(?,?,?,?)',(uid,'token-'+uid,'成員 '+str(index),self.module.now()+3600))
                db.execute('INSERT INTO members(user,expedition,seen) VALUES(?,?,?)',(uid,self.room['id'],self.module.now()))
        ids=[];offset=0
        while offset is not None:
            data=self.a.get(self.path+'/preview',params={'offset':offset}).json();self.assertEqual(data['total'],106);self.assertLessEqual(len(data['items']),50)
            ids.extend(row['id'] for row in data['items']);offset=data['next_offset']
        self.assertEqual(len(ids),106);self.assertEqual(len(set(ids)),106)
        self.assertEqual(self.a.get(self.path+'/preview?offset=-1').status_code,422)
        self.assertEqual(self.a.get(self.path+'/preview?offset=1000001').status_code,422)
        self.assertEqual(self.a.get(self.path+'/preview?offset=500').json()['items'],[])


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(ExpeditionPreviewTest,name,None)
