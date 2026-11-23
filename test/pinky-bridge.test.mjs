import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPinkyBridge } from '../lib/pinky-bridge.mjs';
import { pinkyLaunchError } from '../lib/pinky-launch-error.mjs';

test('Pinky attributes an ambiguous launch failure only to a matching enforcement event',async()=>{
 const error=new Error('spawn UNKNOWN'), hash='ab'.repeat(32), start=Date.now();
 const denied=await pinkyLaunchError(error,hash,start,async(executable,args)=>{
   assert.match(executable,/wevtutil\.exe$/i);
   const filter=args.find(arg=>arg.startsWith('/q:'));
   assert.ok(filter.includes('EventID=3077') && filter.includes(hash.toUpperCase()) && filter.includes(new Date(start-1500).toISOString()));
   return {stdout:"<Event xmlns='x'><Data Name='PolicyName'>VerifiedAndReputableDesktop</Data></Event>"};
 });
 assert.match(denied.message,/智慧型應用程式控制.*3077/);
 assert.equal(await pinkyLaunchError(error,hash,start,async()=>({stdout:''}),async()=>{}),error);
 assert.equal(await pinkyLaunchError(error,hash,start,async()=>{throw Error('log unavailable');}),error);
 const timeout=new Error('MCP handshake timed out');
 assert.equal(await pinkyLaunchError(timeout,hash,start,async()=>assert.fail('not a spawn failure')),timeout);
});
test('Pinky reuses one connection, persists receipts and never replays uncertain input after restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'codexmini-pinky-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let starts=0,calls=0,closed=0,deny=false,fail=false;
 const deps={receiptDirectory:dir,permissions:{require:async()=>{if(deny)throw Error('revoked');}},
 connect:async()=>{starts++;return {client:{listTools:async()=>({tools:[{name:'phone_tap'},{name:'phone_observe'},{name:'phone_task_run'}]}),
 callTool:async()=>{calls++;if(fail)throw Error('disconnected');return {content:[{type:'text',text:'approval_pending'}]};},
 close:async()=>{closed++;}}};}};
 const a=createPinkyBridge(deps);const tool=await a.invoke({action:'tools'});assert.deepEqual(tool.tools.map(x=>x.name),['phone_tap','phone_observe']);
 const req={action:'call',tool:'phone_tap',requestId:randomUUID(),arguments:{x:1,y:2}};
 const result=await a.invoke(req);assert.equal(result.status,'returned');assert.equal(result.retryInput,false);
 await a.invoke(req);assert.equal(calls,1);assert.equal(starts,1);
 await a.close();const b=createPinkyBridge(deps);
 assert.equal((await b.invoke(req)).replayed,true);assert.equal(starts,1);
 fail=true;const uncertain={...req,requestId:randomUUID()};assert.equal((await b.invoke(uncertain)).status,'uncertain');
 await b.close();const c=createPinkyBridge(deps);assert.equal((await c.invoke(uncertain)).status,'uncertain');assert.equal(calls,2);
 await assert.rejects(c.invoke({...req,arguments:{x:9,y:9}}),/conflict/);
 await assert.rejects(c.invoke({...req,tool:'phone_task_run',requestId:randomUUID()}),/autonomous AI/);
 deny=true;await assert.rejects(c.invoke({action:'tools'}),/revoked/);
 await c.close();assert.equal(closed,2);
});

