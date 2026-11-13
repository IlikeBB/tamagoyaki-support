'use strict';
function profileAvatar(name,uid,url,index=0){
  const photo=typeof url==='string'&&/^\/api\/profiles\/[A-Za-z0-9_-]+\/media\/avatar\?v=[a-f0-9]{24}$/.test(url)?`<img src="${esc(url)}" alt="" data-profile-image>`:'';
  return `<button class="avatar profile-link ${['','orange','blue'][index%3]}" data-action="view-profile" data-id="${esc(uid)}" aria-label="查看${esc(name)}的個人檔案"><span>${esc([...(name||'友')][0])}</span>${photo}</button>`;
}
class ProfileView {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.scroll=root.querySelector('#profile-scroll');this.body=root.querySelector('#profile-content');
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-profile-action]');if(!button)return;event.stopPropagation();const action=button.dataset.profileAction;
      if(action==='tab')actions.tab(button.dataset.tab);else if(action==='more')actions.more();else if(action==='photo')actions.photo(button.dataset.slot);
      else if(action==='room')actions.room(button.dataset.id);else if(action==='remove-room')actions.removeRoom(button.dataset.id);else if(action==='pin')actions.pin(button.dataset.room,button.dataset.id);
      else if(action==='remove-history')actions.removeHistory(button.dataset.id);
      else if(action==='remove-content')actions.removeContent(button.dataset.id);
      else if(action==='confirm-content')actions.confirmContent(button.dataset.id);
      else if(action==='cancel-content')actions.cancelContent();
      else if(action==='task-room')actions.taskRoom(button.dataset.room);else actions[action]?.();
    });
    root.querySelector('#profile-close').onclick=()=>root.close();root.addEventListener('close',()=>{if(root.open)return;this.fit();actions.closed();(this.opener?.isConnected?this.opener:document.querySelector('#account-button')).focus({preventScroll:true});});
    document.addEventListener('error',event=>{if(event.target.matches?.('img[data-profile-image]')){event.target.hidden=true;if(event.target.id==='account-avatar')document.querySelector('#account-button').classList.remove('has-avatar');}},true);
    const fit=()=>this.fit();window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);root.addEventListener('focusin',fit);root.addEventListener('focusout',()=>requestAnimationFrame(fit));
  }
  fit(){
    const viewport=window.visualViewport,focused=this.root.contains(document.activeElement)&&document.activeElement.matches('textarea,input:not([type=range])'),full=document.body.getBoundingClientRect().height;
    const keyboard=this.root.open&&focused&&viewport&&Math.abs(viewport.scale-1)<.01&&viewport.height<full-150;
    this.root.classList.toggle('profile-keyboard',!!keyboard);
    if(keyboard){this.root.style.setProperty('--profile-height',`${Math.round(viewport.height)}px`);this.root.style.setProperty('--profile-top',`${Math.round(viewport.offsetTop)}px`);}
    else{this.root.style.removeProperty('--profile-height');this.root.style.removeProperty('--profile-top');}
  }
  status(message,error=false){this.root.querySelector('#profile-status').textContent=message;this.root.querySelector('#profile-retry').hidden=!error;}
  render(data,tab,editing=false,draft=null){
    const p=data.profile,photo=`<span>${esc([...(p.nickname||'友')][0])}</span>`+(p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="${esc(p.nickname)}的頭貼" data-profile-image>`:'');
    const banner=p.banner_url?`<img src="${esc(p.banner_url)}" alt="個人橫幅">`:'<img src="/static/profile-banner.svg" alt="">';
    this.root.querySelector('#profile-edit').hidden=!p.own;this.root.querySelector('#profile-settings').hidden=!p.own;this.root.querySelector('#profile-edit').textContent=editing?'取消編輯':'編輯檔案';
    this.root.querySelector('#news-launcher').hidden=!p.own;
    const values=draft||p;
    this.body.innerHTML=`<div class="profile-banner">${banner}${editing?'<button data-profile-action="photo" data-slot="banner">更換橫幅</button>':''}</div><div class="profile-identity"><div class="profile-portrait">${photo}${editing?'<button data-profile-action="photo" data-slot="avatar" aria-label="更換頭貼">＋</button>':''}</div><div class="profile-name"><h3>${esc(p.nickname)}</h3><p>@${esc(p.username)}</p></div></div><p class="profile-bio">${esc(p.bio||'每一段遠征，都留下一點回憶。')}</p>${editing?`<form id="profile-details-form" class="profile-details"><label for="profile-name-input">暱稱</label><input id="profile-name-input" name="nickname" maxlength="24" required value="${esc(values.nickname)}"><label for="profile-bio-input">簡介</label><textarea id="profile-bio-input" name="bio" maxlength="160" rows="3" placeholder="分享你喜歡的活動，或容易認出的特徵。">${esc(values.bio||'')}</textarea><p class="field-note">頭貼與橫幅在裁切確認後立即更新。</p><div class="profile-photo-actions"><button type="button" data-profile-action="removeAvatar" ${!p.avatar_url?'disabled':''}>移除頭貼</button><button type="button" data-profile-action="removeBanner" ${!p.banner_url?'disabled':''}>移除橫幅</button></div><button type="submit" class="button primary full">儲存個人檔案</button></form>`:`<div class="profile-tabs" role="group" aria-label="個人紀錄"><button data-profile-action="tab" data-tab="wall" aria-pressed="${tab==='wall'}">遠征隊牆</button>${p.own?`<button data-profile-action="tab" data-tab="tasks" aria-pressed="${tab==='tasks'}">我發布的任務</button><button data-profile-action="tab" data-tab="landmarks" aria-pressed="${tab==='landmarks'}">我的地標</button><button data-profile-action="tab" data-tab="messages" aria-pressed="${tab==='messages'}">我的留言</button>`:''}</div><section id="profile-records" aria-live="polite"></section><button id="profile-more" class="button outline profile-more" data-profile-action="more" hidden>載入更多</button>`}`;
    this.body.querySelector('.profile-tabs')?.classList.toggle('has-management',p.own);
    if(editing)this.body.querySelector('form').onsubmit=event=>{event.preventDefault();actionsGuard(()=>this.actions.save(event.target));};
  }
  records(items,tab,total,next){
    const root=this.root.querySelector('#profile-records');if(!root)return;
    if(ProfileContentView.managed(tab)){ProfileContentView.render(root,items,tab,total,this.actions.contentState());this.root.querySelector('#profile-more').hidden=next==null;return;}
    const historyBusy=this.actions.historyBusy?.();
    const hint=`${total} 段遠征回憶 · 私人隊伍依權限顯示`;
    root.innerHTML=`<p class="profile-record-note">${esc(hint)}</p>`+(items.length?items.map(item=>`<article class="profile-wall-card"><span class="profile-wall-venue">${icon('ticket')} ${esc(item.venue_name)}</span><h4>${esc(item.name)}</h4><p>${esc(activityDate(item.event_date,item.event_end_date))} · ${item.removed?'遠征隊已刪除':item.participating?'參加中':'曾經參加'}</p>${item.can_enter?`<button data-profile-action="room" data-id="${esc(item.id)}">前往遠征隊 ${icon('arrow')}</button>`:''}${item.can_delete?`<button class="profile-room-delete" data-profile-action="remove-room" data-id="${esc(item.id)}">刪除遠征隊</button>`:''}${item.can_remove?`<button class="profile-history-remove" data-profile-action="remove-history" data-id="${esc(item.id)}" aria-label="從展示牆移除 ${esc(item.name)} 的紀錄" ${historyBusy?'disabled':''}>${historyBusy===item.id?'移除中…':'移除紀錄'}</button><small class="profile-history-note">只移除自己的展示紀錄；再次加入這支遠征隊時會重新顯示。</small>`:''}</article>`).join(''):`<div class="profile-empty">${icon('ticket')}<strong>還沒有可顯示的遠征紀錄</strong><p>加入遠征隊後，這裡會留下你的場次回憶。</p></div>`);
    this.root.querySelector('#profile-more').hidden=next==null;
  }
}
function actionsGuard(action){Promise.resolve().then(action).catch(()=>{});}
