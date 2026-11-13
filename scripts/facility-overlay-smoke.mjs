import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const origin=process.argv[2]||'http://127.0.0.1:8078';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[];fs.mkdirSync('artifacts',{recursive:true});
async function waitTiles(page){await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:30000});await page.waitForTimeout(300);}
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await expect(page.locator('#venue-selector,.facility-controls')).toHaveCount(0);
 await expect(page.locator('.facility-overlay')).toHaveCount(1);
 await page.waitForFunction(()=>{const img=document.querySelector('.facility-overlay');return img?.complete&&img.naturalWidth>0;});
 expect(await page.locator('.facility-overlay').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
 await expect(page.locator('#pin-count')).toHaveText('0');
 const fit=await page.evaluate(()=>{
  const bounds=facilityLayer.getBounds(),sw=map.latLngToContainerPoint(bounds.getSouthWest()),ne=map.latLngToContainerPoint(bounds.getNorthEast());
  const rect=facilityLayer.getElement().getBoundingClientRect();
  return {width:rect.width,expectedWidth:ne.x-sw.x,opacity:facilityLayer.options.opacity,pane:Number(getComputedStyle(map.getPane('facility')).zIndex),vectorPane:Number(getComputedStyle(map.getPane('overlayPane')).zIndex)};
 });
 expect(fit.width).toBeCloseTo(fit.expectedWidth,0);expect(fit.opacity).toBe(0.85);expect(fit.pane).toBeLessThan(fit.vectorPane);
 await waitTiles(page);await page.screenshot({path:'artifacts/facility-overlay-desktop.png'});
 await page.evaluate(()=>{renderMap();renderMap();map.setView([35.6478,140.0348],17,{animate:false});});
 await expect(page.locator('.facility-overlay')).toHaveCount(1);
 await waitTiles(page);
 expect(await page.locator('.facility-overlay').evaluate(img=>img.getBoundingClientRect().width)).toBeGreaterThan(fit.width);
 const clickPoint=await page.evaluate(()=>{
  window.__facilityMapClicked=false;map.once('click',()=>{window.__facilityMapClicked=true;});
  const p=map.latLngToContainerPoint([35.64823,140.03470]),rect=map.getContainer().getBoundingClientRect();
  return {x:rect.left+p.x,y:rect.top+p.y};
 });
 await page.mouse.click(clickPoint.x,clickPoint.y);
 expect(await page.evaluate(()=>window.__facilityMapClicked)).toBe(true);
 await page.screenshot({path:'artifacts/facility-overlay-detail.png'});
 for(const width of [320,390,768,1024]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#venue-selector,.facility-controls')).toHaveCount(0);
 }
 await page.setViewportSize({width:390,height:844});await waitTiles(page);await page.screenshot({path:'artifacts/facility-overlay-mobile.png'});
 // An unavailable overlay must leave the geographic map and task UI usable.
 const unavailable=await browser.newPage();
 await unavailable.route('**/static/maps/makuhari-facility-v2.json',route=>route.abort());
 await unavailable.goto(origin);
 await expect(unavailable.locator('#toast')).toContainText('仍可使用原有地圖');
 await expect(unavailable.locator('.region-boundary')).toBeVisible();await unavailable.close();
 expect(errors).toEqual([]);
 console.log(JSON.stringify({ok:true,origin,defaultOverlay:true,controlsRemoved:true,geographicScaling:true,layerOrder:true,mapClickThrough:true,emptyLandmarks:true,responsive:true,loadFailureFallback:true,errors}));
}finally{await browser.close();}
