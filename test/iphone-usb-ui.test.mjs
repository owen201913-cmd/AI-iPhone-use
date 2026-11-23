import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createUsbUi} from '../lib/mcp-iphone-usb.mjs';
import {TOOL_RESULT_CONTENT} from '../lib/tool-performance.mjs';

test('paired USB screenshots, concurrency, uncertain input and receipts survive client reconnection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'usb-ui-'));
  const config=join(root,'config.json'),deviceHash='e'.repeat(64);
  const enable=enabled=>writeFile(config,JSON.stringify({enabled,deviceHash}));
  await enable(true);
  let release, entered, dispatches=0;
  const enteredWorker=new Promise(resolve=>{entered=resolve;});
  const resultGate=new Promise(resolve=>{release=resolve;});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  const make=()=>createUsbUi({root,permissions:{require:async k=>assert.equal(k,'commands')},worker:async r=>{
    if(r.action==='observe')return {status:'observed',image:png,native:[1,1],inputMayHaveRun:false};
    dispatches++;entered();await resultGate;throw Error('lost device');
  }});
  const one=make(),two=make();
  try{
    const observed=await one.invoke({action:'observe',requestId:randomUUID()});
    const observationId=observed.observationId;
    assert.equal(observed[TOOL_RESULT_CONTENT][0].data,png);
    assert.equal((await two.invoke({action:'image',observationId}))[TOOL_RESULT_CONTENT][0].data,png);
    const tap={action:'tap',observationId,requestId:randomUUID(),points:[[0,0]]};
    await assert.rejects(()=>two.invoke({...tap,points:[[1,0]]}),/outside/);
    await assert.rejects(()=>two.invoke({...tap,points:[[0,0,0]]}));
    const active=one.invoke(tap);await enteredWorker;
    assert.equal((await two.invoke({action:'observe'})).status,'busy');
    assert.equal((await two.invoke(tap)).inputMayHaveRun,true);
    release();assert.equal((await active).status,'uncertain');
    one.close();
    const saved=await two.invoke(tap);assert.equal(saved.fromReceipt,true);
    await assert.rejects(()=>two.invoke({...tap,action:'hold'}),/different operation/);
    assert.equal((await two.invoke({...tap,requestId:randomUUID()})).inputMayHaveRun,false);
    assert.equal((await two.invoke({action:'receipt',requestId:tap.requestId})).status,'uncertain');
    assert.equal(dispatches,1);
    await enable(false);await assert.rejects(()=>two.invoke({action:'image',observationId}),/disabled/);
  }finally{release();one.close();two.close();await rm(root,{recursive:true,force:true});}
});
