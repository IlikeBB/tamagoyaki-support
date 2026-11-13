"""Admission, privacy, copied settings, moderation, private reviews, and blocks."""
from tests import test_app


class ExpeditionPermissionsTest(test_app.RendezvousTest):
    def test_catalog_and_member_preview_use_room_local_date(self):
        from datetime import datetime,timezone,timedelta
        from unittest import mock
        fixed=datetime(2026,11,15,0,30,tzinfo=timezone(timedelta(hours=9)))
        with self.module.connect() as db:
            db.execute("UPDATE expeditions SET event_date='2026-11-14' WHERE id=?",(self.room['id'],))
            db.execute("INSERT INTO expedition_settings VALUES(?, 'public',NULL,'free','18:30','Asia/Taipei')",(self.room['id'],))
        with mock.patch('backend.expedition_settings.datetime') as clock:
            clock.now.side_effect=lambda zone:fixed.astimezone(zone)
            self.assertTrue(any(room['id']==self.room['id'] for room in self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']))
            self.assertEqual(self.outsider.get(self.path+'/preview').status_code,200)
            self.assertEqual(self.outsider.get(self.path+'/members/'+self.users[1]['id']+'/actions').status_code,200)
            with self.module.connect() as db:db.execute("UPDATE expedition_settings SET time_zone='Asia/Tokyo' WHERE expedition=?",(self.room['id'],))
            self.assertFalse(any(room['id']==self.room['id'] for room in self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']))
            self.assertEqual(self.outsider.get(self.path+'/preview').status_code,404)
            self.assertEqual(self.b.get(self.path+'/preview').status_code,200)

    def settings(self, **changes):
        data=self.a.get(self.path+'/settings').json()
        body={key:data[key] for key in ('privacy','pin_policy','event_time','time_zone')}
        body['event_date']=data['room']['event_date'] or None
        return self.a.put(self.path+'/settings',json={**body,**changes})

    def pin(self,client,title='情報'):
        return client.post(self.path+'/pins',json={'title':title,'kind':'meet','hours':0,'lat':25,'lng':121})

    def friend(self):
        self.a.post('/api/friends/requests',json={'username':self.usernames[1]})
        self.b.post('/api/friends/'+self.users[0]['id']+'/accept')

    def deputy(self):
        return self.a.put(self.path+'/members/'+self.users[1]['id']+'/role',json={'role':'deputy'})

    def test_leader_settings_and_password_admission_on_both_paths(self):
        self.assertEqual(self.b.get(self.path+'/settings').status_code,403)
        self.assertEqual(self.settings(privacy='password',password='Joining passphrase 2026!',event_time='18:30',time_zone='Asia/Taipei').status_code,200)
        data=self.a.get(self.path+'/settings').json()
        self.assertTrue(data['has_password']);self.assertNotIn('password_hash',str(data))
        catalog=self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']
        room=next(room for room in catalog if room['id']==self.room['id'])
        self.assertEqual((room['privacy'],room['event_time'],room['time_zone']),('password','18:30','Asia/Taipei'))
        self.assertNotIn('password_hash',str(self.a.get('/api/me').json()))
        for path,body in [(self.path+'/join',{}),('/api/join',{'code':self.room['code']})]:
            self.assertEqual(self.outsider.post(path,json=body).status_code,428)
            self.assertEqual(self.outsider.post(path,json={**body,'password':'wrong'}).status_code,403)
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        self.assertEqual(self.outsider.post(self.path+'/join',json={'password':'Joining passphrase 2026!'}).status_code,200)
        self.assertEqual(self.settings(privacy='invite').status_code,200)
        self.assertEqual(self.b.get(self.path).status_code,200)
        self.assertFalse(any(room['id']==self.room['id'] for room in self.c.get('/api/venues/makuhari/expeditions').json()['expeditions']))
        self.assertEqual(self.outsider.post(self.path+'/join',json={}).status_code,404)
        self.assertEqual(self.settings(privacy='password').status_code,422)
        self.assertEqual(self.settings(privacy='public',event_date=None,event_time='18:00').status_code,422)
        self.assertEqual(self.settings(event_time='24:00').status_code,422)

    def test_copy_only_copies_configuration_with_new_identity(self):
        self.settings(privacy='password',password='Copied password 2026!',pin_policy='approval',event_time='20:00')
        self.pin(self.a);self.make_task()
        copied=self.a.post(self.path+'/copy',json={'name':'新的場次'}).json()
        self.assertNotEqual(copied['id'],self.room['id']);self.assertNotEqual(copied['code'],self.room['code'])
        self.assertEqual((copied['privacy'],copied['pin_policy'],copied['event_time']),('password','approval','20:00'))
        self.assertNotIn('password_hash',copied)
        new=self.a.get('/api/expeditions/'+copied['id']).json()
        self.assertEqual(len(new['members']),1);self.assertEqual(new['tasks'],[]);self.assertEqual(new['pins'],[]);self.assertEqual(new['squads'],[])
        self.assertEqual(self.b.post(self.path+'/copy',json={'name':'不能複製'}).status_code,403)
        self.assertEqual(self.outsider.post('/api/expeditions/'+copied['id']+'/join',json={'password':'Copied password 2026!'}).status_code,200)

    def test_muting_limits_publication_and_keeps_reading_leaving_and_private_messages(self):
        aid,bid,cid=[u['id'] for u in self.users[:3]];self.friend()
        squad=self.b.post(self.path+'/squads',json={'name':'小隊'}).json();pin=self.pin(self.a).json()
        self.deputy();self.assertEqual(self.b.put(self.path+'/members/'+aid+'/moderation',json={'muted':True}).status_code,403)
        self.assertEqual(self.b.put(self.path+'/members/'+cid+'/moderation',json={'muted':True}).status_code,200)
        self.assertEqual(self.c.get(self.path).status_code,200)
        self.assertEqual(self.a.put(self.path+'/members/'+bid+'/moderation',json={'muted':True}).status_code,200)
        self.assertFalse(next(chat for chat in self.b.get('/api/chat').json()['conversations'] if chat['id']=='expedition:'+self.room['id'])['can_send'])
        for path in ['/api/chat/expedition/'+self.room['id']+'/messages','/api/chat/squad/'+squad['id']+'/messages']:
            self.assertEqual(self.b.post(path,json={'body':'不能發送','client_id':'muted-message-'+bid}).status_code,403)
        self.assertEqual(self.b.post('/api/chat/friend/'+aid+'/messages',json={'body':'好友私訊可用','client_id':'private-message-'+bid}).status_code,200)
        self.assertEqual(self.pin(self.b).status_code,403)
        self.assertEqual(self.b.post(self.path+'/tasks',json={'title':'不能發布','kind':'trade','lat':25,'lng':121,'hours':2}).status_code,403)
        self.assertEqual(self.b.post(self.path+'/pins/'+pin['id']+'/reports',json={'body':'不能留言','client_id':'muted-report-'+bid}).status_code,403)
        self.assertEqual(self.b.get(self.path+'/pins/'+pin['id']+'/reports').status_code,200)
        self.assertEqual(self.a.put(self.path+'/members/'+bid+'/moderation',json={'muted':False}).status_code,200)
        self.assertTrue(next(chat for chat in self.b.get('/api/chat').json()['conversations'] if chat['id']=='expedition:'+self.room['id'])['can_send'])
        self.assertEqual(self.pin(self.b).status_code,200)
        self.assertEqual(self.c.delete(self.path+'/membership').status_code,200)

    def test_pin_approval_keeps_submissions_private_and_only_managers_approve(self):
        self.settings(pin_policy='approval');self.deputy()
        submitted=self.pin(self.c,'待審地標').json();pid=submitted['id']
        self.assertTrue(submitted['pending'])
        for client in (self.a,self.b,self.c):self.assertFalse(any(pin['id']==pid for pin in client.get(self.path).json()['pins']))
        self.assertEqual(self.outsider.get(self.path+'/pin-submissions').status_code,403)
        self.assertEqual(self.c.get(self.path+'/pin-submissions').json()['total'],1)
        self.assertEqual(self.c.put(self.path+'/pin-submissions/'+pid,json={'decision':'approve'}).status_code,403)
        with self.module.connect() as db:self.assertIsNone(db.execute('SELECT 1 FROM landmark_records WHERE pin=?',(pid,)).fetchone())
        self.assertEqual(self.b.put(self.path+'/pin-submissions/'+pid,json={'decision':'approve'}).status_code,200)
        self.assertTrue(any(pin['id']==pid for pin in self.a.get(self.path).json()['pins']))
        self.assertEqual(self.b.put(self.path+'/pin-submissions/'+pid,json={'decision':'approve'}).status_code,404)
        second=self.pin(self.c).json()['id'];self.assertEqual(self.a.put(self.path+'/pin-submissions/'+second,json={'decision':'reject'}).status_code,200)
        held=self.pin(self.c).json()['id']
        self.a.put(self.path+'/members/'+self.users[2]['id']+'/moderation',json={'muted':True})
        self.assertEqual(self.b.put(self.path+'/pin-submissions/'+held,json={'decision':'approve'}).status_code,409)
        self.assertEqual(self.b.put(self.path+'/pin-submissions/'+held,json={'decision':'reject'}).status_code,200)
        self.a.put(self.path+'/members/'+self.users[2]['id']+'/moderation',json={'muted':False})
        third=self.pin(self.c).json()['id'];self.assertEqual(self.c.delete(self.path+'/pin-submissions/'+third).status_code,200)
        fourth=self.pin(self.c).json()['id'];self.c.delete(self.path+'/membership')
        self.assertEqual(self.a.get(self.path+'/pin-submissions').json()['total'],0)
        with self.module.connect() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM pin_submissions WHERE id=?',(fourth,)).fetchone())
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_blacklist_stops_invitations_private_chat_and_mutual_squad_positions(self):
        aid,bid=self.users[0]['id'],self.users[1]['id'];self.friend()
        squad=self.a.post(self.path+'/squads',json={'name':'同行'}).json()
        self.b.post(self.path+'/squads/join',json={'code':squad['code']})
        for client in (self.a,self.b):self.assertEqual(client.put(self.path+'/location',json={'lat':25,'lng':121,'accuracy':5,'scope':'squad','squad_id':squad['id']}).status_code,200)
        self.assertTrue(next(m for m in self.b.get(self.path).json()['members'] if m['user']==aid)['location_visible'])
        self.assertEqual(self.a.put('/api/blocks/'+bid).status_code,200)
        self.assertEqual(self.a.get('/api/blocks').json()['items'][0]['id'],bid)
        self.assertEqual(self.b.get('/api/blocks').json()['items'],[])
        for client,other in ((self.a,bid),(self.b,aid)):
            row=next(m for m in client.get(self.path).json()['members'] if m['user']==other)
            self.assertFalse(row['location_visible']);self.assertIsNone(row['lat'])
            self.assertEqual(client.get('/api/chat/friend/'+other+'/messages').status_code,403)
            self.assertFalse(any(t['kind']=='friend' for t in client.get('/api/chat').json()['conversations']))
            self.assertEqual(client.get('/api/friends').json()['friends'],[])
        self.assertEqual(self.b.post('/api/friends/requests',json={'username':self.usernames[0]}).status_code,403)
        self.assertEqual(self.a.put('/api/blocks/'+aid).status_code,409)
        self.a.delete('/api/blocks/'+bid);self.assertEqual(self.a.get('/api/friends').json()['friends'],[])
        self.assertEqual(self.b.post('/api/friends/requests',json={'username':self.usernames[0]}).status_code,200)

    def test_member_actions_follow_role_hierarchy(self):
        aid,bid,cid=[u['id'] for u in self.users[:3]];path=lambda uid:self.path+'/members/'+uid+'/actions'
        normal=self.c.get(path(bid)).json();self.assertTrue(normal['can_friend']);self.assertFalse(normal['can_mute'])
        self.deputy();self.assertFalse(self.b.get(path(aid)).json()['can_mute']);self.assertTrue(self.b.get(path(cid)).json()['can_mute'])
        self.assertTrue(self.a.get(path(bid)).json()['can_set_role'])
        self.assertEqual(self.outsider.get(path(bid)).status_code,200)
        self.settings(privacy='invite');self.assertEqual(self.outsider.get(path(bid)).status_code,404)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(ExpeditionPermissionsTest,name,None)
