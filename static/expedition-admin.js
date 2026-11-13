'use strict';
async function showOwnedRooms(){
  if(!state.authenticated)return showAuth();
  dialog('<h2>我建立的遠征隊</h2><p>即使已退出，仍可在這裡刪除自己建立的隊伍。</p><div id="owned-rooms" role="status">正在載入…</div>');
  const root=$('#owned-rooms'),uid=state.user.id;
  try{
    const data=await api('/expeditions/owned');if(!root.isConnected||state.user.id!==uid)return;
    root.innerHTML=data.expeditions.map(room=>`<article class="room-item owned-room"><div><strong>${esc(room.name)}</strong><small>${esc(activityDate(room.event_date))} · ${esc(activityVenues().find(v=>v.id===room.venue)?.name||room.venue)}</small></div><button class="button outline" data-action="manage-members" data-id="${esc(room.id)}">管理成員</button><button class="button outline logout-button" data-action="delete-room" data-id="${esc(room.id)}">刪除</button></article>`).join('')||empty('還沒有建立的遠征隊','建立隊伍後，可在這裡管理。');
  }catch(error){if(root.isConnected)root.textContent=error.message;}
}
async function showDeleteRoom(id){
  const data=await api('/expeditions/owned'),room=data.expeditions.find(r=>r.id===id);
  if(!room)throw new Error('只能刪除自己建立且仍存在的遠征隊。');
  dialog(`<h2>刪除這支遠征隊？</h2><p><strong>${esc(room.name)}</strong></p><p>隊內任務、地標、群聊與位置分享會一併清除，所有成員將離開隊伍，原邀請碼無法再加入。個人檔案的場次與地標評價紀錄仍會保留。</p><p>刪除後無法復原。</p><button class="button primary full" data-action="confirm-delete-room" data-id="${esc(id)}">確認刪除遠征隊</button><button class="button outline full" data-action="close">取消，保留隊伍</button>`);
}
async function deleteRoom(id){
  const current=!state.demo&&state.room.id===id;
  const result=await api('/expeditions/'+encodeURIComponent(id),'DELETE');assistance?.sync(result.help_rooms||[]);
  if(current){resetLobby();try{localStorage.removeItem('tamago-room');}catch{}}
  state.rooms=state.rooms.filter(room=>room.id!==id);
  closeDialog();render();if(current)showMap();chat?.tick();
  try{const me=await api('/me');state.rooms=me.expeditions;}catch{}
  toast('遠征隊已刪除，場次與地標評價紀錄仍保留。');
}
