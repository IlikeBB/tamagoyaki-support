import concurrent.futures
import secrets
from urllib.parse import parse_qs,urlparse

from tests import test_app


class SquadInvitesTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()
        response=self.a.post(self.path+'/squads',json={'name':'南口 <img src=x> 小隊'})
        self.assertEqual(response.status_code,200);self.squad=response.json()
        self.invites=self.path+'/squads/'+self.squad['id']

    def befriend(self,index):
        other=self.clients[index]
        self.assertEqual(self.a.post('/api/friends/requests',json={'username':self.usernames[index]}).status_code,200)
        self.assertEqual(other.post('/api/friends/'+self.users[0]['id']+'/accept').status_code,200)

    def invite(self,index=3,nonce=None,client=None,path=None):
        return (client or self.a).post((path or self.invites)+'/invites',json={'friend_id':self.users[index]['id'],'client_id':nonce or secrets.token_hex(16)})

    def test_candidates_are_accepted_friends_without_coordinates(self):
        self.befriend(1);self.befriend(3)
        self.a.post('/api/friends/requests',json={'username':self.usernames[2]})
        self.b.post(self.path+'/squads/join',json={'code':self.squad['code']})
        self.b.put('/api/friends/location',json={'lat':25.033,'lng':121.5654,'accuracy':8})
        response=self.a.get(self.invites+'/invitees');self.assertEqual(response.status_code,200)
        people={p['id']:p for p in response.json()['friends']}
        self.assertEqual(set(people),{self.users[1]['id'],self.users[3]['id']})
        self.assertTrue(people[self.users[1]['id']]['in_squad']);self.assertTrue(people[self.users[1]['id']]['in_expedition'])
        self.assertFalse(people[self.users[3]['id']]['in_expedition'])
        self.assertTrue(all(not {'lat','lng','located','accuracy','code','token'}&p.keys() for p in people.values()))
        self.assertEqual(self.c.get(self.invites+'/invitees').status_code,403)
        self.assertEqual(self.outsider.get(self.invites+'/invitees').status_code,403)
        self.assertEqual(response.headers['cache-control'],'no-store')

    def test_invitation_is_a_private_unread_message_and_never_auto_joins(self):
        self.befriend(3)
        result=self.invite();self.assertEqual(result.status_code,200);message=result.json()
        self.assertIn(self.squad['name'],message['body'])
        url=urlparse(message['body'].splitlines()[-1]);params=parse_qs(url.query)
        self.assertEqual(url.scheme+'://'+url.netloc,self.module.PUBLIC_ORIGIN)
        self.assertEqual(params,{'join':[self.room['code']],'squad':[self.squad['code']]})
        self.assertEqual(self.outsider.get('/api/me').json()['expeditions'],[])
        self.assertEqual(self.outsider.get('/api/chat').json()['unread'],1)
        private='/api/chat/friend/'+self.users[0]['id']+'/messages'
        self.assertEqual(self.outsider.get(private).json()['messages'][0]['id'],message['id'])
        self.assertEqual(self.c.get(private).status_code,403)
        self.assertFalse({'lat','lng','thread','client_id','token'}&message.keys())
        mine=self.snapshot(self.a)['me'];self.assertEqual(mine['scope'],'off');self.assertIsNone(mine['lat'])

    def test_current_squad_and_friendship_are_required_on_every_request(self):
        self.assertEqual(self.invite().status_code,403)
        self.a.post('/api/friends/requests',json={'username':self.usernames[3]})
        self.assertEqual(self.invite().status_code,403)
        self.outsider.post('/api/friends/'+self.users[0]['id']+'/accept')
        nonce=secrets.token_hex(16);self.assertEqual(self.invite(nonce=nonce).status_code,200)
        self.a.delete('/api/friends/'+self.users[3]['id'])
        self.assertEqual(self.invite(nonce=nonce).status_code,403)
        self.assertEqual(self.a.get(self.invites+'/invitees').json()['friends'],[])
        self.befriend(3)
        self.a.post(self.path+'/squads',json={'name':'另一支小隊'})
        self.assertEqual(self.a.get(self.invites+'/invitees').status_code,403)
        self.assertEqual(self.invite().status_code,403)

    def test_retry_is_unique_even_when_concurrent_or_recipient_has_joined(self):
        self.befriend(3);nonce=secrets.token_hex(16)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results=list(pool.map(lambda _:self.invite(nonce=nonce),range(3)))
        self.assertTrue(all(r.status_code==200 for r in results));self.assertEqual(len({r.json()['id'] for r in results}),1)
        self.outsider.post('/api/join',json={'code':self.room['code']})
        self.outsider.post(self.path+'/squads/join',json={'code':self.squad['code']})
        self.assertEqual(self.invite().status_code,409)
        self.assertEqual(self.invite(nonce=nonce).json()['id'],results[0].json()['id'])
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM chat_messages WHERE sender=? AND client_id=?',(self.users[0]['id'],nonce)).fetchone()[0],1)

    def test_reusing_another_message_nonce_or_cross_room_cannot_send(self):
        self.befriend(1);self.befriend(3);nonce=secrets.token_hex(16)
        self.assertEqual(self.invite(1,nonce=nonce).status_code,200)
        self.assertEqual(self.invite(3,nonce=nonce).status_code,409)
        other=self.a.post('/api/expeditions',json={'name':'另一場','venue':'japan'}).json()
        foreign='/api/expeditions/'+other['id']+'/squads/'+self.squad['id']
        self.assertEqual(self.invite(path=foreign).status_code,403)
        self.assertEqual(self.invite(client=self.c).status_code,403)
        self.assertEqual(self.invite(index=0).status_code,403)

    def test_message_rate_limit_and_body_validation_are_shared(self):
        self.befriend(3);thread=self.module.chat.thread(self.users[0]['id'],'friend',self.users[3]['id']);stamp=self.module.now()
        with self.module.connect() as db:
            db.executemany('INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES(?,?,?,?,?,?)',
                           [('friend',thread,self.users[0]['id'],'existing',secrets.token_hex(16),stamp) for _ in range(60)])
        self.assertEqual(self.invite().status_code,429)
        self.assertEqual(self.a.post(self.invites+'/invites',json={'friend_id':self.users[3]['id'],'client_id':'bad'}).status_code,422)
        self.assertEqual(self.a.post(self.invites+'/invites',json={'friend_id':self.users[3]['id'],'client_id':secrets.token_hex(16),'body':'replace invitation'}).status_code,422)

    def test_nonfriends_cannot_use_codes_and_failed_join_keeps_location(self):
        personal=self.b.post(self.path+'/squads',json={'name':'原有小隊'}).json()
        point={'lat':25.033,'lng':121.5654,'accuracy':8,'scope':'squad','squad_id':personal['id']}
        self.assertEqual(self.b.put(self.path+'/location',json=point).status_code,200)
        result=self.b.post(self.path+'/squads/join',json={'code':self.squad['code']})
        self.assertEqual(result.status_code,403);self.assertIn('互為好友',result.json()['detail'])
        mine=self.snapshot(self.b)['me'];self.assertEqual(mine['squad'],personal['id']);self.assertEqual(mine['scope'],'squad');self.assertEqual(mine['lat'],point['lat'])
        self.befriend(1)
        self.assertEqual(self.b.post(self.path+'/squads/join',json={'code':self.squad['code']}).status_code,200)

    def test_combined_invitation_join_is_atomic_and_requires_accepted_friend(self):
        payload={'code':self.room['code'],'squad_code':self.squad['code'].lower()}
        self.assertEqual(self.outsider.post('/api/join',json=payload).status_code,403)
        self.assertEqual(self.outsider.get('/api/me').json()['expeditions'],[])
        self.a.post('/api/friends/requests',json={'username':self.usernames[3]})
        self.assertEqual(self.outsider.post('/api/join',json=payload).status_code,403)
        self.assertEqual(self.outsider.get('/api/profiles/me').json()['wall']['total'],0)
        self.outsider.post('/api/friends/'+self.users[0]['id']+'/accept')
        result=self.outsider.post('/api/join',json=payload)
        self.assertEqual(result.status_code,200);self.assertTrue(result.json()['squad_joined'])
        mine=self.snapshot(self.outsider)['me'];self.assertEqual(mine['squad'],self.squad['id']);self.assertEqual(mine['scope'],'off')

    def test_old_invitation_stops_working_after_unfriend_or_friend_leaves_squad(self):
        self.befriend(1);self.befriend(3)
        self.b.post(self.path+'/squads/join',json={'code':self.squad['code']})
        self.assertEqual(self.invite().status_code,200)
        payload={'code':self.room['code'],'squad_code':self.squad['code']}
        self.a.delete('/api/friends/'+self.users[3]['id'])
        self.assertEqual(self.outsider.post('/api/join',json=payload).status_code,403)
        self.befriend(3)
        self.a.post(self.path+'/squads',json={'name':'換到另一隊'})
        self.assertEqual(self.outsider.post('/api/join',json=payload).status_code,403)
        self.assertEqual(self.outsider.get('/api/me').json()['expeditions'],[])

    def test_expired_or_foreign_squad_code_never_creates_membership(self):
        self.befriend(3)
        self.assertEqual(self.outsider.post('/api/join',json={'code':self.room['code'],'squad_code':'ZZZZZZZZ'}).status_code,404)
        self.assertEqual(self.outsider.get('/api/me').json()['expeditions'],[])


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(SquadInvitesTest,name,None)
