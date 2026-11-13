"""Management authorization, private roster shape, and revoked membership effects."""
from . import test_app


class ExpeditionMembersTest(test_app.RendezvousTest):
    def test_only_creator_can_rename_with_valid_name(self):
        from fastapi.testclient import TestClient
        path=self.path+'/name';original=self.room['name']
        self.assertEqual(TestClient(self.module.app).put(path,json={'name':'新名稱'},headers={'X-Tamago-Client':'web'}).status_code,401)
        for client in (self.b,self.c,self.outsider):
            self.assertEqual(client.put(path,json={'name':'不應生效'}).status_code,403)
        self.role(self.a,self.users[1]['id'])
        self.assertEqual(self.b.put(path,json={'name':'副團長不能修改'}).status_code,403)
        for body in ({'name':''},{'name':'   '},{'name':'a'*61},{'name':'合法','owner':self.users[1]['id']}):
            self.assertEqual(self.a.put(path,json=body).status_code,422)
        self.assertEqual(self.snapshot(self.a)['room']['name'],original)
        self.assertEqual(self.a.put(path,json={'name':'  新遠征隊名稱  '}).json()['room']['name'],'新遠征隊名稱')
        self.a.delete(self.path+'/membership')
        self.assertEqual(self.a.put(path,json={'name':'已退出的建立者仍可管理'}).status_code,200)
        self.assertEqual(self.a.put('/api/expeditions/missing/name',json={'name':'新名稱'}).status_code,404)
        self.a.delete(self.path)
        self.assertEqual(self.a.put(path,json={'name':'已刪除'}).status_code,404)

    def test_rename_updates_live_surfaces_and_wall_without_changing_membership_or_code(self):
        with self.module.connect() as db:
            original=dict(db.execute('SELECT * FROM expeditions WHERE id=?',(self.room['id'],)).fetchone())
            memberships=[tuple(row) for row in db.execute('SELECT * FROM members WHERE expedition=? ORDER BY user',(self.room['id'],))]
        name='<img src=x> 同行遠征隊'
        self.assertEqual(self.a.put(self.path+'/name',json={'name':name}).status_code,200)
        with self.module.connect() as db:
            renamed=dict(db.execute('SELECT * FROM expeditions WHERE id=?',(self.room['id'],)).fetchone())
            self.assertEqual({key:value for key,value in renamed.items() if key!='name'},{key:value for key,value in original.items() if key!='name'})
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM members WHERE expedition=? ORDER BY user',(self.room['id'],))],memberships)
        self.assertEqual(self.b.get(self.path+'/preview').json()['room']['name'],name)
        self.assertEqual(self.a.get(self.path+'/management').json()['room']['name'],name)
        self.assertEqual(next(room for room in self.b.get('/api/me').json()['expeditions'] if room['id']==self.room['id'])['name'],name)
        self.assertEqual(next(room for room in self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions'] if room['id']==self.room['id'])['name'],name)
        self.assertEqual(next(room for room in self.b.get('/api/profiles/me/wall').json()['items'] if room['id']==self.room['id'])['name'],name)
        self.assertEqual(next(chat for chat in self.b.get('/api/chat').json()['conversations'] if chat['id']=='expedition:'+self.room['id'])['title'],name)
        self.assertEqual(self.outsider.post('/api/join',json={'code':self.room['code']}).json()['name'],name)
        self.a.delete(self.path)
        self.assertEqual(next(room for room in self.b.get('/api/profiles/me/wall').json()['items'] if room['id']==self.room['id'])['name'],name)

    def role(self, client, target, value='deputy'):
        return client.put(self.path+'/members/'+target+'/role',json={'role':value})

    def kick(self, client, target):
        return client.delete(self.path+'/members/'+target)

    def test_permissions_and_creator_identity(self):
        aid,bid,cid=[u['id'] for u in self.users[:3]]
        self.assertEqual(self.b.get(self.path+'/management').status_code,403)
        self.assertEqual(self.outsider.get(self.path+'/management').status_code,403)
        self.assertEqual(self.role(self.b,bid).status_code,403)
        self.assertEqual(self.role(self.a,aid).status_code,403)
        self.assertEqual(self.role(self.a,bid).status_code,200)
        self.assertEqual(self.b.get('/api/me').json()['expeditions'][-1]['my_role'],'deputy')
        self.assertEqual(self.role(self.b,cid).status_code,403)
        self.assertEqual(self.kick(self.b,aid).status_code,403)
        self.assertEqual(self.kick(self.b,bid).status_code,403)
        self.assertEqual(self.role(self.a,cid).status_code,200)
        self.assertEqual(self.kick(self.b,cid).status_code,403)
        self.assertEqual(self.role(self.a,cid,'member').status_code,200)
        self.assertEqual(self.kick(self.b,cid).status_code,200)
        self.assertEqual(self.c.get(self.path).status_code,403)
        self.assertEqual(self.role(self.a,cid).status_code,404)
        self.assertEqual(self.kick(self.a,cid).status_code,404)
        self.assertEqual(self.kick(self.a,bid).status_code,200)
        self.b.post('/api/join',json={'code':self.room['code']})
        self.assertEqual(self.b.get(self.path+'/management').status_code,403)
        self.a.delete(self.path+'/membership')
        self.assertEqual(self.a.get(self.path+'/management').status_code,200)
        self.assertEqual(self.role(self.a,bid).status_code,200)
        self.assertEqual(self.b.delete(self.path).status_code,403)

    def test_roster_privacy_validation_and_revocation(self):
        aid,bid,cid=[u['id'] for u in self.users[:3]]
        self.role(self.a,bid)
        roster=self.b.get(self.path+'/management').json()
        self.assertEqual(roster['my_role'],'deputy')
        self.assertEqual(roster['total'],3)
        for person in roster['items']:
            self.assertEqual(set(person),{'id','nickname','avatar_url','role','can_set_role','can_kick'})
            self.assertFalse(person['can_set_role'])
            self.assertEqual(person['can_kick'],person['id']==cid)
        self.assertEqual(roster['items'][0]['id'],aid)
        self.assertEqual(self.a.get(self.path+'/management?offset=-1').status_code,422)
        self.assertEqual(self.a.get(self.path+'/management?offset=1000001').status_code,422)
        self.assertEqual(self.a.put(self.path+'/members/'+bid+'/role',json={'role':'leader'}).status_code,422)
        self.assertEqual(self.a.put(self.path+'/members/'+bid+'/role',json={'role':'member','owner':True}).status_code,422)
        self.role(self.a,bid,'member')
        self.assertEqual(self.kick(self.b,cid).status_code,403)
        self.assertEqual(self.b.get(self.path+'/management').status_code,403)

    def test_kick_cleans_tasks_help_and_empty_squad(self):
        bid=self.users[1]['id']
        squad=self.b.post(self.path+'/squads',json={'name':'私密小隊'}).json()
        with self.module.connect() as db:
            db.execute("UPDATE members SET scope='squad',lat=25,lng=121,located=? WHERE user=? AND expedition=?",(self.module.now(),bid,self.room['id']))
            for task_id,owner,assignee,kind in [('help',bid,None,'help'),('accepted',self.users[0]['id'],bid,'trade')]:
                db.execute('''INSERT INTO tasks(id,expedition,owner,title,description,kind,lat,lng,status,assignee,created,expires,help_active)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',(self.room['id']+task_id,self.room['id'],owner,'任務','',kind,25,121,'accepted' if assignee else 'open',assignee,self.module.now(),self.module.now()+3600,int(kind=='help')))
            db.execute('INSERT INTO help_locations(user,expedition,lat,lng,accuracy,located) VALUES(?,?,?,?,?,?)',(bid,self.room['id'],25,121,5,self.module.now()))
        self.assertEqual(self.kick(self.a,bid).status_code,200)
        with self.module.connect() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM squads WHERE id=?',(squad['id'],)).fetchone())
            self.assertIsNone(db.execute('SELECT 1 FROM help_locations WHERE user=?',(bid,)).fetchone())
            self.assertEqual(db.execute('SELECT status FROM tasks WHERE id=?',(self.room['id']+'help',)).fetchone()[0],'cancelled')
            task=db.execute('SELECT status,assignee FROM tasks WHERE id=?',(self.room['id']+'accepted',)).fetchone()
            self.assertEqual(tuple(task),('open',None))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.b.get(self.path).status_code,403)
        self.assertEqual(self.b.post(self.path+'/squads',json={'name':'不能建立'}).status_code,403)
        self.assertEqual(self.b.get('/api/chat/expedition/'+self.room['id']+'/messages').status_code,403)
        self.assertEqual(self.b.get('/api/chat/squad/'+squad['id']+'/messages').status_code,403)

    def test_management_pagination_and_repeat_migration_preserves_roles(self):
        bid=self.users[1]['id']
        self.role(self.a,bid)
        with self.module.connect() as db:
            for index in range(53):
                uid=self.room['id']+'-person-'+str(index)
                db.execute('INSERT INTO users(id,token,nickname,expires) VALUES(?,?,?,?)',(uid,uid,'成員 '+str(index),self.module.now()+3600))
                db.execute('INSERT INTO members(user,expedition,seen) VALUES(?,?,?)',(uid,self.room['id'],self.module.now()))
        self.module.expedition_members.migrate()
        first=self.a.get(self.path+'/management').json()
        second=self.a.get(self.path+'/management?offset='+str(first['next_offset'])).json()
        self.assertEqual((len(first['items']),len(second['items'])),(50,6))
        self.assertIsNone(second['next_offset'])
        self.assertEqual(len({p['id'] for p in first['items']+second['items']}),56)
        self.assertEqual(first['items'][0]['role'],'leader')
        self.assertEqual(first['items'][1]['id'],bid)
        self.assertEqual(first['items'][1]['role'],'deputy')


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(ExpeditionMembersTest,name,None)
