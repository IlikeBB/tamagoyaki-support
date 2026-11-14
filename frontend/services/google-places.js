export function createGooglePlaces(resources) {
  let library;
  function timed(promise){
    return new Promise((resolve,reject)=>{
      const release=resources.defer(()=>reject(new DOMException('Application scope was disposed.','AbortError')));
      const timer=resources.timeout(()=>reject(new Error('Google 地點搜尋連線逾時，請再試一次。')),15000);
      Promise.resolve(promise).then(value=>resources.active?resolve(value):reject(new DOMException('Application scope was disposed.','AbortError')),reject).finally(()=>{resources.clearTimeout(timer);release();});
    });
  }
  async function search(query,settings,view){
    const text=String(query||'').trim();
    if(text.length<2||text.length>120)throw new Error('請輸入 2 至 120 個字的地點名稱或地址。');
    if(!view?.isGoogle||!window.google?.maps?.importLibrary)throw new Error('Google 地圖尚未載入，請重新整理後再搜尋。');
    try{
      if(!library)library=timed(google.maps.importLibrary('places')).catch(error=>{library=null;throw error;});
      const {Place}=await library;
      const response=await timed(Place.searchByText({textQuery:text,fields:['id','displayName','formattedAddress','location'],maxResultCount:8,language:settings?.language||'zh-TW',region:(settings?.region||'JP').toLowerCase()}));
      const results=[],seen=new Set();
      for(const place of response.places||[]){
        const lat=place.location?.lat(),lng=place.location?.lng();
        if(!place.id||seen.has(place.id)||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)continue;
        seen.add(place.id);
        results.push({id:place.id,name:place.displayName||place.formattedAddress||'未命名地點',address:place.formattedAddress||'',lat,lng,source:'google',attributions:(place.attributions||[]).map(a=>({provider:a.provider||'',uri:a.providerURI||''}))});
        if(results.length===8)break;
      }
      return {results};
    }catch(error){
      const detail=String(error?.code||'')+' '+String(error?.message||'');
      if(/ZERO_RESULTS/.test(detail))return {results:[]};
      if(/REQUEST_DENIED|PERMISSION_DENIED|API_KEY|ApiNotActivated|ApiTargetBlocked/.test(detail))throw new Error('Google 地點搜尋尚未獲得授權，請聯絡管理員。');
      if(/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|quota/i.test(detail))throw new Error('Google 地點搜尋暫時忙碌，請稍後再試。');
      if(/連線逾時/.test(detail))throw new Error('Google 地點搜尋連線逾時，請再試一次。');
      throw new Error('Google 地點搜尋暫時無法連線，請稍後重試。');
    }
  }
  return {search};
}
