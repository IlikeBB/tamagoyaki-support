import concurrent.futures
import secrets

from fastapi.testclient import TestClient
from tests import test_app


class ChatTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear()
        super().setUp()
        self.dm = '/api/chat/friend/'+self.users[1]['id']
        self.group = '/api/chat/expedition/'+self.room['id']

    def send(self, client, path, text='在南口會合！', nonce=None):
        return client.post(path+'/messages', json={'body': text, 'client_id': nonce or secrets.token_hex(12)})

    def befriend(self):
        self.assertEqual(self.a.post('/api/friends/requests',json={'username':self.usernames[1]}).status_code,200)
        self.assertEqual(self.b.post('/api/friends/'+self.users[0]['id']+'/accept').status_code,200)

    def test_friend_privacy_and_revocation(self):
        self.assertEqual(self.send(self.a,self.dm).status_code,403)
        self.a.post('/api/friends/requests',json={'username':self.usernames[1]})
        self.assertEqual(self.b.get('/api/chat/friend/'+self.users[0]['id']+'/messages').status_code,403)
        self.b.post('/api/friends/'+self.users[0]['id']+'/accept')
        sent=self.send(self.a,self.dm).json()
        path='/api/chat/friend/'+self.users[0]['id']
        history=self.b.get(path+'/messages').json()['messages']
        self.assertEqual([m['id'] for m in history],[sent['id']])
        self.assertFalse(any(key in history[0] for key in ('lat','lng','token','username','thread','client_id')))
        # Sharing an expedition never grants access to someone else's DMs.
        self.assertEqual(self.c.get(path+'/messages').status_code,403)
        self.assertEqual(self.c.get(self.dm+'/messages').status_code,403)
        self.assertTrue(all(t['kind']!='friend' for t in self.c.get('/api/chat').json()['conversations']))
        self.assertEqual(self.b.get('/api/chat').json()['unread'],1)
        self.assertEqual(self.a.get('/api/chat').json()['unread'],0)
        self.a.delete('/api/friends/'+self.users[1]['id'])
        for client,endpoint in ((self.a,self.dm),(self.b,path)):
            self.assertEqual(client.get(endpoint+'/messages').status_code,403)
            self.assertEqual(self.send(client,endpoint).status_code,403)
            self.assertEqual(client.post(endpoint+'/read',json={'last_id':sent['id']}).status_code,403)
            self.assertFalse(any(t['kind']=='friend' for t in client.get('/api/chat').json()['conversations']))

    def test_group_requires_current_membership_on_every_operation(self):
        sent=self.send(self.a,self.group).json()
        self.assertEqual(self.b.get(self.group+'/messages').json()['messages'][0]['sender_name'],self.users[0]['nickname'])
        self.assertEqual(self.outsider.get(self.group+'/messages').status_code,403)
        self.assertEqual(self.send(self.outsider,self.group).status_code,403)
        self.assertEqual(self.b.delete(self.path+'/membership').status_code,200)
        self.assertEqual(self.b.get(self.group+'/messages').status_code,403)
        self.assertEqual(self.send(self.b,self.group).status_code,403)
        self.assertEqual(self.b.post(self.group+'/read',json={'last_id':sent['id']}).status_code,403)
        self.assertFalse(self.b.get('/api/chat').json()['conversations'])
        self.assertEqual(self.b.post('/api/join',json={'code':self.room['code']}).status_code,200)
        self.assertEqual(self.b.get(self.group+'/messages').json()['messages'][0]['body'],'在南口會合！')

    def test_chat_avatar_follows_current_profile_without_exposing_private_fields(self):
        import base64
        from tests.test_profiles import png
        self.befriend()
        sent=self.send(self.a,self.group).json()
        self.assertIsNone(sent['sender_avatar_url'])
        payload={'image':'data:image/png;base64,'+base64.b64encode(png()).decode()}
        self.assertEqual(self.a.put('/api/profiles/me/media/avatar',json=payload).status_code,200)
        history=self.b.get(self.group+'/messages').json()['messages']
        avatar=history[0]['sender_avatar_url']
        self.assertTrue(avatar.startswith('/api/profiles/'+self.users[0]['id']+'/media/avatar?v='))
        self.assertEqual(self.b.get(avatar).status_code,200)
        contact=next(c for c in self.b.get('/api/chat').json()['conversations'] if c['kind']=='friend')
        self.assertEqual(contact['avatar_url'],avatar)
        self.assertNotIn('avatar_digest',contact)
        self.assertFalse(any(key in history[0] for key in ('avatar_digest','lat','lng','username','token')))
        self.assertEqual(self.send(self.a,self.group,'新的訊息').json()['sender_avatar_url'],avatar)
        self.assertEqual(self.outsider.get(self.group+'/messages').status_code,403)
        self.a.delete('/api/profiles/me/media/avatar')
        self.assertIsNone(self.b.get(self.group+'/messages').json()['messages'][0]['sender_avatar_url'])
        contact=next(c for c in self.b.get('/api/chat').json()['conversations'] if c['kind']=='friend')
        self.assertIsNone(contact['avatar_url'])

    def test_message_validation_retry_and_atomic_duplicate(self):
        for body in ({'body':'  \n ', 'client_id':'unique-nonce'}, {'body':'a'*2001,'client_id':'unique-nonce'},
                     {'body':'\x00bad','client_id':'unique-nonce'}, {'body':'X','client_id':'unique-nonce','sender':self.users[1]['id']},
                     {'body':'X','client_id':'unique-nonce','lat':25}):
            self.assertEqual(self.a.post(self.group+'/messages',json=body).status_code,422)
        nonce=secrets.token_hex(12)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results=list(pool.map(lambda _:self.send(self.a,self.group,'  會合\r\n收到 🥚  ',nonce),range(2)))
        self.assertTrue(all(r.status_code==200 for r in results))
        self.assertEqual(results[0].json()['id'],results[1].json()['id'])
        self.assertEqual(results[0].json()['body'],'會合\n收到 🥚')
        self.assertEqual(self.send(self.a,self.group,'不同內容',nonce).status_code,409)
        self.assertEqual(len(self.b.get(self.group+'/messages').json()['messages']),1)
        self.assertEqual(TestClient(self.module.app).get('/api/chat').status_code,401)
        self.assertEqual(TestClient(self.module.app).post(self.group+'/messages',json={'body':'X','client_id':nonce}).status_code,403)
        self.assertEqual(self.a.post(self.group+'/messages',json={'body':'X','client_id':nonce},headers={'Origin':'https://evil.example'}).status_code,403)

    def test_pagination_and_monotonic_read_cursors(self):
        with self.module.connect() as db:
            db.executemany('INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES(?,?,?,?,?,?)',
                [('expedition',self.room['id'],self.users[0]['id'],str(i),secrets.token_hex(12),self.module.now()-120) for i in range(120)])
        def history(**params):return self.b.get(self.group+'/messages',params=params).json()
        latest=history();self.assertTrue(latest['has_more']);self.assertEqual([m['body'] for m in latest['messages']],[str(i) for i in range(70,120)])
        older=history(before=latest['messages'][0]['id']);self.assertTrue(older['has_more'])
        first=history(before=older['messages'][0]['id']);self.assertFalse(first['has_more']);self.assertEqual(len(first['messages']),20)
        forward=history(after=0);self.assertTrue(forward['has_more']);self.assertEqual(forward['messages'][0]['body'],'0')
        self.assertEqual(self.b.get('/api/chat').json()['unread'],120)
        self.b.post(self.group+'/read',json={'last_id':forward['messages'][-1]['id']})
        self.assertEqual(self.b.get('/api/chat').json()['unread'],70)
        self.b.post(self.group+'/read',json={'last_id':forward['messages'][0]['id']})
        self.assertEqual(self.b.get('/api/chat').json()['unread'],70)
        self.b.post(self.group+'/read',json={'last_id':latest['messages'][-1]['id']})
        self.assertEqual(self.b.get('/api/chat').json()['unread'],0)
        self.assertEqual(self.c.get('/api/chat').json()['unread'],120)
        self.befriend();dm=self.send(self.a,self.dm).json()
        self.assertEqual(self.b.post(self.group+'/read',json={'last_id':dm['id']}).status_code,404)
        self.assertEqual(self.b.get(self.group+'/messages?before=1&after=0').status_code,422)
        self.assertEqual(self.b.get(self.group+'/messages').headers['cache-control'],'no-store')

    def test_rate_limit_and_logout(self):
        sent=[self.send(self.a,self.group,nonce=secrets.token_hex(12)) for _ in range(60)]
        self.assertTrue(all(r.status_code==200 for r in sent))
        self.assertEqual(self.send(self.a,self.group).status_code,429)
        self.a.post('/api/auth/logout',json={})
        self.assertEqual(self.a.get(self.group+'/messages').status_code,401)
        self.assertEqual(self.a.get('/api/chat').status_code,401)
        self.assertEqual(self.send(self.a,self.group).status_code,401)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):
        setattr(ChatTest,name,None)
