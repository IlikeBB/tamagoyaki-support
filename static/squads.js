'use strict';
class SquadPanel {
  static render({squads,members,mine,user}){
    const people=list=>list.length?`<div class="squad-people" aria-label="已加入成員">${[...list].sort((a,b)=>(b.user===user.id)-(a.user===user.id)||a.nickname.localeCompare(b.nickname,'zh-Hant')).map(person=>`<div class="squad-person">${profileAvatar(person.nickname,person.user,person.avatar_url)}<div class="squad-person-info"><strong>${esc(person.nickname)}${person.user===user.id?'（你）':''}</strong><small>${person.online?'在線':'離線'}</small></div></div>`).join('')}</div>`:'<p class="squad-empty">還沒有成員。</p>';
    const ordered=[...squads].sort((a,b)=>(b.id===mine.squad)-(a.id===mine.squad)||a.name.localeCompare(b.name,'zh-Hant'));
    const cards=ordered.map(squad=>{
      const own=squad.id===mine.squad,joined=members.filter(person=>person.squad===squad.id);
      return `<article class="squad-group ${own?'is-current':''}" data-squad-id="${esc(squad.id)}"><div class="squad-group-heading"><h3>${esc(squad.name)}</h3><span>${own?'我的小隊 · ':''}${joined.length} 人</span></div>${people(joined)}${own?`<div class="squad-group-actions"><button type="button" data-action="squad-chat" data-id="${esc(squad.id)}">小隊聊天</button><button type="button" data-action="squad-invite">邀請加入小隊</button><button type="button" data-action="leave-squad" data-id="${esc(squad.id)}">離開小隊</button></div>`:''}</article>`;
    }).join('');
    const unassigned=members.filter(person=>!person.squad||!squads.some(squad=>squad.id===person.squad));
    return `<section class="squad-overview" aria-labelledby="squad-overview-title"><div class="squad-overview-heading"><div><div class="eyebrow">SQUAD COMPOSITION</div><h2 id="squad-overview-title">小隊組合</h2></div><span>${squads.length} 支小隊 · ${members.length} 位成員</span></div><p class="squad-intro">僅限好友組成小隊。</p><div class="squad-overview-actions"><button type="button" class="button secondary" data-action="create-squad">＋ 建立小隊</button><button type="button" class="button outline" data-action="join-squad">輸入小隊邀請碼</button></div>${cards}${unassigned.length?`<details class="squad-unassigned" open><summary>尚未分組 · ${unassigned.length} 人</summary>${people(unassigned)}</details>`:''}</section>`;
  }
}
