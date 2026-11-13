"""Multi-day expedition creation, visibility, archival and legacy data migration."""
from datetime import datetime, timedelta, timezone
from contextlib import closing
from pathlib import Path
import secrets
import sqlite3
import tempfile
from unittest import mock
from tests import test_app


class EventRangeTest(test_app.RendezvousTest):
    def date(self,days=0):
        return str(datetime.now(timezone(timedelta(hours=9))).date()+timedelta(days=days))

    def create(self,**changes):
        return self.a.post('/api/expeditions',json={'name':'多日遠征','venue':'makuhari','event_date':self.date(),**changes})

    def settings(self,path=None,**changes):
        path=path or self.path
        data=self.a.get(path+'/settings').json()
        body={key:data[key] for key in ('privacy','pin_policy','event_time','time_zone')}
        body.update({key:data['room'][key] or None for key in ('event_date','event_end_date')})
        return self.a.put(path+'/settings',json={**body,**changes})

    def test_create_single_undated_and_multi_day_ranges_across_all_lists(self):
        for end,expected in [(None,''),(self.date(),''),(self.date(3),self.date(3))]:
            response=self.create(event_end_date=end);self.assertEqual(response.status_code,200)
            room=response.json();self.assertEqual(room['event_end_date'],expected)
            path='/api/expeditions/'+room['id']
            for rooms in [self.a.get('/api/me').json()['expeditions'],self.a.get('/api/expeditions/owned').json()['expeditions'],self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions'],self.a.get('/api/profiles/me/wall').json()['items']]:
                self.assertEqual(next(row for row in rooms if row['id']==room['id'])['event_end_date'],expected)
            self.assertEqual(self.a.get(path).json()['room']['event_end_date'],expected)
            self.assertEqual(self.a.get(path+'/settings').json()['room']['event_end_date'],expected)
        room=self.create(event_date=None,event_end_date=None).json()
        self.assertEqual((room['event_date'],room['event_end_date']),('',''))

    def test_invalid_ranges_do_not_create_or_change_rooms(self):
        for changes in [{'event_end_date':self.date(-1)},{'event_date':None,'event_end_date':self.date(2)},{'event_end_date':'2026-02-30'},{'event_end_date':self.date(731)},{'event_date':self.date(-2),'event_end_date':self.date(2)}]:
            self.assertEqual(self.create(**changes).status_code,422)
        self.assertEqual(self.create(event_end_date=self.date(730)).status_code,200)
        before=self.a.get(self.path+'/settings').json()['room']
        for changes in [{'event_end_date':self.date(-1)},{'event_date':None,'event_end_date':self.date(2)},{'event_end_date':self.date(731)}]:
            self.assertEqual(self.settings(**changes).status_code,422)
            self.assertEqual(self.a.get(self.path+'/settings').json()['room'],before)

    def test_management_copy_content_and_archived_wall_keep_ranges(self):
        self.assertEqual(self.settings(event_end_date=self.date(4)).status_code,200)
        self.assertEqual(self.b.put(self.path+'/settings',json={'privacy':'public','pin_policy':'free','event_date':self.date(),'event_end_date':self.date(5)}).status_code,403)
        copied=self.a.post(self.path+'/copy',json={'name':'另一場遠征'}).json()
        self.assertEqual(copied['event_end_date'],self.date(4));self.assertNotEqual(copied['code'],self.room['code'])
        # A pre-update client saving a different setting must retain the end date.
        self.assertEqual(self.a.put(self.path+'/settings',json={'privacy':'public','pin_policy':'approval','event_date':self.date()}).status_code,200)
        self.assertEqual(self.a.get(self.path+'/settings').json()['room']['event_end_date'],self.date(4))
        self.make_task()
        pin=self.a.post(self.path+'/pins',json={'title':'集合情報','kind':'meet','hours':0,'lat':25,'lng':121}).json()
        self.a.post(self.path+'/pins/'+pin['id']+'/reports',json={'body':'現在人不多','client_id':secrets.token_hex(16)})
        for kind in ('task','landmark','message'):
            row=self.a.get('/api/profiles/me/content?kind='+kind).json()['items'][0]
            self.assertEqual(row['event_end_date'],self.date(4))
        # Reports use the updated archived schedule even if the pin was created earlier.
        self.settings(event_date=self.date(1),event_end_date=self.date(5))
        row=self.a.get('/api/profiles/me/content?kind=message').json()['items'][0]
        self.assertEqual((row['event_date'],row['event_end_date']),(self.date(1),self.date(5)))
        self.assertEqual(self.a.delete(self.path).status_code,200)
        archived=next(row for row in self.a.get('/api/profiles/me/wall').json()['items'] if row['id']==self.room['id'])
        self.assertTrue(archived['removed']);self.assertEqual(archived['event_end_date'],self.date(5))
        self.assertEqual(self.settings('/api/expeditions/'+copied['id'],event_end_date=None).status_code,200)
        self.assertEqual(self.a.get('/api/expeditions/'+copied['id']).json()['room']['event_end_date'],'')
        self.assertEqual(self.settings('/api/expeditions/'+copied['id'],event_date=None,event_end_date=None).status_code,200)

    def test_catalog_previews_and_member_actions_use_last_day_in_room_timezone(self):
        fixed=datetime(2026,11,16,0,30,tzinfo=timezone(timedelta(hours=9)))
        with self.module.connect() as db:
            db.execute("UPDATE expeditions SET event_date='2026-11-13',event_end_date='2026-11-15' WHERE id=?",(self.room['id'],))
            db.execute("INSERT INTO expedition_settings VALUES(?,'public',NULL,'free','','Asia/Taipei')",(self.room['id'],))
        with mock.patch('backend.expedition_settings.datetime') as clock:
            clock.now.side_effect=lambda zone:fixed.astimezone(zone)
            self.assertIn(self.room['id'],[row['id'] for row in self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']])
            self.assertEqual(self.outsider.get(self.path+'/preview').status_code,200)
            self.assertEqual(self.outsider.get(self.path+'/members/'+self.users[1]['id']+'/actions').status_code,200)
            with self.module.connect() as db:db.execute("UPDATE expedition_settings SET time_zone='Asia/Tokyo' WHERE expedition=?",(self.room['id'],))
            self.assertNotIn(self.room['id'],[row['id'] for row in self.outsider.get('/api/venues/makuhari/expeditions').json()['expeditions']])
            self.assertEqual(self.outsider.get(self.path+'/preview').status_code,404)
            self.assertEqual(self.b.get(self.path+'/preview').status_code,200)

    def test_migration_preserves_existing_single_days_and_is_repeatable(self):
        original=self.module.DB
        with tempfile.TemporaryDirectory() as folder:
            legacy=Path(folder)/'legacy.sqlite3'
            with self.module.connect() as source,closing(sqlite3.connect(legacy)) as target:source.backup(target)
            self.module.DB=legacy
            try:
                with self.module.connect() as db:
                    for table in ('expeditions','expedition_records'):
                        db.execute('ALTER TABLE '+table+' DROP COLUMN event_end_date')
                    before={table:[tuple(row) for row in db.execute('SELECT id,name,event_date FROM '+table+' ORDER BY id')] for table in ('expeditions','expedition_records')}
                self.module.init_db();self.module.init_db()
                with self.module.connect() as db:
                    for table,rows in before.items():
                        self.assertEqual([tuple(row) for row in db.execute('SELECT id,name,event_date FROM '+table+' ORDER BY id')],rows)
                        self.assertEqual(db.execute("SELECT COUNT(*) FROM "+table+" WHERE event_end_date<>''").fetchone()[0],0)
                    self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            finally:self.module.DB=original


for name in list(vars(test_app.RendezvousTest)):
    if name.startswith('test_'):setattr(EventRangeTest,name,None)
