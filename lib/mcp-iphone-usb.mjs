import { stateRoot, usbPython } from './paths.mjs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { TOOL_RESULT_CONTENT } from './tool-performance.mjs';

const actionNames = ['status','observe','image','launch','tap','hold','swipe','pinch','type','paste','key','receipt'];
const pointCounts = {tap:1,hold:1,swipe:2,pinch:4};
const coordinate = z.number().int().min(0).max(899);
export const usbInput = z.object({
  action:z.enum(actionNames), requestId:z.string().uuid().optional(), observationId:z.string().uuid().optional(),
  points:z.array(z.array(coordinate).length(2)).min(1).max(4).optional(),
  app:z.string().regex(/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/).max(160).optional(),
  text:z.string().min(1).max(192).optional(),
  key:z.enum(['enter','backspace','escape','tab','left','right','up','down']).optional(),
}).strict();
export const usbDescription = 'Control the enrolled, unlocked iPhone over paired USB. Observe returns native PNG pixels, image size and observationId. Tap/hold points:[[x,y]], swipe:[start,end], pinch:[start1,end1,start2,end2], all in returned image pixels. Mutations need a fresh UUID requestId; except launch, also supply latest observationId. Use type for printable ASCII in a visibly focused field, or paste for Unicode only when replacing the iPhone clipboard is intended. key sends a named key. Launch takes an installed bundle ID. Inspect the returned screen to verify the goal. Never repeat uncertain input; receipt reads the same requestId.';

function runWorker(request, signal, configFile) {
  const python = usbPython;
  const script = fileURLToPath(new URL('../scripts/iphone-usb-ui.py',import.meta.url));
  return new Promise((resolve,reject)=>{
    const proc=spawn(python,['-I','-X','utf8',script,configFile],{stdio:['pipe','pipe','ignore'],windowsHide:true,signal});
    const parts=[]; let size=0;
    const timer=setTimeout(()=>proc.kill(),26000);
    proc.on('error',reject);
    proc.stdin.on('error',()=>{});
    proc.stdout.on('data',buf=>{size+=buf.length;if(size>6*1024*1024)proc.kill();else parts.push(buf);});
    proc.on('close',code=>{
      clearTimeout(timer);
      try {if(code!==0)throw Error('usb_worker_interrupted');resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}
      catch(err){reject(err);}
    });
    proc.stdin.end(JSON.stringify(request));
  });
}

function allowedFields(r) {
  const allowed=['action'];
  if (r.action==='launch') allowed.push('app');
  if (pointCounts[r.action]) allowed.push('points');
  if (r.action==='type'||r.action==='paste') allowed.push('text');
  if (r.action==='key') allowed.push('key');
  if (!['observe','image','status'].includes(r.action)) allowed.push('requestId');
  if (!['observe','status','launch','receipt'].includes(r.action)) allowed.push('observationId');
  if(allowed.some(k=>r[k]===undefined)||Object.keys(r).some(k=>!allowed.includes(k))) throw Error('Expected fields: '+allowed.join(', '));
  if(pointCounts[r.action] && r.points.length!==pointCounts[r.action]) throw Error('Incorrect number of gesture points.');
  if(r.action==='type' && !/^[\x20-\x7e]+$/.test(r.text)) throw Error('type accepts printable ASCII. For Unicode use paste with explicit clipboard intent.');
}

export function createUsbUi({permissions,root,worker=runWorker}){
  const directory=root??join(stateRoot,'iphone-usb-ui');
  const configFile = join(directory, 'config.json');
  let db,controller;
  async function binding(){
    await permissions.require('commands');
    const c=JSON.parse((await readFile(configFile,'utf8')).replace(/^\uFEFF/,''));
    if(c.enabled!==true||!/^[a-f0-9]{64}$/.test(c.deviceHash)) throw Error('USB control is disabled or unpaired.');
    return c.deviceHash;
  }
  function storage(){
    if(db)return db;
    db=new DatabaseSync(join(directory,'control.sqlite'));
    db.exec(`PRAGMA busy_timeout=2000; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS lease(device TEXT PRIMARY KEY,owner TEXT,until_ms INTEGER);
      CREATE TABLE IF NOT EXISTS screen(device TEXT PRIMARY KEY,id TEXT,expires INTEGER,image TEXT,native TEXT,width INTEGER,height INTEGER);
      CREATE TABLE IF NOT EXISTS receipt(id TEXT PRIMARY KEY, device TEXT, signature TEXT,result TEXT);`);
    return db;
  }
  function close(){
    controller?.abort();
    if(db&&!controller){db.close();db=undefined;}
  }
  function prune(){db?.prepare('DELETE FROM screen WHERE expires<=?').run(Date.now());}
  async function invoke(input){
    const r=usbInput.parse(input);
    // Older clients attach a transport requestId to every call, including reads.
    if(['status','image','observe'].includes(r.action)) delete r.requestId;
    allowedFields(r);
    const device=await binding(), sql=storage();prune();
    if(r.action==='image'){
      const row=sql.prepare('SELECT * FROM screen WHERE device=? AND id=? AND expires>?').get(device,r.observationId,Date.now());
      if(!row)return {status:'observe_again',reason:'observation_expired_or_consumed',inputMayHaveRun:false};
      return {status:'cached_image',observationId:row.id,width:row.width,height:row.height,
        [TOOL_RESULT_CONTENT]:[{type:'image',mimeType:'image/png',data:row.image}]};
    }
    const prior=r.requestId && sql.prepare('SELECT device,signature,result FROM receipt WHERE id=?').get(r.requestId);
    const sig=createHash('sha256').update(JSON.stringify(r)).digest('hex');
    if(prior && prior.device===device && (r.action==='receipt'||sig===prior.signature)){
      return {requestId:r.requestId,...JSON.parse(prior.result),replayed:false,fromReceipt:true};
    }
    if(r.action==='receipt') return {status:'not_found',requestId:r.requestId};
    if(prior)throw Error('requestId already belongs to a different operation.');
    const isInput=!['observe','status'].includes(r.action), owner=randomUUID();
    const lease=sql.prepare('INSERT INTO lease VALUES(?,?,?) ON CONFLICT(device) DO UPDATE SET owner=excluded.owner,until_ms=excluded.until_ms WHERE lease.until_ms<=?')
      .run(device,owner,Date.now()+45000,Date.now());
    if(!lease.changes)return {status:'busy',inputMayHaveRun:false};
    let reserved=false;
    controller=new AbortController();
    try{
      const payload={...r,binding:device};
      if(r.observationId){
        const seen=sql.prepare('SELECT * FROM screen WHERE device=? AND id=? AND expires>?').get(device,r.observationId,Date.now());
        if(!seen)return {status:'observe_again',reason:'observation_expired_or_consumed',inputMayHaveRun:false};
        if(r.points?.some(([x,y])=>x>=seen.width||y>=seen.height))throw Error('Point outside the observed image.');
        payload.previous=seen.image;payload.native=JSON.parse(seen.native);
      }
      if(isInput){
        sql.prepare('INSERT INTO receipt VALUES(?,?,?,?)').run(r.requestId,device,sig,JSON.stringify({status:'uncertain',inputMayHaveRun:true}));
        reserved=true;
        sql.prepare('DELETE FROM screen WHERE device=?').run(device);
      }
      const result=await worker(payload,controller.signal,configFile);
      const {image,native,...rest}=result;
      const meta={...rest,transport:'paired_usb',...(r.requestId?{requestId:r.requestId}:{})};
      let frame;
      if(image){
        const buf=Buffer.from(image,'base64');
        if(buf.length<24||buf.toString('hex',0,8)!=='89504e470d0a1a0a') throw Error('invalid_usb_frame');
        const width=buf.readUInt32BE(16),height=buf.readUInt32BE(20),id=randomUUID();
        sql.prepare('INSERT OR REPLACE INTO screen VALUES(?,?,?,?,?,?,?)').run(device,id,Date.now()+120000,image,JSON.stringify(native),width,height);
        Object.assign(meta,{observationId:id,width,height,nativeSize:native});frame={type:'image',mimeType:'image/png',data:image};
      }
      if(reserved)sql.prepare('UPDATE receipt SET result=? WHERE id=?').run(JSON.stringify({...rest,verifyFrom:'observe_current_screen'}),r.requestId);
      return frame?{...meta,[TOOL_RESULT_CONTENT]:[frame]}:meta;
    }catch(err){
      if(reserved)return {status:'uncertain',requestId:r.requestId,inputMayHaveRun:true,reason:'usb_operation_interrupted'};
      throw err;
    }finally{
      controller=undefined;
      sql.prepare('DELETE FROM lease WHERE device=? AND owner=?').run(device,owner);
    }
  }
  return {invoke,close,prune,check:async()=>{if(controller){try{await binding();}catch{controller.abort();}}}};
}

