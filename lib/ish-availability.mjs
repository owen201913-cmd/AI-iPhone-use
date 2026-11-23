import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {remoteJob} from './phone-workspace.mjs';

// Only explicit, time-limited requests may wait for the pinned phone. Read-only
// probes cannot run a batch. After dispatch only receipts may be retried.
export function createAvailabilityQueue({workspace,permissions,now=Date.now,retryMs=1500}) {
  const jobs=new Map();
  const report=j=>({requestId:j.id,status:j.state,expiresAt:j.expiresAt,queueScope:'current_host_session',retryInput:false,...j.result});
  function finish(j,state,result) {
    j.state=state; j.result=result; j.controller.abort();
  }
  async function dispatch(j,request) {
    const probeId=randomUUID();
    try {
      while(j.state==='waiting_for_phone' && now()<j.expiresAt) {
        const probe=await workspace.invoke({action:'receipt',requestId:probeId},undefined,j.binding);
        if(j.state!=='waiting_for_phone') return;
        if(now()>=j.expiresAt) break;
        if(probe.status==='no_receipt') {
          await permissions.require('commands');
          if(j.state!=='waiting_for_phone' || now()>=j.expiresAt) break;
          j.state='dispatching';
          const result=await workspace.invoke({...request,waitMs:0},undefined,j.binding);
          finish(j,'submitted',result);
          return;
        }
        if(probe.nextAction!=='open_workspace_on_phone') {
          finish(j,'preflight_failed',{detail:probe.detail||probe.status,inputDispatched:false});
          return;
        }
        await delay(Math.min(retryMs,Math.max(0,j.expiresAt-now())),undefined,{signal:j.controller.signal});
      }
      if(j.state==='waiting_for_phone') finish(j,'expired',{inputDispatched:false});
    } catch(error) {
      if(j.state==='cancelled' || j.state==='expired') return;
      const uncertain=j.state==='dispatching';
      finish(j,uncertain?'uncertain':'preflight_failed',{detail:String(error.message).slice(0,180),inputMayHaveRun:uncertain});
    }
  }
  async function invoke(request) {
    await permissions.require('commands');
    if(request.queueUntilOpenMs!==undefined && (request.action!=='background' || request.waitMs)) throw Error('Queue a background job without waitMs.');
    if(request.action==='cancel_wait') {
      remoteJob({...request,action:'receipt'});
      if(request.script!==undefined || request.waitMs) throw Error('cancel_wait only takes a request ID.');
    }
    const id=request.requestId?.toLowerCase();
    for(const [key,j] of jobs) {
      if(j.state==='waiting_for_phone' && now()>=j.expiresAt) finish(j,'expired',{inputDispatched:false});
      if(j.state!=='dispatching' && j.state!=='waiting_for_phone' && now()>j.expiresAt+600000) jobs.delete(key);
    }
    const existing=jobs.get(id);
    if(existing && ['receipt','cancel_wait','background'].includes(request.action)) {
      const current=await workspace.binding().catch(error=>{if(error.code!=='ENOENT') throw error;});
      if(current!==existing.binding) return {requestId:id,status:'pairing_changed',inputDispatched:false};
    }
    if(request.action==='cancel_wait') {
      if(!existing) return {requestId:id,status:'no_local_wait'};
      if(existing.state==='waiting_for_phone') finish(existing,'cancelled',{inputDispatched:false});
      else if(['dispatching','submitted','uncertain'].includes(existing.state)) return {requestId:id,status:'already_dispatched_or_uncertain',retryInput:false};
      return report(existing);
    }
    if(request.action==='receipt' && existing) {
      if(existing.state!=='submitted' && existing.state!=='uncertain') return report(existing);
      if(existing.state==='submitted' && !['completed','uncertain','awaiting_receipt','awaiting_confirmation','running_or_interrupted','pending_or_interrupted'].includes(existing.result.status)) return report(existing);
      return workspace.invoke(request,undefined,existing.binding);
    }
    if(!request.queueUntilOpenMs && !(existing && request.action==='background')) return workspace.invoke(request);
    if(request.action!=='background') throw Error('queueUntilOpenMs requires a background job.');
    const ms=request.queueUntilOpenMs;
    if(ms!==undefined && (!Number.isInteger(ms)||ms<1000||ms>600000)) throw Error('Choose 1 second to 10 minutes.');
    if(request.script!==undefined) throw Error('script applies only to run.');
    remoteJob(request);
    const hash=createHash('sha256').update(JSON.stringify([request.title,request.steps])).digest('hex');
    const previous=j=>j.hash===hash?report(j):{requestId:id,status:'request_id_conflict',retryInput:false};
    if(existing) return previous(existing);
    const binding=await workspace.binding().catch(error=>{if(error.code!=='ENOENT') throw error;});
    if(!binding) return {requestId:id,status:'not_paired',inputDispatched:false};
    // Recheck after pairing I/O to serialize simultaneous requests for the same UUID.
    if(jobs.has(id)) {
      const current=jobs.get(id);
      return current.binding===binding?previous(current):{requestId:id,status:'pairing_changed',inputDispatched:false};
    }
    if([...jobs.values()].some(j=>j.state==='waiting_for_phone'||j.state==='dispatching')) return {requestId:id,status:'another_job_waiting',inputDispatched:false};
    if(jobs.size>=64) jobs.delete(jobs.keys().next().value);
    const j={id,hash,binding,expiresAt:now()+ms,state:'waiting_for_phone',controller:new AbortController()};
    jobs.set(id,j);
    void dispatch(j,request);
    return report(j);
  }
  function close() {
    for(const j of jobs.values()) if(j.state==='waiting_for_phone') finish(j,'cancelled',{inputDispatched:false});
  }
  return {invoke,close};
}
