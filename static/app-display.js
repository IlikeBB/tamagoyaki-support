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
    const iosSteps='<ol class="app-install-steps"><li>用 Safari 開啟本站，按「分享」。</li><li>選擇「加入主畫面」；若出現「打開為網頁 App」，請保持開啟。</li><li>按「加入」，之後點主畫面的玉子燒圖示開啟。</li></ol>';
    const androidSteps='<ol class="app-install-steps"><li>用 Chrome 或 Edge 開啟本站。</li><li>開啟瀏覽器選單，選「安裝應用程式」、「安裝並建立捷徑」或「加入主畫面」。</li><li>完成安裝後，從主畫面的玉子燒圖示開啟。</li></ol>';
    const fullscreen=!!document.fullscreenEnabled&&!!document.documentElement.requestFullscreen;
    this.dialog(`<h2>用 App 模式開啟。</h2><p>${this.installed?'目前已在 App 模式中。':'加入主畫面後，從 App 圖示開啟就不會顯示瀏覽器網址列。'}</p>${!this.installed&&this.installPrompt?'<button class="button primary full" data-action="app-install">安裝到主畫面</button>':''}${fullscreen?`<button class="button ${this.installPrompt?'outline':'primary'} full" data-action="app-fullscreen">${document.fullscreenElement?'離開全螢幕':'立即全螢幕顯示'}</button>`:''}${!this.installed?`<div class="app-install-guide"><h3>${ios?'iPhone／iPad':'Android／電腦'}</h3>${ios?iosSteps:androidSteps}<details><summary>${ios?'Android／電腦的安裝方式':'iPhone／iPad 的安裝方式'}</summary>${ios?androidSteps:iosSteps}</details></div>`:''}<p class="field-note">一般瀏覽器分頁無法自動隱藏網址列。手機系統的狀態列與全螢幕支援依裝置而定。</p><button class="button outline full" data-action="help">查看網站使用說明</button>`);
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
