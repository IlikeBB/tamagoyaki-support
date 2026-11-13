import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected preview origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[],stamp=()=>Date.now()/1000,own={lat:35.64805,lng:140.0340,accuracy:8};
const user={id:'fan-viewer',nickname:'小玉',username:'fan-preview'},room={id:'fan-room',owner:user.id,name:'幕張同行隊',venue:'makuhari',event_date:'',code:'PREVIEW1'};
const member=(id,nickname,lat,lng,extra={})=>({user:id,nickname,lat,lng,located:stamp(),accuracy:8,scope:'expedition',location_visible:true,online:true,squad:'alpha',...extra});
const peers=[member('fan-friend','小狐',35.64925,140.0353,{scope:'off',location_visible:false}),member('fan-member','同行隊友',35.64935,140.0322),member('fan-task','任務夥伴',null,null,{scope:'off',location_visible:false}),member('fan-help','求助夥伴',35.64685,140.0356,{help_shared:true}),member('fan-hidden','未分享隊員',null,null,{scope:'off',location_visible:false})];
const friend={id:'fan-friend',username:'friend',nickname:'小狐',lat:35.64925,lng:140.0353,accuracy:8,located:stamp(),location_visible:true};
const task={id:'fan-quest',owner:'fan-task',owner_name:'任務夥伴',assignee:user.id,title:'會合交換',kind:'trade',status:'accepted',location_visible:true,location_source:'published',location_mode:'publisher',lat:35.64665,lng:140.0326,created:stamp(),expires:stamp()+3600};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.addInitScript(()=>{localStorage.setItem('tamago-people-filter','expedition');localStorage.setItem('tamago-limit-region','off');});
 await page.route('**/api/**',route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.continue();
  if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/config')return route.continue();
  if(url.pathname==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(url.pathname==='/api/friends')return route.fulfill({json:{friends:[friend],incoming:[],outgoing:[],sharing:false}});
  if(url.pathname==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  if(url.pathname==='/api/expeditions/'+room.id)return route.fulfill({json:{room,members:peers,tasks:[task],pins:[],squads:[],me:{scope:'off',squad:'alpha'},help_rooms:[]}});
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!state.demo&&friends.ready()&&lastTeamSyncAt>0&&!!map),{timeout:30000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));
 await expect(page.locator('.friend-map-point')).toHaveCount(1);await expect(page.locator('.expedition-map-point')).toHaveCount(1);await expect(page.locator('.presence-task')).toHaveCount(1);await expect(page.locator('.presence-fan')).toHaveCount(0);await expect(page.locator('.self-map-point')).toHaveCount(0);
 await expect(page.locator('.friend-map-point .teammate-map-relation svg')).toHaveCount(1);await expect(page.locator('.expedition-map-point .teammate-map-relation svg circle')).toHaveCount(1);
 checks.push('only authorized people render; without own GPS, relationships remain visible and directions stay absent');
 await page.evaluate(point=>{state.position=point;lastPositionAt=Date.now();state.scope='local';state.radar=false;locationCardDismissed=true;renderLocation();renderMap();map.setView(point,16,{animate:false});},own);
 await expect(page.locator('.self-map-point .presence-halo')).toHaveCount(1);await expect(page.locator('.self-map-point .presence-fan')).toHaveCount(0);await expect(page.locator('.teammate-map-point .presence-fan')).toHaveCount(3);
 const friendAngle=Number(await page.locator('.friend-map-point .presence-fan').getAttribute('data-angle'));expect(friendAngle).toBeGreaterThan(0);expect(friendAngle).toBeLessThan(90);
 await page.evaluate(()=>{Object.defineProperty(screen.orientation,'angle',{configurable:true,value:0});onOrientation({webkitCompassHeading:0});window.qaPresenceRoot=document.querySelector('.self-map-point');});
 await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','0');
 const before=await page.locator('.self-map-point .presence-core').boundingBox();
 await page.evaluate(()=>onOrientation({webkitCompassHeading:90}));await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','90');
 expect(await page.evaluate(()=>qaPresenceRoot===document.querySelector('.self-map-point'))).toBe(true);const after=await page.locator('.self-map-point .presence-core').boundingBox();expect(Math.abs(before.x-after.x)).toBeLessThan(1);expect(Math.abs(before.y-after.y)).toBeLessThan(1);
 await page.evaluate(()=>onOrientation({absolute:true,alpha:90}));await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','270');
 await page.evaluate(()=>onOrientation({webkitCompassHeading:NaN}));await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','270');
 await page.evaluate(()=>onOrientation({webkitCompassHeading:360}));await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','0');
 expect(Number(await page.locator('.friend-map-point .presence-fan').getAttribute('data-angle'))).toBe(friendAngle);
 checks.push('self fan follows iOS and absolute compass signals, rejects NaN and wraps north; rotations preserve marker identity and position; other fans retain geographic bearings');
 await page.evaluate(()=>{lastPositionAt=Date.now()-300000;renderMap();});await expect(page.locator('.self-map-point')).toHaveClass(/is-last-known/);await expect(page.locator('.self-map-point .presence-fan')).toHaveCount(0);await expect(page.locator('.self-map-point .presence-label')).toContainText('最後位置');await expect(page.locator('.friend-map-point .presence-label')).toContainText('方位估算');
 await page.evaluate(()=>{lastPositionAt=Date.now();state.heading=330;renderMap();});
 await page.locator('.friend-map-point').click();await expect(page.locator('#finder-source')).toContainText('好友即時位置');await page.locator('#finder-close').click();
 await page.locator('.expedition-map-point').locator('..').press('Enter');await expect(page.locator('#finder-source')).toContainText('遠征隊即時位置');await page.locator('#finder-close').click();await page.locator('.expedition-map-point').locator('..').press('Space');await expect(page.locator('#teammate-finder')).toBeVisible();await page.locator('#finder-close').click();
 await expect(page.locator('.help-map-marker')).toHaveCount(1);expect(await page.locator('.help-map-marker').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(187, 41, 36)');await expect(page.locator('#people-filter')).toHaveCount(0);
 await expect(page.locator('.friend-map-point')).toHaveCount(1);await expect(page.locator('.expedition-map-point')).toHaveCount(1);
 checks.push('stale own GPS suppresses heading and labels estimated bearings; pointer and keyboard open finder; red help symbol and authorized positions remain intact');
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:width<700?844:900});await page.evaluate(point=>map.setView(point,16,{animate:false}),own);await page.waitForTimeout(600);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','330');
  const center=await page.locator('.self-map-point .presence-core').evaluate(e=>{const rect=e.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;if(map.isGoogle)return map.pointAt(x,y);const box=map.getContainer().getBoundingClientRect();return map.containerPointToLatLng([x-box.left,y-box.top]);});expect(center.lat).toBeCloseTo(own.lat,4);expect(center.lng).toBeCloseTo(own.lng,4);
  if(width===390||width===1440)await page.screenshot({path:`artifacts/map-presence-${origin.startsWith('https')?'google':'leaflet'}-${width}.png`});
 }
 await page.evaluate(()=>{lastPositionAt=Date.now()-901000;renderMap();});await expect(page.locator('.self-map-point')).toHaveCount(0);await expect(page.locator('.presence-fan')).toHaveCount(0);
 await page.evaluate(()=>{lastPositionAt=Date.now();friends.data.friends[0].located=Date.now()/1000-901;renderMap();});await expect(page.locator('.friend-map-point')).toHaveCount(0);
 if(origin.startsWith('https')){
  await page.evaluate(()=>window.gm_authFailure());await expect.poll(()=>page.evaluate(()=>!!map&&!map.isGoogle)).toBe(true);await expect(page.locator('.self-map-point .presence-fan')).toHaveAttribute('data-angle','330');await expect(page.locator('.expedition-map-point .presence-fan')).toHaveCount(1);
 }
 checks.push('320/390/768/1024/1440 layouts fit and dot centers stay on their coordinates; expired positions vanish; both map providers use the same fan design');
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,origin,checks,errors,writes}));
}finally{await browser.close();}
