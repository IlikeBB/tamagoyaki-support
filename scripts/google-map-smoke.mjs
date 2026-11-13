import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';

// Read-only on the live app. Any task/pin fixture stays inside this browser tab.
const origin=process.argv[2]||'http://127.0.0.1:8078';
if(!['http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected live origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const redact=text=>String(text).replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]');
const errors=[],checks=[];let tiles=0;
let page;
fs.mkdirSync('artifacts',{recursive:true});
try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(redact(e.message)));
  page.on('console',m=>{if(m.type()==='error')errors.push(redact(m.text()));});
  page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('/maps/vt')&&r.ok())tiles++;});
  await page.goto(origin);
  await expect.poll(()=>page.evaluate(()=>!!window.google?.maps&&typeof map!=='undefined'&&!!map?.isGoogle),{timeout:25000}).toBe(true);
  await expect(page.locator('.google-facility-overlay')).toBeVisible();
  await expect.poll(()=>tiles,{timeout:20000}).toBeGreaterThan(0);
  await expect(page.locator('#map-provider-notice')).not.toBeVisible();
  await expect(page.locator('#map img[alt="Google"]')).toBeVisible();
  await expect.poll(()=>page.locator('.google-facility-overlay').evaluate(el=>el.complete&&el.naturalWidth>0),{timeout:15000}).toBe(true);
  const geometry=await page.evaluate(()=>({center:map.getCenter(),radius:map.radius,minimum:map.getMinZoom(),zoom:map.getZoom(),circle:layers.items.find(x=>x instanceof google.maps.Circle)?.getRadius()}));
  expect(geometry.radius).toBe(1000);expect(geometry.circle).toBe(1000);
  expect(geometry.center.lat).toBeCloseTo(35.6483,3);expect(geometry.center.lng).toBeCloseTo(140.0346,3);
  checks.push('Native Google raster tiles, attribution, 1 km boundary and venue overlay loaded');
  await page.screenshot({path:'artifacts/google-desktop.png'});
  const initialZoom=await page.evaluate(()=>map.getZoom());
  await page.locator('[data-action=zoom-in]').click();
  await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBeGreaterThan(initialZoom);
  const desktopOverlay=await page.locator('.google-facility-overlay').boundingBox();
  expect(desktopOverlay.width).toBeGreaterThan(100);
  await page.evaluate(()=>{
    state.pins=[{id:'google-map-ui-fixture',title:'地圖情報點測試',kind:'booth',lat:35.6485,lng:140.0349}];renderMap();
  });
  await page.locator('.google-custom-marker[aria-label="地圖情報點測試"]').click();
  await expect(page.locator('#target-card')).toContainText('地圖情報點測試');
  await page.locator('[data-action=target-close]').click();
  await page.evaluate(()=>{state.pins=[];renderMap();});
  checks.push('Zoom, custom accessible information marker and target card');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>map.element.clientWidth)).toBe(390);
  await page.evaluate(()=>new Promise(resolve=>{
    google.maps.event.addListenerOnce(map.native,'idle',resolve);
    map.focusRegion(venue(),1000);setTimeout(resolve,4000);
  }));
  await expect(page.locator('.google-facility-overlay')).toBeVisible();
  await page.locator('#finder-launcher').click();
  await expect(page.locator('#teammate-finder')).toBeVisible();
  await expect(page.locator('#finder-empty-message')).toContainText('加入遠征隊');
  await page.locator('#finder-close').click();
  await expect(page.locator('#map img[alt="Google"]')).toBeVisible();
  const attribution=await page.locator('#map a').evaluateAll(links=>links.map(link=>{
    const rect=link.getBoundingClientRect();
    const top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return {text:link.textContent||link.querySelector('img')?.alt||'',visible:rect.width>0&&rect.height>0,uncovered:!!top&&(link.contains(top)||top.contains(link))};
  }).filter(link=>link.visible));
  expect(attribution.length).toBeGreaterThan(1);
  expect(attribution.filter(link=>!link.uncovered)).toEqual([]);
  await page.screenshot({path:'artifacts/google-mobile.png'});
  checks.push('Mobile layout and floating teammate finder');
  await page.setViewportSize({width:320,height:568});
  await page.evaluate(()=>new Promise(resolve=>{
    google.maps.event.addListenerOnce(map.native,'idle',resolve);
    map.focusRegion(venue(),1000);setTimeout(resolve,4000);
  }));
  const controls=await page.locator('.map-tools').boundingBox();
  const banner=await page.locator('#demo-banner').boundingBox();
  const location=await page.locator('.location-card').boundingBox();
  expect(controls.y).toBeGreaterThanOrEqual(banner.y+banner.height);
  expect(controls.y+controls.height).toBeLessThanOrEqual(location.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({path:'artifacts/google-small-mobile.png'});
  checks.push('Short mobile screen keeps map controls clear of the banner and GPS card');
  // Auth failure after SDK load must keep the app usable and visibly report fallback.
  await page.evaluate(()=>window.gm_authFailure());
  await expect(page.locator('#map-provider-notice')).toBeVisible();
  await expect(page.locator('.region-boundary')).toBeVisible();
  await expect(page.locator('.facility-overlay')).toBeVisible();
  checks.push('Late Google authorization failure restores the fallback map and venue overlay');
  expect(errors).toEqual([]);
  console.log(JSON.stringify({origin,checks,tiles,errors},null,2));
}catch(e){
  await page?.screenshot({path:'artifacts/google-load-status.png'}).catch(()=>{});
  const state=await page?.evaluate(()=>({provider:typeof map!=='undefined'?(map?.isGoogle?'google':map?'leaflet':'none'):'none',fallbackNotice:!document.getElementById('map-provider-notice').hidden,facilityImages:document.querySelectorAll('.facility-overlay').length})).catch(()=>null);
  console.error(JSON.stringify({error:redact(e.message),errors,tiles,state},null,2));process.exitCode=1;
}
finally{await browser.close();}
