"""Integration tests use an isolated temporary database and independent cookies."""
import concurrent.futures
import importlib
import os
import tempfile
import unittest
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi.testclient import TestClient


class RendezvousTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ["TAMAGO_DB"] = cls.temp.name + "/test.sqlite3"
        os.environ["TAMAGO_ORIGIN"] = "http://127.0.0.1:8078"
        cls.module = importlib.import_module("backend.app")
        cls.original_db = cls.module.DB
        cls.module.DB = Path(cls.temp.name) / 'test.sqlite3'
        cls.ctx = TestClient(cls.module.app)
        cls.ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)
        cls.module.DB = cls.original_db
        cls.temp.cleanup()

    def setUp(self):
        with self.module.connect() as db:
            db.execute("DELETE FROM auth_attempts")
        self.clients = [TestClient(self.module.app, headers={"X-Tamago-Client":"web"}) for _ in range(4)]
        self.password = "A long test password 2026!"
        self.usernames = ["test_"+secrets.token_hex(6) for _ in self.clients]
        self.users = [c.post("/api/auth/register",json={"username":self.usernames[i],"password":self.password,"nickname":f"隊友{i}"}).json() for i,c in enumerate(self.clients)]
        self.a,self.b,self.c,self.outsider = self.clients
        self.room = self.a.post("/api/expeditions",json={"name":"測試遠征隊","venue":"makuhari","event_date":str(datetime.now(timezone(timedelta(hours=9))).date())}).json()
        self.path = "/api/expeditions/"+self.room["id"]
        for c in (self.b,self.c):
            self.assertEqual(c.post("/api/join",json={"code":self.room["code"]}).status_code,200)

    def snapshot(self,client):
        return client.get(self.path).json()

    def make_task(self):
        response=self.a.post(self.path+"/tasks",json={"title":"35 換狐 <script>alert(1)</script>","description":"測試","kind":"trade","lat":35.65,"lng":140.03,"hours":6})
        self.assertEqual(response.status_code,200)
        return response.json()

    def test_invitation_boundary_and_csrf(self):
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        self.assertEqual(self.outsider.post("/api/join",json={"code":"ZZZZZZZZ"}).status_code,404)
        self.assertEqual(self.a.post("/api/profile",json={"nickname":"X"},headers={"Origin":"https://evil.example"}).status_code,403)
        self.assertEqual(TestClient(self.module.app).post("/api/profile",json={"nickname":"X"}).status_code,403)
        self.assertEqual(self.a.get("/api/me").headers["cache-control"],"no-store")

    def test_fixed_task_flag_keeps_selected_location_and_receiver_privacy(self):
        selected = {'lat':35.6474, 'lng':140.0358}
        flag = self.a.post(self.path+'/tasks',json={'title':'固定任務旗標','kind':'dining','hours':2,'location_mode':'fixed',**selected}).json()
        task_path = self.path+'/tasks/'+flag['id']
        def task_for(client):
            return next(t for t in self.snapshot(client)['tasks'] if t['id']==flag['id'])
        self.assertEqual(flag['location_mode'],'fixed')
        self.assertIsNone(task_for(self.b)['lat'])
        self.assertEqual(self.b.post(task_path+'/accept').status_code,200)
        moved = {'lat':25.033,'lng':121.5654,'accuracy':8,'scope':'task'}
        # A static flag does not authorize task-only live coordinate uploads.
        self.assertEqual(self.a.put(self.path+'/location',json=moved).status_code,409)
        self.assertEqual(self.a.put(self.path+'/location',json={**moved,'scope':'expedition'}).status_code,200)
        received=task_for(self.b)
        self.assertEqual((received['lat'],received['lng']),(selected['lat'],selected['lng']))
        self.assertEqual(received['location_source'],'fixed')
        self.assertIsNone(received['accuracy'])
        self.assertIsNone(task_for(self.c)['lat'])
        self.assertEqual(self.b.post(task_path+'/release').status_code,200)
        self.assertIsNone(task_for(self.b)['lat'])
        self.assertEqual(self.c.post(task_path+'/accept').status_code,200)
        self.assertEqual(task_for(self.c)['lat'],selected['lat'])
        # Finishing the last moving task withdraws GPS even with a fixed flag open.
        moving=self.make_task()
        self.assertEqual(moving['location_mode'],'publisher')
        self.assertEqual(self.a.put(self.path+'/location',json=moved).status_code,200)
        self.assertEqual(self.a.post(self.path+'/tasks/'+moving['id']+'/cancel').status_code,200)
        self.assertEqual(self.snapshot(self.a)['me']['scope'],'off')
        self.assertEqual(task_for(self.c)['lat'],selected['lat'])
        self.assertEqual(self.a.post(task_path+'/cancel').status_code,200)
        self.assertIsNone(task_for(self.c)['lat'])
        self.assertEqual(self.outsider.get(self.path).status_code,403)

    def test_landmark_creator_and_expedition_admin_permissions(self):
        body={'title':'臨時集合點','kind':'meet','hours':2,'lat':35.6474,'lng':140.0358}
        pin=self.b.post(self.path+'/pins',json=body).json()
        def can_delete(client):
            return next(p for p in self.snapshot(client)['pins'] if p['id']==pin['id'])['can_delete']
        self.assertTrue(can_delete(self.a))
        self.assertTrue(can_delete(self.b))
        self.assertFalse(can_delete(self.c))
        self.assertGreater(pin['expires'],self.module.now())
        self.assertEqual(self.c.delete(self.path+'/pins/'+pin['id']).status_code,403)
        self.assertEqual(self.outsider.delete(self.path+'/pins/'+pin['id']).status_code,403)
        # Ownership of a different room cannot grant cross-room authority.
        other=self.c.post('/api/expeditions',json={'name':'另一支遠征隊','venue':'pia','event_date':self.room['event_date']}).json()
        self.assertEqual(self.c.delete('/api/expeditions/'+other['id']+'/pins/'+pin['id']).status_code,404)
        self.assertEqual(self.c.delete(self.path+'/pins/'+pin['id']).status_code,403)
        self.assertEqual(self.a.delete(self.path+'/pins/'+pin['id']).status_code,200)
        self.assertFalse(any(p['id']==pin['id'] for p in self.snapshot(self.b)['pins']))
        own=self.b.post(self.path+'/pins',json=body).json()
        self.assertEqual(self.b.delete(self.path+'/pins/'+own['id']).status_code,200)
        expired=self.b.post(self.path+'/pins',json=body).json()
        with self.module.connect() as db:
            db.execute('UPDATE pins SET expires=? WHERE id=?',(self.module.now()-1,expired['id']))
        self.assertFalse(any(p['id']==expired['id'] for p in self.snapshot(self.a)['pins']))

    def test_taiwan_coordinates_and_task_privacy(self):
        point={"lat":25.033,"lng":121.5654}
        response=self.a.post(self.path+'/tasks',json={"title":"台灣定位驗證","kind":"dining","hours":1,**point})
        self.assertEqual(response.status_code,200)
        task=response.json();task_path=self.path+'/tasks/'+task['id']
        self.assertIsNone(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])['lat'])
        self.assertEqual(self.b.post(task_path+'/accept').status_code,200)
        self.assertEqual(self.a.put(self.path+'/location',json={**point,"accuracy":12,"scope":"task"}).status_code,200)
        visible=next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])
        self.assertEqual((visible['lat'],visible['lng']),(point['lat'],point['lng']))
        self.assertIsNone(next(t for t in self.snapshot(self.c)['tasks'] if t['id']==task['id'])['lat'])
        self.assertTrue(all(m['lat'] is None and m['lng'] is None for m in self.snapshot(self.b)['members']))

    def test_task_only_location_visibility_and_revocation(self):
        self.a.post('/api/friends/requests',json={'username':self.usernames[1]})
        self.b.post('/api/friends/'+self.users[0]['id']+'/accept')
        squad=self.a.post(self.path+"/squads",json={"name":"同行小隊"}).json()
        other_squad=self.snapshot(self.c)["squads"][0]
        self.assertNotIn("code",other_squad)
        self.assertEqual(self.b.post(self.path+"/squads/join",json={"code":squad["code"]}).status_code,200)
        task=self.make_task()
        task_path=self.path+'/tasks/'+task['id']
        location={"lat":35.6483,"lng":140.0346,"accuracy":15,"scope":"task"}
        self.assertEqual(self.a.put(self.path+"/location",json=location).status_code,200)
        def task_for(client):
            return next(t for t in self.snapshot(client)['tasks'] if t['id']==task['id'])
        for client in (self.a,self.b,self.c):
            self.assertTrue(all(m['lat'] is None and m['lng'] is None for m in self.snapshot(client)['members']))
        for client in (self.b,self.c):
            self.assertFalse(task_for(client)['location_visible'])
            self.assertIsNone(task_for(client)['lat'])
            self.assertIsNone(task_for(client)['lng'])
        self.assertEqual(self.b.post(task_path+'/accept').status_code,200)
        self.assertEqual(task_for(self.b)['lat'],35.6483)
        self.assertEqual(task_for(self.b)['location_source'],'live')
        self.assertIsNone(task_for(self.c)['lat'])
        # Same squad still cannot read coordinates through the member list.
        self.assertTrue(all(m['lat'] is None for m in self.snapshot(self.b)['members']))
        with self.module.connect() as db:
            db.execute("UPDATE members SET located=? WHERE user=?",(self.module.now()-121,self.users[0]["id"]))
        self.assertEqual(task_for(self.b)['lat'],35.6483)
        self.assertEqual(task_for(self.b)['location_source'],'last_known')
        self.assertEqual(task_for(self.b)['location_status'],'last_known')
        self.assertIsNone(task_for(self.c)['lat'])
        with self.module.connect() as db:
            db.execute("UPDATE members SET located=? WHERE user=?",(self.module.now()-901,self.users[0]["id"]))
        self.assertEqual(task_for(self.b)['lat'],task['lat'])
        self.assertEqual(task_for(self.b)['location_source'],'published')
        self.assertEqual(self.a.delete(self.path+"/location").status_code,200)
        self.assertEqual(task_for(self.b)['location_source'],'published')
        self.assertEqual(self.b.post(task_path+'/release').status_code,200)
        self.assertIsNone(task_for(self.b)['lat'])
        self.assertEqual(self.c.post(task_path+'/accept').status_code,200)
        self.assertIsNotNone(task_for(self.c)['lat'])
        self.assertIsNone(task_for(self.b)['lat'])
        self.assertEqual(self.c.post(task_path+'/complete').status_code,200)
        self.assertIsNone(task_for(self.c)['lat'])
        with self.module.connect() as db:
            self.assertIsNone(db.execute("SELECT lat FROM members WHERE user=?",(self.users[0]["id"],)).fetchone()[0])
        self.assertEqual(self.a.put(self.path+'/location',json=location).status_code,409)
        self.assertEqual(self.a.put(self.path+'/location',json={**location,'scope':'squad'}).status_code,422)
        cancelled=self.make_task()
        cancelled_path=self.path+'/tasks/'+cancelled['id']
        self.assertEqual(self.b.post(cancelled_path+'/accept').status_code,200)
        self.assertEqual(self.a.post(cancelled_path+'/cancel').status_code,200)
        self.assertIsNone(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==cancelled['id'])['lat'])
        expired=self.make_task()
        self.assertEqual(self.b.post(self.path+'/tasks/'+expired['id']+'/accept').status_code,200)
        with self.module.connect() as db:
            db.execute('UPDATE tasks SET expires=? WHERE id=?',(self.module.now()-1,expired['id']))
        self.assertFalse(any(t['id']==expired['id'] for t in self.snapshot(self.b)['tasks']))

    def test_personal_location_audiences_are_exclusive(self):
        point={'lat':25.033,'lng':121.5654,'accuracy':12}
        aid=self.users[0]['id']
        self.assertEqual(self.a.post('/api/friends/requests',json={'username':self.usernames[3]}).status_code,200)
        self.assertEqual(self.outsider.post('/api/friends/'+aid+'/accept').status_code,200)
        def member_for(client,path=None):
            return next(m for m in client.get(path or self.path).json()['members'] if m['user']==aid)
        def friend_for():
            return next(f for f in self.outsider.get('/api/friends').json()['friends'] if f['id']==aid)
        self.assertEqual(self.a.put(self.path+'/location',json={**point,'scope':'expedition'}).status_code,200)
        for viewer in (self.b,self.c):
            self.assertTrue(member_for(viewer)['location_visible'])
            self.assertEqual(member_for(viewer)['lat'],point['lat'])
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        self.assertFalse(friend_for()['location_visible'])
        self.assertEqual(self.a.put('/api/friends/location',json=point).status_code,200)
        self.assertTrue(friend_for()['location_visible'])
        for viewer in (self.b,self.c):
            self.assertFalse(member_for(viewer)['location_visible'])
            self.assertIsNone(member_for(viewer)['lat'])
        task=self.make_task();task_path=self.path+'/tasks/'+task['id']
        self.b.post(task_path+'/accept')
        self.assertEqual(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])['location_source'],'published')
        self.assertEqual(self.a.put(self.path+'/location',json={**point,'scope':'task'}).status_code,200)
        self.assertFalse(friend_for()['location_visible'])
        self.assertIsNone(member_for(self.c)['lat'])
        self.assertEqual(next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])['location_source'],'live')
        self.a.put(self.path+'/location',json={**point,'scope':'expedition'})
        self.b.post(task_path+'/complete')
        self.assertTrue(member_for(self.c)['location_visible'])
        room2=self.a.post('/api/expeditions',json={'name':'第二支遠征隊','venue':'ariake','event_date':self.room['event_date']}).json()
        second='/api/expeditions/'+room2['id']
        self.outsider.post('/api/join',json={'code':room2['code']})
        self.assertEqual(self.a.put(second+'/location',json={**point,'scope':'expedition'}).status_code,200)
        self.assertIsNone(member_for(self.b)['lat'])
        self.assertTrue(member_for(self.outsider,second)['location_visible'])
        self.assertEqual(self.b.get(second).status_code,403)
        self.assertFalse(friend_for()['location_visible'])
        self.assertEqual(self.b.delete('/api/location').status_code,200)
        self.assertTrue(member_for(self.outsider,second)['location_visible'])
        self.assertEqual(self.a.delete('/api/location').status_code,200)
        self.assertIsNone(member_for(self.outsider,second)['lat'])
        self.assertFalse(friend_for()['location_visible'])
        self.a.put(self.path+'/location',json={**point,'scope':'expedition'})
        with self.module.connect() as db:
            db.execute('UPDATE members SET located=? WHERE user=?',(self.module.now()-899,aid))
        self.assertTrue(member_for(self.b)['location_visible'])
        self.assertEqual(member_for(self.b)['location_status'],'last_known')
        # Reading snapshots must not extend the last GPS sample's lifetime.
        with self.module.connect() as db:
            self.assertLess(db.execute('SELECT located FROM members WHERE user=? AND expedition=?',(aid,self.room['id'])).fetchone()[0],self.module.now()-890)
            db.execute('UPDATE members SET located=? WHERE user=?',(self.module.now()-901,aid))
        self.assertFalse(member_for(self.b)['location_visible'])
        self.assertTrue(all(member_for(self.b)[key] is None for key in ('lat','lng','accuracy','located')))

    def test_venue_catalog_public_join_private_rooms_and_team_intelligence(self):
        private=self.a.post('/api/expeditions',json={'name':'邀請限定','venue':'makuhari','event_date':self.room['event_date'],'discoverable':False}).json()
        catalog=self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']
        self.assertIn(self.room['id'],[r['id'] for r in catalog])
        self.assertNotIn(private['id'],[r['id'] for r in catalog])
        self.assertTrue(all('code' not in r and 'owner' not in r and 'lat' not in r for r in catalog))
        self.assertEqual(self.outsider.post('/api/expeditions/'+private['id']+'/join').status_code,404)
        self.assertEqual(self.outsider.post(self.path+'/join').status_code,200)
        self.assertEqual(self.outsider.get(self.path).status_code,200)
        pin=self.a.post(self.path+'/pins',json={'title':'特典攤位情報','description':'隊內情報','kind':'booth','lat':35.65,'lng':140.03,'hours':6}).json()
        shared=next(p for p in self.snapshot(self.b)['pins'] if p['id']==pin['id'])
        self.assertEqual(shared['lat'],35.65)
        self.assertEqual(shared['lng'],140.03)
        self.assertTrue(all(m['lat'] is None for m in self.snapshot(self.b)['members']))
        self.assertEqual(self.b.get('/api/expeditions/'+private['id']).status_code,403)

    def test_atomic_task_acceptance_and_permissions(self):
        task=self.make_task();path=self.path+"/tasks/"+task["id"]
        self.assertEqual(self.a.post(path+"/accept").status_code,409)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            responses=list(pool.map(lambda c:c.post(path+"/accept").status_code,[self.b,self.c]))
        self.assertEqual(sorted(responses),[200,409])
        t=next(t for t in self.snapshot(self.a)["tasks"] if t["id"]==task["id"])
        winner=self.b if t["assignee"]==self.users[1]["id"] else self.c
        loser=self.c if winner is self.b else self.b
        self.assertEqual(loser.post(path+"/complete").status_code,403)
        self.assertEqual(winner.post(path+"/cancel").status_code,403)
        self.assertEqual(winner.post(path+"/release").status_code,200)
        self.assertEqual(winner.post(path+"/accept").status_code,200)
        self.assertEqual(winner.post(path+"/complete").status_code,200)
        self.assertEqual(loser.post(path+"/accept").status_code,409)

    def test_landmarks_expiry_owner_and_validation(self):
        body={"title":"官店集合點","description":"位置由使用者標記","kind":"shop","lat":35.65,"lng":140.03,"hours":0}
        p=self.a.post(self.path+"/pins",json=body).json()
        self.assertIsNone(p["expires"])
        self.assertEqual(self.b.delete(self.path+"/pins/"+p["id"]).status_code,403)
        self.assertEqual(self.a.delete(self.path+"/pins/"+p["id"]).status_code,200)
        self.assertEqual(self.a.post(self.path+"/pins",json={**body,"lat":999}).status_code,422)
        self.assertEqual(self.a.post(self.path+"/pins",json={**body,"title":"   "}).status_code,422)
        temp=self.a.post(self.path+"/pins",json={**body,"hours":2}).json()
        with self.module.connect() as db:
            db.execute("UPDATE pins SET expires=? WHERE id=?",(self.module.now()-1,temp["id"]))
        self.assertFalse(any(p["id"]==temp["id"] for p in self.snapshot(self.b)["pins"]))

    def test_leave_cancels_tasks_releases_and_hides_member(self):
        t=self.make_task();path=self.path+"/tasks/"+t["id"]
        self.b.post(path+"/accept")
        self.assertEqual(self.b.delete(self.path+"/membership").status_code,200)
        self.assertEqual(next(item for item in self.snapshot(self.a)["tasks"] if item["id"]==t["id"])["status"],"open")
        self.assertEqual(self.b.get(self.path).status_code,403)
        self.assertEqual(self.a.delete(self.path+"/membership").status_code,200)
        self.assertEqual(next(item for item in self.snapshot(self.c)["tasks"] if item["id"]==t["id"])["status"],"cancelled")

    def test_static_and_cleanup(self):
        self.assertEqual(self.a.get("/").status_code,200)
        self.assertEqual(self.a.get("/static/app.js").status_code,200)
        self.assertEqual(self.a.get("/sw.js").headers["content-type"].split(';')[0],"application/javascript")
        self.make_task()
        self.assertEqual(self.a.put(self.path+"/location",json={"lat":1,"lng":2,"accuracy":3,"scope":"task"}).status_code,200)
        with self.module.connect() as db:
            db.execute("UPDATE members SET located=? WHERE user=?",(self.module.now()-901,self.users[0]["id"]))
        self.module.cleanup()
        with self.module.connect() as db:
            self.assertIsNone(db.execute("SELECT lat FROM members WHERE user=?",(self.users[0]["id"],)).fetchone()[0])

    def test_registration_hash_validation_and_legacy_migration(self):
        fresh=TestClient(self.module.app,headers={"X-Tamago-Client":"web"})
        duplicate=fresh.post("/api/auth/register",json={"username":self.usernames[0].upper(),"password":self.password,"nickname":"重複"})
        self.assertEqual(duplicate.status_code,409)
        short=fresh.post("/api/auth/register",json={"username":"short_password","password":"secret-short","nickname":"測試"})
        self.assertEqual(short.status_code,422)
        self.assertNotIn("secret-short",short.text)
        self.assertEqual(fresh.post("/api/profile",json={"nickname":"匿名"}).status_code,401)
        with self.module.connect() as db:
            row=db.execute("SELECT * FROM users WHERE id=?",(self.users[0]["id"],)).fetchone()
            self.assertTrue(row["password_hash"].startswith("$argon2id$"))
            self.assertNotIn(self.password,row["password_hash"])
            stored=db.execute("SELECT token_hash FROM sessions WHERE user=?",(self.users[0]["id"],)).fetchone()[0]
            self.assertNotEqual(stored,self.a.cookies.get("tamago_session"))
            legacy_id=secrets.token_hex(12);legacy_token=secrets.token_urlsafe(32)
            db.execute("INSERT INTO users(id,token,nickname,expires) VALUES(?,?,?,?)",(legacy_id,legacy_token,"舊訪客",self.module.now()+1000))
        fresh.cookies.set("tamago_session",legacy_token)
        converted=fresh.post("/api/auth/register",json={"username":"legacy_"+secrets.token_hex(5),"password":self.password,"nickname":"新帳號"})
        self.assertEqual(converted.status_code,201)
        self.assertEqual(converted.json()["id"],legacy_id)

    def test_cross_device_login_logout_and_session_expiry(self):
        second=TestClient(self.module.app,headers={"X-Tamago-Client":"web"})
        old_cookie=self.a.cookies.get("tamago_session")
        logged=second.post("/api/auth/login",json={"username":self.usernames[0].upper(),"password":self.password})
        self.assertEqual(logged.status_code,200)
        self.assertEqual(logged.json()["id"],self.users[0]["id"])
        self.assertEqual(second.get("/api/me").json()["expeditions"][0]["id"],self.room["id"])
        self.make_task()
        self.assertEqual(self.a.put(self.path+"/location",json={"lat":35.65,"lng":140.03,"accuracy":10,"scope":"task"}).status_code,200)
        self.assertEqual(self.a.post("/api/auth/logout").status_code,200)
        self.assertIsNone(self.a.get("/api/me").json()["user"])
        stolen=TestClient(self.module.app,headers={"X-Tamago-Client":"web"},cookies={"tamago_session":old_cookie})
        self.assertEqual(stolen.get(self.path).status_code,401)
        self.assertEqual(second.get(self.path).status_code,200)
        self.assertIsNone(next(m for m in self.snapshot(self.b)["members"] if m["user"]==self.users[0]["id"])["lat"])
        with self.module.connect() as db:
            db.execute("UPDATE sessions SET expires=? WHERE user=?",(self.module.now()-1,self.users[0]["id"]))
            db.execute("UPDATE users SET expires=? WHERE id=?",(self.module.now()-1,self.users[0]["id"]))
        self.assertIsNone(second.get("/api/me").json()["user"])
        self.module.cleanup()
        with self.module.connect() as db:
            self.assertIsNotNone(db.execute("SELECT id FROM users WHERE id=?",(self.users[0]["id"],)).fetchone())
        self.assertEqual(second.post("/api/auth/login",json={"username":self.usernames[0],"password":self.password}).status_code,200)

    def test_password_change_revokes_other_sessions(self):
        second=TestClient(self.module.app,headers={"X-Tamago-Client":"web"})
        second.post("/api/auth/login",json={"username":self.usernames[0],"password":self.password})
        current_cookie=self.a.cookies.get("tamago_session")
        self.assertEqual(self.a.post("/api/auth/password",json={"current_password":"incorrect","new_password":"Another strong passphrase 2026!"}).status_code,401)
        changed=self.a.post("/api/auth/password",json={"current_password":self.password,"new_password":"Another strong passphrase 2026!"})
        self.assertEqual(changed.status_code,200)
        self.assertNotEqual(current_cookie,self.a.cookies.get("tamago_session"))
        self.assertIsNotNone(self.a.get("/api/me").json()["user"])
        self.assertIsNone(second.get("/api/me").json()["user"])
        self.assertEqual(second.post("/api/auth/login",json={"username":self.usernames[0],"password":self.password}).status_code,401)
        self.assertEqual(second.post("/api/auth/login",json={"username":self.usernames[0],"password":"Another strong passphrase 2026!"}).status_code,200)

    def test_country_activity_choices_support_creation_join_and_history(self):
        created={}
        for vid,label in (('taiwan','台灣'),('japan','日本')):
            response=self.a.post('/api/expeditions',json={'name':label+'活動隊伍','venue':vid,'event_date':self.room['event_date']})
            self.assertEqual(response.status_code,200);created[vid]=response.json()
        for vid,label in (('taiwan','台灣'),('japan','日本')):
            room=created[vid]
            catalogue=self.b.get('/api/venues/'+vid+'/expeditions').json()['expeditions']
            self.assertIn(room['id'],[r['id'] for r in catalogue])
            self.assertTrue(all(r['venue']==vid for r in catalogue))
            self.assertEqual(self.b.post('/api/expeditions/'+room['id']+'/join').status_code,200)
            wall=self.b.get('/api/profiles/me').json()['wall']['items']
            self.assertEqual(next(r for r in wall if r['id']==room['id'])['venue_name'],label)
            view=self.b.get('/api/expeditions/'+room['id']).json()
            self.assertTrue(all(m['lat'] is None and m['lng'] is None for m in view['members']))
        self.assertEqual(self.a.post('/api/expeditions',json={'name':'不支援的選項','venue':'unknown','event_date':self.room['event_date']}).status_code,422)

    def test_optional_dates_support_omission_join_and_archived_feedback(self):
        rooms=[]
        for extra in ({},{'event_date':None},{'event_date':''}):
            response=self.a.post('/api/expeditions',json={'name':'不指定活動日期','venue':'taiwan',**extra})
            self.assertEqual(response.status_code,200);room=response.json();rooms.append(room)
            self.assertEqual(room['event_date'],'')
            catalog=self.outsider.get('/api/venues/taiwan/expeditions').json()['expeditions']
            self.assertIn(room['id'],[r['id'] for r in catalog])
            self.assertEqual(self.b.post('/api/expeditions/'+room['id']+'/join').status_code,200)
        path='/api/expeditions/'+rooms[0]['id']
        pin=self.a.post(path+'/pins',json={'title':'未指定日期的現場情報','kind':'meet','lat':25,'lng':121,'hours':2}).json()
        self.assertEqual(self.b.put(path+'/pins/'+pin['id']+'/vote',json={'value':1}).status_code,200)
        self.assertEqual(self.a.delete(path).status_code,200)
        wall=self.b.get('/api/profiles/me').json()['wall']['items']
        archived=next(r for r in wall if r['id']==rooms[0]['id'])
        self.assertEqual(archived['event_date'],'');self.assertTrue(archived['removed'])
        feedback=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertEqual(feedback['event_date'],'');self.assertEqual(feedback['likes'],1)

    def test_optional_dates_keep_date_validation_and_public_catalogue_rules(self):
        base_date=datetime.fromisoformat(self.room['event_date']).date()
        created=[]
        for label,value,public in (('未指定',None,True),('過去',str(base_date-timedelta(days=1)),True),
                                   ('將來',str(base_date+timedelta(days=1)),True),('私人',None,False)):
            response=self.a.post('/api/expeditions',json={'name':label,'venue':'japan','event_date':value,'discoverable':public})
            self.assertEqual(response.status_code,200);created.append(response.json())
        catalogue=self.outsider.get('/api/venues/japan/expeditions').json()['expeditions'];ids=[r['id'] for r in catalogue]
        self.assertIn(created[0]['id'],ids);self.assertIn(created[2]['id'],ids)
        self.assertNotIn(created[1]['id'],ids);self.assertNotIn(created[3]['id'],ids)
        self.assertLess(ids.index(created[2]['id']),ids.index(created[0]['id']))
        for invalid in ('not-a-date','2026-02-30',str(base_date-timedelta(days=2)),str(base_date+timedelta(days=731))):
            self.assertEqual(self.a.post('/api/expeditions',json={'name':'無效日期','venue':'japan','event_date':invalid}).status_code,422)

    def test_failed_logins_throttle_and_uniform_errors(self):
        fresh=TestClient(self.module.app,headers={"X-Tamago-Client":"web"})
        wrong=fresh.post("/api/auth/login",json={"username":self.usernames[0],"password":"incorrect"})
        missing=fresh.post("/api/auth/login",json={"username":"no_such_"+secrets.token_hex(5),"password":"incorrect"})
        self.assertEqual(wrong.status_code,missing.status_code)
        self.assertEqual(wrong.json(),missing.json())
        for _ in range(9):
            self.assertEqual(fresh.post("/api/auth/login",json={"username":self.usernames[0],"password":"incorrect"}).status_code,401)
        blocked=fresh.post("/api/auth/login",json={"username":self.usernames[0],"password":self.password})
        self.assertEqual(blocked.status_code,429)
        self.assertIn("retry-after",blocked.headers)


if __name__ == "__main__":
    unittest.main(verbosity=2)
