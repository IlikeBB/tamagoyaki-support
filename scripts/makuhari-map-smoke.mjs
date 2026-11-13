import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const origin=process.argv[2]||process.env.MAP_ORIGIN||'http://127.0.0.1:8079';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[];fs.mkdirSync('artifacts',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(origin);expect(response.status()).toBe(200);
  await expect(page.locator('.region-boundary')).toBeVisible();
  await expect(page.locator('.region-mask')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
  await expect(page.locator('#pin-count')).toHaveText('0');
  await expect(page.locator('#venue-selector')).toHaveCount(0);
  const region=await page.evaluate(()=>({venue:venue().id,radius:layers.getLayers().find(x=>x.getRadius)?.getRadius(),center:map.getCenter(),pins:state.pins.length}));
  expect(region.venue).toBe('makuhari');expect(region.radius).toBe(1000);expect(region.pins).toBe(0);
  expect(region.center.lat).toBeCloseTo(35.6483,3);expect(region.center.lng).toBeCloseTo(140.0346,3);
  expect((await page.locator('.region-boundary').boundingBox()).width).toBeGreaterThan(200);
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:30000});
  await page.waitForTimeout(300);await page.screenshot({path:'artifacts/makuhari-clean-desktop.png'});
  await page.locator('.section-nav [data-tab=pins]').click();await expect(page.locator('.pin-row')).toHaveCount(0);
  for(const width of [320,390,768,1024]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.locator('.mobile-tabs [data-mobile=map]').click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);await expect(page.locator('.region-boundary')).toBeVisible();
  expect((await page.locator('.region-boundary').boundingBox()).width).toBeGreaterThan(200);
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:30000});
  await page.waitForTimeout(300);await page.screenshot({path:'artifacts/makuhari-clean-mobile.png'});
  expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,origin,venue:'makuhari',radiusMeters:1000,landmarkMarkers:0,intelligencePoints:0,desktop:true,mobile:true,errors}));
}finally{await browser.close();}
