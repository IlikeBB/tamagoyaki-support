"""Small, cached, manually submitted place searches; never send a user's GPS."""
from collections import OrderedDict
import json
import math
import os
import threading
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException


class Places:
    # Public service terms: https://github.com/komoot/photon#demo-server
    # Keep one upstream request at a time, at most one each second, with a cache.
    def __init__(self, venues, origin):
        self.venues = venues
        self.origin = origin
        self.endpoint = os.environ.get('TAMAGO_PLACE_SEARCH_URL', 'https://photon.komoot.io/api/')
        self.lock = threading.Lock()
        self.cache = OrderedDict()
        self.last_request = -math.inf

    @staticmethod
    def normalized(query):
        return ''.join(unicodedata.normalize('NFKC', query).casefold().split())

    def local(self, query):
        aliases = {
            'makuhari':['幕張展覽館','幕張展覽中心','幕張メッセ','makuhari messe'],
            'k-arena':['K橫','K横','Kアリーナ横浜','K arena yokohama'],
            'pia':['ぴあアリーナMM','PIA arena MM','PIA'],
            'ariake':['有明アリーナ','有明體育館','ariake arena'],
        }
        needle = self.normalized(query)
        return [{'id':'venue:'+v['id'],'name':v['name'],'address':'固定場館地標','lat':v['lat'],'lng':v['lng'],'source':'venue'}
                for v in self.venues if any(needle in self.normalized(name) for name in [v['name'],v['short'],*aliases.get(v['id'],[])])]

    @staticmethod
    def parse(data):
        if not isinstance(data, dict) or not isinstance(data.get('features'), list):
            raise ValueError('Unexpected search response')
        results, seen = [], set()
        for feature in data['features'][:20]:
            try:
                properties = feature['properties']
                geometry = feature['geometry']
                if geometry['type'] != 'Point':
                    continue
                lng, lat = map(float, geometry['coordinates'][:2])
                if not math.isfinite(lat) or not math.isfinite(lng) or not -90<=lat<=90 or not -180<=lng<=180:
                    continue
                name = str(properties.get('name') or properties.get('street') or properties.get('city') or '').strip()[:160]
                if not name:
                    continue
                identity = (name,round(lat,5),round(lng,5))
                if identity in seen:
                    continue
                seen.add(identity)
                address = list(dict.fromkeys(str(properties[k])[:120] for k in ('country','state','county','city','district','street','housenumber') if properties.get(k)))
                results.append({'id':f"osm:{properties.get('osm_type','')}:{properties.get('osm_id',len(results))}",
                                'name':name,'address':' · '.join(address)[:400], 'lat':lat,'lng':lng,'source':'osm'})
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
            if len(results) == 5:
                break
        return results

    def search(self, query):
        query = ' '.join(query.split())
        if not 2<=len(query)<=120:
            raise HTTPException(422,'請輸入 2–120 個字的地點名稱或地址。')
        local = self.local(query)
        if local:
            return local
        if not self.lock.acquire(blocking=False):
            raise HTTPException(429,'地點搜尋忙碌中，請稍後再試。',headers={'Retry-After':'2'})
        try:
            key = query.casefold()
            cached = self.cache.get(key)
            if cached and time.monotonic()-cached[0]<86400:
                self.cache.move_to_end(key)
                return cached[1]
            if time.monotonic()-self.last_request < 1.1:
                raise HTTPException(429,'請稍候一秒再搜尋。',headers={'Retry-After':'2'})
            self.last_request = time.monotonic()
            request = Request(self.endpoint+'?'+urlencode({'q':query,'limit':5}),
                              headers={'User-Agent':f'TamagoyakiSupport/1.0 (+{self.origin})','Accept':'application/json'})
            try:
                with urlopen(request,timeout=8) as response:
                    raw = response.read(1_000_001)
                if len(raw)>1_000_000:
                    raise ValueError('Search response too large')
                results = self.parse(json.loads(raw))
            except (HTTPError, URLError, TimeoutError, OSError, ValueError):
                raise HTTPException(503,'地點搜尋暫時無法連線，請稍後重試；仍可長按地圖標記。') from None
            self.cache[key] = (time.monotonic(), results)
            self.cache.move_to_end(key)
            while len(self.cache)>512:
                self.cache.popitem(last=False)
            return results
        finally:
            self.lock.release()
