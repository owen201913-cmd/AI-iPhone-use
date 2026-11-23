import { activeTrace, tracePhase } from './call-trace.mjs';
import { pinkyOutcome } from './pinky-result.mjs';
import { pinkyLaunchError } from './pinky-launch-error.mjs';
import { ensurePhoneTab, navigatePhoneTabs, PHONE_APP_IDENTIFIER } from './phone-navigation.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, lstat, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { stateRoot } from './paths.mjs';
export const PHONE_TOOLS = new Set(['phone_connect','phone_observe','phone_apps','phone_tap','phone_type','phone_key','phone_launch','phone_swipe','phone_pinch','phone_drag','phone_wait_for','phone_release','phone_batch','phone_request_approval','phone_handoff']);
const COMPOUND_PHONE_BUDGET_MS = 40_000;
export function createPinkyBridge({ permissions, configFile = join(stateRoot,'pinky.json'), onResult=()=>{}, clientName = 'Iphone use (Codex)', receiptDirectory = join(stateRoot,'pinky','receipts'), connect } = {}) {
 let generation=0, session, connecting, tail=Promise.resolve(), closed=false;
 const receipts=new Map(), pendingIds=new Map();
 const validId=id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'');
 async function stored(id){if(!validId(id))throw Error('Invalid requestId');if(receipts.has(id))return receipts.get(id);try{return JSON.parse(await readFile(join(receiptDirectory,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function persist(value, first = false, retainResult = false) {
  await mkdir(receiptDirectory, {recursive:true});
  const {result, ...metadata} = value;
  const contents = JSON.stringify(retainResult ? value : metadata);
  const path = join(receiptDirectory, value.requestId + '.json');
  if (first) {
   await writeFile(path, contents, {flag:'wx'});
  } else {
   const tmp = path + '.tmp';
   await writeFile(tmp, contents);
   await rename(tmp, path);
  }
  receipts.set(value.requestId, value);
 }
 const identity={name:clientName,version:'0.3.0'};
 async function open() {
  if(closed)throw Error('Pinky bridge is closed.');
  if(session)return session;
  if(connecting)return connecting;
  connecting=(async()=>{
   const epoch=generation, started=performance.now();
   let client, transport;
   if(connect){({client,transport}=await connect());}
   else{
    const config=JSON.parse(await readFile(configFile,'utf8'));
    if(config.enabled!==true || !/^[a-f0-9]{64}$/.test(config.sha256||''))throw Error('Pinky is not configured locally.');
    const info=await lstat(config.executable);
    if(!info.isFile()||info.isSymbolicLink()||!/Pinky\.exe$/i.test(config.executable))throw Error('Invalid approved Pinky executable.');
    if(createHash('sha256').update(await readFile(await realpath(config.executable))).digest('hex')!==config.sha256)throw Error('Pinky executable changed; review the local binding before reconnecting.');
    client=new Client(identity);transport=new StdioClientTransport({command:config.executable,args:['mcp'],stderr:'pipe'});
    const launchTime=Date.now();
    await client.connect(transport,{timeout:10000}).catch(async error=>{
      await client.close().catch(()=>{});
      throw process.platform==='win32'?await pinkyLaunchError(error,config.sha256,launchTime):error;
    });
    transport.stderr?.resume();
   }
   let listing;
   try {
    listing=await client.listTools();
    if (closed || epoch !== generation) throw Error('Pinky connection was closed or revoked during startup.');
   } catch(error) { await client.close().catch(()=>{}); throw error; }
   const schemas=new Map(listing.tools.map(tool=>[tool.name,tool]));
   const live={client,transport,listing,schemas,id:randomUUID(),connectedMs:Math.round(performance.now()-started),calls:0};
   client.onclose=()=>{if(session===live)session=null;};
   session=live; return live;
  })().finally(()=>{connecting=null;});
  return connecting;
 }
 async function execute(input, queueMs) {
  await permissions.require('commands');
  if(input.names !== undefined && input.action !== 'tools') throw Error('names applies only to tools.');
  const multi=input.action==='navigate_tabs';
  const goal=multi || input.action==='ensure_tab';
  if(multi && (!Array.isArray(input.tabs) || !input.tabs.length || input.tabs.length>10 ||
    input.tabs.some(t=>typeof t!=='string'||!t.trim()||t.length>120) ||
    (input.expected?.selectedTab!==undefined && input.expected.selectedTab!==input.tabs.at(-1)))) {
    throw Error('navigate_tabs requires 1 to 10 named tabs and a matching final expected tab if specified.');
  }
  if (!multi && input.tabs!==undefined) throw Error('tabs applies only to navigate_tabs.');
  if(!goal&&(input.openApp!==undefined||input.connectTask!==undefined))
   throw Error('openApp and connectTask are only supported for ensure_tab.');
  if(input.action==='close'){
   const prior=session;session=null;await prior?.client.close();return {status:'closed',retryInput:false};
  }
  if(input.action==='receipt'){
   const receipt = pendingIds.has(input.requestId) ? receipts.get(input.requestId) : await stored(input.requestId);
   return receipt ? {...receipt,replayed:true} : pendingIds.has(input.requestId) ? {status:'pending',requestId:input.requestId,retryInput:false} : {status:'not_found',reason:'No receipt in this process; an old input must not be replayed automatically.'};
  }
  if(input.action==='status')return {connected:!!session,sessionId:session?.id,calls:session?.calls??0,modelCalls:0};
  if(input.action==='tools'){
   const live=await open();const listed=live.listing;
   return {sessionId:live.id,connectMs:live.connectedMs,tools:listed.tools.filter(t=>PHONE_TOOLS.has(t.name) && (!input.names || input.names.includes(t.name))),excluded:'Autonomous phone_task_* model tools and unreviewed extensions.'};
  }
  let connectTask;
  if(goal){
   if(!input.expected?.app||(!multi&&!input.expected?.selectedTab)||!input.intent?.trim()||input.tool!==undefined||input.arguments!==undefined)
    throw Error('ensure_tab requires expected app, selectedTab and intent; it never accepts coordinates or tool arguments.');
   if(input.openApp!==undefined&&typeof input.openApp!=='boolean')throw Error('openApp must be a boolean.');
   if(input.openApp&&!PHONE_APP_IDENTIFIER.test(input.expected.app))throw Error('openApp requires an exact app package or bundle identifier.');
   if(input.connectTask!==undefined){
    connectTask=typeof input.connectTask==='string'?input.connectTask.trim():'';
    if(input.openApp!==true||!connectTask||connectTask.length>160||/[\r\n]/.test(connectTask))
     throw Error('connectTask requires openApp and a one-line task name of at most 160 characters.');
   }
  }else if(input.action!=='call'||!PHONE_TOOLS.has(input.tool))throw Error('Only discovered Pinky execution tools are allowed; autonomous AI tasks are disabled.');
  if(!validId(input.requestId))throw Error('A new UUID requestId is required. Use receipt for uncertain operations.');
  const modifiers=input.openApp?{openApp:true,...(connectTask&&{connectTask})}:null;
  const goalSignature=[input.action,...(multi?[input.tabs]:[]),input.device??null,input.intent,input.expected,...(modifiers?[modifiers]:[])];
  const signature=createHash('sha256').update(JSON.stringify(goal?goalSignature:input.expected?[input.tool,input.arguments??{},input.expected]:[input.tool,input.arguments??{}])).digest('hex');
  const prior=await stored(input.requestId);
  if(prior){
   if(prior.signature!==signature)throw Error('Request ID conflict.');
   return {...prior,replayed:true};
  }
  if(receipts.size>=32)receipts.delete(receipts.keys().next().value);
  const reused=!!session, opening=performance.now();
  const live=await tracePhase('pinky.connect',open);const connectMs=Math.round(performance.now()-opening);
  if(!(goal?['phone_observe','phone_tap']:[input.tool]).every(name=>live.schemas.has(name)))throw Error('Tool is absent from this Pinky version. Discover current tools first.');await permissions.require('commands');
  const started=performance.now();
  // Record intent before dispatch. Connection failures never replay an input.
  const traceId=activeTrace()?.traceId;
  const intentRecord={status:'uncertain',requestId:input.requestId,signature,traceId,inputMayHaveRun:!goal,retryInput:false};
  await tracePhase('pinky.persist_intent',()=>persist(intentRecord,true));
  const upstreamStarted=performance.now(),localStartedAtMs=Date.now();
  const deviceKey=input.device??input.arguments?.device??'';
  // Never carry semantic state across explicit devices, a lease boundary, or different sessions.
  const previous=live.semanticDevice===deviceKey?live.semanticState:undefined;
  let goalMayHaveRun=false, leaseMayHaveOpened=false;
  let progress;
  const deadline=modifiers||multi?started+COMPOUND_PHONE_BUDGET_MS:Infinity;
  try{
   const call=async(name,args)=>{
    await permissions.require('commands');
    if(!live.schemas.has(name))throw Error('This Pinky version does not expose '+name);
    const timeout=Math.min(55000,Math.floor(deadline-performance.now()));
    if(timeout<1)throw Error('The phone goal exceeded its time budget.');
    live.calls++;
    // A tab goal requires an accessibility ref and selected state. OCR can
    // never supply either. Raw calls keep the user's original OCR/screenshot flags.
    const semanticRead = goal && name === 'phone_observe' &&
      live.schemas.get(name)?.inputSchema?.properties?.ocr?.type === 'boolean';
    return live.client.callTool({name,arguments:semanticRead ? {...args,ocr:false} : args},undefined,{timeout});
   };
   const markConnect=async()=>{
    await persist({...intentRecord,leaseMayHaveOpened:true});
    leaseMayHaveOpened=true;
   };
   const markInput=async()=>{
    if(goalMayHaveRun)return;
    await persist({...intentRecord,...(progress&&{steps:progress}),inputMayHaveRun:true,...(leaseMayHaveOpened&&{leaseMayHaveOpened})});
    goalMayHaveRun=true;
   };
   const navigation={...input,connectTask,call,markInput,markConnect};
   const recordStep=async steps=>{
    progress=steps.slice();
    await persist({...intentRecord,steps:progress,inputMayHaveRun:goalMayHaveRun,...(leaseMayHaveOpened&&{leaseMayHaveOpened})});
   };
   const answer=await tracePhase('pinky.upstream',()=>multi ? navigatePhoneTabs(navigation,recordStep) :
     goal ? ensurePhoneTab(navigation) : call(input.tool,input.arguments??{}));
   const result=goal?answer.result:answer;
   const upstreamMs=Math.round(performance.now()-upstreamStarted), verificationStarted=performance.now();
   const outcome=pinkyOutcome(goal?{tool:'phone_observe',expected:input.expected}:input,result,leaseMayHaveOpened?undefined:previous);
   if(goal){outcome.taskVerified=answer.goal.taskVerified;outcome.verification=answer.goal.taskVerified?'expected_semantic_state':'uncertain';outcome.needsObservation=!answer.goal.taskVerified;}
   live.semanticState=outcome.semanticState;live.semanticDevice=deviceKey;
   const verificationMs=Math.round((performance.now()-verificationStarted)*1000)/1000;
   const receipt={status:goal?answer.goal.status:result.isError?'upstream_error':'returned',requestId:input.requestId,signature,sessionId:live.id,callMs:Math.round(performance.now()-started),traceId,timing:{queueMs,connectMs,connection:reused?'reused':'cold',upstreamMs,verificationMs,localStartedAtMs,upstreamReturnedAtMs:Date.now(),inputDispatchedAtMs:null,uiChangedAtMs:null},outcome,...(goal&&{goal:answer.goal}),...(leaseMayHaveOpened&&{leaseMayHaveOpened}),inputMayHaveRun:goal?goalMayHaveRun:!['phone_observe','phone_apps','phone_wait_for'].includes(input.tool),retryInput:false,result};
   await tracePhase('pinky.persist_result',()=>persist(receipt, false, input.includeImage === false));try{void Promise.resolve(onResult(input,result,receipt)).catch(()=>{});}catch{}return receipt;
  }catch{
   live.semanticState={};
   const receipt={status:'uncertain',requestId:input.requestId,signature,sessionId:live.id,traceId,...(progress&&{steps:progress}),timing:{queueMs,connectMs,upstreamMs:Math.round(performance.now()-upstreamStarted)},...(leaseMayHaveOpened&&{leaseMayHaveOpened}),inputMayHaveRun:goal?goalMayHaveRun:true,retryInput:false,reason:'Pinky did not return a conclusive response; query state before any new action.'};
   await persist(receipt);return receipt;
  }
 }
 return {
  invoke(input) {
   if (closed) return Promise.reject(Error('Pinky bridge is closed.'));
   if (input.action === 'status') return execute(input, 0);
   // A receipt for an in-flight operation is a snapshot. Never wait behind
   // the very input whose dispatch state the caller needs to reconcile.
   if (input.action === 'receipt') return execute(input, 0);
   const id = validId(input.requestId) && input.requestId;
   const queued = performance.now();
   if (id) pendingIds.set(id, (pendingIds.get(id) || 0) + 1);
   const result = tail.then(() => execute(input, Math.round((performance.now()-queued)*1000)/1000)).finally(() => {
    if (!id) return;
    const count = pendingIds.get(id) - 1;
    if (count) pendingIds.set(id,count); else pendingIds.delete(id);
   });
   tail = result.catch(()=>{});
   return result;
  },
  hasSession(){return !!(session || connecting);},
  async enforceRevocation(policy){if(!policy.enabled||!policy.capabilities?.commands){generation++;const prior=session;session=null;await prior?.client.close();}},
  async closeAll(){return this.close();},
  async close(){closed=true;const prior=session;session=null;await prior?.client.close();await tail;const pending=await connecting?.catch(()=>null);if(pending&&pending!==prior)await pending.client.close();}
 };
}

