from tests import test_app


class AssistanceTest(test_app.RendezvousTest):
    # Reuse the isolated database/account setup without rerunning inherited tests.
    def help(self,client=None,path=None):
        response=(client or self.a).post((path or self.path)+'/tasks',json={
            'title':'需要現場協助','kind':'help','lat':25.033,'lng':121.5654,
            'accuracy':8,'help_broadcast':True,'location_mode':'fixed','hours':1})
        self.assertEqual(response.status_code,200)
        return response.json()

    def test_help_broadcast_requires_consent_and_stays_in_its_expedition(self):
        self.assertEqual(self.a.post(self.path+'/tasks',json={'title':'未授權求助','kind':'help','lat':25,'lng':121}).status_code,422)
        task=self.help();self.assertEqual(task['location_mode'],'publisher')
        for client in (self.a,self.b,self.c):
            snapshot=self.snapshot(client);visible=next(t for t in snapshot['tasks'] if t['id']==task['id'])
            self.assertTrue(visible['location_visible']);self.assertEqual(visible['location_source'],'help')
            self.assertEqual(visible['lat'],25.033)
        for client in (self.b,self.c):
            member=next(m for m in self.snapshot(client)['members'] if m['user']==self.users[0]['id'])
            self.assertTrue(member['help_shared']);self.assertEqual(member['lng'],121.5654)
        other=self.a.post('/api/expeditions',json={'name':'另一個場館','venue':'pia','event_date':self.room['event_date']}).json()
        self.outsider.post('/api/join',json={'code':other['code']})
        other_data=self.outsider.get('/api/expeditions/'+other['id']).json()
        self.assertFalse(other_data['tasks'])
        member=next(m for m in other_data['members'] if m['user']==self.users[0]['id'])
        self.assertIsNone(member['lat']);self.assertFalse(member['help_shared'])
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        location={'lat':25.04,'lng':121.57,'accuracy':10}
        self.assertEqual(self.a.put('/api/friends/location',json=location).status_code,409)
        self.assertEqual(self.a.put(self.path+'/location',json={**location,'scope':'expedition'}).status_code,409)
        self.assertEqual(self.a.put('/api/help/location',json=location).status_code,200)
        self.assertEqual(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])['lat'],25.04)

    def test_help_lasts_until_deleted_and_multiple_tasks_share_one_watch(self):
        one,two=self.help(),self.help()
        with self.module.connect() as db:
            db.execute('UPDATE tasks SET expires=? WHERE id IN (?,?)',(self.module.now()-1,one['id'],two['id']))
        self.assertEqual(len([t for t in self.snapshot(self.b)['tasks'] if t['help_active']]),2)
        one_path=self.path+'/tasks/'+one['id']
        self.assertEqual(self.a.post(one_path+'/complete').status_code,409)
        self.assertEqual(self.b.post(one_path+'/cancel').status_code,403)
        self.assertEqual(self.a.post(one_path+'/cancel').status_code,200)
        self.assertEqual(self.a.get('/api/me').json()['help_rooms'][0]['tasks'],1)
        self.assertEqual(self.a.put('/api/help/location',json={'lat':25.03,'lng':121.56,'accuracy':9}).status_code,200)
        self.assertEqual(self.a.post(self.path+'/tasks/'+two['id']+'/cancel').status_code,200)
        self.assertFalse(self.a.get('/api/me').json()['help_rooms'])
        self.assertTrue(all(not m['help_shared'] and m['lat'] is None for m in self.snapshot(self.b)['members']))
        self.assertEqual(self.a.put('/api/help/location',json={'lat':25,'lng':121,'accuracy':9}).status_code,409)
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM help_locations WHERE user=?',(self.users[0]['id'],)).fetchone()[0],0)

    def test_stale_help_does_not_fall_back_to_published_coordinates(self):
        task=self.help()
        with self.module.connect() as db:
            db.execute('UPDATE help_locations SET located=? WHERE user=?',(self.module.now()-121,self.users[0]['id']))
        self.module.cleanup()
        for client in (self.a,self.b,self.c):
            task_view=next(t for t in self.snapshot(client)['tasks'] if t['id']==task['id'])
            self.assertTrue(task_view['location_visible'])
            self.assertEqual(task_view['location_status'],'last_known')
            self.assertEqual(task_view['lat'],25.033)
        with self.module.connect() as db:
            db.execute('UPDATE help_locations SET located=? WHERE user=?',(self.module.now()-899,self.users[0]['id']))
        self.assertTrue(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])['location_visible'])
        with self.module.connect() as db:
            db.execute('UPDATE help_locations SET located=? WHERE user=?',(self.module.now()-901,self.users[0]['id']))
        for client in (self.a,self.b,self.c):
            task_view=next(t for t in self.snapshot(client)['tasks'] if t['id']==task['id'])
            self.assertFalse(task_view['location_visible']);self.assertIsNone(task_view['lat']);self.assertIsNone(task_view['lng'])
        self.assertEqual(self.a.delete('/api/help/location').status_code,200)
        self.assertTrue(self.a.get('/api/me').json()['help_rooms'])
        self.assertEqual(self.a.delete(self.path+'/membership').status_code,200)
        self.assertFalse(self.a.get('/api/me').json()['help_rooms'])

    def test_logout_withdraws_help_location_but_preserves_task_for_resume(self):
        task=self.help()
        self.assertEqual(self.a.post('/api/auth/logout',json={}).status_code,200)
        visible=next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])
        self.assertFalse(visible['location_visible']);self.assertIsNone(visible['lat'])
        self.assertEqual(visible['status'],'open')
        self.assertEqual(self.a.put('/api/help/location',json={'lat':25,'lng':121,'accuracy':9}).status_code,401)

    def test_leaving_one_help_room_preserves_another_help_room_only(self):
        self.help()
        other=self.a.post('/api/expeditions',json={'name':'第二個求助場館','venue':'pia','event_date':self.room['event_date']}).json()
        other_path='/api/expeditions/'+other['id']
        self.outsider.post('/api/join',json={'code':other['code']})
        self.help(path=other_path)
        self.assertEqual(len(self.a.get('/api/me').json()['help_rooms']),2)
        result=self.a.delete(self.path+'/membership').json()
        self.assertEqual([r['id'] for r in result['help_rooms']],[other['id']])
        self.assertEqual(self.a.put('/api/help/location',json={'lat':25.04,'lng':121.57,'accuracy':9}).status_code,200)
        self.assertTrue(all(m['lat'] is None for m in self.snapshot(self.b)['members']))
        self.assertTrue(any(t['location_visible'] for t in self.outsider.get(other_path).json()['tasks']))


# Only run assistance cases when this class is discovered.
for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):
        setattr(AssistanceTest,name,None)
