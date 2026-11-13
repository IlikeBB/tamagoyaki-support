// Prepare the official editable vector map without raster repainting.
// Run from this project with: node scripts/prepare-facility-map.mjs
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const sourceUrl='https://www.m-messe.co.jp/static/images/facility/floormap.svg';
const pageUrl='https://www.m-messe.co.jp/facility/';
const osmUrl='https://www.openstreetmap.org/api/0.6/map?bbox=140.027,35.642,140.042,35.654';
fs.mkdirSync('assets/maps',{recursive:true});fs.mkdirSync('static/maps',{recursive:true});
const original='assets/maps/makuhari-official-floor.svg';
if(!fs.existsSync(original))fs.copyFileSync('artifacts/makuhari-floormap-official.svg',original);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
let cleaned;
try {
 const page=await browser.newPage();
 await page.goto(new URL(`../${original}`,import.meta.url).href);
 cleaned=await page.evaluate(()=>{
  const svg=document.documentElement,art=document.getElementById('アートワーク');
  const icons=[...art.querySelectorAll('g')].filter(el=>{
   if(el.querySelector('text'))return false;
   const b=el.getBBox();
   return b.width>=14&&b.width<=22&&b.height>=14&&b.height<=22&&Math.abs(b.width-b.height)<1;
  });
  icons.forEach(el=>el.remove());
  for(const id of ['アイコン_xFF08_バリアフリー以外_xFF09_','レイヤー_21','凡例','凡例_xFF08_バリアフリーver_xFF09_','下地','レイヤー_19'])document.getElementById(id)?.remove();
  // The original north arrow points down/right. Turn lettering back toward the viewer
  // after north-up registration, while keeping each label's original map position.
  for(const text of art.querySelectorAll('text')){
   const b=text.getBBox();
   text.setAttribute('transform',`${text.getAttribute('transform')||''} rotate(180 ${b.x+b.width/2} ${b.y+b.height/2})`);
  }
  // Keep only map geometry; legends and duplicate floor insets are outside the clips below.
  return {removed:icons.length,style:svg.querySelector('style').textContent,body:[...svg.children].filter(el=>el.tagName==='g').map(el=>new XMLSerializer().serializeToString(el)).join('')};
 });
}finally{await browser.close();}

const R=6378137,rad=Math.PI/180;
const project=([lat,lng])=>[R*lng*rad,-R*Math.log(Math.tan(Math.PI/4+lat*rad/2))];
const unproject=([x,y])=>[(2*Math.atan(Math.exp(-y/R))-Math.PI/2)/rad,x/R/rad];
const origin=project([35.6483,140.0346]);
// Independent affine fits avoid treating the schematic's differently scaled buildings as a survey.
// Ground anchors: OSM ways 374815914 (1–8), 211128545 (9–11), 242014402/403.
const parts=[
 {id:'halls-1-8',clip:'166,18.2 1064,18.2 1064,239.6 166,239.6',anchors:[
  {pixel:[187,18.2],latlng:[35.6449717,140.0359558]},
  {pixel:[1064,18.2],latlng:[35.6482036,140.0314924]},
  {pixel:[187,239.6],latlng:[35.6459366,140.0369604]}]},
 {id:'halls-9-11',clip:'625,494 873,494 873,914 625,914',anchors:[
  {pixel:[625,525],latlng:[35.6486853,140.0361528]},
  {pixel:[871,525],latlng:[35.6494139,140.035099]},
  {pixel:[625,912],latlng:[35.6500967,140.0376305]}]},
 {id:'conference',clip:'250,272.8 294,272.8 294,239.6 410,239.6 410,409 201,409 201,364 250,364',anchors:[
  {pixel:[250,272.8],latlng:[35.646295,140.0366836]},
  {pixel:[410,272.8],latlng:[35.6468066,140.0359697]},
  {pixel:[410,408],latlng:[35.647241,140.0364383]}]},
 {id:'event-hall',clip:'628,254 841,254 841,414 628,414',anchors:[
  {pixel:[735,333],latlng:[35.64823,140.03470]},
  {pixel:[835,333],latlng:[35.64863,140.03414]},
  {pixel:[735,413],latlng:[35.648614,140.035116]}]},
];
function fit(anchors){
 const [[x0,y0],[x1,y1],[x2,y2]]=anchors.map(a=>a.pixel);
 const p=anchors.map(a=>project(a.latlng).map((v,i)=>v-origin[i]));
 const dx1=x1-x0,dy1=y1-y0,dx2=x2-x0,dy2=y2-y0,det=dx1*dy2-dx2*dy1;
 const solve=i=>{
  const v1=p[1][i]-p[0][i],v2=p[2][i]-p[0][i];
  const a=(v1*dy2-v2*dy1)/det,c=(dx1*v2-dx2*v1)/det;
  return [a,c,p[0][i]-a*x0-c*y0];
 };
 const x=solve(0),y=solve(1);return [x[0],y[0],x[1],y[1],x[2],y[2]];
}
const transform=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
for(const part of parts)part.matrix=fit(part.anchors);
const corners=parts.flatMap(p=>p.clip.split(' ').map(v=>transform(p.matrix,v.split(',').map(Number))));
const min=[0,1].map(i=>Math.floor(Math.min(...corners.map(p=>p[i]))-4));
const max=[0,1].map(i=>Math.ceil(Math.max(...corners.map(p=>p[i]))+4));
const size=max.map((v,i)=>v-min[i]);
const clips=parts.map(p=>`<clipPath id="clip-${p.id}"><polygon points="${p.clip}"/></clipPath>`).join('');
const groups=parts.map(p=>`<g data-building="${p.id}" transform="matrix(${p.matrix.join(' ')})"><g clip-path="url(#clip-${p.id})"><use href="#clean-floor"/></g>${p.id==='event-hall'?'<g transform="rotate(180 735 338)"><text x="735" y="330" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#293e36">幕張イベントホール</text><text x="735" y="348" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#293e36">Makuhari Event Hall</text></g>':''}</g>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${min.join(' ')} ${size.join(' ')}" width="${size[0]}" height="${size[1]}" role="img" aria-label="幕張メッセ場館示意圖，官方設施圖標已移除"><title>幕張メッセ場館示意圖（約略對齊）</title><desc>Adapted from ${pageUrl}. Amenity icons, legend and duplicate floor insets omitted. Approximate alignment to OpenStreetMap building outlines.</desc><style>${cleaned.style}</style><defs>${clips}<g id="clean-floor">${cleaned.body}</g></defs>${groups}</svg>`;
fs.writeFileSync('static/maps/makuhari-facility-v2.svg',svg,'utf8');
const metadata={image:'/static/maps/makuhari-facility-v2.svg',bounds:[unproject([min[0]+origin[0],max[1]+origin[1]]),unproject([max[0]+origin[0],min[1]+origin[1]])],source:pageUrl,original:sourceUrl,groundReference:osmUrl,prepared:'2026-11-06',alignment:'Approximate per-building affine fits; this official multi-floor schematic is not a surveyed map.',removedArtworkIconGroups:cleaned.removed,parts:parts.map(({id,anchors})=>({id,anchors}))};
fs.writeFileSync('static/maps/makuhari-facility-v2.json',JSON.stringify(metadata,null,2)+'\n','utf8');
console.log(JSON.stringify({ok:true,removedArtworkIcons:cleaned.removed,buildings:parts.length,bytes:Buffer.byteLength(svg),bounds:metadata.bounds}));
