import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createAvailabilityQueue} from '../lib/ish-availability.mjs';

function setup() {
  let wake, calls=0, time=1000, binding='phone1', result='awaiting_confirmation';
  const seen=[];
  const job={action:'background',requestId:randomUUID(),title:'Edit and test',steps:['echo 42'],queueUntilOpenMs:1000};
  const queue=createAvailabilityQueue({permissions:{require:async()=>{}},now:()=>time,retryMs:1,workspace:{
    binding:async()=>binding,
    async invoke(request,internal,expected){
      assert.equal(expected,binding);
      seen.push(request.action);
      if(request.action==='background'){calls++; return {status:result};}
      if(request.requestId===job.requestId) return {status:'completed',exitCode:0,output:'42'};
      return new Promise(resolve=>{wake=resolve;});
    }
  }});
  return {job,queue,seen,wake:()=>wake({status:'no_receipt'}),calls:()=>calls,expire:()=>{time+=1001;},replace:()=>{binding='phone2';},loseResult:()=>{result='uncertain';}};
}

test('return before phone opens, join duplicate and submit exactly once with native confirmation',async()=>{
  const f=setup();
  const [a,b]=await Promise.all([f.queue.invoke(f.job),f.queue.invoke(f.job)]);
  assert.equal(a.status,'waiting_for_phone');
  assert.deepEqual(a,b);
  assert.deepEqual(f.seen,['receipt']);
  assert.equal((await f.queue.invoke({...f.job,steps:['false']})).status,'request_id_conflict');
  f.wake(); await nextTurn();
  assert.equal((await f.queue.invoke(f.job)).status,'awaiting_confirmation');
  assert.deepEqual(await f.queue.invoke({action:'receipt',requestId:f.job.requestId}),{status:'completed',exitCode:0,output:'42'});
  assert.equal(f.calls(),1);
  f.replace();
  assert.equal((await f.queue.invoke(f.job)).status,'pairing_changed');
});
for(const end of ['cancelled','expired','close']){
  test(end+' during the read-only probe cannot dispatch a script',async()=>{
    const f=setup();
    await f.queue.invoke(f.job);
    if(end==='cancelled') await f.queue.invoke({action:'cancel_wait',requestId:f.job.requestId});
    if(end==='expired') f.expire();
    if(end==='close') f.queue.close();
    f.wake(); await nextTurn();
    assert.equal((await f.queue.invoke({action:'receipt',requestId:f.job.requestId})).status,end==='close'?'cancelled':end);
    assert.equal(f.calls(),0);
  });
}
test('uncertain submission is reconciled by read-only receipt with no resend',async()=>{
  const f=setup();
  f.loseResult(); await f.queue.invoke(f.job); f.wake(); await nextTurn();
  assert.equal((await f.queue.invoke(f.job)).status,'uncertain');
  assert.equal((await f.queue.invoke({action:'receipt',requestId:f.job.requestId})).output,'42');
  assert.equal(f.calls(),1);
});
