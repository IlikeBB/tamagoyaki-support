"""Task feedback archived without coordinates, with one vote per member and task."""
import time

from fastapi import HTTPException, Request
from .reputation import FeedbackVote


class TaskFeedback:
    def __init__(self,connect,accounts):
        self.connect,self.accounts=connect,accounts

    def migrate(self):
        with self.connect() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS task_feedback_records (
              task TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expedition TEXT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,
              room_name TEXT NOT NULL,venue TEXT NOT NULL,event_date TEXT NOT NULL,
              created INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS task_feedback_owner ON task_feedback_records(owner,created);
            CREATE INDEX IF NOT EXISTS task_feedback_expedition ON task_feedback_records(expedition);
            CREATE TABLE IF NOT EXISTS task_reviews (
              task TEXT NOT NULL REFERENCES task_feedback_records(task) ON DELETE CASCADE,
              voter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              value INTEGER NOT NULL CHECK(value IN (-1,1)),created INTEGER NOT NULL,updated INTEGER NOT NULL,
              PRIMARY KEY(task,voter)
            );
            CREATE INDEX IF NOT EXISTS task_reviews_voter ON task_reviews(voter,updated);
            ''')
            c.execute('''INSERT OR IGNORE INTO task_feedback_records
              SELECT t.id,t.owner,t.expedition,t.title,t.kind,e.name,e.venue,e.event_date,t.created,t.expires,t.status
              FROM tasks t JOIN expeditions e ON e.id=t.expedition''')
            c.execute('''UPDATE task_feedback_records SET status=(SELECT status FROM tasks WHERE tasks.id=task_feedback_records.task)
              WHERE task IN (SELECT id FROM tasks)''')

    @staticmethod
    def record(c,task):
        c.execute('''INSERT INTO task_feedback_records
          SELECT ?,?,?,?, ?,e.name,e.venue,e.event_date,?,?,? FROM expeditions e WHERE e.id=?
          ON CONFLICT(task) DO UPDATE SET status=excluded.status''',
          (task['id'],task['owner'],task['expedition'],task['title'],task['kind'],task['created'],task['expires'],task['status'],task['expedition']))

    @staticmethod
    def sync_room(c,eid):
        c.execute('''UPDATE task_feedback_records SET status=(SELECT status FROM tasks WHERE tasks.id=task_feedback_records.task)
          WHERE expedition=? AND task IN (SELECT id FROM tasks)''',(eid,))

    @staticmethod
    def totals(c,uid):
        return dict(c.execute('''SELECT COALESCE(SUM(v.value=1),0) AS likes,COALESCE(SUM(v.value=-1),0) AS dislikes
          FROM task_feedback_records r LEFT JOIN task_reviews v ON v.task=r.task WHERE r.owner=?''',(uid,)).fetchone())

    @staticmethod
    def votes(c,tid,uid):
        return dict(c.execute('''SELECT COALESCE(SUM(value=1),0) AS likes,COALESCE(SUM(value=-1),0) AS dislikes,
          COALESCE(MAX(CASE WHEN voter=? THEN value END),0) AS my_vote FROM task_reviews WHERE task=?''',(uid,tid)).fetchone())

    @staticmethod
    def active(task,stamp):
        return task['status'] in ('open','accepted') and (task['expires']>stamp or bool(task['help_active']))

    def annotate(self,c,tasks,uid):
        stamp=int(time.time())
        for task in tasks:
            task.update(self.votes(c,task['id'],uid))
            task['can_vote']=task['owner']!=uid and self.active(task,stamp)

    def install(self,app):
        @app.put('/api/expeditions/{eid}/tasks/{tid}/vote')
        def vote(eid: str,tid: str,body: FeedbackVote,request: Request):
            uid=self.accounts.current_user(request)['id'];stamp=int(time.time())
            self.accounts.limit('task-vote',uid,120,60)
            with self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                record=c.execute('SELECT 1 FROM task_feedback_records WHERE task=? AND expedition=?',(tid,eid)).fetchone()
                task=c.execute('SELECT * FROM tasks WHERE id=? AND expedition=?',(tid,eid)).fetchone()
                member=c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(uid,eid)).fetchone()
                if body.value==0 and record:
                    c.execute('DELETE FROM task_reviews WHERE task=? AND voter=?',(tid,uid))
                else:
                    if not member:raise HTTPException(403,'只有這支遠征隊的目前成員可以評價任務。')
                    if not task:raise HTTPException(404,'這個任務已移除。')
                    if not self.active(task,stamp):raise HTTPException(409,'這個任務已結束或到期。')
                    if task['owner']==uid:raise HTTPException(403,'不能為自己發布的任務評價。')
                    self.record(c,dict(task))
                    if body.value:
                        c.execute('''INSERT INTO task_reviews VALUES(?,?,?,?,?) ON CONFLICT(task,voter)
                          DO UPDATE SET value=excluded.value,updated=excluded.updated''',(tid,uid,body.value,stamp,stamp))
                    else:c.execute('DELETE FROM task_reviews WHERE task=? AND voter=?',(tid,uid))
                result={'ok':True}
                if member and task and self.active(task,stamp):result.update(self.votes(c,tid,uid))
                return result
