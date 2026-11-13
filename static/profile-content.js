'use strict';
class ProfileContentView {
  static managed(tab){return ['tasks','landmarks','messages'].includes(tab);}
  static render(root,items,tab,total,state={}){
    if(tab==='tasks'){this.tasks(root,items,total);return;}
    const message=tab==='messages',label=message?'留言':'地標';
    root.innerHTML=`<p class="profile-record-note">${total} 筆${label} · 僅本人可管理</p>`+(items.length?items.map(item=>{
      const kind=message?(item.source==='report'?'地標回報':'地面留言'):item.expires?'臨時情報點':'定期情報點';
      const expiry=item.source==='report'?(item.parent_removed?'地標已移除':!item.active?'地標已到期':'現場回報'):!item.active?'已到期':item.expires?'到期：'+new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(item.expires*1000)):'永久保留';
      const confirm=state.confirmation===item.id,busy=state.busy===item.id;
      return `<article class="profile-content-card" data-content-id="${esc(item.id)}"><div class="profile-content-heading"><span>${icon(message?'message':'pin')}</span><h4>${esc(item.title)}</h4></div><p class="profile-content-meta">${esc(item.room_name)} · ${esc(activityDate(item.event_date,item.event_end_date))}</p>${item.description?`<p class="profile-content-copy">${esc(item.description)}</p>`:''}<div class="profile-content-status"><span>${kind} · ${esc(expiry)}</span>${item.source==='report'?'':`<span>${icon('thumb-up')} ${item.likes} · ${icon('thumb-down')} ${item.dislikes}</span>`}</div><div class="profile-content-actions">${item.can_view?`<button type="button" data-profile-action="pin" data-room="${esc(item.expedition)}" data-id="${esc(item.parent_pin||item.id)}">在地圖上查看</button>`:''}${!confirm?`<button type="button" class="profile-content-delete" data-profile-action="remove-content" data-id="${esc(item.id)}" ${state.busy?'disabled':''}>刪除${label}</button>`:''}</div>${confirm?`<div class="profile-content-confirm" role="group" aria-label="確認刪除${esc(item.title)}"><p>確定刪除這筆${label}？評價與 XP 紀錄會保留。</p><div><button type="button" class="profile-content-delete" data-profile-action="confirm-content" data-id="${esc(item.id)}" ${state.busy?'disabled':''}>${busy?'刪除中…':'確認刪除'}</button><button type="button" data-profile-action="cancel-content" ${state.busy?'disabled':''}>取消</button></div></div>`:''}</article>`;
    }).join(''):`<div class="profile-empty">${icon(message?'message':'pin')}<strong>目前沒有可管理的${label}</strong></div>`);
  }
  static tasks(root,items,total){
    const kinds={trade:'交換',bounty:'懸賞',giveaway:'配布',help:'求助',dining:'聚餐'};
    root.innerHTML=`<p class="profile-record-note">${total} 筆進行中的任務</p>`+(items.length?items.map(item=>{
      const status=item.help_active?'求助中':item.status==='accepted'?'已有人接取':'等待接取';
      return `<article class="profile-content-card" data-content-id="${esc(item.id)}"><div class="profile-content-heading"><span>${icon('flag')}</span><h4>${esc(item.title)}</h4></div><p class="profile-content-meta">${esc(item.room_name)} · ${esc(activityDate(item.event_date,item.event_end_date))}</p>${item.description?`<p class="profile-content-copy">${esc(item.description)}</p>`:''}<div class="profile-content-status"><span>${esc(kinds[item.kind]||'任務')} · ${status}</span></div>${item.can_view?`<div class="profile-content-actions"><button type="button" data-profile-action="task-room" data-room="${esc(item.expedition)}">前往任務看板</button></div>`:''}</article>`;
    }).join(''):`<div class="profile-empty">${icon('flag')}<strong>目前沒有進行中的任務</strong></div>`);
  }
}
