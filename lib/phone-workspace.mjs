import { readFile } from 'node:fs/promises';
import { stateRoot } from './paths.mjs';
import { join } from 'node:path';
import { isIPv4 } from 'node:net';
import { createHash } from 'node:crypto';
import ssh2 from 'ssh2';
import {openIshUsb} from './ish-usb.mjs';
import {receiptStore} from './ish-receipts.mjs';

export const pairingDirectory=join(stateRoot,'ish-workspace');
const digest = text => createHash('sha256').update(text).digest('hex');
const shellQuote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const maxOutput=32768;

async function waitForCompletion(promise, deadline) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) return;
  let timer;
  try {
    const result = await Promise.race([promise, new Promise(resolve => {
      timer = setTimeout(resolve, remaining);
    })]);
    if (result?.status === 'completed') return result;
  } finally { clearTimeout(timer); }
}

function validateBatch(steps, title) {
  if (typeof title !== 'string' || !title.trim() || /[\x00-\x1f\x7f]/.test(title) || Buffer.byteLength(title) > 160)
    throw Error('Provide a short, single-line batch title for the phone.');
  if (!Array.isArray(steps) || !steps.length || steps.length > 10 ||
      steps.some(step => typeof step !== 'string' || !step.trim() || step.includes('\0')) ||
      Buffer.byteLength(steps.join('\n')) > 16384)
    throw Error('Use 1–10 shell steps totaling at most 16384 bytes.');
}

function backgroundJob(requestId, steps, title) {
  validateBatch(steps, title);
  const signature = digest(JSON.stringify(['background', title, steps]));
  const statements = [
    'set -u', 'job=$1', 'cd "$HOME/workspace" || exit 70', 'exec 9>/dev/workspace-batch || exit 69',
    'printf "%s\\n" '+shellQuote('begin '+steps.length+' '+title)+' >&9 || exit 77',
    'printf "%s\\n" running > "$job/phase.tmp" && mv "$job/phase.tmp" "$job/phase" || exit 70',
    'ulimit -f 256 || exit 70',
    'code=0; remaining='+steps.length,
    'for part in "$job"/step-*; do',
    '  timeout -s KILL 60 sh "$part" 9>&- || { code=$?; break; }',
    '  remaining=$((remaining-1))',
    '  if [ "$remaining" -gt 0 ]; then printf "step\\n" >&9 || exit 75; fi',
    'done',
    'printf "%s" "$code" > "$job/executed.tmp" && mv "$job/executed.tmp" "$job/executed" || exit 70',
    'timeout 3 sh -c '+shellQuote('echo ready > "$1/events"')+' signal "$job" 9>&- </dev/null >/dev/null 2>&1 &',
    'timeout 3 sh -c '+shellQuote('read -r ack < "$1/ack"')+' wait "$job" 9>&- || :',
    'if [ "$code" -eq 0 ]; then printf "step\\n" >&9 && printf "done\\n" >&9 || exit 75; else printf "failed\\n" >&9; fi',
    'exit "$code"'
  ];
  const supervisor = [
    'job=$1',
    'setsid sh "$job/driver" "$job" >"$job/out" 2>&1',
    'code=$?',
    'printf "%s" "$code" > "$job/code.tmp" && mv "$job/code.tmp" "$job/code"',
    'if [ ! -f "$job/executed" ]; then timeout 3 sh -c '+shellQuote('echo done > "$1/events"')+' signal "$job"; fi'
  ].join('\n');
  return [
    'if [ ! -d "$job" ] && [ ! -c /dev/workspace-batch ]; then echo NO_BG; exit 0; fi',
    'if mkdir "$job" 2>/dev/null; then',
    '  printf %s '+signature+' > "$job/hash" || exit 70',
    '  mkfifo "$job/events" "$job/ack" || exit 70',
    ...steps.map((s,i) => '  printf %s '+shellQuote(s)+' > "$job/step-'+String(i+1).padStart(2,'0')+'" || exit 70'),
    '  printf %s '+shellQuote(statements.join('\n'))+' > "$job/driver" || exit 70',
    '  echo awaiting_confirmation > "$job/phase" || exit 70',
    '  nohup sh -c '+shellQuote(supervisor)+' supervisor "$job" </dev/null >/dev/null 2>&1 &',
    'elif [ -f "$job/hash" ] && [ "$(cat "$job/hash")" != '+signature+' ]; then echo CONFLICT; exit 0; fi'
  ];
}

export function remoteJob({action,requestId,script,steps,title}) {
  if (!uuid.test(requestId)) throw Error('A request UUID is required.');
  if(action==='run' && (typeof script!=='string'||!script.trim()||script.includes('\0')||Buffer.byteLength(script)>16384)) throw Error('Use 1–16384 bytes of shell script.');
  if(!['run','background','receipt'].includes(action)) throw Error('Invalid workspace operation.');
  if(action!=='background' && (steps!==undefined || title!==undefined)) throw Error('steps and title apply only to background.');
  const lines=['umask 077','cd "$HOME" || exit 70',...(action==='receipt'?[]:['mkdir -p .iphone-use/jobs workspace || exit 70']),
    'job="$HOME/.iphone-use/jobs/'+requestId.toLowerCase()+'"'];
  if(action==='run'){
    const hash=digest(script);
    lines.push('if mkdir "$job" 2>/dev/null; then',
      '  printf %s '+hash+' > "$job/hash" || exit 70',
      '  printf %s '+shellQuote(script)+' > "$job/script" || exit 70',
      '  cd "$HOME/workspace" || exit 70',
      '  nohup sh -c '+shellQuote('job=$1; (ulimit -f 256 || exit 70; timeout -s KILL 60 sh "$job/script") >"$job/out" 2>&1; printf "%s" "$?" >"$job/code.tmp" && mv "$job/code.tmp" "$job/code"')+' worker "$job" </dev/null >/dev/null 2>&1 &',
      '  wait "$!"','elif [ -f "$job/hash" ] && [ "$(cat "$job/hash")" != '+hash+' ]; then echo CONFLICT; exit 0; fi');
  }
  if(action==='background') lines.push(...backgroundJob(requestId,steps,title));
  lines.push('if [ -f "$job/code" ]; then','  echo DONE; cat "$job/code"; echo; wc -c < "$job/out"; head -c '+maxOutput+' "$job/out"',
    'elif [ -f "$job/phase" ]; then cat "$job/phase";',
    'elif [ -d "$job" ]; then echo PENDING; else echo MISSING; fi');
  return lines.join('\n');
}

function decode(bytes) {
  const value=bytes.toString('utf8');
  const match=/^(DONE|EXECUTED)\n(\d+)\n\s*(\d+)\n/.exec(value);
  if(match) {
    if(bytes.length-Buffer.byteLength(match[0])!==Math.min(Number(match[3]),maxOutput)) throw Error('Incomplete workspace output.');
    return {status:'completed',exitCode:Number(match[2]),output:value.slice(match[0].length),truncated:Number(match[3])>maxOutput,
      ...(match[1]==='EXECUTED'?{verification:'script_exit',schedulerCompletion:'unobserved'}:{})};
  }
  const status={PENDING:'pending_or_interrupted',MISSING:'no_receipt',CONFLICT:'request_id_conflict',
    NO_BG:'background_build_required',awaiting_confirmation:'awaiting_confirmation',running:'running_or_interrupted'}[value.trim()];
  if(!status) throw Error('Invalid workspace receipt.');
  return {status,retryInput:false};
}

export function createPhoneWorkspace({directory=pairingDirectory,backgroundBuild=false,permissions,openUsb=openIshUsb,makeClient=()=>new ssh2.Client()}) {
  const pairingFile=backgroundBuild?'device-background.json':'device.json';
  const port=backgroundBuild?22483:22482;
  let session;
  function close() {const old=session;session=undefined;if(old){clearTimeout(old.timer);old.client.destroy();}}
  const watchers = new Map();
  const binding = async () => digest(await readFile(join(directory,pairingFile)));
  async function invoke(input, internal, expectedBinding) {
    const began = performance.now();
    const waitMs = input.waitMs ?? 0;
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 40000 ||
        (waitMs && !['background','receipt'].includes(input.action))) throw Error('Use waitMs from 0 to 40000 on background or receipt.');
    await permissions.require('commands');
    const {action,requestId}=input;
    if(action!=='run' && input.script!==undefined) throw Error('script applies only to run.');
    let command=action==='status'?null:remoteJob(input);
    if(internal) {
      const job='job="$HOME/.iphone-use/jobs/'+requestId.toLowerCase()+'"';
      if(internal==='ack') command=job+'; timeout 3 sh -c '+shellQuote('echo received > "$1/ack"')+' ack "$job" >/dev/null 2>&1; echo PENDING';
      else command=[job,'if [ -p "$job/events" ] && [ ! -f "$job/code" ] && [ ! -f "$job/executed" ]; then',
        '  timeout 660 sh -c '+shellQuote('read -r event < "$1/events"')+' wait "$job" || :; fi',
        'if [ -f "$job/code" ]; then echo DONE; cat "$job/code"; elif [ -f "$job/executed" ]; then echo EXECUTED; cat "$job/executed"; else echo PENDING; exit 0; fi',
        'echo; wc -c < "$job/out"; head -c '+maxOutput+' "$job/out"'].join('\n');
    }
    let config, configBinding;
    try {
      const raw=await readFile(join(directory,pairingFile));
      configBinding=digest(raw);
      if(expectedBinding && configBinding!==expectedBinding) return {status:'pairing_changed',inputDispatched:false};
      config=JSON.parse(raw);
    }
    catch(e){if(e.code==='ENOENT'){close();return {status:'not_paired',inputDispatched:false};}throw e;}
    const {host,hostKey,deviceHash}=config;
    const usb=config.transport==='usb';
    if(!/^SHA256:[A-Za-z0-9+/]{43}$/.test(hostKey) || (usb?!/^[0-9a-f]{64}$/.test(deviceHash):
      !isIPv4(host)||!(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.0\.0\.1$)/.test(host))))throw Error('Invalid local iSH pairing.');
    const key=(usb?deviceHash:host)+hostKey;
    const watchKey=key+'/'+requestId?.toLowerCase();
    const cache=backgroundBuild && command ? receiptStore(directory,digest(key)) : null;
    if(cache && action==='receipt' && !internal) {
      const start=performance.now();
      const found=await cache.read(requestId.toLowerCase());
      if(found) return {...found,receiptSource:'host_copy',elapsedMs:Math.round(performance.now()-start)};
      const pending=watchers.get(watchKey);
      if(pending) {
        const final=waitMs && await waitForCompletion(pending,began+waitMs);
        await permissions.require('commands');
        if(final) return {...final,elapsedMs:Math.round(performance.now()-began)};
        if(waitMs) return {requestId,status:'awaiting_receipt',retryInput:false,elapsedMs:Math.round(performance.now()-began)};
      }
    }
    if(session && session.key!==key)close();
    if(!command)return {status:session?.ready?'connected':'paired',workspace:'~/workspace',transport:usb?'usb':'tcp'};
    if(!session){
      const privateKey=await readFile(join(directory,'identity'));
      // Concurrent callers share one handshake, even on first use.
      if(!session){
        const client=makeClient(), entry={client,key,active:0};
        session=entry;
        entry.connected=new Promise((res,rej)=>{
          client.once('ready',()=>{entry.ready=true;res();});
          client.on('error',rej);
          client.once('close',()=>{rej(Error('SSH closed'));clearTimeout(entry.timer);if(session===entry)session=undefined;});
          (async()=>{
            const sock=usb?await openUsb(deviceHash,port):undefined;
            try {
              if(session!==entry)throw Error('Pairing changed.');
              await permissions.require('commands');
              // A suspended iSH can accept the USB socket before its SSH process runs.
              // Use the caller's wait budget on this one handshake, before dispatch.
              const readyTimeout=action==='background' && waitMs ? Math.min(25000,Math.max(5000,waitMs)) : 5000;
              client.connect({...(usb?{sock}:{host,port}),username:'ishwork',privateKey,readyTimeout,
                hostVerifier:key=>'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===hostKey});
            }catch(e){sock?.destroy();throw e;}
          })().catch(rej);
        });
      }
    }
    const entry=session, start=performance.now(), reused=!!entry.ready;
    entry.active++;clearTimeout(entry.timer);
    let sent=false;
    try{
      await entry.connected;
      await permissions.require('commands');
      const bytes=await new Promise((resolve,reject)=>{
        let stream,size=0, chunks=[];
        const finish=(error,data)=>{clearTimeout(timer);entry.client.removeListener('close',lost);error?reject(error):resolve(data);};
        const lost=()=>finish(Error('SSH disconnected'));
        entry.client.once('close',lost);
        const timer=setTimeout(()=>{finish(Error('receipt wait expired'));stream?.close();},internal==='watch'?665000:67500);
        sent=true;
        entry.client.exec(command,(err,ch)=>{
          if(err)return finish(err);
          stream=ch;
          ch.on('data',buf=>{size+=buf.length;if(size<=maxOutput+256)chunks.push(buf);else ch.close();});
          ch.stderr.resume();
          ch.on('error',error=>finish(error));
          ch.once('close',code=>code===0&&size<=maxOutput+256?finish(null,Buffer.concat(chunks)):finish(Error('Remote worker interrupted')));
        });
      });
      const result={requestId:requestId.toLowerCase(),...decode(bytes)};
      if(cache && (action==='receipt'||action==='background') && result.status==='completed') {
        await permissions.require('commands');
        const saved=await cache.save(result).then(()=>true,()=>false);
        if(saved && internal==='watch' && result.verification==='script_exit') void invoke({action:'receipt',requestId},'ack',configBinding).catch(()=>{});
      }
      if(cache && action==='background' && ['awaiting_confirmation','running_or_interrupted'].includes(result.status)) {
        let pending=watchers.get(watchKey);
        if(!pending) {
          pending=invoke({action:'receipt',requestId},'watch',configBinding).catch(()=>undefined).finally(()=>watchers.delete(watchKey));
          watchers.set(watchKey,pending);
        }
        if(waitMs) {
          const final=await waitForCompletion(pending,began+waitMs);
          await permissions.require('commands');
          if(final) return {...final,receiptSource:'live_delivery',elapsedMs:Math.round(performance.now()-began)};
          return {requestId,status:'awaiting_receipt',retryInput:false,elapsedMs:Math.round(performance.now()-began)};
        }
      }
      return {...result,reusedConnection:reused,elapsedMs:Math.round(performance.now()-start)};
    } catch(e){
      if(!sent&&session===entry&&!entry.ready)close();
      const waitingForApp=!sent && /timed out while waiting for handshake|iSH SSH port unavailable/i.test(e.message);
      return {requestId,status:sent?'uncertain':'unavailable',inputMayHaveRun:sent&&action!=='receipt',retryInput:false,detail:e.message.slice(0,180),
        ...(waitingForApp?{nextAction:'open_workspace_on_phone',app:backgroundBuild?'iSH Workspace':'iSH'}:{})};
    }
    finally{if(--entry.active===0 && entry===session){entry.timer=setTimeout(close,45000);entry.timer.unref();}}
  }
  return {invoke,close,binding};
}
