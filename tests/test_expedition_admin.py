import concurrent.futures
import secrets

from fastapi.testclient import TestClient
from tests import test_app


class ExpeditionAdminTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()

    def owned(self,client):return client.get('/api/expeditions/owned').json()['expeditions']

    def test_owner_can_delete_even_after_leaving_and_others_cannot(self):
        self.assertEqual(TestClient(self.module.app).get('/api/expeditions/owned').status_code,401)
        self.assertEqual(self.b.delete(self.path).status_code,403)
        self.assertEqual(self.outsider.delete(self.path).status_code,403)
        self.assertEqual(self.owned(self.b),[])
        self.assertIn(self.room['id'],[r['id'] for r in self.owned(self.a)])
        self.assertEqual(self.a.delete(self.path+'/membership').status_code,200)
        self.assertTrue(self.a.get('/api/profiles/me').json()['wall']['items'][0]['can_delete'])
        self.assertEqual(self.a.delete(self.path).status_code,200)
        self.assertEqual(self.a.delete(self.path).status_code,404)
        self.assertEqual(self.owned(self.a),[])
        self.assertNotIn(self.room['id'],[r['id'] for r in self.a.get('/api/venues/makuhari/expeditions').json()['expeditions']])
        for client in (self.a,self.b,self.c):
            self.assertEqual(client.get(self.path).status_code,403)
            self.assertEqual(client.post(self.path+'/join').status_code,404)
            self.assertEqual(client.post('/api/join',json={'code':self.room['code']}).status_code,404)
            self.assertNotIn(self.room['id'],[r['id'] for r in client.get('/api/me').json()['expeditions']])
            wall=client.get('/api/profiles/me').json()['wall']['items'][0]
            self.assertTrue(wall['removed']);self.assertFalse(wall['can_enter']);self.assertFalse(wall['can_delete'])

    def test_deletion_cleans_room_data_and_preserves_other_rooms_and_reputation(self):
        other=self.a.post('/api/expeditions',json={'name':'保留的另一隊','venue':'pia','event_date':self.room['event_date']}).json()
        other_path='/api/expeditions/'+other['id']
        self.a.post('/api/friends/requests',json={'username':self.usernames[1]});self.b.post('/api/friends/'+self.users[0]['id']+'/accept')
        self.b.put('/api/friends/location',json={'lat':25,'lng':121,'accuracy':10})
        dm=self.a.post('/api/chat/friend/'+self.users[1]['id']+'/messages',json={'body':'好友訊息應保留','client_id':secrets.token_hex(12)}).json()
        group=self.a.post('/api/chat/expedition/'+self.room['id']+'/messages',json={'body':'這個群聊隨隊刪除','client_id':secrets.token_hex(12)}).json()
        self.b.post('/api/chat/expedition/'+self.room['id']+'/read',json={'last_id':group['id']})
        self.a.post(self.path+'/squads',json={'name':'同行小隊'})
        pin=self.a.post(self.path+'/pins',json={'title':'臨時情報','kind':'meet','lat':35.64,'lng':140.03,'hours':2}).json()
        self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':1})
        self.a.post(self.path+'/pins',json={'title':'隊內永久情報','kind':'meet','lat':35.64,'lng':140.03,'hours':0})
        for path in (self.path,other_path):
            response=self.a.post(path+'/tasks',json={'title':'持續求助','kind':'help','lat':25,'lng':121,'accuracy':8,'help_broadcast':True})
            self.assertEqual(response.status_code,200)
        result=self.a.delete(self.path)
        self.assertEqual(result.status_code,200);self.assertEqual([r['id'] for r in result.json()['help_rooms']],[other['id']])
        self.assertEqual(self.a.get(other_path).status_code,200)
        self.assertEqual(self.b.get('/api/friends').json()['sharing'],True)
        with self.module.connect() as db:
            for table in ('expeditions','members','tasks','pins','squads','help_locations'):
                key='id' if table=='expeditions' else 'expedition'
                self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table+' WHERE '+key+'=?',(self.room['id'],)).fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chat_messages WHERE kind='expedition' AND thread=?",(self.room['id'],)).fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chat_reads WHERE kind='expedition' AND thread=?",(self.room['id'],)).fetchone()[0],0)
            self.assertIsNotNone(db.execute('SELECT 1 FROM chat_messages WHERE id=?',(dm['id'],)).fetchone())
            self.assertEqual(len(db.execute('PRAGMA foreign_key_check').fetchall()),0)
        self.assertEqual(self.b.get('/api/chat/expedition/'+self.room['id']+'/messages').status_code,403)
        received=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertTrue(received['removed']);self.assertEqual(received['likes'],1)
        self.assertEqual(self.a.get('/api/profiles/me').json()['reputation']['likes'],1)
        self.assertEqual(self.b.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':0}).status_code,200)

    def test_private_archived_wall_stays_private(self):
        room=self.a.post('/api/expeditions',json={'name':'私人回憶','venue':'pia','event_date':self.room['event_date'],'discoverable':False}).json()
        self.b.post('/api/join',json={'code':room['code']})
        self.a.delete('/api/expeditions/'+room['id'])
        own=self.b.get('/api/profiles/me').json()['wall']['items']
        self.assertIn(room['id'],[r['id'] for r in own])
        for viewer in (self.c,self.outsider):
            other=viewer.get('/api/profiles/'+self.users[1]['id']).json()['wall']['items']
            self.assertNotIn(room['id'],[r['id'] for r in other])

    def test_history_migration_preserves_legacy_rows_and_is_idempotent(self):
        with self.module.connect() as db:
            before=[tuple(r) for r in db.execute('SELECT * FROM expedition_history ORDER BY user,expedition')]
            db.executescript('''ALTER TABLE expedition_history RENAME TO history_saved;
              CREATE TABLE expedition_history(user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expedition TEXT NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
                first_joined INTEGER NOT NULL,last_joined INTEGER NOT NULL,PRIMARY KEY(user,expedition));''')
            # Legacy history could only refer to still-existing rooms.
            db.execute('INSERT INTO expedition_history SELECT h.* FROM history_saved h JOIN expeditions e ON e.id=h.expedition')
            db.execute('DROP TABLE history_saved')
            legacy=[tuple(r) for r in db.execute('SELECT * FROM expedition_history ORDER BY user,expedition')]
        for _ in range(2):self.module.profiles.migrate()
        with self.module.connect() as db:
            after=[tuple(r) for r in db.execute('SELECT * FROM expedition_history ORDER BY user,expedition')]
            self.assertEqual(after,legacy)
            self.assertIn('expedition_records',{r['table'] for r in db.execute('PRAGMA foreign_key_list(expedition_history)')})
        self.assertEqual(self.a.delete(self.path).status_code,200)
        self.assertTrue(any(r['id']==self.room['id'] for r in self.a.get('/api/profiles/me').json()['wall']['items']))

    def test_join_and_delete_serialize_without_resurrecting_membership(self):
        with concurrent.futures.ThreadPoolExecutor() as pool:
            deletion=pool.submit(self.a.delete,self.path)
            joining=pool.submit(self.outsider.post,self.path+'/join')
            self.assertEqual(deletion.result().status_code,200)
            self.assertIn(joining.result().status_code,(200,404))
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM members WHERE expedition=?',(self.room['id'],)).fetchone()[0],0)
            self.assertEqual(len(db.execute('PRAGMA foreign_key_check').fetchall()),0)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(ExpeditionAdminTest,name,None)
