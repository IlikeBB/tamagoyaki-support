import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class NewsBoard extends VueService {
 constructor(root,launcher,actions){
    super(); const resources = this.resources;
  const list=root.querySelector('#news-list'),status=root.querySelector('#news-status'),retry=root.querySelector('#news-retry');
  const labels={update:'網站更新',event:'活動公告'},storageKey='tamago-news-read';
  const invitationSection=root.querySelector('#news-invitations'),invitationList=root.querySelector('#news-invitation-list');
  let entries=[],filter='all',loading=null,error='',read=new Set(),owner=null,incoming=[],friendError='',syncError='',friendKey='',friendGeneration=0,opener=null;
  const busy=new Set();
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))read=new Set(saved.filter(v=>typeof v==='string').slice(-200));}catch{}
  const revision=item=>item.id+':'+(item.updated_at||item.published_at);
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function badge(){
    if(!resources.active)return;
    const unread=entries.some(item=>!read.has(revision(item)));
    actions.badge({unread,requests:incoming.length});
  }
  function renderInvitations(){
    const tab=root.querySelector('[data-news-filter="friends"]');tab.hidden=!owner;tab.textContent='好友邀請'+(incoming.length?` (${incoming.length})`:'');
    invitationSection.hidden=!owner||!['all','friends'].includes(filter)||(!incoming.length&&!friendError&&!syncError&&filter!=='friends');
    root.querySelector('#news-invitation-status').textContent=friendError||syncError;
    const key=JSON.stringify([owner,incoming,[...busy],syncError]);if(key===friendKey)return;friendKey=key;
    TamagoVue.renderList(invitationList,'invitations',{items:incoming,busy:[...busy],error:syncError});
  }
  async function respond(id,response){
    if(busy.has(id)||!incoming.some(person=>person.id===id)||owner!==actions.user()?.id)return;
    const generation=friendGeneration;busy.add(id);friendError='';renderInvitations();
    try{await actions.respond(id,response);}
    catch(error){if(generation===friendGeneration)friendError=error.message;}
    finally{
      if(generation===friendGeneration){
        busy.delete(id);await actions.sync();
        if(generation===friendGeneration){render();if(root.open)root.querySelector('[data-news-filter="friends"]').focus({preventScroll:true});}
      }
    }
  }
  this.setFriends=(uid,requests=[],problem='')=>{
    const identityChanged=owner!==uid;
    if(identityChanged){owner=uid;friendGeneration++;busy.clear();friendError='';if(!owner&&filter==='friends')filter='all';}
    const next=uid?requests:[],nextError=uid&&problem?'好友邀請暫時無法同步，請稍後重試。':'';
    if(!identityChanged&&JSON.stringify(incoming)===JSON.stringify(next)&&syncError===nextError&&friendKey)return badge();
    incoming=next;syncError=nextError;render();
  };
  function render(){
    if(!resources.active)return;
    retry.hidden=!(filter==='friends'?syncError:error);root.setAttribute('aria-busy',String(!!loading));
    status.textContent=filter==='friends'?`${incoming.length} 份待處理好友邀請`:error||(loading?'正在載入公告…':`共 ${entries.length} 則公告`);
    for(const button of root.querySelectorAll('[data-news-filter]'))button.setAttribute('aria-pressed',String(button.dataset.newsFilter===filter));
    renderInvitations();
    const visible=entries.filter(item=>filter==='all'||item.type===filter);
    TamagoVue.renderList(list,'news',{items:visible.map(item=>{
      let safeLink=null;try{const url=new URL(item.link?.url,location.origin);if(item.link?.url&&(url.protocol==='https:'||(url.origin===location.origin&&url.protocol==='http:')))safeLink=url.href;}catch{}
      return {...item,unread:!read.has(revision(item)),eventDate:item.type==='event'&&validDate(item.event_date),safeLink};
    }),empty:filter!=='friends'&&!visible.length&&!loading&&!error?(filter==='event'?'目前沒有活動公告，有新活動時會在這裡公布。':filter==='update'?'目前沒有網站更新公告。':'目前沒有公告，有新消息時會在這裡公布。'):''});
    if(root.open&&!loading){
      for(const item of visible)read.add(revision(item));
      read=new Set([...read].slice(-200));
      try{localStorage.setItem(storageKey,JSON.stringify([...read]));}catch{}
    }
    badge();
  }
  async function load(){
    if(loading)return loading;
    error='';
    loading=(async()=>{
      const controller=new AbortController(),timeout=resources.timeout(()=>controller.abort(),10000);
      try{
        const response=await resources.fetch('/static/news.json',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('news unavailable');
        const data=await response.json();if(!Array.isArray(data.announcements))throw new Error('invalid news');
        const seen=new Set();
        entries=data.announcements.filter(item=>{
          if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||!Object.hasOwn(labels,item.type)||!validDate(item.published_at)||typeof item.title!=='string'||!item.title.trim()||!Array.isArray(item.body)||!item.body.every(text=>typeof text==='string'))return false;
          seen.add(item.id);return true;
        }).sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,100);
      }catch{error=navigator.onLine?'公告暫時無法載入，請稍後重試。':'目前離線，連線後即可查看公告。';}
      finally{resources.clearTimeout(timeout);loading=null;render();}
    })();
    render();return loading;
  }
  this.open=(category='all')=>{
    filter=category==='friends'&&owner?'friends':'all';friendError='';if(!root.open){opener=document.activeElement;root.showModal();}root.querySelector('.news-scroll').scrollTop=0;if(loading)render();else load();actions.sync();
  };
  resources.listen(launcher, 'click',()=>this.open());
  resources.listen(root.querySelector('#news-close'), 'click',()=>root.close());
  resources.listen(root, 'close',()=>{const target=opener?.isConnected&&opener.getClientRects().length?opener:document.getElementById('account-button');target?.focus({preventScroll:true});});
  resources.listen(retry, 'click',()=>{load();actions.sync();});
  resources.listen(invitationList, 'click',event=>{const button=event.target.closest('[data-news-invite]');if(button)respond(button.dataset.newsInvite,button.dataset.newsResponse);});
  for(const button of root.querySelectorAll('[data-news-filter]'))resources.listen(button, 'click',()=>{
    filter=button.dataset.newsFilter;root.querySelector('.news-scroll').scrollTop=0;render();
  });
  resources.listen(document, 'visibilitychange',()=>{if(!document.hidden)load();});
  resources.interval(()=>{if(!document.hidden)load();},60000);
  load();
 }
}
