import * as TamagoVue from '../views.js';
// Third-party maps receive DOM nodes rendered by the shared Vue runtime.
export class MapPresence {
  static angle(value){return Number.isFinite(value)?((value%360)+360)%360:null;}
  static render(model){return TamagoVue.createMapMarker({...model,kind:['self','friend','member','task'].includes(model.kind)?model.kind:'task',angle:this.angle(model.angle)});}
  static updateSelf(root,value){if(root)TamagoVue.updatePresence(root,this.angle(value));}
}
