"""Map configuration and page security, without reading the user's credentials."""
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient


class MapConfigurationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        global app
        import app
        cls.folder = tempfile.TemporaryDirectory()
        cls.original_db = app.DB
        app.DB = Path(cls.folder.name) / 'maps-test.sqlite3'

    @classmethod
    def tearDownClass(cls):
        app.DB = cls.original_db
        cls.folder.cleanup()

    def test_missing_malformed_and_valid_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'maps.json'
            with patch.dict(os.environ, {'TAMAGO_GOOGLE_MAPS_CONFIG': str(path), 'TAMAGO_MAP_PROVIDER': ''}):
                self.assertEqual(app.map_settings(), {'provider': 'leaflet'})
                for invalid in ('{', '[]', 'null', '{"apiKey": 123}', '{"apiKey": "placeholder"}'):
                    path.write_text(invalid, encoding='utf-8')
                    self.assertEqual(app.map_settings(), {'provider': 'leaflet'})
                fake_key = 'AIza' + 'x' * 35
                path.write_text(json.dumps({'apiKey': fake_key, 'language': 'zh-TW', 'region': 'JP'}), encoding='utf-8-sig')
                with TestClient(app.app) as client:
                    response = client.get('/api/config')
                    self.assertEqual(response.json()['maps'], {'provider': 'google', 'api_key': fake_key, 'language': 'zh-TW', 'region': 'JP'})
                    self.assertEqual(response.headers['cache-control'], 'no-store')
                    self.assertEqual(client.get('/google-maps.local.json').status_code, 404)
                    self.assertEqual(client.get('/static/google-maps.local.json').status_code, 404)
                with patch.dict(os.environ, {'TAMAGO_MAP_PROVIDER': 'leaflet'}):
                    self.assertEqual(app.map_settings(), {'provider': 'leaflet'})

    def test_script_nonces_are_unique_and_match_the_header(self):
        client = TestClient(app.app)
        first, second = client.get('/'), client.get('/')
        nonces = []
        for response in (first, second):
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('__CSP_NONCE__', response.text)
            nonce = re.search(r"'nonce-([^']+)'", response.headers['content-security-policy']).group(1)
            scripts = re.findall(r'<script\b[^>]*>', response.text)
            self.assertTrue(scripts)
            self.assertTrue(all(f'nonce="{nonce}"' in script for script in scripts))
            self.assertEqual(response.headers['cache-control'], 'no-store')
            nonces.append(nonce)
        self.assertNotEqual(*nonces)


if __name__ == '__main__':
    unittest.main()
