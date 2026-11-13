'use strict';
(() => {
  const root=document.querySelector('#news-dialog'),launcher=document.querySelector('#news-launcher');
  const list=root.querySelector('#news-list'),status=root.querySelector('#news-status'),retry=root.querySelector('#news-retry');
  const labels={update:'網站更新',event:'活動公告'},storageKey='tamago-news-read';
  let entries=[],filter='all',loading=null,error='',read=new Set();
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))read=new Set(saved.filter(v=>typeof v==='string').slice(-200));}catch{}
  const revision=item=>item.id+':'+(item.updated_at||item.published_at);
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function badge(){
    const unread=entries.some(item=>!read.has(revision(item)));
    launcher.querySelector('.news-unread').hidden=!unread;
    launcher.setAttribute('aria-label',unread?'News 公告，有新公告':'News 公告');
  }
  function render(){
    retry.hidden=!error;root.setAttribute('aria-busy',String(!!loading));
    status.textContent=error||(loading?'正在載入公告…':`共 ${entries.length} 則公告`);
    for(const button of root.querySelectorAll('[data-news-filter]'))button.setAttribute('aria-pressed',String(button.dataset.newsFilter===filter));
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
    if(!visible.length&&!loading&&!error)list.append(element('p','news-empty',filter==='event'?'目前沒有活動公告，有新活動時會在這裡公布。':filter==='update'?'目前沒有網站更新公告。':'目前沒有公告，有新消息時會在這裡公布。'));
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
  launcher.addEventListener('click',()=>{
    filter='all';root.showModal();root.querySelector('.news-scroll').scrollTop=0;load();
  });
  root.querySelector('#news-close').addEventListener('click',()=>root.close());
  root.addEventListener('close',()=>launcher.focus({preventScroll:true}));
  retry.addEventListener('click',load);
  for(const button of root.querySelectorAll('[data-news-filter]'))button.addEventListener('click',()=>{
    filter=button.dataset.newsFilter;root.querySelector('.news-scroll').scrollTop=0;render();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden)load();},60000);
  load();
})();
