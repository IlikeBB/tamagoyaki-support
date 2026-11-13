'use strict';
class ProfileCrop {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.canvas=root.querySelector('canvas');this.context=this.canvas.getContext('2d');this.generation=0;
    for(const input of root.querySelectorAll('input[type=range]'))input.oninput=()=>this.draw();
    root.querySelector('[data-crop-cancel]').onclick=()=>this.cancel();root.querySelector('[data-crop-save]').onclick=()=>this.save();
  }
  async open(file,slot){
    this.clear();const generation=++this.generation;
    if(!file)return;if(file.size>12*1024*1024)throw new Error('請選擇 12 MB 以內的照片。');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('請選擇 JPG、PNG 或 WebP 圖片。');
    this.url=URL.createObjectURL(file);const picture=new Image();
    try{await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(new Error('無法讀取這張圖片，請換一張 JPG、PNG 或 WebP。'));picture.src=this.url;});}
    catch(error){this.clear();throw error;}
    if(generation!==this.generation)return;
    this.image=picture;this.slot=slot;const [width,height]=slot==='avatar'?[320,320]:[1200,400];this.canvas.width=width;this.canvas.height=height;
    this.root.dataset.slot=slot;this.root.querySelector('[data-crop-title]').textContent=slot==='avatar'?'調整你的頭貼':'調整你的橫幅';
    this.root.querySelector('[name=zoom]').value='1';this.root.querySelector('[name=x]').value='50';this.root.querySelector('[name=y]').value='50';this.root.hidden=false;this.draw();this.actions.opened();
  }
  draw(){
    if(!this.image)return;
    const image=this.image,width=this.canvas.width,height=this.canvas.height,zoom=Number(this.root.querySelector('[name=zoom]').value),scale=Math.max(width/image.naturalWidth,height/image.naturalHeight)*zoom;
    const sw=width/scale,sh=height/scale,x=(image.naturalWidth-sw)*Number(this.root.querySelector('[name=x]').value)/100,y=(image.naturalHeight-sh)*Number(this.root.querySelector('[name=y]').value)/100;
    this.context.fillStyle='#fffefa';this.context.fillRect(0,0,width,height);this.context.drawImage(image,x,y,sw,sh,0,0,width,height);
  }
  async save(){
    const button=this.root.querySelector('[data-crop-save]'),generation=this.generation;button.disabled=true;
    try{await this.actions.save(this.slot,this.canvas.toDataURL('image/png'));if(generation===this.generation)this.cancel();}
    catch(error){if(generation===this.generation)this.actions.error(error.message);}finally{button.disabled=false;}
  }
  clear(){this.generation++;if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image=null;}
  cancel(){this.clear();this.root.hidden=true;this.actions.cancelled();}
}
