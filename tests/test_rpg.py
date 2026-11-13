"""XP is computed from authorized, unique feedback, including retained history."""
import concurrent.futures
import unittest

from fastapi.testclient import TestClient
from backend.rpg import progression
from tests import test_app


class ProgressionTest(unittest.TestCase):
    def test_boundaries_and_negative_xp(self):
        for likes,dislikes,xp,level,progress,needed in (
            (0,0,0,1,0,100),(1,0,20,1,20,80),(5,1,95,1,95,5),
            (5,0,100,2,0,100),(6,0,120,2,20,80),(0,1,-5,1,0,105),
        ):
            with self.subTest(likes=likes,dislikes=dislikes):
                data=progression(likes,dislikes)
                self.assertEqual((data['xp'],data['level'],data['progress'],data['needed']),(xp,level,progress,needed))
                self.assertEqual(data['next_level'],level+1)
        self.assertEqual(progression(20,0)['title'],'情報新星')
        self.assertEqual(progression(245,0)['title'],'傳說支援者')


class RpgTest(test_app.RendezvousTest):
    def setUp(self):
        self.module.limits.clear();super().setUp()

    def profile(self,client=None,uid='me'):
        response=(client or self.a).get('/api/profiles/'+uid)
        self.assertEqual(response.status_code,200);return response.json()

    def vote(self,client,item,value,source='tasks',path=None):
        return client.put((path or self.path)+'/'+source+'/'+item['id']+'/vote',json={'value':value})

    def pin(self,hours=0):
        response=self.a.post(self.path+'/pins',json={'title':'RPG 情報點','kind':'meet','lat':25.03,'lng':121.56,'hours':hours})
        self.assertEqual(response.status_code,200);return response.json()

    def test_mixed_feedback_switch_retract_and_level_down(self):
        task=self.make_task();pin=self.pin()
        self.assertEqual(self.profile()['rpg']['xp'],0)
        for client,item,source in ((self.b,task,'tasks'),(self.c,task,'tasks'),(self.b,pin,'pins'),(self.c,pin,'pins')):
            for _ in range(2):self.assertEqual(self.vote(client,item,1,source).status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],80)
        extra=self.make_task();self.assertEqual(self.vote(self.b,extra,1).status_code,200)
        self.assertEqual(self.profile()['rpg']['level'],2)
        self.assertEqual(self.vote(self.b,task,-1).status_code,200)
        data=self.profile();self.assertEqual(data['rpg']['xp'],75);self.assertEqual(data['rpg']['level'],1)
        self.assertEqual(data['reputation'],{'likes':4,'dislikes':1,'landmarks':0})
        self.assertEqual(self.vote(self.b,task,0).status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],80)
        self.assertEqual(self.profile(self.b)['rpg']['xp'],0)

    def test_task_feedback_authorization_validation_and_privacy(self):
        task=self.make_task()
        self.assertEqual(self.vote(self.a,task,1).status_code,403)
        self.assertEqual(self.vote(self.outsider,task,1).status_code,403)
        self.assertEqual(self.vote(TestClient(self.module.app,headers={'X-Tamago-Client':'web'}),task,1).status_code,401)
        self.assertEqual(self.vote(self.b,task,2).status_code,422)
        self.assertEqual(self.b.put(self.path+'/tasks/'+task['id']+'/vote',json={'value':1,'owner':self.users[1]['id']}).status_code,422)
        self.assertEqual(self.a.patch('/api/profiles/me',json={'nickname':'test','xp':9999,'level':99}).status_code,422)
        other=self.a.post('/api/expeditions',json={'name':'另一隊','venue':'taiwan','event_date':''}).json()
        self.assertEqual(self.vote(self.b,task,1,path='/api/expeditions/'+other['id']).status_code,403)
        self.assertEqual(self.vote(self.b,task,1).status_code,200)
        visible=next(t for t in self.snapshot(self.b)['tasks'] if t['id']==task['id'])
        self.assertEqual(visible['likes'],1);self.assertEqual(visible['my_vote'],1)
        self.assertIsNone(visible['lat']);self.assertIsNone(visible['lng'])
        self.assertNotIn('voter',visible);self.assertFalse(next(t for t in self.snapshot(self.a)['tasks'] if t['id']==task['id'])['can_vote'])
        self.assertEqual(self.profile(self.outsider,self.users[0]['id'])['rpg']['xp'],20)
        self.assertEqual(self.outsider.get('/api/profiles/'+self.users[0]['id']+'/feedback').json()['items'],[])
        record=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertEqual(record['source'],'task')
        self.assertFalse({'lat','lng','accuracy','code','voter','help_active'} & record.keys())

    def test_finish_expiry_and_help_lifetime(self):
        task=self.make_task();self.vote(self.b,task,1)
        self.assertEqual(self.a.post(self.path+'/tasks/'+task['id']+'/complete').status_code,200)
        self.assertEqual(self.vote(self.c,task,1).status_code,409)
        record=self.a.get('/api/profiles/me/feedback').json()['items'][0]
        self.assertEqual(record['status'],'done');self.assertFalse(record['active'])
        self.assertEqual(self.profile()['rpg']['xp'],20)
        expired=self.make_task()
        with self.module.connect() as db:db.execute('UPDATE tasks SET expires=? WHERE id=?',(self.module.now()-1,expired['id']))
        self.assertEqual(self.vote(self.b,expired,1).status_code,409)
        help_task=self.a.post(self.path+'/tasks',json={'title':'求助','kind':'help','lat':25,'lng':121,'accuracy':8,'help_broadcast':True,'hours':1}).json()
        with self.module.connect() as db:db.execute('UPDATE tasks SET expires=? WHERE id=?',(self.module.now()-1,help_task['id']))
        self.assertEqual(self.vote(self.b,help_task,-1).status_code,200)
        self.assertTrue(next(t for t in self.snapshot(self.c)['tasks'] if t['id']==help_task['id'])['help_active'])
        self.assertEqual(self.profile()['rpg']['xp'],15)
        self.a.post(self.path+'/tasks/'+help_task['id']+'/cancel')
        self.assertEqual(self.vote(self.c,help_task,1).status_code,409)

    def test_departure_deletion_archive_and_retraction(self):
        task=self.make_task();self.vote(self.b,task,1);self.vote(self.c,task,-1)
        self.assertEqual(self.b.delete(self.path+'/membership').status_code,200)
        self.assertEqual(self.vote(self.b,task,-1).status_code,403)
        self.assertEqual(self.vote(self.b,task,0).status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],-5)
        self.assertEqual(self.a.delete(self.path).status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],-5)
        given=self.c.get('/api/profiles/me/feedback?kind=given').json()['items'][0]
        self.assertTrue(given['removed']);self.assertFalse(given['can_view']);self.assertNotIn('likes',given)
        self.assertEqual(self.vote(self.c,task,0).json(),{'ok':True})
        self.assertEqual(self.profile()['rpg']['xp'],0)
        self.assertEqual(self.c.get('/api/profiles/me/feedback?kind=given').json()['items'],[])

    def test_permanent_negative_stays_and_limited_negative_archives(self):
        permanent=self.pin();limited=self.pin(2)
        result=self.vote(self.b,permanent,-1,'pins')
        self.assertEqual(result.status_code,200);self.assertFalse(result.json()['removed'])
        self.assertEqual(self.vote(self.b,limited,-1,'pins').status_code,200)
        ids=[p['id'] for p in self.snapshot(self.c)['pins']]
        self.assertIn(permanent['id'],ids);self.assertNotIn(limited['id'],ids)
        self.assertEqual(self.profile()['rpg']['xp'],-10)
        self.assertEqual(self.a.delete(self.path+'/pins/'+permanent['id']).status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],-10)
        for item in (permanent,limited):self.assertEqual(self.vote(self.b,item,0,'pins').status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],0)

    def test_concurrent_task_votes_are_unique_and_task_stays(self):
        task=self.make_task()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results=list(pool.map(lambda value:self.vote(self.b,task,value),[1,-1,1,-1]))
        self.assertTrue(all(r.status_code==200 for r in results))
        profile=self.profile();self.assertEqual(profile['reputation']['likes']+profile['reputation']['dislikes'],1)
        self.assertIn(profile['rpg']['xp'],(-5,20))
        self.assertIn(task['id'],[t['id'] for t in self.snapshot(self.c)['tasks']])

    def test_mixed_history_pagination_and_migration_preserve_votes(self):
        for index in range(7):
            task=self.make_task();pin=self.pin()
            self.vote(self.b,task,1);self.vote(self.b,pin,1,'pins')
        for _ in range(2):
            self.module.task_feedback.migrate();self.module.reputation.migrate()
        self.assertEqual(self.profile()['rpg']['xp'],280)
        for kind in ('received','given'):
            client=self.a if kind=='received' else self.b
            page=client.get('/api/profiles/me/feedback?kind='+kind).json()
            self.assertEqual(page['total'],14);self.assertEqual(len(page['items']),12)
            more=client.get('/api/profiles/me/feedback?kind='+kind+'&offset='+str(page['next_offset'])).json()
            self.assertIsNone(more['next_offset']);items=page['items']+more['items']
            self.assertEqual(len({(r['source'],r['id']) for r in items}),14)
            self.assertEqual({r['source'] for r in items},{'pin','task'})
            self.assertTrue(all('lat' not in r and 'lng' not in r for r in items))

    def test_legacy_backfill_keeps_existing_landmark_votes(self):
        task=self.make_task();permanent=self.pin();limited=self.pin(2)
        self.vote(self.b,limited,1,'pins')
        with self.module.connect() as db:
            db.execute('DELETE FROM task_feedback_records WHERE task=?',(task['id'],))
            db.execute('DELETE FROM landmark_records WHERE pin=?',(permanent['id'],))
        for _ in range(2):
            self.module.task_feedback.migrate();self.module.reputation.migrate()
        self.assertEqual(self.profile()['rpg']['xp'],20)
        self.assertEqual(self.vote(self.b,task,1).status_code,200)
        self.assertEqual(self.vote(self.b,permanent,1,'pins').status_code,200)
        self.assertEqual(self.profile()['rpg']['xp'],60)
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM task_feedback_records WHERE task=?',(task['id'],)).fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM landmark_records WHERE pin=?',(permanent['id'],)).fetchone()[0],1)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(RpgTest,name,None)
