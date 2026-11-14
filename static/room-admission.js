'use strict';
class RoomAdmission {
  constructor(actions){this.actions=actions;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){if(this.form?.isConnected)document.querySelector('#dialog').close();this.finish?.();}}
  async join(id,uid){
    try{return await this.actions.api(`/expeditions/${encodeURIComponent(id)}/join`,'POST',{});}
    catch(error){if(error.status!==428)throw error;}
    if(this.actions.user()?.id!==uid)return;
    this.finish?.();this.uid=uid;
    this.actions.dialog({kind:'admission'});
    this.form=document.querySelector('#room-admission-form');const form=this.form,dialog=document.querySelector('#dialog');
    return new Promise(resolve=>{
      let settled=false;const done=room=>{if(settled)return;settled=true;dialog.removeEventListener('close',closed);this.finish=null;this.uid=null;this.form=null;resolve(room);},closed=()=>done();this.finish=()=>done();dialog.addEventListener('close',closed);
      form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');if(button.disabled||this.actions.user()?.id!==uid)return;button.disabled=true;form.querySelector('.form-error').textContent='';
        try{const room=await this.actions.api(`/expeditions/${encodeURIComponent(id)}/join`,'POST',{password:new FormData(form).get('password')});if(this.actions.user()?.id!==uid||!form.isConnected)return;done(room);dialog.close();}
        catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}
        finally{if(form.isConnected)button.disabled=false;}
      };form.querySelector('input').focus();
    });
  }
}
