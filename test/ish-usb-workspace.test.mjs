import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createConnection} from 'node:net';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import ssh2 from 'ssh2';
import {createPhoneWorkspace} from '../lib/phone-workspace.mjs';

test('USB workspace pins the host, shares a handshake and never sends input to a changed host',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ish-usb-test-'));
  const makeKey=()=>generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs1'});
  const host=makeKey(),user=makeKey(),deviceHash='a'.repeat(64);
  const fingerprint=key=>'SHA256:'+createHash('sha256').update(ssh2.utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/,'');
  const config=hostKey=>writeFile(join(directory,'device.json'),JSON.stringify({transport:'usb',deviceHash,hostKey}));
  let handshakes=0,commands=0;
  const server=new ssh2.Server({hostKeys:[host]},client=>{
    handshakes++;client.on('error',()=>{});
    client.on('authentication',ctx=>{
      if(ctx.method==='publickey' && ctx.username==='ishwork' && ctx.key.data.equals(ssh2.utils.parseKey(user).getPublicSSH()))ctx.accept();else ctx.reject();
    }).on('ready',()=>client.on('session',accept=>accept().on('exec',accept=>{
      commands++;const s=accept();s.write('DONE\n0\n2\nok');s.exit(0);s.end();
    })));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const workspace=createPhoneWorkspace({directory,permissions:{require:async()=>{}},openUsb:async hash=>{
    assert.equal(hash,deviceHash);const sock=createConnection(server.address().port,'127.0.0.1');await once(sock,'connect');return sock;
  }});
  try{
    assert.equal((await workspace.invoke({action:'status'})).status,'not_paired');
    await writeFile(join(directory,'identity'),user);await config(fingerprint(host));
    const read=()=>workspace.invoke({action:'receipt',requestId:randomUUID()});
    const replies=await Promise.all([read(),read()]);
    assert.ok(replies.every(r=>r.output==='ok'));assert.equal(handshakes,1);
    assert.equal((await read()).reusedConnection,true);
    await config(fingerprint(user));
    const denied=await workspace.invoke({action:'run',requestId:randomUUID(),script:'echo example'});
    assert.equal(denied.status,'unavailable');assert.equal(denied.inputMayHaveRun,false);assert.equal(commands,3);
  }finally{workspace.close();server.close();await rm(directory,{recursive:true,force:true});}
});
