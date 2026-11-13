from tests import test_app


class GroundMessagesTest(test_app.RendezvousTest):
    def note(self):
        response=self.b.post(self.path+'/pins',json={
            'title':'前方有休息處','description':'前方有休息處\n右側入口可以坐下。',
            'kind':'message','hours':24,'lat':25.033,'lng':121.5654})
        self.assertEqual(response.status_code,200)
        return response.json()

    def test_note_is_fixed_and_visible_to_members_without_live_location(self):
        pin=self.note()
        self.assertEqual(pin['expires']-pin['created'],86400)
        data=self.snapshot(self.c)
        visible=next(p for p in data['pins'] if p['id']==pin['id'])
        self.assertEqual((visible['kind'],visible['lat'],visible['lng']),('message',25.033,121.5654))
        self.assertEqual(visible['description'],'前方有休息處\n右側入口可以坐下。')
        self.assertIsNone(next(m for m in data['members'] if m['user']==self.users[1]['id'])['lat'])
        self.b.put(self.path+'/location',json={'scope':'expedition','lat':25.04,'lng':121.57,'accuracy':10})
        self.assertEqual(next(p for p in self.snapshot(self.c)['pins'] if p['id']==pin['id'])['lat'],25.033)
        self.assertEqual(self.outsider.get(self.path).status_code,403)
        self.assertEqual(self.outsider.post(self.path+'/pins',json={k:v for k,v in pin.items() if k in ('title','description','kind','lat','lng')} ).status_code,403)

    def test_delete_authorization_and_vote_history_apply_to_messages(self):
        pin=self.note();path=self.path+'/pins/'+pin['id']
        self.assertEqual(self.c.delete(path).status_code,403)
        self.assertEqual(self.c.put(path+'/vote',json={'value':1}).status_code,200)
        self.assertEqual(self.a.delete(path).status_code,200)
        with self.module.connect() as db:
            self.assertEqual(db.execute('SELECT kind FROM landmark_records WHERE pin=?',(pin['id'],)).fetchone()['kind'],'message')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM landmark_reviews WHERE pin=?',(pin['id'],)).fetchone()[0],1)
        other=self.note()
        self.assertEqual(self.b.delete(self.path+'/pins/'+other['id']).status_code,200)

    def test_invalid_votes_and_expiration_remove_map_note_but_keep_record(self):
        pin=self.note()
        result=self.c.put(self.path+'/pins/'+pin['id']+'/vote',json={'value':-1})
        self.assertEqual(result.status_code,200);self.assertTrue(result.json()['removed'])
        self.assertFalse(any(p['id']==pin['id'] for p in self.snapshot(self.b)['pins']))
        other=self.note()
        with self.module.connect() as db:db.execute('UPDATE pins SET expires=? WHERE id=?',(self.module.now()-1,other['id']))
        self.module.cleanup()
        self.assertFalse(any(p['id']==other['id'] for p in self.snapshot(self.b)['pins']))
        with self.module.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM landmark_records WHERE pin IN (?,?)',(pin['id'],other['id'])).fetchone()[0],2)


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(GroundMessagesTest,name,None)
