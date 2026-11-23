import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPhoneWorkspace,remoteJob} from '../lib/phone-workspace.mjs';
import {receiptStore} from '../lib/ish-receipts.mjs';

const run = promisify(execFile);
const command = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh';
const makeJob = fields => remoteJob({action:'background',requestId:randomUUID(),steps:['true'],title:'test',...fields});

test('validate the handheld batch before sending any input', () => {
  assert.throws(()=>makeJob({steps:Array(11).fill('true')}));
  assert.throws(()=>makeJob({steps:[' ']}));
  assert.throws(()=>makeJob({steps:['echo a\0b']}));
  assert.throws(()=>makeJob({title:'two\nlines'}));
  assert.throws(()=>makeJob({requestId:'../x'}));
});

test('completed receipt survives a new host without crossing device bindings', async () => {
  const directory=await mkdtemp(join(tmpdir(),'ish-completed-'));
  const requestId=randomUUID(), result={requestId,status:'completed',exitCode:3,output:'failed check\n'};
  try {
    await receiptStore(directory,'device1').save(result);
    assert.deepEqual(await receiptStore(directory,'device1').read(requestId),result);
    assert.equal(await receiptStore(directory,'device2').read(requestId),undefined);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('a background job delivers stdout before release, including while the phone is later offline', async () => {
  const directory=await mkdtemp(join(tmpdir(),'ish-watch-'));
  const requestId=randomUUID();
  let notify, wake;
  const acknowledged=new Promise(r=>{notify=r;});
  const execution=new Promise(r=>{wake=r;});
  class Client extends EventEmitter {
    connect(){queueMicrotask(()=>this.emit('ready'));}
    destroy(){this.emit('close');}
    exec(cmd, callback){
      const stream=new PassThrough();
      stream.stderr=new PassThrough();
      callback(null,stream);
      const reply=s=>{stream.write(s);stream.emit('close',0);};
      if(cmd.includes('mkfifo')) queueMicrotask(()=>reply('awaiting_confirmation\n'));
      else if(cmd.includes('read -r event')) execution.then(()=>reply('EXECUTED\n0\n3\n42\n'));
      else if(cmd.includes('echo received')) queueMicrotask(()=>{reply('PENDING\n');notify();});
      else throw Error('Unexpected input, including replay');
    }
  }
  const options={directory,backgroundBuild:true,permissions:{require:async()=>{}},makeClient:()=>new Client()};
  const w=createPhoneWorkspace(options);
  try {
    await writeFile(join(directory,'device-background.json'),JSON.stringify({host:'127.0.0.1',hostKey:'SHA256:'+'A'.repeat(43)}));
    await writeFile(join(directory,'identity'),'test-only');
    const started=await w.invoke({action:'background',requestId,steps:['echo 42'],title:'check'});
    assert.equal(started.status,'awaiting_confirmation');
    const waiting=await w.invoke({action:'receipt',requestId,waitMs:5});
    assert.equal(waiting.status,'awaiting_receipt');
    wake();
    await acknowledged;
    const oneCall=await w.invoke({action:'background',requestId:randomUUID(),steps:['echo 42'],title:'one call',waitMs:3000});
    assert.equal(oneCall.receiptSource,'live_delivery');
    assert.equal(oneCall.exitCode,0);
    assert.equal(oneCall.output,'42\n');
    w.close();
    const offline=createPhoneWorkspace({...options,makeClient(){throw Error('Offline');}});
    const got=await offline.invoke({action:'receipt',requestId});
    assert.equal(got.receiptSource,'host_copy');
    assert.equal(got.output,'42\n');
    assert.equal(got.exitCode,0);
    assert.equal(got.schedulerCompletion,'unobserved');
    offline.close();
  } finally {w.close();await rm(directory,{recursive:true,force:true});}
});

test('stock build refuses a batch without staging or executing it', async () => {
  const temp = await mkdtemp(join(tmpdir(),'ish-background-'));
  try {
    const script=makeJob({steps:['echo unexpected > "$HOME/ran"']});
    const actual=await run(command,['-c',script+'\ntest ! -e "$HOME/ran"'],{env:{...process.env,HOME:temp}});
    assert.equal(actual.stdout.trim(),'NO_BG');
    const dirs=await run(command,['-c','test ! -e "$HOME/ran" && find "$HOME/.iphone-use/jobs" -mindepth 1 | wc -l'],{env:{...process.env,HOME:temp}});
    assert.equal(dirs.stdout.trim(),'0');
  } finally { await rm(temp,{recursive:true,force:true}); }
});
