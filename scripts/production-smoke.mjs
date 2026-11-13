// Read-only public-origin verification; never run the writing browser suite here.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const origin='https://tamagoyaki-support.modoubletw.com';
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(origin);
  expect(response.status()).toBe(200);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(page.locator('#room-name')).toHaveText('尚未加入遠征隊');
  await expect(page.locator('.quest')).toHaveCount(0);
  await expect(page.locator('#task-count')).toHaveText('0');
  await expect(page.locator('#member-count')).toHaveText('0');
  for(const id of ['makuhari','k-arena','pia','ariake']){
    await page.locator(`#venue-selector [data-id="${id}"]`).click();
    await expect(page.locator(`#venue-selector [data-id="${id}"]`)).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>map.options.maxBounds.contains(map.getBounds()))).toBe(true);
    await page.evaluate(()=>map.setZoom(0,{animate:false}));
    expect(await page.evaluate(()=>map.getZoom()>=map.getMinZoom())).toBe(true);
  }
  await page.locator('#venue-selector [data-id="makuhari"]').click();
  await page.evaluate(()=>map.panTo([0,0],{animate:false}));
  // Leaflet rounds the constrained viewport to whole pixels (sub-metre at this zoom).
  await expect.poll(()=>page.evaluate(()=>map.options.maxBounds.pad(.001).contains(map.getBounds()))).toBe(true);
  await page.locator('#venue-selector [data-id="makuhari"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:30000});
  // Let Leaflet's tile opacity transition finish before visual inspection.
  await page.waitForTimeout(400);
  fs.mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/production-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:30000});
  await page.waitForTimeout(400);
  await page.screenshot({path:'artifacts/production-mobile.png'});
  await page.locator('.mobile-tabs [data-tab=tasks]').click();
  await expect(page.locator('.quest')).toHaveCount(0);
  await page.locator('.mobile-tabs [data-tab=members]').click();
  await expect(page.locator('.member-row')).toHaveCount(0);
  await page.locator('.mobile-tabs [data-tab=pins]').click();
  await expect(page.locator('.pin-row')).toHaveCount(6);
  await expect(page.locator('.pin-row').filter({hasText:'特典領取處（演示）'})).toBeVisible();
  await page.locator('.pin-row').filter({hasText:'特典領取處（演示）'}).getByRole('button',{name:'在地圖上尋找'}).click();
  await expect(page.locator('#target-card')).toContainText('特典領取處');
  await page.locator('[data-action=target-close]').click();
  for(const id of ['makuhari','k-arena','pia','ariake']){
    await page.locator(`#venue-selector [data-id="${id}"]`).click();
    expect(await page.evaluate(()=>map.options.maxBounds.contains(map.getBounds()))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>isSecureContext)).toBe(true);
  await expect(page.locator('#demo-banner')).toContainText('固定地標');
  await page.locator('#account-button').click();
  await page.locator('[data-action=auth-register]').click();
  await expect(page.locator('#auth-form')).toBeVisible();
  await expect(page.locator('#auth-password')).toHaveAttribute('minlength','15');
  await page.screenshot({path:'artifacts/production-register.png'});
  await page.setViewportSize({width:320,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#dialog [data-action=close]').click();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ok:true,origin,https:true,desktop:true,mobile:true,registrationForm:true,tasks:0,expeditions:0,preservedLandmarks:6,regionRadiusMeters:1000,regionSwitching:true,panAndZoomBounds:true,errors}));
}finally{await browser.close();}
