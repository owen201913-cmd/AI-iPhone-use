import { z } from 'zod';
import { readTrace } from './call-trace.mjs';
import { readTransportTrace } from './transport-trace.mjs';
import { TOOL_RESULT_CONTENT } from './tool-performance.mjs';
export function registerPhoneTool(add, phone, permissions) {
  add('pinky', 'Prefer action:ensure_tab for a requested selected tab: expected:{app,selectedTab}, intent, fresh requestId. One call reads the current screen, taps a unique ref only if needed, and verifies. For an authorized request to open the app, set openApp:true. Include connectTask only if the request also authorizes acquiring a new Pinky session when one is missing. The app must be an exact package or bundle ID. This combines setup, launch if needed, and verification in one call. Never repeat uncertain input. For a known ordered list of named tabs use navigate_tabs with tabs:[labels], expected:{app}, intent and a fresh requestId. Each selection is verified on the device. For explicit action sequences use phone_batch. Persistent Pinky MCP connection. tools lists the current approved phone tool schemas. call uses exact tool/arguments and a fresh requestId UUID; receipt queries a previous request without replay. Same requestId never resends, including after restart. status does not launch a process; close releases this bridge. Native screenshots are returned directly. Pinky retains all device leases, approvals and takeover rules. phone_task_* autonomous AI tools are disabled; Codex decides each action. Discover tools once per session, reuse returned screens and references; never replay uncertain input. Reuse the screen returned by each action; do not add phone_observe routinely. Prefer phone_batch only for already confirmed deterministic navigation; stop partial batches and never resend completed steps. Short settle_ms may defer waiting to the next call and is not a guaranteed speedup. expected verifies a narrow app/selected-tab goal without another observe; trace retrieves local latency boundaries.', {
    names:z.array(z.string().min(1).max(80)).min(1).max(15).optional().describe('tools only: return just these tool schemas; omit for the full catalog.'),
    action:z.enum(['tools','call','receipt','status','close','trace','ensure_tab','navigate_tabs']), traceId:z.string().uuid().optional(),
    tabs:z.array(z.string().trim().min(1).max(120)).min(1).max(10).optional().describe('navigate_tabs only: up to ten ordered accessible tab names in one app.'),
    intent:z.string().trim().min(1).max(240).optional().describe('tab navigation only: purpose shown by Pinky.'),
    device:z.string().trim().min(1).max(160).optional().describe('tab navigation only: device selected in the active Pinky lease.'),
    openApp:z.boolean().optional().describe('tab navigation only: explicitly allow opening the expected app if it is not already in front.'),
    connectTask:z.string().trim().min(1).max(160).optional().describe('tab navigation with openApp:true only: acquire a missing lease scoped to the expected app under this task name.'),
    includeImage:z.boolean().optional().describe('Default true. On a new operation, false omits images from the reply and saves its original result (including images) in the local receipt for retrieval after restart. On a receipt lookup, false only filters the reply.'),
    expected:z.object({app:z.string().min(1).max(120),selectedTab:z.string().min(1).max(120).optional()}).strict().optional().describe('Read-only verification against the returned screen, never retries. Only current semantic tab/app evidence can confirm this narrow goal; settle timeout remains visible.'),
    tool:z.string().max(80).optional(), arguments:z.record(z.string(),z.json()).optional(),
    requestId:z.string().uuid().optional(),
  }, async input=>{
    if(input.action==='trace'){await permissions.require('commands');return {...readTrace(input.traceId),transport:readTransportTrace(input.traceId)};}
    if(input.traceId!==undefined)throw Error('traceId only applies to trace.');
    const receipt=await phone.invoke(input);const {result,...metadata}=receipt;
    if(!result)return metadata;
    return {...metadata,upstreamIsError:result.isError===true,[TOOL_RESULT_CONTENT]:input.includeImage===false?result.content.filter(c=>c.type!=='image'):result.content};
  },{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true});
}
