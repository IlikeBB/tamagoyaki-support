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
      else if(action==='withdraw')actions.withdraw(button.dataset.room,button.dataset.id);else actions[action]?.();
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
    const p=data.profile,r=data.reputation,photo=`<span>${esc([...(p.nickname||'友')][0])}</span>`+(p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="${esc(p.nickname)}的頭貼" data-profile-image>`:'');
    const banner=p.banner_url?`<img src="${esc(p.banner_url)}" alt="個人橫幅">`:'<img src="/static/profile-banner.svg" alt="">';
    this.root.querySelector('#profile-edit').hidden=!p.own;this.root.querySelector('#profile-settings').hidden=!p.own;this.root.querySelector('#profile-edit').textContent=editing?'取消編輯':'編輯檔案';
    const values=draft||p;
    this.body.innerHTML=`<div class="profile-banner">${banner}${editing?'<button data-profile-action="photo" data-slot="banner">更換橫幅</button>':''}</div><div class="profile-identity"><div class="profile-portrait">${photo}${editing?'<button data-profile-action="photo" data-slot="avatar" aria-label="更換頭貼">＋</button>':''}</div><div class="profile-name"><h3>${esc(p.nickname)}</h3><p>@${esc(p.username)}</p></div></div><p class="profile-bio">${esc(p.bio||'每一段遠征，都留下一點回憶。')}</p><div class="profile-stats"><div><strong>${r.likes}</strong><span>${icon('thumb-up')} 讚 · 有效</span></div><div><strong>${r.dislikes}</strong><span>${icon('thumb-down')} 倒讚 · 無效</span></div><div aria-describedby="profile-stats-note"><strong>${r.landmarks}</strong><span>${icon('pin')} 累計限時標記</span></div></div><p id="profile-stats-note" class="profile-stats-note">累計包含限時地標與地面留言；刪除或到期後仍保留紀錄。</p>${editing?`<form id="profile-details-form" class="profile-details"><label for="profile-name-input">暱稱</label><input id="profile-name-input" name="nickname" maxlength="24" required value="${esc(values.nickname)}"><label for="profile-bio-input">簡介</label><textarea id="profile-bio-input" name="bio" maxlength="160" rows="3" placeholder="分享你喜歡的活動，或容易認出的特徵。">${esc(values.bio||'')}</textarea><p class="field-note">頭貼與橫幅在裁切確認後立即更新。讚與倒讚來自你發布的限時地標與地面留言回饋。</p><div class="profile-photo-actions"><button type="button" data-profile-action="removeAvatar" ${!p.avatar_url?'disabled':''}>移除頭貼</button><button type="button" data-profile-action="removeBanner" ${!p.banner_url?'disabled':''}>移除橫幅</button></div><button type="submit" class="button primary full">儲存個人檔案</button></form>`:`<div class="profile-tabs" role="group" aria-label="個人紀錄"><button data-profile-action="tab" data-tab="wall" aria-pressed="${tab==='wall'}">遠征隊牆</button><button data-profile-action="tab" data-tab="received" aria-pressed="${tab==='received'}">收到的評價</button>${p.own?`<button data-profile-action="tab" data-tab="given" aria-pressed="${tab==='given'}">我的評價</button>`:''}</div><section id="profile-records" aria-live="polite"></section><button id="profile-more" class="button outline profile-more" data-profile-action="more" hidden>載入更多</button>`}`;
    if(editing)this.body.querySelector('form').onsubmit=event=>{event.preventDefault();actionsGuard(()=>this.actions.save(event.target));};
  }
  records(items,tab,total,next){
    const root=this.root.querySelector('#profile-records');if(!root)return;
    const hint=tab==='wall'?`${total} 段遠征回憶 · 私人隊伍依權限顯示`:tab==='received'?'僅顯示你有權限查看的地標紀錄；讚／倒讚總數包含歷年回饋。':'只有你能查看自己給出的評價，可隨時收回。';
    root.innerHTML=`<p class="profile-record-note">${esc(hint)}</p>`+(items.length?items.map(item=>tab==='wall'?`<article class="profile-wall-card"><span class="profile-wall-venue">${icon('ticket')} ${esc(item.venue_name)}</span><h4>${esc(item.name)}</h4><p>${esc(activityDate(item.event_date))} · ${item.removed?'遠征隊已刪除':item.participating?'參加中':'曾經參加'}</p>${item.can_enter?`<button data-profile-action="room" data-id="${esc(item.id)}">前往遠征隊 ${icon('arrow')}</button>`:''}${item.can_delete?`<button class="profile-room-delete" data-profile-action="remove-room" data-id="${esc(item.id)}">刪除遠征隊</button>`:''}</article>`:`<article class="profile-feedback-card"><div class="profile-feedback-heading"><span>${icon(item.kind==='toilet'?'pin':'flag')}</span><h4>${esc(item.title)}</h4></div><p>${esc(item.room_name)} · ${esc(activityDate(item.event_date))}</p><div class="profile-feedback-status"><span>${item.invalidated?'無效票較多，已移除':item.removed?'已移除':item.active?'有效期間內':'已到期'}</span>${tab==='given'?`<strong>${icon(item.value===1?'thumb-up':'thumb-down')} 你認為${item.value===1?'有效':'無效'}</strong>`:`<strong>${icon('thumb-up')} ${item.likes} · ${icon('thumb-down')} ${item.dislikes}</strong>`}</div><div class="profile-feedback-actions">${item.can_view&&item.active?`<button data-profile-action="pin" data-room="${esc(item.expedition)}" data-id="${esc(item.pin)}">在地圖上查看</button>`:''}${tab==='given'?`<button data-profile-action="withdraw" data-room="${esc(item.expedition)}" data-id="${esc(item.pin)}">收回評價</button>`:''}</div></article>`).join(''):`<div class="profile-empty">${icon(tab==='wall'?'ticket':'thumb-up')}<strong>${tab==='wall'?'還沒有可顯示的遠征紀錄':tab==='received'?'還沒有可顯示的地標回饋':'還沒有給出評價'}</strong><p>${tab==='wall'?'加入遠征隊後，這裡會留下你的場次回憶。':tab==='received'?'發布限時地標或地面留言後，隊友可以評價是否有效。':'在臨時地標點「有效」或「無效」，幫隊友判斷現場情報。'}</p></div>`);
    this.root.querySelector('#profile-more').hidden=next==null;
  }
}
function actionsGuard(action){Promise.resolve().then(action).catch(()=>{});}
