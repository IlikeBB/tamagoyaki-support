import concurrent.futures
import secrets
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
        self.assertEqual(self.a.get(self.base+'?kind=unknown').status_code,422);self.assertEqual(self.a.get(self.base+'?offset=-1').status_code,422)
        self.assertEqual(self.a.get(self.base).headers['cache-control'],'no-store')

    def test_authored_tasks_are_private_paginated_and_hide_finished_work(self):
        tasks=[self.make_task() for _ in range(16)]
        self.b.post(self.path+'/tasks/'+tasks[0]['id']+'/accept')
        self.a.post(self.path+'/tasks/'+tasks[1]['id']+'/complete')
        self.a.post(self.path+'/tasks/'+tasks[2]['id']+'/cancel')
        with self.module.connect() as db:
            db.execute('UPDATE tasks SET expires=? WHERE id=?',(self.module.now()-1,tasks[3]['id']))
        self.b.post(self.path+'/tasks',json={'title':'別人的任務','kind':'dining','lat':25,'lng':121,'hours':2})
        path=self.base+'?kind=task'
        first=self.a.get(path);self.assertEqual(first.status_code,200)
        data=first.json();self.assertEqual(data['total'],13);self.assertEqual(len(data['items']),12);self.assertEqual(data['next_offset'],12)
        last=self.a.get(path+'&offset=12').json();self.assertIsNone(last['next_offset'])
        rows=data['items']+last['items'];self.assertEqual(len({row['id'] for row in rows}),13)
        self.assertEqual({row['id'] for row in rows},{task['id'] for task in tasks}-{task['id'] for task in tasks[1:4]})
        self.assertTrue(all(row['can_view'] and not row['can_delete'] for row in rows))
        self.assertFalse(any(set(row)&{'lat','lng','accuracy','located','assignee','code','owner'} for row in rows))
        self.assertEqual(next(row for row in rows if row['id']==tasks[0]['id'])['status'],'accepted')
        self.assertEqual(self.b.get(path).json()['total'],1)
        self.assertEqual(TestClient(self.module.app).get(path).status_code,401)
        self.assertEqual(self.b.get('/api/profiles/'+self.users[0]['id']+'/content?kind=task').status_code,404)
        self.assertEqual(first.headers['cache-control'],'no-store')

    def test_ongoing_help_stays_listed_after_expiry_and_leaving_hides_cancelled_tasks(self):
        task=self.a.post(self.path+'/tasks',json={'title':'求助','kind':'help','lat':25,'lng':121,'accuracy':8,'help_broadcast':True,'hours':2}).json()
        with self.module.connect() as db:
            db.execute('UPDATE tasks SET expires=? WHERE id=?',(self.module.now()-1,task['id']))
        rows=self.a.get(self.base+'?kind=task').json()['items'];self.assertEqual(rows[0]['id'],task['id']);self.assertTrue(rows[0]['help_active'])
        own=self.b.post(self.path+'/tasks',json={'title':'自己的任務','kind':'dining','lat':25,'lng':121,'hours':2}).json()
        self.b.delete(self.path+'/membership')
        self.assertEqual(self.b.get(self.base+'?kind=task').json()['items'],[])

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

    def test_landmark_reports_membership_nonce_validation_and_no_gps(self):
        pin=self.create(hours=0);path=self.path+'/pins/'+pin['id']+'/reports';body={'body':'排隊約十分鐘 <script>x</script>','client_id':secrets.token_hex(16)}
        self.assertEqual(self.outsider.get(path).status_code,403);self.assertEqual(self.outsider.post(path,json=body).status_code,403)
        with concurrent.futures.ThreadPoolExecutor() as pool:responses=list(pool.map(lambda _:self.b.post(path,json=body),range(2)))
        self.assertTrue(all(response.status_code==200 for response in responses));self.assertEqual(responses[0].json()['id'],responses[1].json()['id'])
        data=self.c.get(path).json();self.assertEqual(data['total'],1);self.assertFalse(data['items'][0]['can_delete']);self.assertEqual(data['items'][0]['body'],body['body'])
        self.assertFalse(set(data['items'][0])&{'lat','lng','accuracy','located','client_id'})
        self.assertEqual(self.b.post(path,json={**body,'body':'改寫內容'}).status_code,409)
        self.assertEqual(self.b.post(path,json={**body,'body':'  '}).status_code,422)
        self.assertEqual(self.b.post(path,json={**body,'body':'x'*601}).status_code,422)
        self.assertEqual(self.b.post(path,json={**body,'lat':25}).status_code,422)
        self.assertTrue(all(row['lat'] is None for row in self.snapshot(self.c)['members']))
        self.assertEqual(self.snapshot(self.b)['me']['scope'],'off')
        self.b.delete(self.path+'/membership');self.assertEqual(self.b.post(path,json=body).status_code,403)

    def test_report_management_survives_parent_deletion_and_preserves_xp(self):
        pin=self.create(hours=0);path=self.path+'/pins/'+pin['id']+'/reports'
        report=self.b.post(path,json={'body':'還有特典可以領取','client_id':secrets.token_hex(16)}).json()
        self.assertEqual(self.c.delete(path+'/'+report['id']).status_code,403)
        managed=self.b.get(self.base+'?kind=message').json()['items'][0]
        self.assertEqual(managed['source'],'report');self.assertEqual(managed['parent_pin'],pin['id']);self.assertTrue(managed['can_view'])
        self.assertEqual(self.a.delete(self.base+'/'+report['id']+'?source=report').status_code,404)
        self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':1});before=self.a.get('/api/profiles/me').json()['rpg']
        self.a.delete(self.path+'/pins/'+pin['id']);self.assertEqual(self.b.get(path).status_code,404)
        managed=self.b.get(self.base+'?kind=message').json()['items'][0];self.assertTrue(managed['parent_removed']);self.assertFalse(managed['can_view'])
        self.b.delete(self.path+'/membership');self.assertEqual(self.b.delete(self.base+'/'+report['id']+'?source=report').status_code,200)
        self.assertEqual(self.b.get(self.base+'?kind=message').json()['total'],0);self.assertEqual(self.a.get('/api/profiles/me').json()['rpg'],before)

    def test_report_feed_is_bounded_and_captain_can_remove(self):
        pin=self.create();path=self.path+'/pins/'+pin['id']+'/reports'
        for index in range(23):self.b.post(path,json={'body':'人潮更新 '+str(index),'client_id':secrets.token_hex(16)})
        data=self.a.get(path).json();self.assertEqual(data['total'],23);self.assertEqual(len(data['items']),20)
        self.assertTrue(all(row['can_delete'] for row in data['items']))
        self.assertEqual(self.a.delete(path+'/'+data['items'][0]['id']).status_code,200)
        self.assertEqual(self.b.get(path).json()['total'],22)
        with self.module.connect() as db:db.execute('UPDATE pins SET expires=? WHERE id=?',(self.module.now()-1,pin['id']))
        self.assertEqual(self.b.get(path).status_code,404);self.assertEqual(self.b.post(path,json={'body':'過期回報','client_id':secrets.token_hex(16)}).status_code,404)

    def test_interactions_follow_author_and_annotate_only_current_viewer(self):
        pin=self.create(hours=0);second=self.create(hours=0);other=self.create(self.c,hours=0)
        flags=lambda client:{row['id']:row for row in self.snapshot(client)['pins']}
        self.assertFalse(flags(self.b)[pin['id']]['following_author'])
        self.assertFalse(flags(self.b)[pin['id']]['reported_by_me'])
        self.assertEqual(self.outsider.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':1}).status_code,403)
        self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':1})
        self.assertTrue(flags(self.b)[second['id']]['following_author'])
        self.assertFalse(flags(self.c)[second['id']]['following_author'])
        self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':0})
        self.assertEqual(flags(self.b)[pin['id']]['my_vote'],0)
        self.assertTrue(flags(self.b)[second['id']]['following_author'])
        self.b.put(self.path+'/pins/'+other['id']+'/vote',json={'value':-1})
        self.assertFalse(flags(self.b)[other['id']]['following_author'])
        report_path=self.path+'/pins/'+other['id']+'/reports'
        report=self.b.post(report_path,json={'body':'目前空位很多','client_id':secrets.token_hex(16)}).json()
        self.assertTrue(flags(self.b)[other['id']]['reported_by_me'])
        self.assertTrue(flags(self.b)[other['id']]['following_author'])
        new=self.create(self.c,hours=0)
        self.assertTrue(flags(self.b)[new['id']]['following_author'])
        self.b.delete(report_path+'/'+report['id'])
        self.assertFalse(flags(self.b)[other['id']]['reported_by_me'])
        self.assertTrue(flags(self.b)[other['id']]['following_author'])
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        self.module.init_db();self.module.init_db()
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM landmark_follows WHERE follower=?',(self.users[1]['id'],)).fetchone()[0],2)
