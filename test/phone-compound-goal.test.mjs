import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPinkyBridge} from '../lib/pinky-bridge.mjs';
import {ensurePhoneTab} from '../lib/phone-navigation.mjs';

const app = 'com.apple.mobiletimer';
const expected = {app,selectedTab:'World Clock'};
const base = {expected,intent:'Open World Clock',openApp:true,connectTask:'Read World Clock'};
const reply = (text, isError=false) => ({content:[{type:'text',text}],isError});
const noLease = reply('error: invalid_argument\nNo phone is connected in this session; call phone_connect first.',true);
const home = reply('settled\nscreen 390x844 · app: Home Screen (com.apple.springboard)');
const clock = (alreadySelected=true) => reply([
  'settled', 'screen 390x844 · app: Clock ('+app+')',
  '[1] tab "World Clock" @42,790'+(alreadySelected?' selected':''),
  '[2] tab "Stopwatch" @280,790'+(alreadySelected?'':' selected')
].join('\n'));

async function runGoal(responses, fields={}) {
  const calls = [];
  const traces = [];
  const goal = await ensurePhoneTab({
    ...base, ...fields,
    markConnect:async()=>{traces.push('markConnect');},
    markInput:async()=>{traces.push('markInput');},
    call:async(name,args)=>{
      calls.push({name,args});
      assert.ok(responses.length,'Unexpected '+name);
      traces.push(name);
      return responses.shift();
    }
  });
  assert.equal(responses.length,0);
  return {goal:goal.goal,calls,traces};
}

test('combine replay-safe scoped connect, exact launch and tab verification in one request',async()=>{
  const tap = reply('settled\n~ [1] tab "World Clock" @42,790 selected');
  const {goal,calls,traces}=await runGoal([noLease,home,clock(false),tap],{device:'test phone'});
  assert.deepEqual(calls,[
    {name:'phone_observe',args:{device:'test phone',screenshot:false}},
    {name:'phone_connect',args:{device:'test phone',task:base.connectTask,apps:[app]}},
    {name:'phone_launch',args:{device:'test phone',app,intent:base.intent}},
    {name:'phone_tap',args:{device:'test phone',ref:1,intent:base.intent}}
  ]);
  assert.deepEqual(traces,['phone_observe','markConnect','phone_connect','markInput','phone_launch','markInput','phone_tap']);
  assert.equal(goal.taskVerified,true);
  assert.equal(goal.reads,1);
  assert.equal(goal.connects,1);
  assert.equal(goal.launches,1);
  assert.equal(goal.taps,1);
});

test('complete current or connect frame avoids redundant launch and observe',async()=>{
  const active=await runGoal([clock()]);
  assert.equal(active.goal.taskVerified,true);
  assert.equal(active.goal.connects,0);
  assert.equal(active.goal.launches,0);
  const connected=await runGoal([noLease,clock()]);
  assert.equal(connected.goal.taskVerified,true);
  assert.equal(connected.goal.connects,1);
  assert.equal(connected.goal.launches,0);
  assert.equal(connected.goal.inputMayHaveRun,false);
  const namedLeaseMissing = reply(
    'error: invalid_argument\nThis session is not connected to My Phone; call phone_connect with device "device-001" first.',true
  );
  const bareApp = reply(clock().content[0].text.replace('Clock ('+app+')',app));
  const named = await runGoal([namedLeaseMissing,bareApp],{device:'My Phone'});
  assert.equal(named.goal.connects,1);
  assert.equal(named.goal.taskVerified,true);
});

test('a settle timeout triggers a readback and never repeats a tap or launch', async () => {
  const timeout = reply(clock().content[0].text.replace('settled', 'settled · phone · settle: timeout'));
  const confirmed = await runGoal([clock(false), timeout, clock()]);
  assert.deepEqual(confirmed.calls.map(call => call.name), ['phone_observe','phone_tap','phone_observe']);
  assert.equal(confirmed.goal.taskVerified, true);
  const changed = await runGoal([clock(false), timeout, clock(false)]);
  assert.equal(changed.goal.taskVerified, false);
  assert.equal(changed.goal.taps, 1);
  const unstable = await runGoal([timeout, timeout]);
  assert.equal(unstable.goal.taskVerified, false);
  assert.equal(unstable.goal.taps, 0);
  const launched = await runGoal([home, timeout, clock()]);
  assert.deepEqual(launched.calls.map(call => call.name), ['phone_observe','phone_launch','phone_observe']);
  assert.equal(launched.goal.taskVerified, true);
});

test('only a confirmed missing lease can connect; an incomplete launch is observed only once',async()=>{
  for(const initial of [
    reply('error: invalid_argument\nChoose a device first.',true),
    reply(clock().content[0].text.replace(' · app: ',' · locked · app: ')),
    reply('paused\nThe person is using the phone.'),
    reply('stopped'),
    reply('approval_pending')
  ]) {
    const attempt=await runGoal([initial]);
    assert.equal(attempt.goal.taskVerified,false);
    assert.equal(attempt.goal.connects,0);
    assert.equal(attempt.goal.launches,0);
  }
  const partial = await runGoal([home,reply('settled'),clock()]);
  assert.equal(partial.goal.taskVerified,true);
  assert.deepEqual(partial.calls.map(x=>x.name),['phone_observe','phone_launch','phone_observe']);
  const uncertain = await runGoal([home,reply('approval_pending')]);
  assert.equal(uncertain.goal.reason,'launch_not_confirmed');
  assert.equal(uncertain.goal.inputMayHaveRun,true);
  assert.equal(uncertain.goal.taps,0);
});

test('a possibly opened lease persists before dispatch and survives restart without replay',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pinky-compound-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const request={action:'ensure_tab',requestId:randomUUID(),...base};
  const ledger=join(directory,request.requestId+'.json');
  let count=0;
  const deps={
    receiptDirectory:directory,
    permissions:{require:async()=>{}},
    connect:async()=>({client:{
      listTools:async()=>({tools:['phone_observe','phone_connect','phone_launch','phone_tap'].map(name=>({name}))}),
      callTool:async({name},_schema,{timeout})=>{
        count++;
        assert.ok(timeout>0 && timeout<=40_000);
        if(name==='phone_observe')return noLease;
        assert.equal(name,'phone_connect');
        const pending=JSON.parse(await readFile(ledger,'utf8'));
        assert.equal(pending.leaseMayHaveOpened,true);
        assert.equal(pending.inputMayHaveRun,false);
        throw Error('disconnected while connecting');
      },
      close:async()=>{}
    }})
  };
  const first=createPinkyBridge(deps);
  const result=await first.invoke(request);
  assert.equal(result.status,'uncertain');
  assert.equal(result.leaseMayHaveOpened,true);
  assert.equal(result.inputMayHaveRun,false);
  await first.close();

  const second=createPinkyBridge(deps);
  const saved=await second.invoke(request);
  assert.equal(saved.replayed,true);
  assert.equal(saved.leaseMayHaveOpened,true);
  await assert.rejects(second.invoke({...request,connectTask:'Another task'}),/conflict/);
  await assert.rejects(second.invoke({...request,openApp:false}),/requires openApp/);
  await assert.rejects(second.invoke({...request,expected:{...expected,app:'https://example.com'}}),/exact app/);
  assert.equal(count,2);
  await second.close();
});
