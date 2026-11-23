import { z } from 'zod';
import { createPhoneWorkspace } from '../phone-workspace.mjs';
import { createAvailabilityQueue } from '../ish-availability.mjs';
import { measuredTool } from '../tool-performance.mjs';
import { redactSensitiveText } from '../redact.mjs';

const requiredFields = {
  run: ['requestId', 'script'],
  background: ['requestId', 'title', 'steps'],
  receipt: ['requestId'],
  cancel_wait: ['requestId'],
};
// Keep the top-level MCP schema an object so clients can discover its fields.
const workspaceInput = z.strictObject({
  action: z.enum(['status', ...Object.keys(requiredFields)]),
  requestId: z.string().uuid().optional().describe('Required except for status. Use a new UUID for each new job and the original UUID for retries, receipt, or cancel_wait.'),
  script: z.string().min(1).max(16384).optional().describe('Required for run.'),
  environment: z.enum(['standard','continued']).optional(),
  title: z.string().min(1).max(160).optional().describe('Required for background.'),
  steps: z.array(z.string().min(1).max(16384)).min(1).max(10).optional().describe('Required for background.'),
  waitMs: z.number().int().min(0).max(40000).optional(),
  queueUntilOpenMs: z.number().int().min(1000).max(600000).optional().describe('Return immediately and wait up to this many milliseconds for iSH Workspace to open. Only for background; use receipt or cancel_wait with the same requestId. Host restart clears pending waits.'),
}).superRefine((request, ctx) => {
  for (const field of requiredFields[request.action] ?? []) {
    if (request[field] === undefined) {
      ctx.addIssue({code:'custom', path:[field], message:`${field} is required for ${request.action}.`});
    }
  }
}).meta({
  if: {properties:{action:{const:'status'}}},
  else: {oneOf:Object.entries(requiredFields).map(([action, required]) => ({
    properties:{action:{const:action}}, required,
  }))},
});

export function register(server, permissions) {
  const workspace = createPhoneWorkspace({permissions});
  const continuedWorkspace = createPhoneWorkspace({permissions,backgroundBuild:true});
  const backgroundQueue = createAvailabilityQueue({permissions,workspace:continuedWorkspace});
  server.registerTool('iphone_receipt', {
    title:'iPhone workspace receipt', description:'Read a background workspace job result without dispatching any action.',
    inputSchema:z.object({requestId:z.string().uuid()}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  }, (input,extra)=>measuredTool(async ({requestId})=>({requestId,...await backgroundQueue.invoke({action:'receipt',requestId})}),
    input,extra,redactSensitiveText,'iphone_receipt'));
  server.registerTool('iphone_workspace', {
    description:'Run shell in ~/workspace on the paired iPhone. Combine read, edit and test in one run. For work that must survive switching apps, use background with a visible title and 1–10 sequential scripts (60s each); requires iSH Workspace on iOS 26 and one foreground Start tap. For a short batch, pass waitMs (up to 40000) to receive the final exitCode/output in the same call; zero returns immediately. If still awaiting, query receipt with the same UUID and environment continued. Each app has separate files. Never replay uncertain work.',
    inputSchema:workspaceInput,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  }, (input,extra)=>measuredTool(async request=>{
    const backgroundAction=['background','cancel_wait'].includes(request.action);
    const environment=request.environment ?? (backgroundAction?'continued':'standard');
    if (backgroundAction && environment!=='continued') throw Error('Background tasks use the continued environment.');
    if (request.queueUntilOpenMs!==undefined && (request.action!=='background'||request.waitMs)) throw Error('Use queueUntilOpenMs on background with no synchronous wait.');
    const target=environment==='continued'?backgroundQueue:workspace;
    return {environment,...await target.invoke(request)};
  },input,extra,redactSensitiveText,'iphone_workspace'));
  function closeAll() {
    backgroundQueue.close();
    workspace.close();
    continuedWorkspace.close();
  }
  return {check(policy) { if (!policy.enabled || !policy.capabilities?.commands) closeAll(); }, closeAll};
}
