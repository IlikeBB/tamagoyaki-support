'use strict';
class NewsBoard {
 constructor(root,launcher,actions){
  const list=root.querySelector('#news-list'),status=root.querySelector('#news-status'),retry=root.querySelector('#news-retry');
  const labels={update:'網站更新',event:'活動公告'},storageKey='tamago-news-read';
  const invitationSection=root.querySelector('#news-invitations'),invitationList=root.querySelector('#news-invitation-list');
  let entries=[],filter='all',loading=null,error='',read=new Set(),owner=null,incoming=[],friendError='',syncError='',friendKey='',friendGeneration=0;
  const busy=new Set();
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))read=new Set(saved.filter(v=>typeof v==='string').slice(-200));}catch{}
  const revision=item=>item.id+':'+(item.updated_at||item.published_at);
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function badge(){
    const unread=entries.some(item=>!read.has(revision(item)));
    launcher.querySelector('.news-unread').hidden=!(unread||incoming.length);
    launcher.setAttribute('aria-label','News 公告'+(incoming.length?`，${incoming.length} 份好友邀請`:unread?'，有新公告':''));
  }
  function renderInvitations(){
    const tab=root.querySelector('[data-news-filter="friends"]');tab.hidden=!owner;tab.textContent='好友邀請'+(incoming.length?` (${incoming.length})`:'');
    invitationSection.hidden=!owner||!['all','friends'].includes(filter)||(!incoming.length&&!friendError&&!syncError&&filter!=='friends');
    root.querySelector('#news-invitation-status').textContent=friendError||syncError;
    const key=JSON.stringify([owner,incoming,[...busy],syncError]);if(key===friendKey)return;friendKey=key;
    invitationList.replaceChildren();
    for(const person of incoming){
      const card=element('article','news-invite'),identity=element('div','news-invite-person'),portrait=element('span','news-invite-avatar',[...(person.nickname||'夥伴')][0]);
      if(person.avatar_url){const image=element('img');image.src=person.avatar_url;image.alt='';image.onerror=()=>image.remove();portrait.append(image);}
      const name=element('div');name.append(element('strong','',person.nickname),element('small','','@'+person.username));identity.append(portrait,name);
      const buttons=element('div','news-invite-actions');
      for(const [response,label] of [['accept','接受邀請'],['reject','拒絕']]){
        const button=element('button',response==='accept'?'button secondary':'button outline',label);button.type='button';
        button.dataset.newsInvite=person.id;button.dataset.newsResponse=response;button.disabled=busy.has(person.id)||!!syncError;buttons.append(button);
      }
      card.append(identity,element('p','','想邀請你成為好友。'),buttons);invitationList.append(card);
    }
    if(!incoming.length)invitationList.append(element('p','news-empty','目前沒有待處理的好友邀請。'));
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
    retry.hidden=!(filter==='friends'?syncError:error);root.setAttribute('aria-busy',String(!!loading));
    status.textContent=filter==='friends'?`${incoming.length} 份待處理好友邀請`:error||(loading?'正在載入公告…':`共 ${entries.length} 則公告`);
    for(const button of root.querySelectorAll('[data-news-filter]'))button.setAttribute('aria-pressed',String(button.dataset.newsFilter===filter));
    renderInvitations();
    list.replaceChildren();
    const visible=entries.filter(item=>filter==='all'||item.type===filter);
    for(const item of visible){
      const article=element('article','news-item'),meta=element('div','news-item-meta');
      meta.append(element('span','news-tag '+item.type,labels[item.type]));
      const time=element('time','',item.published_at.replaceAll('-',' / '));time.dateTime=item.published_at;meta.append(time);
      if(!read.has(revision(item)))meta.append(element('span','news-new','新公告'));
      article.append(meta,element('h3','',item.title));
      if(item.type==='event'&&validDate(item.event_date))article.append(element('p','news-event-date','活動日期 · '+item.event_date));
      for(const paragraph of item.body)article.append(element('p','',paragraph));
      if(item.link&&typeof item.link.url==='string'){
        try{
          const url=new URL(item.link.url,location.origin);
          if(url.protocol==='https:'||(url.origin===location.origin&&url.protocol==='http:')){
            const link=element('a','news-link',typeof item.link.label==='string'?item.link.label:'查看詳情');
            link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';article.append(link);
          }
        }catch{}
      }
      list.append(article);
    }
    if(filter!=='friends'&&!visible.length&&!loading&&!error)list.append(element('p','news-empty',filter==='event'?'目前沒有活動公告，有新活動時會在這裡公布。':filter==='update'?'目前沒有網站更新公告。':'目前沒有公告，有新消息時會在這裡公布。'));
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
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch('/static/news.json',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('news unavailable');
        const data=await response.json();if(!Array.isArray(data.announcements))throw new Error('invalid news');
        const seen=new Set();
        entries=data.announcements.filter(item=>{
          if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||!Object.hasOwn(labels,item.type)||!validDate(item.published_at)||typeof item.title!=='string'||!item.title.trim()||!Array.isArray(item.body)||!item.body.every(text=>typeof text==='string'))return false;
          seen.add(item.id);return true;
        }).sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,100);
      }catch{error=navigator.onLine?'公告暫時無法載入，請稍後重試。':'目前離線，連線後即可查看公告。';}
      finally{clearTimeout(timeout);loading=null;render();}
    })();
    render();return loading;
  }
  this.open=(category='all')=>{
    filter=category==='friends'&&owner?'friends':'all';friendError='';if(!root.open)root.showModal();root.querySelector('.news-scroll').scrollTop=0;if(loading)render();else load();actions.sync();
  };
  launcher.addEventListener('click',()=>this.open());
  root.querySelector('#news-close').addEventListener('click',()=>root.close());
  root.addEventListener('close',()=>launcher.focus({preventScroll:true}));
  retry.addEventListener('click',()=>{load();actions.sync();});
  invitationList.addEventListener('click',event=>{const button=event.target.closest('[data-news-invite]');if(button)respond(button.dataset.newsInvite,button.dataset.newsResponse);});
  for(const button of root.querySelectorAll('[data-news-filter]'))button.addEventListener('click',()=>{
    filter=button.dataset.newsFilter;root.querySelector('.news-scroll').scrollTop=0;render();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden)load();},60000);
  load();
 }
}
