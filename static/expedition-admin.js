'use strict';
async function showOwnedRooms(){
  if(!state.authenticated)return showAuth();
  dialog({kind:'owned'});
  const root=$('#owned-rooms'),uid=state.user.id;
  try{
    const data=await api('/expeditions/owned');if(!root.isConnected||state.user.id!==uid)return;
    TamagoVue.renderList(root,'owned',{items:data.expeditions.map(room=>({...room,schedule:activityDate(room.event_date,room.event_end_date),venue_name:activityVenues().find(v=>v.id===room.venue)?.name||room.venue}))});
  }catch(error){if(root.isConnected)root.textContent=error.message;}
}
async function showDeleteRoom(id){
  const data=await api('/expeditions/owned'),room=data.expeditions.find(r=>r.id===id);
  if(!room)throw new Error('只能刪除自己建立且仍存在的遠征隊。');
  dialog({kind:'deleteRoom',room:{...room},id});
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
