'use strict';
class ProfileRpg {
  static render(rpg){
    if(!rpg)return '';
    return `<section class="profile-rpg" aria-label="遠征者等級"><div class="profile-rpg-heading"><span class="profile-level">${icon('spark')} Lv.${esc(rpg.level)}</span><strong>${esc(rpg.title)}</strong><span class="profile-xp">${esc(rpg.xp)} <small>XP</small></span></div><label class="profile-rpg-next" for="profile-xp-progress"><span>前往 Lv.${esc(rpg.next_level)}</span><span>還需 ${esc(rpg.needed)} XP</span></label><progress id="profile-xp-progress" value="${esc(rpg.progress)}" max="${esc(rpg.required)}">${esc(rpg.progress)} / ${esc(rpg.required)}</progress><p>收到讚 <b>＋20 XP</b> · 倒讚 <b>－5 XP</b><br>每 100 XP 升一級；切換或收回評價會同步調整。</p></section>`;
  }
}
