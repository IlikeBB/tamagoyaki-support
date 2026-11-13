// Rasterize the project's own vector icon for mobile home-screen compatibility.
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  const page=await browser.newPage({viewport:{width:512,height:512}});
  for(const size of [192,512]){
    await page.setContent(`<body style="margin:0;background:#f7b84b"><img width="${size}" height="${size}" src="https://tamagoyaki-support.modoubletw.com/static/icon.svg"></body>`);
    await page.locator('img').evaluate(img=>img.decode());
    await page.locator('img').screenshot({path:`static/icon-${size}.png`});
  }
  console.log('Exported 192px and 512px app icons.');
}finally{await browser.close();}
