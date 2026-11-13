'use strict';
async function syncRoomChanges(uid,{catalog=false,people=false}={}){
  if(!state.authenticated||state.user.id!==uid)return;
  const me=await api('/me');if(!state.authenticated||state.user.id!==uid)return;
  state.rooms=me.expeditions;if(people)await friends.sync({fresh:true});if(!state.demo)await refresh({fresh:true});
  if(!state.authenticated||state.user.id!==uid)return;
  if(catalog&&expeditionPage?.visible())await expeditionPage.loadCatalog();render();chat?.tick();
}
async function leaveExpeditionFromMenu(id,uid){
  if(!state.authenticated||state.user.id!==uid)return;
  const current=!state.demo&&state.room.id===id;if(current)await stopTeamLocation();
  const result=await api(`/expeditions/${encodeURIComponent(id)}/membership`,'DELETE');if(!state.authenticated||state.user.id!==uid)return;
  assistance?.sync(result.help_rooms||[]);if(current){resetLobby();try{localStorage.removeItem('tamago-room');}catch{}}
  state.rooms=state.rooms.filter(room=>room.id!==id);if(roomSettings?.room.id===id&&roomSettings.current())closeDialog();await syncRoomChanges(uid,{catalog:true});toast('已退出遠征隊。');
}
function activitySchedule(room){return activityDate(room.event_date)+(room.event_time?' '+room.event_time+'（'+(room.time_zone==='Asia/Taipei'?'台灣':'日本')+'）':'');}
