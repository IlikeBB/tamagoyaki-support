from fastapi.testclient import TestClient
from tests import test_app


class ProfileContentTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()
        self.base='/api/profiles/me/content'

    def create(self,client=None,kind='meet',hours=2,path=None,title='自己的情報點'):
        response=(client or self.a).post((path or self.path)+'/pins',json={'title':title,'description':'內容 <script>private</script>','kind':kind,'lat':25.033,'lng':121.5654,'hours':hours})
        self.assertEqual(response.status_code,200);return response.json()

    def test_private_listing_separates_types_and_pages_without_coordinates(self):
        pin=self.create(hours=0);message=self.create(kind='message');self.create(self.b)
        for index in range(12):self.create(title='情報點 '+str(index))
        data=self.a.get(self.base).json()
        self.assertEqual(data['total'],13);self.assertEqual(len(data['items']),12);self.assertEqual(data['next_offset'],12)
        next_page=self.a.get(self.base+'?offset=12').json();self.assertEqual(len(next_page['items']),1);self.assertIsNone(next_page['next_offset'])
        items=data['items']+next_page['items'];self.assertEqual(len({row['id'] for row in items}),13)
        own=next(row for row in items if row['id']==pin['id']);self.assertIsNone(own['expires']);self.assertTrue(own['can_view']);self.assertTrue(own['can_delete'])
        self.assertTrue(all(not set(row)&{'lat','lng','accuracy','located','code'} for row in items))
        messages=self.a.get(self.base+'?kind=message').json();self.assertEqual([row['id'] for row in messages['items']],[message['id']])
        self.assertEqual(self.b.get(self.base).json()['total'],1)
        self.assertEqual(self.b.get('/api/profiles/'+self.users[0]['id']+'/content').status_code,404)
        self.assertEqual(TestClient(self.module.app).get(self.base).status_code,401)
        self.assertEqual(self.a.get(self.base+'?kind=task').status_code,422);self.assertEqual(self.a.get(self.base+'?offset=-1').status_code,422)
        self.assertEqual(self.a.get(self.base).headers['cache-control'],'no-store')

    def test_owner_can_manage_expired_and_left_private_room_content(self):
        room=self.a.post('/api/expeditions',json={'name':'私人遠征','venue':'japan','discoverable':False}).json();path='/api/expeditions/'+room['id']
        self.b.post('/api/join',json={'code':room['code']});pin=self.create(self.b,path=path)
        with self.module.connect() as db:db.execute('UPDATE pins SET expires=? WHERE id=?',(self.module.now()-1,pin['id']))
        self.b.delete(path+'/membership')
        row=next(row for row in self.b.get(self.base).json()['items'] if row['id']==pin['id'])
        self.assertFalse(row['active']);self.assertFalse(row['can_view']);self.assertTrue(row['can_delete'])
        self.assertEqual(self.b.delete(path+'/pins/'+pin['id']).status_code,403)
        self.assertEqual(self.b.delete(self.base+'/'+pin['id']).status_code,200)
        self.assertNotIn(pin['id'],[row['id'] for row in self.b.get(self.base).json()['items']])

    def test_deletion_is_owner_only_and_preserves_feedback_xp(self):
        pin=self.create(self.b);message=self.create(self.b,kind='message');path=self.path+'/pins/'+pin['id']
        self.assertEqual(self.a.put(path+'/vote',json={'value':1}).status_code,200)
        before=self.b.get('/api/profiles/me').json();bid=self.users[1]['id']
        self.assertEqual(self.a.delete(self.base+'/'+pin['id']).status_code,404)  # Even the captain manages only their own content here.
        self.assertEqual(self.c.delete(self.base+'/'+pin['id']).status_code,404)
        self.assertEqual(self.outsider.delete(self.base+'/'+pin['id']).status_code,404)
        self.assertEqual(TestClient(self.module.app).delete(self.base+'/'+pin['id'],headers={'X-Tamago-Client':'web'}).status_code,401)
        self.assertEqual(self.b.delete(self.base+'/'+pin['id']).status_code,200)
        self.assertEqual(self.b.delete(self.base+'/'+pin['id']).status_code,404)
        after=self.b.get('/api/profiles/me').json();self.assertEqual(before['reputation'],after['reputation']);self.assertEqual(before['rpg'],after['rpg'])
        record=next(row for row in self.b.get('/api/profiles/me/feedback').json()['items'] if row['id']==pin['id'])
        self.assertTrue(record['removed']);self.assertEqual(record['likes'],1)
        self.assertFalse(any(row['id']==pin['id'] for row in self.snapshot(self.a)['pins']))
        self.assertEqual(self.b.delete(self.base+'/'+message['id']).status_code,200)
        self.assertEqual(self.b.get(self.base+'?kind=message').json()['total'],0)
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT owner FROM landmark_records WHERE pin=?',(message['id'],)).fetchone()['owner'],bid)
