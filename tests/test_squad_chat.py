import secrets

from tests import test_app


class SquadChatTest(test_app.RendezvousTest):
    def create(self,client,name='同行小隊'):
        result=client.post(self.path+'/squads',json={'name':name})
        self.assertEqual(result.status_code,200)
        return result.json()

    def send(self,client,squad,text='在南口會合！'):
        return client.post('/api/chat/squad/'+squad['id']+'/messages',json={'body':text,'client_id':secrets.token_hex(12)})

    def contacts(self,client):
        return client.get('/api/chat').json()['conversations']

    def assert_revoked(self,client,squad,mid):
        path='/api/chat/squad/'+squad['id']
        self.assertEqual(client.get(path+'/messages').status_code,403)
        self.assertEqual(self.send(client,squad).status_code,403)
        self.assertEqual(client.post(path+'/read',json={'last_id':mid}).status_code,403)
        self.assertFalse(any(c['id']=='squad:'+squad['id'] for c in self.contacts(client)))

    def test_creation_joining_unread_and_isolation_from_other_squads(self):
        first=self.create(self.a)
        second=self.create(self.c,'物販小隊')
        contact=next(c for c in self.contacts(self.a) if c['kind']=='squad')
        self.assertEqual(contact['target'],first['id'])
        self.assertEqual(contact['title'],first['name'])
        self.assertIn(self.room['name'],contact['subtitle'])
        self.assertIsNone(contact['latest'])
        self.assertFalse(any(c['kind']=='squad' for c in self.contacts(self.b)))
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':first['code']}).status_code,200)
        sent=self.send(self.a,first,'集合 🥚\n<img src=x>').json()
        path='/api/chat/squad/'+first['id']
        history=self.b.get(path+'/messages').json()['messages']
        self.assertEqual([m['id'] for m in history],[sent['id']])
        self.assertEqual(history[0]['body'],'集合 🥚\n<img src=x>')
        self.assertFalse(any(k in history[0] for k in ('lat','lng','token','client_id','thread')))
        self.assertEqual(self.b.get('/api/chat').json()['unread'],1)
        self.assertEqual(self.b.post(path+'/read',json={'last_id':sent['id']}).status_code,200)
        self.assertEqual(self.b.get('/api/chat').json()['unread'],0)
        for client in (self.c,self.outsider):self.assert_revoked(client,first,sent['id'])
        self.assert_revoked(self.a,second,sent['id'])
        room_history=self.b.get('/api/chat/expedition/'+self.room['id']+'/messages').json()['messages']
        self.assertEqual(room_history,[])

    def test_switching_leaving_and_rejoining_recheck_membership(self):
        first=self.create(self.a)
        self.b.post(self.path+'/squads/join',json={'code':first['code']})
        sent=self.send(self.a,first).json()
        self.create(self.a,'換到另一小隊')
        self.assert_revoked(self.a,first,sent['id'])
        self.assertEqual(self.a.post(self.path+'/squads/join',json={'code':first['code']}).status_code,200)
        self.assertEqual(self.a.get('/api/chat/squad/'+first['id']+'/messages').json()['messages'][0]['id'],sent['id'])
        self.a.delete(self.path+'/squads/'+first['id']+'/membership')
        self.assert_revoked(self.a,first,sent['id'])
        self.b.delete(self.path+'/membership')
        self.assert_revoked(self.b,first,sent['id'])
        with self.module.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chat_messages WHERE kind='squad' AND thread=?",(first['id'],)).fetchone()[0],0)

    def test_dissolving_cleans_squad_chat_and_keeps_expedition_chat(self):
        room_chat='/api/chat/expedition/'+self.room['id']
        preserved=self.a.post(room_chat+'/messages',json={'body':'保留遠征隊訊息','client_id':secrets.token_hex(12)}).json()
        target=self.create(self.c,'仍有人小隊')
        for action in ('create','join','exit'):
            with self.subTest(action=action):
                squad=self.create(self.a,'即將解散')
                sent=self.send(self.a,squad).json()
                self.a.post('/api/chat/squad/'+squad['id']+'/read',json={'last_id':sent['id']})
                if action=='create':self.create(self.a,'換新隊')
                elif action=='join':self.a.post(self.path+'/squads/join',json={'code':target['code']})
                else:self.a.delete(self.path+'/membership')
                with self.module.connect() as db:
                    for table in ('chat_messages','chat_reads'):
                        self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table} WHERE kind='squad' AND thread=?",(squad['id'],)).fetchone()[0],0)
                    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
                self.assertEqual(self.c.get(room_chat+'/messages').json()['messages'][0]['id'],preserved['id'])
                self.assertTrue(any(c['target']==target['id'] for c in self.contacts(self.c)))

    def test_deleting_expedition_cleans_its_squad_chat_only(self):
        squad=self.create(self.a)
        sent=self.send(self.a,squad).json()
        self.a.post('/api/chat/squad/'+squad['id']+'/read',json={'last_id':sent['id']})
        other=self.c.post('/api/expeditions',json={'name':'保留另一隊','venue':'taiwan'}).json()
        other_squad=self.c.post('/api/expeditions/'+other['id']+'/squads',json={'name':'另一隊的小隊'}).json()
        saved=self.send(self.c,other_squad).json()
        self.assertEqual(self.a.delete(self.path).status_code,200)
        self.assert_revoked(self.a,squad,sent['id'])
        with self.module.connect() as db:
            for table in ('chat_messages','chat_reads'):
                self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table} WHERE kind='squad' AND thread=?",(squad['id'],)).fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.c.get('/api/chat/squad/'+other_squad['id']+'/messages').json()['messages'][0]['id'],saved['id'])


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(SquadChatTest,name,None)
