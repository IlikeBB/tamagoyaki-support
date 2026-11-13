import io
import json
import unittest
from unittest.mock import patch
from urllib.error import URLError
from fastapi import HTTPException
from places import Places

VENUES=[{'id':'k-arena','name':'Kアリーナ横浜','short':'K 橫','lat':35.4645775,'lng':139.6306334}]
def result(name='台北101',lng=121.5645,lat=25.034):
    return {'geometry':{'type':'Point','coordinates':[lng,lat]},'properties':{'name':name,'city':'臺北市','country':'臺灣','osm_type':'W','osm_id':123}}
def response(features):
    return io.BytesIO(json.dumps({'features':features}).encode('utf-8'))


class PlacesTest(unittest.TestCase):
    def setUp(self):
        self.search=Places(VENUES,'https://example.test')

    def test_curated_venue_alias_uses_verified_point_without_external_request(self):
        with patch('places.urlopen') as fetch:
            for query in ['K橫','K arena yokohama','Ｋアリーナ横浜']:
                point=self.search.search(query)[0]
                self.assertEqual(point['lat'],VENUES[0]['lat'])
                self.assertEqual(point['source'],'venue')
            fetch.assert_not_called()

    def test_utf8_query_cache_identity_and_no_gps(self):
        with patch('places.urlopen',return_value=response([result()])) as fetch:
            first=self.search.search('  台北101 ')
            self.assertEqual(first,self.search.search('台北101'))
            fetch.assert_called_once()
            request=fetch.call_args.args[0]
            self.assertIn('q=%E5%8F%B0%E5%8C%97101',request.full_url)
            self.assertNotIn('lat=',request.full_url)
            self.assertNotIn('lon=',request.full_url)
            self.assertIn('TamagoyakiSupport',request.headers['User-agent'])
            self.assertEqual(first[0]['lng'],121.5645)

    def test_upstream_throttle_lock_and_error_recovery(self):
        with patch('places.urlopen',return_value=response([])) as fetch:
            self.assertEqual(self.search.search('無結果'),[])
            with self.assertRaises(HTTPException) as error:
                self.search.search('不同地點')
            self.assertEqual(error.exception.status_code,429)
            fetch.assert_called_once()
        self.search.last_request=-100
        with patch('places.urlopen',side_effect=URLError('private upstream detail')):
            with self.assertRaises(HTTPException) as error:
                self.search.search('連線故障')
            self.assertEqual(error.exception.status_code,503)
            self.assertNotIn('private',error.exception.detail)
        self.assertFalse(self.search.lock.locked())
        self.search.lock.acquire()
        try:
            with self.assertRaises(HTTPException) as error:
                self.search.search('其他搜尋')
            self.assertEqual(error.exception.status_code,429)
        finally:
            self.search.lock.release()

    def test_bad_results_are_filtered_and_duplicates_removed(self):
        results=Places.parse({'features':[None,{},result(lng=999),result(lat=float('nan')),result(),result()]})
        self.assertEqual(len(results),1)
        self.assertEqual(results[0]['name'],'台北101')
        for invalid in ['', 'x',' '*5,'a'*121]:
            with self.assertRaises(HTTPException):self.search.search(invalid)


if __name__=='__main__':
    unittest.main()
