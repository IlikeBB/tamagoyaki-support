from contextlib import contextmanager
from pathlib import Path
import sqlite3
import tempfile
import unittest

from backend.chat import Chat


class ChatSchemaTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'legacy.sqlite3'
        with self.connect() as db:
            db.execute('CREATE TABLE users(id TEXT PRIMARY KEY)')
            db.executemany('INSERT INTO users VALUES(?)',[('a',),('b',)])
        self.chat=Chat(self.connect,None)

    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path)
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:yield db
        finally:db.close()

    def legacy(self):
        with self.connect() as db:
            db.executescript('''CREATE TABLE chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('friend','expedition')),
              thread TEXT NOT NULL,sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),client_id TEXT NOT NULL,created INTEGER NOT NULL,
              UNIQUE(sender,client_id));
              CREATE INDEX chat_thread_messages ON chat_messages(kind,thread,id);
              CREATE INDEX chat_sender_time ON chat_messages(sender,created);
              CREATE TABLE chat_reads (
              user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK(kind IN ('friend','expedition')),thread TEXT NOT NULL,
              last_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user,kind,thread));''')

    def test_upgrade_preserves_messages_reads_sequence_and_constraints(self):
        self.legacy()
        with self.connect() as db:
            db.executemany('INSERT INTO chat_messages VALUES(?,?,?,?,?,?,?)',[(42,'friend','a:b','a','原有私訊 🥚','nonce-private',1),(43,'expedition','room','b','原有群聊','nonce-group',2)])
            db.executemany('INSERT INTO chat_reads VALUES(?,?,?,?)',[('b','friend','a:b',42),('a','expedition','room',43)])
            db.execute("INSERT INTO chat_messages VALUES(200,'expedition','room','a','deleted','nonce-deleted',3)")
            db.execute('DELETE FROM chat_messages WHERE id=200')
            messages=[tuple(row) for row in db.execute('SELECT * FROM chat_messages ORDER BY id')]
            reads=[tuple(row) for row in db.execute('SELECT * FROM chat_reads ORDER BY user')]
        for _ in range(2):self.chat.migrate()
        with self.connect() as db:
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM chat_messages ORDER BY id')],messages)
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM chat_reads ORDER BY user')],reads)
            mid=db.execute("INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES('squad','s1','a','小隊訊息','nonce-squad',4)").lastrowid
            self.assertEqual(mid,201)
            db.execute("INSERT INTO chat_reads VALUES('b','squad','s1',201)")
            with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES('squad','s1','a','duplicate','nonce-private',5)")
            with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO chat_reads VALUES('b','public','s1',201)")
            indexes={row['name'] for row in db.execute('PRAGMA index_list(chat_messages)')}
            self.assertTrue({'chat_thread_messages','chat_sender_time'}<=indexes)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_empty_legacy_chat_keeps_deleted_id_high_watermark(self):
        self.legacy()
        with self.connect() as db:
            db.execute("INSERT INTO chat_messages VALUES(100,'friend','a:b','a','deleted','nonce-deleted',1)")
            db.execute('DELETE FROM chat_messages')
        self.chat.migrate()
        with self.connect() as db:
            mid=db.execute("INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES('squad','s1','a','new','nonce-new',2)").lastrowid
            self.assertEqual(mid,101)

    def test_fresh_schema_is_idempotent(self):
        self.chat.migrate()
        self.chat.migrate()
        with self.connect() as db:
            db.execute("INSERT INTO chat_messages(kind,thread,sender,body,client_id,created) VALUES('squad','s1','a','new','nonce-new',1)")
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
