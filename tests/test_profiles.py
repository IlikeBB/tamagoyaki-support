import base64
import concurrent.futures
import struct
import zlib

from fastapi.testclient import TestClient
from tests import test_app


def png(width=320,height=320,color=(230,170,70),metadata=False,pixels=None):
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    result=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))
    if metadata:result+=chunk(b'tEXt',b'GPS\x00private camera coordinates')
    return result+chunk(b'IDAT',zlib.compress(pixels if pixels is not None else (b'\0'+bytes(color)*width)*height))+chunk(b'IEND',b'')


class ProfilesTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()
        self.pid=self.users[0]['id']

    def pin(self,hours=2):
        response=self.a.post(self.path+'/pins',json={'title':'南口不用排隊的洗手間','description':'右側入口','kind':'toilet','lat':35.648,'lng':140.034,'hours':hours})
        self.assertEqual(response.status_code,200);return response.json()

    def vote(self,client,pin,value):return client.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':value})

    def profile(self,client=None,uid='me'):return (client or self.a).get('/api/profiles/'+uid).json()

    def test_profile_details_and_photo_upload_boundaries(self):
        data=self.profile();self.assertTrue(data['profile']['own']);self.assertIsNone(data['profile']['avatar_url'])
        self.assertEqual(self.a.patch('/api/profiles/me',json={'nickname':'玉子燒 🥚','bio':'今天也一起遠征。'}).status_code,200)
        self.assertEqual(self.profile()['profile']['bio'],'今天也一起遠征。')
        self.assertEqual(self.profile(self.b,self.pid)['profile']['nickname'],'玉子燒 🥚')
        self.assertFalse(self.profile(self.b,self.pid)['profile']['own'])
        self.assertEqual(self.a.patch('/api/profiles/me',json={'nickname':'X','bio':'x'*161}).status_code,422)
        self.assertEqual(self.a.patch('/api/profiles/me',json={'nickname':'X','user':self.users[1]['id']}).status_code,422)
        photo=png(metadata=True);payload={'image':'data:image/png;base64,'+base64.b64encode(photo).decode()}
        result=self.a.put('/api/profiles/me/media/avatar',json=payload)
        self.assertEqual(result.status_code,200);url=result.json()['avatar_url']
        image=self.b.get(url);self.assertEqual(image.status_code,200);self.assertEqual(image.headers['content-type'],'image/png')
        self.assertNotIn(b'private camera coordinates',image.content);self.assertNotIn(b'tEXt',image.content)
        self.assertEqual(self.profile()['profile']['avatar_url'],url)
        self.assertEqual(TestClient(self.module.app).get(url).status_code,401)
        self.assertEqual(self.b.put('/api/profiles/'+self.pid+'/media/avatar',json=payload).status_code,405)
        self.assertEqual(self.a.delete('/api/profiles/me/media/avatar').status_code,200)
        self.assertEqual(self.a.get(url).status_code,404)
        self.assertEqual(TestClient(self.module.app).get('/api/profiles/'+self.pid).status_code,401)

    def test_media_rejects_malformed_oversized_and_expanding_payloads(self):
        fixtures=[b'<svg onload="alert(1)"/>',png(width=321),png()[:-12],png()+b'extra',
                  png(pixels=(b'\0'+bytes((1,2,3))*320)*640),png(pixels=(b'\6'+bytes((1,2,3))*320)*320)]
        broken=bytearray(png());broken[-1]^=1;fixtures.append(bytes(broken))
        for raw in fixtures:
            response=self.a.put('/api/profiles/me/media/avatar',json={'image':'data:image/png;base64,'+base64.b64encode(raw).decode()})
            self.assertEqual(response.status_code,422)
        self.assertEqual(self.a.put('/api/profiles/me/media/banner',json={'image':'data:image/png;base64,'+base64.b64encode(png(1200,400)).decode()}).status_code,200)
        self.assertEqual(self.a.put('/api/profiles/me/media/avatar',content=b'x'*2_900_001,headers={'Content-Type':'application/json'}).status_code,413)
        self.assertEqual(self.a.patch('/api/profiles/me',content=b'x'*20_000,headers={'Content-Type':'application/json'}).status_code,413)

    def test_participation_wall_survives_leaving_and_filters_private_rooms(self):
        private=self.a.post('/api/expeditions',json={'name':'只有隊員知道的場次','venue':'pia','event_date':self.room['event_date'],'discoverable':False}).json()
        self.b.post('/api/join',json={'code':private['code']})
        bid=self.users[1]['id'];path='/api/expeditions/'+private['id']
        self.assertIn(private['id'],[r['id'] for r in self.profile(self.b)['wall']['items']])
        self.assertIn(private['id'],[r['id'] for r in self.profile(self.a,bid)['wall']['items']])
        self.assertNotIn(private['id'],[r['id'] for r in self.profile(self.outsider,bid)['wall']['items']])
        self.b.delete(path+'/membership')
        old=next(r for r in self.profile(self.b)['wall']['items'] if r['id']==private['id'])
        self.assertFalse(old['participating']);self.assertFalse(old['can_enter']);self.assertNotIn('code',old)
        self.b.post('/api/join',json={'code':private['code']})
        self.assertEqual(len([r for r in self.profile(self.b)['wall']['items'] if r['id']==private['id']]),1)

    def test_votes_are_unique_switchable_and_member_only(self):
        pin=self.pin();permanent=self.pin(hours=0)
        self.assertEqual(self.vote(self.a,pin,1).status_code,403)
        self.assertEqual(self.vote(self.outsider,pin,1).status_code,403)
        self.assertEqual(self.vote(self.b,permanent,1).status_code,422)
        for _ in range(2):self.assertEqual(self.vote(self.b,pin,1).status_code,200)
        self.assertEqual(self.vote(self.c,pin,-1).status_code,200)
        self.assertEqual(self.profile()['reputation'],{'likes':1,'dislikes':1,'landmarks':1})
        view=next(p for p in self.snapshot(self.b)['pins'] if p['id']==pin['id'])
        self.assertEqual(view['my_vote'],1);self.assertTrue(view['can_vote']);self.assertNotIn('voter',view)
        self.vote(self.b,pin,-1)
        self.assertEqual(self.profile()['reputation']['likes'],0);self.assertEqual(self.profile()['reputation']['dislikes'],2)
        self.assertNotIn(pin['id'],[p['id'] for p in self.snapshot(self.a)['pins']])
        self.vote(self.b,pin,0);self.assertEqual(self.profile()['reputation']['dislikes'],1)

    def test_expiry_delete_and_leaving_preserve_history_but_allow_retraction(self):
        pin=self.pin();self.vote(self.b,pin,1);self.vote(self.c,pin,-1)
        with self.module.connect() as db:db.execute('UPDATE pins SET expires=? WHERE id=?',(self.module.now()-1,pin['id']))
        self.assertEqual(self.vote(self.b,pin,-1).status_code,409)
        self.assertEqual(self.a.delete(self.path+'/pins/'+pin['id']).status_code,200)
        self.assertEqual(self.profile()['reputation']['likes'],1)
        received=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertTrue(received['removed']);self.assertFalse(received['active']);self.assertNotIn('lat',received)
        self.c.delete(self.path+'/membership')
        given=self.c.get('/api/profiles/me/feedback?kind=given').json()['items'][0]
        self.assertEqual(given['value'],-1);self.assertNotIn('likes',given);self.assertNotIn('dislikes',given)
        self.assertEqual(self.b.get('/api/profiles/'+self.users[2]['id']+'/feedback?kind=given').status_code,403)
        self.assertEqual(self.vote(self.c,pin,0).status_code,200)
        self.assertEqual(self.profile()['reputation']['dislikes'],0)

    def test_feedback_record_visibility_and_atomic_vote_changes(self):
        pin=self.pin();self.vote(self.c,pin,1)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results=list(pool.map(lambda value:self.vote(self.b,pin,value),[1,-1]))
        self.assertTrue(all(r.status_code==200 for r in results))
        totals=self.profile()['reputation'];self.assertEqual(totals['likes']+totals['dislikes'],2)
        profile=self.profile(self.outsider,self.pid);self.assertEqual(profile['reputation'],totals)
        self.assertEqual(self.outsider.get('/api/profiles/'+self.pid+'/feedback').json()['items'],[])
        self.assertEqual(len(self.b.get('/api/profiles/'+self.pid+'/feedback').json()['items']),1)
        self.assertEqual(self.a.get('/api/profiles/me/feedback').headers['cache-control'],'no-store')

    def test_first_invalid_vote_removes_pin_and_preserves_feedback(self):
        pin=self.pin();permanent=self.pin(hours=0)
        self.assertEqual(self.vote(self.outsider,pin,-1).status_code,403)
        result=self.vote(self.b,pin,-1)
        self.assertEqual(result.status_code,200);self.assertTrue(result.json()['removed'])
        self.assertEqual(result.json()['dislikes'],1)
        ids=[p['id'] for p in self.snapshot(self.c)['pins']]
        self.assertNotIn(pin['id'],ids);self.assertIn(permanent['id'],ids)
        self.assertEqual(self.vote(self.c,pin,1).status_code,404)
        received=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertTrue(received['removed']);self.assertTrue(received['invalidated'])
        self.assertEqual(received['dislikes'],1);self.assertNotIn('lat',received)
        given=self.b.get('/api/profiles/me/feedback?kind=given').json()['items'][0]
        self.assertEqual(given['pin'],pin['id']);self.assertEqual(given['value'],-1)
        self.assertEqual(self.profile()['reputation']['dislikes'],1)
        self.assertEqual(self.vote(self.b,pin,0).status_code,200)
        self.assertNotIn(pin['id'],[p['id'] for p in self.snapshot(self.a)['pins']])
        retained=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertEqual(retained['dislikes'],0);self.assertTrue(retained['invalidated'])

    def test_tie_stays_until_retracting_a_positive_vote_even_after_leaving(self):
        pin=self.pin();self.vote(self.b,pin,1)
        result=self.vote(self.c,pin,-1).json();self.assertFalse(result['removed'])
        self.assertIn(pin['id'],[p['id'] for p in self.snapshot(self.a)['pins']])
        self.b.delete(self.path+'/membership')
        result=self.vote(self.b,pin,0).json();self.assertEqual(result,{'ok':True})
        self.assertNotIn(pin['id'],[p['id'] for p in self.snapshot(self.c)['pins']])
        received=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertTrue(received['invalidated']);self.assertEqual(received['dislikes'],1)

    def test_existing_negative_pins_are_removed_idempotently_during_migration(self):
        pin=self.pin();permanent=self.pin(hours=0)
        with self.module.connect() as db:
            db.execute('ALTER TABLE landmark_records DROP COLUMN invalidated')
            db.execute('INSERT INTO landmark_reviews VALUES(?,?,?,?,?)',(pin['id'],self.users[1]['id'],-1,self.module.now(),self.module.now()))
        for _ in range(2):self.module.reputation.migrate()
        with self.module.connect() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM pins WHERE id=?',(pin['id'],)).fetchone())
            self.assertIsNotNone(db.execute('SELECT 1 FROM pins WHERE id=?',(permanent['id'],)).fetchone())
            self.assertEqual(db.execute('SELECT invalidated FROM landmark_records WHERE pin=?',(pin['id'],)).fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM landmark_reviews WHERE pin=?',(pin['id'],)).fetchone()[0],1)

    def test_concurrent_votes_cannot_leave_a_negative_active_pin(self):
        pin=self.pin()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            futures=[pool.submit(self.vote,self.b,pin,1),pool.submit(self.vote,self.c,pin,-1)]
            results=[f.result() for f in futures]
        self.assertEqual(results[1].status_code,200)
        self.assertIn(results[0].status_code,(200,404))
        totals=self.profile()['reputation'];active=any(p['id']==pin['id'] for p in self.snapshot(self.a)['pins'])
        self.assertEqual(active,totals['likes']>=totals['dislikes'])
        self.assertEqual(totals['dislikes'],1)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(ProfilesTest,name,None)
