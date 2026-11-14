import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class ProfileView extends VueService {
  constructor(root,actions){
    super(); const resources = this.resources;
    this.root=root;this.actions=actions;this.scroll=root.querySelector('#profile-scroll');this.body=root.querySelector('#profile-content');this.content=new TamagoVue.ProfileContentView(this.body);
    resources.listen(root, 'click',event=>{
      const button=event.target.closest('[data-profile-action]');if(!button)return;event.stopPropagation();const action=button.dataset.profileAction;
      if(action==='tab')actions.tab(button.dataset.tab);else if(action==='more')actions.more();else if(action==='photo')actions.photo(button.dataset.slot);
      else if(action==='room')actions.room(button.dataset.id);else if(action==='remove-room')actions.removeRoom(button.dataset.id);else if(action==='pin')actions.pin(button.dataset.room,button.dataset.id);
      else if(action==='remove-history')actions.removeHistory(button.dataset.id);
      else if(action==='remove-content')actions.removeContent(button.dataset.id);
      else if(action==='confirm-content')actions.confirmContent(button.dataset.id);
      else if(action==='cancel-content')actions.cancelContent();
      else if(action==='task-room')actions.taskRoom(button.dataset.room);else actions[action]?.();
    });
    resources.bind(root.querySelector('#profile-close'), 'onclick', ()=>root.close());resources.listen(root, 'close',()=>{if(root.open)return;this.fit();actions.closed();(this.opener?.isConnected?this.opener:document.querySelector('#account-button')).focus({preventScroll:true});});
    resources.listen(document, 'error',event=>{if(event.target.matches?.('img[data-profile-image]')){event.target.hidden=true;if(event.target.id==='account-avatar')document.querySelector('#account-button').classList.remove('has-avatar');}},true);
    const fit=()=>this.fit();resources.listen(window.visualViewport, 'resize',fit);resources.listen(window.visualViewport, 'scroll',fit);resources.listen(window, 'resize',fit);resources.listen(root, 'focusin',fit);resources.listen(root, 'focusout',()=>resources.frame(fit));
  }
  fit(){
    const viewport=window.visualViewport,focused=this.root.contains(document.activeElement)&&document.activeElement.matches('textarea,input:not([type=range])'),full=document.body.getBoundingClientRect().height;
    const keyboard=this.root.open&&focused&&viewport&&Math.abs(viewport.scale-1)<.01&&viewport.height<full-150;
    this.root.classList.toggle('profile-keyboard',!!keyboard);
    if(keyboard){this.root.style.setProperty('--profile-height',`${Math.round(viewport.height)}px`);this.root.style.setProperty('--profile-top',`${Math.round(viewport.offsetTop)}px`);}
    else{this.root.style.removeProperty('--profile-height');this.root.style.removeProperty('--profile-top');}
  }
  status(message,error=false){this.root.querySelector('#profile-status').textContent=message;this.root.querySelector('#profile-retry').hidden=!error;}
  clear(){this.content.clear();}
  selectTab(tab){this.content.selectTab(tab);}
  render(data,tab,editing=false,draft=null){
    const p=data.profile;
    this.root.querySelector('#profile-edit').hidden=!p.own;this.root.querySelector('#profile-settings').hidden=!p.own;this.root.querySelector('#profile-edit').textContent=editing?'取消編輯':'編輯檔案';
    this.root.querySelector('#news-launcher').hidden=!p.own;
    this.content.render(data,tab,editing,draft);
    if(editing)this.resources.bind(this.body.querySelector('form'), 'onsubmit', event=>{event.preventDefault();actionsGuard(()=>this.actions.save(event.target));});
  }
  records(items,tab,total,next){this.content.records(items,tab,total,next,this.actions.contentState(),this.actions.historyBusy?.());}
}
function actionsGuard(action){Promise.resolve().then(action).catch(()=>{});}
