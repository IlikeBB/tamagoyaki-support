'use strict';
class AppDisplay {
  constructor({dialog,close,toast}){
    this.dialog=dialog;this.close=close;this.toast=toast;this.installPrompt=null;
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.installPrompt=event;});
    window.addEventListener('appinstalled',()=>{this.installPrompt=null;this.toast('已加入主畫面，請從 App 圖示開啟。');});
    const fit=()=>{
      // iOS standalone can report visualViewport/innerHeight minus the status
      // bar inset. Its large CSS viewport includes that area. Never persist the
      // shortened pixel height after a gesture, keyboard cycle, or resume.
      if(navigator.standalone===true){
        document.documentElement.style.setProperty('--app-height','100vh');return;
      }
      const viewport=window.visualViewport;
      if(viewport&&viewport.scale!==1)return;
      document.documentElement.style.setProperty('--app-height',`${viewport?.height||innerHeight}px`);
    };
    window.addEventListener('resize',fit);window.addEventListener('pageshow',fit);
    window.visualViewport?.addEventListener('resize',fit);fit();
  }
  get installed(){return navigator.standalone===true||matchMedia('(display-mode:standalone)').matches||matchMedia('(display-mode:fullscreen)').matches;}
  show(){
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const fullscreen=!!document.fullscreenEnabled&&!!document.documentElement.requestFullscreen;
    this.dialog({kind:'appDisplay',installed:this.installed,installPrompt:!!this.installPrompt,fullscreen,fullscreenActive:!!document.fullscreenElement,ios});
  }
  async install(){
    const prompt=this.installPrompt;if(!prompt)return this.show();
    this.installPrompt=null;await prompt.prompt();const choice=await prompt.userChoice;
    if(choice.outcome==='accepted'){this.close();this.toast('安裝完成後，從主畫面圖示開啟即可。');}else this.show();
  }
  async fullscreen(){
    this.close();
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    }catch{this.toast('此瀏覽器無法切換全螢幕，請使用加入主畫面的 App 模式。');this.show();}
  }
}
