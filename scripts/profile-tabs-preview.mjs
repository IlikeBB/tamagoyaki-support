import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],writes=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 const user={id:'profile-preview',username:'preview',nickname:'小玉'},room={id:'profile-room',owner:user.id,name:'幕張同行遠征隊',venue:'makuhari',event_date:''};
 let failTasks=false,emptyTasks=false,delay=null;
 const result=items=>({items,total:items.length,next_offset:null});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.continue();
  if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/config')return route.continue();
  if(url.pathname==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(url.pathname==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(url.pathname==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  if(url.pathname==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,squad:null,scope:'off'},members:[],squads:[],tasks:[],pins:[],help_rooms:[]}});
  if(url.pathname.startsWith('/api/profiles/')&&!url.pathname.endsWith('/content')){
   const own=url.pathname.endsWith('/'+user.id)||url.pathname.endsWith('/me');return route.fulfill({json:{profile:{...user,own,bio:'一起出發，記下每一場遠征。'},reputation:{likes:12,dislikes:1,landmarks:3},rpg:{level:3},wall:result([{...room,venue_name:'幕張メッセ',participating:true,can_enter:true}])}});
  }
  if(url.pathname==='/api/profiles/me/content'){
   const kind=url.searchParams.get('kind');
   if(kind==='task'){
    if(delay){const wait=delay;delay=null;await wait;}
    if(failTasks)return route.fulfill({status:503,json:{detail:'任務暫時無法載入'}});
    return route.fulfill({json:result(emptyTasks?[]:[{id:'own-task',source:'task',expedition:room.id,room_name:room.name,event_date:'',title:'一起聚餐 <img src=x onerror=alert(1)>',description:'LIVE 結束後一起吃飯。',kind:'dining',status:'accepted',can_view:true}])});
   }
   return route.fulfill({json:result([{id:'own-'+kind,source:kind==='message'?'report':'pin',parent_pin:'own-landmark',expedition:room.id,room_name:room.name,event_date:'',title:kind==='message'?'特典領取處':'海濱幕張集合點',description:kind==='message'?'目前排隊約十分鐘。':'中央出口右側',kind:kind==='message'?'report':'meet',expires:null,active:true,can_view:true,can_delete:true,likes:2,dislikes:0}])});
  }
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>state.authenticated&&!!profilePage),{timeout:30000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));await page.locator('#account-button').click();
 const tab=name=>page.locator(`[data-profile-action=tab][data-tab=${name}]`);
 await expect(page.locator('.profile-tabs button')).toHaveText(['遠征隊牆','我發布的任務','我的地標','我的留言']);await expect(page.locator('.profile-rpg,.profile-stats,[data-tab=received],[data-tab=given]')).toHaveCount(0);await expect(page.locator('.profile-wall-card')).toHaveCount(1);
 await tab('tasks').click();await expect(page.locator('.profile-content-card')).toContainText('聚餐 · 已有人接取');await expect(page.locator('.profile-content-heading h4')).toHaveText('一起聚餐 <img src=x onerror=alert(1)>');await expect(page.locator('#profile-records img')).toHaveCount(0);await expect(page.locator('[data-profile-action=remove-content]')).toHaveCount(0);
 await page.locator('[data-profile-action=task-room]').click();await expect(page.locator('#profile-dialog')).not.toBeVisible();expect(await page.evaluate(()=>state.tab)).toBe('tasks');
 await page.locator('#account-button').click();await tab('landmarks').click();await expect(page.locator('.profile-content-card')).toContainText('海濱幕張集合點');await expect(page.locator('[data-profile-action=remove-content]')).toBeVisible();await tab('messages').click();await expect(page.locator('.profile-content-card')).toContainText('目前排隊約十分鐘。');
 checks.push('four requested tabs, compact profile without RPG or evaluation sections, own task navigation and existing landmark/message management');
 failTasks=true;await tab('tasks').click();await expect(page.locator('#profile-status')).toHaveText('任務暫時無法載入');failTasks=false;await page.locator('#profile-retry').click();await expect(page.locator('.profile-content-card')).toHaveCount(1);
 let release;delay=new Promise(resolve=>release=resolve);await tab('tasks').click();await tab('messages').click();await expect(page.locator('.profile-content-card')).toContainText('目前排隊約十分鐘。');release();await page.waitForTimeout(150);await expect(page.locator('.profile-content-card')).toContainText('目前排隊約十分鐘。');
 emptyTasks=true;await tab('tasks').click();await expect(page.locator('.profile-empty')).toContainText('目前沒有進行中的任務');emptyTasks=false;await tab('tasks').click();
 checks.push('task failure retry, empty state, escaped titles and stale responses after a tab switch');
 for(const dark of [false,true]){await page.evaluate(value=>TamagoTheme.set(value),dark);for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});expect(await page.locator('#profile-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.locator('.profile-tabs').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  if(width===390||width===1440)await page.screenshot({path:`artifacts/profile-tabs-${dark?'dark':'light'}-${width}.png`,animations:'disabled'});
 }}
 await page.locator('#profile-edit').click();await expect(page.locator('#profile-details-form')).toBeVisible();await expect(page.locator('.profile-tabs')).toHaveCount(0);await page.locator('#profile-edit').click();await expect(tab('tasks')).toHaveAttribute('aria-pressed','true');
 await page.locator('#profile-close').click();await page.evaluate(()=>profilePage.open('someone-else'));await expect(page.locator('.profile-tabs button')).toHaveText(['遠征隊牆']);await page.evaluate(()=>profilePage.selectTab('tasks'));await expect(page.locator('.profile-tabs button')).toHaveText(['遠征隊牆']);
 checks.push('320–1440px light/dark layouts fit, basic profile editing works and other users cannot open private tabs');
 expect((await page.request.get(origin+'/api/profiles/me/content?kind=task')).status()).toBe(401);
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,origin,checks,errors,writes}));
}finally{await browser.close();}
