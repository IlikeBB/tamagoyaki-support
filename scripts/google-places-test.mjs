import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../frontend/services/google-places.js',import.meta.url),'utf8')).replace('export function createGooglePlaces','function createGooglePlaces');
function client(importLibrary){
 const google={maps:{importLibrary}},window={google};
 vm.runInNewContext(source+';window.client=createGooglePlaces(resources);',{window,google,resources:{active:true,timeout:setTimeout,clearTimeout,defer:()=>()=>{}},DOMException});return window.client;
}
const point=(id='taipei-101',lat=25.034,lng=121.5645)=>({id,displayName:'台北101',formattedAddress:'台北市信義區',location:{lat:()=>lat,lng:()=>lng},attributions:[{provider:'資料供應者',providerURI:'https://example.com/'}]});
const calls=[];let imports=0;
const api=client(async name=>{assert.equal(name,'places');imports++;return {Place:{searchByText:async request=>{calls.push(request);return {places:[point(),point(),point('bad',NaN,121),point('bad-lng',25,181),{id:'no-location'}]};}}};});
const result=await api.search(' 台北101 ',{language:'zh-TW',region:'TW'},{isGoogle:true});
assert.equal(result.results.length,1);assert.equal(result.results[0].source,'google');assert.equal(result.results[0].lat,25.034);
assert.equal(result.results[0].attributions[0].provider,'資料供應者');
assert.equal(calls[0].textQuery,'台北101');assert.equal(calls[0].language,'zh-TW');assert.equal(calls[0].region,'tw');
assert.deepEqual(Array.from(calls[0].fields),['id','displayName','formattedAddress','location']);assert.equal(calls[0].maxResultCount,8);
assert.equal(calls[0].locationBias,undefined);assert.equal(calls[0].locationRestriction,undefined);
await api.search('幕張メッセ',{}, {isGoogle:true});assert.equal(imports,1);
for(const query of ['','x','x'.repeat(121)])await assert.rejects(api.search(query,{}, {isGoogle:true}),/2 至 120/);
await assert.rejects(api.search('台北101',{}, {isGoogle:false}),/尚未載入/);assert.equal(calls.length,2);
let attempts=0;
const recovering=client(async()=>{if(++attempts===1)throw new Error('private loader detail');return {Place:{searchByText:async()=>({places:[]})}};});
await assert.rejects(recovering.search('載入失敗',{}, {isGoogle:true}),/暫時無法連線/);
assert.equal((await recovering.search('重試成功',{}, {isGoogle:true})).results.length,0);assert.equal(attempts,2);
for(const [code,pattern] of [['PERMISSION_DENIED',/尚未獲得授權/],['RESOURCE_EXHAUSTED',/暫時忙碌/],['UNKNOWN_ERROR',/暫時無法連線/]]){
 const broken=client(async()=>({Place:{searchByText:async()=>{throw Object.assign(new Error('private endpoint and credentials'),{code});}}}));
 try{await broken.search('測試錯誤',{}, {isGoogle:true});assert.fail('Expected failure');}catch(error){assert.match(error.message,pattern);assert.doesNotMatch(error.message,/private|credentials/);}
}
const zero=client(async()=>({Place:{searchByText:async()=>{throw {code:'ZERO_RESULTS'};}}}));assert.equal((await zero.search('沒有地點',{}, {isGoogle:true})).results.length,0);
console.log(JSON.stringify({ok:true,checks:['Google Places New request fields, language and region','no GPS or hard area restriction; native LatLng parsing, invalid/duplicate filtering','lazy library loading and retry after failure','safe, actionable permission/quota/network errors; empty results']}));
