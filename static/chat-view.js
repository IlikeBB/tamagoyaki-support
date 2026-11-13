'use strict';
class ChatView {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.filter='all';
    this.list=root.querySelector('#chat-conversations');this.scroll=root.querySelector('#chat-scroll');this.log=root.querySelector('#chat-messages');
    this.input=root.querySelector('#chat-input');this.form=root.querySelector('#chat-form');this.send=root.querySelector('#chat-send');
    root.querySelector('#chat-close').onclick=()=>root.close();root.querySelector('#chat-back').onclick=()=>actions.back();
    root.addEventListener('close',()=>{this.fit();actions.closed();document.querySelector('#chat-launcher').focus({preventScroll:true});});
    root.querySelector('#chat-retry').onclick=()=>actions.retry();
    root.querySelector('#chat-older').onclick=()=>actions.older();
    root.querySelector('#chat-new').onclick=()=>{this.scroll.scrollTop=this.scroll.scrollHeight;actions.read();};
    this.list.onclick=event=>{const button=event.target.closest('[data-chat-key]');if(button)actions.choose(button.dataset.chatKey);};
    this.log.addEventListener('click',event=>{const button=event.target.closest('[data-chat-person]');if(button)actions.person(button.dataset.chatPerson);});
    root.querySelectorAll('[data-chat-filter]').forEach(button=>button.onclick=()=>{this.filter=button.dataset.chatFilter;this.threads(this.contacts||[],this.active);});
    this.form.onsubmit=event=>{event.preventDefault();actions.send();};
    this.input.oninput=()=>{actions.draft(this.input.value);this.composer(this.busy);};
    this.input.onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.isComposing){event.preventDefault();if(!this.send.disabled)this.form.requestSubmit();}};
    this.scroll.onscroll=()=>{if(this.nearBottom()){root.querySelector('#chat-new').hidden=true;actions.read();}};
    const fit=()=>this.fit();window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
    window.addEventListener('resize',fit);root.addEventListener('focusin',fit);root.addEventListener('focusout',()=>requestAnimationFrame(fit));
  }
  text(id,value){this.root.querySelector('#'+id).textContent=value;}
  open(){if(!this.root.open)this.root.showModal();this.fit();}
  badge(count){
    const badge=document.querySelector('#chat-unread');badge.hidden=!count;badge.textContent=count>99?'99+':String(count);
    document.querySelector('#chat-launcher').setAttribute('aria-label',count?`訊息，${count} 則未讀`:'訊息');
  }
  status(message,error=false){this.text('chat-status',message);this.root.querySelector('#chat-retry').hidden=!error;}
  error(message=''){this.text('chat-error',message);}
  threads(contacts,active){
    this.contacts=contacts;this.active=active;
    this.root.querySelectorAll('[data-chat-filter]').forEach(button=>{const on=button.dataset.chatFilter===this.filter;button.setAttribute('aria-pressed',String(on));});
    const visible=contacts.filter(t=>this.filter==='all'||t.kind===this.filter),key=JSON.stringify([visible,active?.id,this.filter]);
    if(this.list.dataset.key===key)return;this.list.dataset.key=key;
    const fragment=document.createDocumentFragment();
    for(const contact of visible){
      const button=document.createElement('button');button.type='button';button.className='chat-contact';button.dataset.chatKey=contact.id;button.setAttribute('aria-current',String(contact.id===active?.id));
      const avatar=document.createElement('span');avatar.className='chat-contact-icon '+contact.kind;avatar.innerHTML=icon(contact.kind==='friend'?'heart':'users');
      const copy=document.createElement('span');copy.className='chat-contact-copy';
      const name=document.createElement('strong');name.textContent=contact.title;
      const note=document.createElement('small');note.textContent=contact.latest?`${contact.latest.sender_name}：${contact.latest.body}`:contact.kind==='friend'?'傳送第一則私訊':'和遠征夥伴聊聊集合與現場情報';
      const meta=document.createElement('small');meta.className='chat-contact-meta';meta.textContent=contact.kind==='friend'?'好友私訊':'遠征隊群聊';copy.append(name,meta,note);button.append(avatar,copy);
      if(contact.unread){const badge=document.createElement('span');badge.className='chat-count';badge.textContent=contact.unread>99?'99+':contact.unread;badge.setAttribute('aria-label',`${contact.unread} 則未讀`);button.append(badge);}
      fragment.append(button);
    }
    const focused=this.list.contains(document.activeElement)?document.activeElement.dataset.chatKey:null;
    this.list.replaceChildren(fragment);if(focused)[...this.list.children].find(button=>button.dataset.chatKey===focused)?.focus({preventScroll:true});this.root.querySelector('#chat-list-empty').hidden=!!visible.length;
    this.text('chat-list-empty',this.filter==='friend'?'還沒有好友。先到「好友」加入對方，就能私訊。':this.filter==='expedition'?'加入遠征隊後，就能和全隊聊天。':'還沒有對話。加入好友或遠征隊，就能在這裡聯絡夥伴。');
  }
  select(contact,draft=''){
    this.active=contact;this.root.dataset.view=contact?'conversation':'list';
    this.root.querySelector('#chat-conversation').hidden=!contact;this.root.querySelector('#chat-placeholder').hidden=!!contact;
    this.text('chat-title',contact?.title||'訊息');this.text('chat-contact-title',contact?.title||'');this.text('chat-contact-subtitle',contact?.kind==='friend'?'好友私訊 · 僅你們雙方可讀':'遠征隊群聊 · 目前隊員可讀');
    this.input.value=draft;this.log.replaceChildren();this.root.querySelector('#chat-new').hidden=true;this.root.querySelector('#chat-older').hidden=true;this.text('chat-empty',contact?'正在載入對話…':'');this.root.querySelector('#chat-empty').hidden=false;this.error();this.composer(false);
    this.threads(this.contacts||[],contact);
    if(this.root.open)this.root.querySelector('#chat-title').focus({preventScroll:true});
  }
  nearBottom(){return this.scroll.scrollHeight-this.scroll.scrollTop-this.scroll.clientHeight<72;}
  messages(messages,uid,{initial=false,prepend=false,hasOlder=false}={}){
    const near=this.nearBottom(),top=this.scroll.scrollTop,height=this.scroll.scrollHeight,existing=new Map([...this.log.children].map(node=>[Number(node.dataset.messageId),node]));
    for(let i=0;i<messages.length;i++){
      const message=messages[i];if(existing.has(message.id))continue;
      const row=document.createElement('li');row.dataset.messageId=message.id;row.className='chat-message'+(message.sender===uid?' is-own':'');
      const meta=document.createElement('div');meta.className='chat-message-meta';const name=document.createElement('strong');name.textContent=message.sender===uid?'你':message.sender_name;
      const time=document.createElement('time');time.dateTime=new Date(message.created*1000).toISOString();time.textContent=new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(message.created*1000);meta.append(name,time);
      const body=document.createElement('p');body.textContent=message.body;
      const copy=document.createElement('div');copy.className='chat-message-copy';copy.append(meta,body);
      const portrait=document.createElement(message.sender===uid?'span':'button');portrait.className='chat-message-avatar';
      if(message.sender!==uid){portrait.type='button';portrait.dataset.chatPerson=message.sender;portrait.setAttribute('aria-label','查看 '+message.sender_name+' 的好友邀請選項');}
      portrait.textContent=[...(message.sender_name||'夥伴')][0];
      if(message.sender_avatar_url){const image=document.createElement('img');image.src=message.sender_avatar_url;image.alt='';image.loading='lazy';image.addEventListener('error',()=>image.remove(),{once:true});portrait.append(image);}
      row.append(portrait,copy);
      const next=[...this.log.children].find(node=>Number(node.dataset.messageId)>message.id);this.log.insertBefore(row,next||null);
    }
    this.root.querySelector('#chat-empty').hidden=!!messages.length;this.text('chat-empty','還沒有訊息，傳句話打個招呼吧。');this.root.querySelector('#chat-older').hidden=!hasOlder;
    if(prepend)this.scroll.scrollTop=top+this.scroll.scrollHeight-height;
    else if(initial||near){this.scroll.scrollTop=this.scroll.scrollHeight;this.root.querySelector('#chat-new').hidden=true;}
    else if(messages.some(m=>!existing.has(m.id)))this.root.querySelector('#chat-new').hidden=false;
  }
  composer(busy=false){
    this.busy=busy;this.send.disabled=busy||!this.input.value.trim()||!navigator.onLine;this.send.textContent=busy?'傳送中…':'傳送';
    this.text('chat-length',`${this.input.value.length} / 2000`);this.input.style.height='0px';this.input.style.height=Math.min(112,Math.max(48,this.input.scrollHeight))+'px';
  }
  fit(){
    const viewport=window.visualViewport,focused=this.root.contains(document.activeElement)&&document.activeElement.matches('textarea,input'),full=document.body.getBoundingClientRect().height;
    const keyboard=this.root.open&&focused&&viewport&&Math.abs(viewport.scale-1)<.01&&viewport.height<full-150;
    this.root.classList.toggle('chat-keyboard',!!keyboard);
    if(keyboard){this.root.style.setProperty('--chat-height',`${Math.round(viewport.height)}px`);this.root.style.setProperty('--chat-top',`${Math.round(viewport.offsetTop)}px`);}
    else{this.root.style.removeProperty('--chat-height');this.root.style.removeProperty('--chat-top');}
  }
}
