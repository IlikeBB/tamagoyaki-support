import concurrent.futures

from tests import test_app


class SquadsTest(test_app.RendezvousTest):
    def create(self,client,name):
        result=client.post(self.path+'/squads',json={'name':name})
        self.assertEqual(result.status_code,200);return result.json()

    def test_invite_code_composition_and_leaving_only_own_current_squad(self):
        first=self.create(self.a,'南口小隊')
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':first['code'].lower()}).status_code,200)
        self.assertEqual(self.snapshot(self.a)['me']['squad'],first['id'])
        self.assertNotIn('code',self.snapshot(self.c)['squads'][0])
        self.assertEqual(self.snapshot(self.b)['squads'][0]['code'],first['code'])
        second=self.create(self.a,'物販小隊')
        self.assertEqual(self.snapshot(self.a)['me']['squad'],second['id'])
        self.assertEqual(self.snapshot(self.b)['me']['squad'],first['id'])
        leave=self.path+'/squads/'+first['id']+'/membership'
        self.assertEqual(self.a.delete(leave).status_code,409)
        self.assertEqual(self.c.delete(leave).status_code,409)
        self.assertEqual(self.b.delete(leave).status_code,200)
        self.assertIsNone(self.snapshot(self.b)['me']['squad'])
        self.assertEqual(self.b.get(self.path).status_code,200)
        self.assertEqual(self.snapshot(self.a)['me']['squad'],second['id'])
        self.assertEqual(self.b.delete(leave).status_code,409)
        other=self.outsider.post('/api/expeditions',json={'name':'另一支遠征隊','venue':'taiwan'}).json()
        foreign=self.outsider.post('/api/expeditions/'+other['id']+'/squads',json={'name':'另一隊小隊'}).json()
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':foreign['code']}).status_code,404)
        self.assertEqual(self.outsider.post(self.path+'/squads',json={'name':'不能跨隊建立'}).status_code,403)
        self.assertEqual(self.outsider.delete(leave).status_code,403)

    def test_switching_clears_regular_location_and_keeps_friend_sharing(self):
        first=self.create(self.a,'第一隊')
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':first['code']}).status_code,200)
        self.a.put(self.path+'/location',json={'scope':'expedition','lat':25.033,'lng':121.5654,'accuracy':10})
        self.create(self.a,'第二隊')
        mine=self.snapshot(self.a)['me']
        self.assertEqual(mine['scope'],'off')
        for key in ('lat','lng','accuracy','located'):self.assertIsNone(mine[key])
        self.a.post('/api/friends/requests',json={'username':self.usernames[1]})
        self.b.post('/api/friends/'+self.users[0]['id']+'/accept')
        self.a.put('/api/friends/location',json={'lat':25.033,'lng':121.5654,'accuracy':10})
        self.assertEqual(self.a.post(self.path+'/squads/join',json={'code':first['code']}).status_code,200)
        self.assertEqual(self.a.delete(self.path+'/squads/'+first['id']+'/membership').status_code,200)
        self.assertTrue(self.b.get('/api/friends').json()['friends'][0]['location_visible'])

    def test_squad_changes_do_not_revoke_active_help_location(self):
        result=self.a.post(self.path+'/tasks',json={'title':'需要幫忙','kind':'help','lat':25.033,'lng':121.5654,'accuracy':10,'help_broadcast':True,'hours':6})
        self.assertEqual(result.status_code,200)
        squad=self.create(self.a,'求助期間的小隊')
        self.assertEqual(self.a.delete(self.path+'/squads/'+squad['id']+'/membership').status_code,200)
        data=self.snapshot(self.b)
        member=next(person for person in data['members'] if person['user']==self.users[0]['id'])
        self.assertTrue(member['help_shared']);self.assertEqual(member['lat'],25.033)
        self.assertTrue(data['tasks'][0]['help_active'])

    def test_last_member_leaving_dissolves_squad_and_invalidates_code(self):
        squad=self.create(self.a,'同行小隊')
        self.b.post(self.path+'/squads/join',json={'code':squad['code']})
        leave=self.path+'/squads/'+squad['id']+'/membership'
        self.assertEqual(self.a.delete(leave).status_code,200)
        self.assertEqual([s['id'] for s in self.snapshot(self.c)['squads']],[squad['id']])
        self.assertEqual(self.b.delete(leave).status_code,200)
        self.assertEqual(self.snapshot(self.c)['squads'],[])
        self.assertEqual(self.c.post(self.path+'/squads/join',json={'code':squad['code']}).status_code,404)
        self.assertEqual(self.a.get(self.path).status_code,200)
        self.assertEqual(self.b.get(self.path).status_code,200)

    def test_switching_and_expedition_exit_only_remove_empty_squads(self):
        first=self.create(self.a,'第一隊')
        second=self.create(self.a,'第二隊')
        self.assertEqual([s['id'] for s in self.snapshot(self.a)['squads']],[second['id']])
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':first['code']}).status_code,404)
        other=self.create(self.b,'另一隊')
        self.assertEqual(self.a.post(self.path+'/squads/join',json={'code':other['code']}).status_code,200)
        self.assertEqual([s['id'] for s in self.snapshot(self.c)['squads']],[other['id']])
        self.assertEqual(self.a.delete(self.path+'/membership').status_code,200)
        self.assertEqual([s['id'] for s in self.snapshot(self.b)['squads']],[other['id']])
        self.assertEqual(self.b.delete(self.path+'/membership').status_code,200)
        self.assertEqual(self.snapshot(self.c)['squads'],[])
        self.assertEqual(self.c.get(self.path).status_code,200)

    def test_startup_removes_legacy_empty_squads_and_keeps_occupied_ones(self):
        squad=self.create(self.a,'保留有人小隊')
        with self.module.connect() as db:
            db.execute('INSERT INTO squads VALUES(?,?,?,?)',('legacy-empty-'+self.room['id'],self.room['id'],'舊空小隊','EMPTY123'))
        self.module.init_db()
        self.module.init_db()
        self.assertEqual([s['id'] for s in self.snapshot(self.a)['squads']],[squad['id']])
        self.assertEqual(self.snapshot(self.a)['me']['squad'],squad['id'])
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM squads WHERE code=?',('EMPTY123',)).fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_join_racing_last_exit_never_leaves_an_empty_or_missing_squad(self):
        squad=self.create(self.a,'同時加入與離開')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            leaving=pool.submit(self.a.delete,self.path+'/squads/'+squad['id']+'/membership')
            joining=pool.submit(self.b.post,self.path+'/squads/join',json={'code':squad['code']})
            self.assertEqual(leaving.result().status_code,200)
            joined=joining.result().status_code
        self.assertIn(joined,(200,404))
        data=self.snapshot(self.b)
        self.assertEqual([s['id'] for s in data['squads']],[squad['id']] if joined==200 else [])
        self.assertEqual(data['me']['squad'],squad['id'] if joined==200 else None)
        with self.module.connect() as db:
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(SquadsTest,name,None)
