"""Accept only fixed-size browser-rendered PNGs; discard all metadata chunks."""
import base64
import binascii
import hashlib
import struct
import zlib
from typing import Literal

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

MediaKind=Literal['avatar','banner']
SIZES={'avatar':(320,320),'banner':(1200,400)}
SIGNATURE=b'\x89PNG\r\n\x1a\n'


class MediaInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    image: str=Field(max_length=2_800_100)


def png_chunk(kind, data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)


def clean_png(value, slot):
    try:
        if not value.startswith('data:image/png;base64,'):raise ValueError()
        raw=base64.b64decode(value.split(',',1)[1],validate=True)
        if len(raw)>2_100_000 or not raw.startswith(SIGNATURE):raise ValueError()
        position=8;header=None;parts=[];ended=False;data_ended=False
        while position<len(raw):
            if position+12>len(raw):raise ValueError()
            length=struct.unpack_from('>I',raw,position)[0];kind=raw[position+4:position+8]
            if position+12+length>len(raw) or not all(65<=b<=90 or 97<=b<=122 for b in kind):raise ValueError()
            data=raw[position+8:position+8+length];crc=struct.unpack_from('>I',raw,position+8+length)[0]
            if zlib.crc32(kind+data)&0xffffffff!=crc:raise ValueError()
            position+=length+12
            if header is None and kind!=b'IHDR':raise ValueError()
            if kind==b'IHDR':
                if header is not None or length!=13:raise ValueError()
                width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',data)
                if (width,height)!=SIZES[slot] or depth!=8 or color not in (2,6) or any((compression,filtering,interlace)):raise ValueError()
                header=data;stride=width*(4 if color==6 else 3)+1;expected=stride*height
            elif kind==b'IDAT':
                if data_ended:raise ValueError()
                parts.append(data)
            elif kind==b'IEND':
                if length or not parts or position!=len(raw):raise ValueError()
                ended=True;break
            else:
                if kind[0]&32==0:raise ValueError()  # Unknown critical chunks, palettes and APNG are not accepted.
                if kind in (b'acTL',b'fcTL',b'fdAT'):raise ValueError()
                if parts:data_ended=True
        if not ended:raise ValueError()
        decoder=zlib.decompressobj();pixels=decoder.decompress(b''.join(parts),expected+1)
        if len(pixels)!=expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:raise ValueError()
        if any(pixels[row*stride]>4 for row in range(height)):raise ValueError()
        return SIGNATURE+png_chunk(b'IHDR',header)+png_chunk(b'IDAT',b''.join(parts))+png_chunk(b'IEND',b'')
    except (ValueError,KeyError,binascii.Error,struct.error,zlib.error):
        raise HTTPException(422,'圖片格式或尺寸不正確，請重新裁切後上傳。') from None


class ProfileMedia:
    def __init__(self, connect, accounts):self.connect,self.accounts=connect,accounts

    def migrate(self):
        with self.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS profile_media (
              user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK(kind IN ('avatar','banner')),data BLOB NOT NULL,digest TEXT NOT NULL,
              PRIMARY KEY(user,kind))''')

    @staticmethod
    def urls(c, uid):
        result={'avatar_url':None,'banner_url':None}
        for row in c.execute('SELECT kind,digest FROM profile_media WHERE user=?',(uid,)):
            result[row['kind']+'_url']=f"/api/profiles/{uid}/media/{row['kind']}?v={row['digest']}"
        return result

    def install(self, app):
        @app.put('/api/profiles/me/media/{slot}')
        def upload(slot: MediaKind, body: MediaInput, request: Request):
            uid=self.accounts.current_user(request)['id'];self.accounts.limit('profile-media',uid,30,3600)
            data=clean_png(body.image,slot);digest=hashlib.sha256(data).hexdigest()[:24]
            with self.connect() as c:
                c.execute('''INSERT INTO profile_media VALUES(?,?,?,?) ON CONFLICT(user,kind)
                  DO UPDATE SET data=excluded.data,digest=excluded.digest''',(uid,slot,data,digest))
            return {slot+'_url':f'/api/profiles/{uid}/media/{slot}?v={digest}'}

        @app.delete('/api/profiles/me/media/{slot}')
        def remove(slot: MediaKind, request: Request):
            uid=self.accounts.current_user(request)['id']
            with self.connect() as c:c.execute('DELETE FROM profile_media WHERE user=? AND kind=?',(uid,slot))
            return {'ok':True}

        @app.get('/api/profiles/{uid}/media/{slot}')
        def image(uid: str, slot: MediaKind, request: Request):
            self.accounts.current_user(request)
            with self.connect() as c:row=c.execute('SELECT data FROM profile_media WHERE user=? AND kind=?',(uid,slot)).fetchone()
            if not row:raise HTTPException(404,'尚未設定這張圖片。')
            return Response(content=row['data'],media_type='image/png',headers={'Content-Disposition':'inline','Cache-Control':'no-store'})
