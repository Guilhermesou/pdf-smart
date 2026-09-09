import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createCanvas } from '@napi-rs/canvas';
const binary = `src-tauri/binaries/pdf-smart-ocr-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
const child = spawn(binary, [], {stdio:['pipe','pipe','inherit']});
const lines = createInterface({input:child.stdout});
const queue = [];
lines.on('line', line=>queue.shift()?.(JSON.parse(line)));
function request(payload) { return new Promise(resolve=>{ queue.push(resolve); child.stdin.write(JSON.stringify(payload)+'\n'); }); }
try {
  const probe = await request({probe:true});
  assert.equal(probe.engine,'apple-vision');
  const canvas = createCanvas(900,500), ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='60px Arial';ctx.fillText('EM BRANCO',200,260);
  const result = await request({image:canvas.toBuffer('image/png').toString('base64')});
  assert.match(result.text,/EM BRANCO/i);
  assert.ok(result.confidence >= 65);
  const invalid = await request({image:'invalid'});assert.ok(invalid.error);
  const again = await request({probe:true}); assert.equal(again.engine,'apple-vision');
  console.log(JSON.stringify({probe:probe.acceleration,recognition:result.acceleration,confidence:result.confidence,recoveredAfterInvalidInput:true}));
} finally { child.stdin.end(); child.kill(); }
