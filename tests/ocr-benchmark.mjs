// Measures OCR on one synthetic image, not end-to-end PDF throughput.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
const child=spawn(`src-tauri/binaries/pdf-smart-ocr-${process.arch==='arm64'?'aarch64':'x86_64'}-apple-darwin`,[],{stdio:['pipe','pipe','inherit']});
const queue=[];const lines=createInterface({input:child.stdout});
lines.on('line',line=>queue.shift()?.(JSON.parse(line)));
function request(payload){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('OCR timeout')),120000);queue.push(r=>{clearTimeout(timer);resolve(r);});child.stdin.write(JSON.stringify(payload)+'\n');});}
const c=createCanvas(900,500),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='60px Arial';ctx.fillText('EM BRANCO',200,260);
const png=c.toBuffer('image/png'),image=png.toString('base64');let worker;
try{
 const setup=performance.now();worker=await createWorker('eng',1,{langPath:new URL('../public/ocr/lang',import.meta.url).pathname,cachePath:'/private/tmp'});await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
 const setupMs=performance.now()-setup;const native=[],wasm=[];
 for(let i=0;i<6;i++){
  let t=performance.now();const a=await request({image});const ams=performance.now()-t;if(a.error)throw Error(a.error);
  t=performance.now();const b=await worker.recognize(png);const bms=performance.now()-t;
  native.push(ams);wasm.push(bms);
  if(!/EM BRANCO/i.test(a.text)||!/EM BRANCO/i.test(b.data.text))throw Error('Recognition differs');
 }
 const median=a=>a.slice(1).sort((a,b)=>a-b)[2];
 console.log(JSON.stringify({scope:'Synthetic stamp OCR; native IPC included, PDF rendering excluded; Node Tesseract differs from browser',tesseractSetupMs:setupMs,firstNativeMs:native[0],firstTesseractMs:wasm[0],warmNativeMedianMs:median(native),warmTesseractMedianMs:median(wasm)}));
}finally{await worker?.terminate();child.stdin.end();child.kill();}
