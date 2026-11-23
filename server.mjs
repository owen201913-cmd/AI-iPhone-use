import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { installedFeatures } from './lib/features.mjs';
import { createPermissions } from './lib/permissions.mjs';
import { createPinkyBridge } from './lib/pinky-bridge.mjs';
import { registerPhoneTool } from './lib/mcp-phone.mjs';
import { measuredTool } from './lib/tool-performance.mjs';
import { redactSensitiveText } from './lib/redact.mjs';
import { instrumentTransport } from './lib/transport-trace.mjs';
import { createHostCleanup } from './lib/host-lifecycle.mjs';
import { createPhoneWorkspace } from './lib/phone-workspace.mjs';
import { createAvailabilityQueue } from './lib/ish-availability.mjs';
import { createUsbUi, usbDescription, usbInput } from './lib/mcp-iphone-usb.mjs';

const features = await installedFeatures();
const permissions = createPermissions();
const usb = features.has('usb') ? createUsbUi({permissions}) : null;
const phone = features.has('pinky') ? createPinkyBridge({permissions, clientName:'Iphone use'}) : null;
const workspace = features.has('ish') ? createPhoneWorkspace({permissions}) : null;
const continuedWorkspace = workspace ? createPhoneWorkspace({permissions,backgroundBuild:true}) : null;
const backgroundQueue = workspace ? createAvailabilityQueue({permissions,workspace:continuedWorkspace}) : null;
const instructions = [
  usb && 'Use iphone_usb for input and iphone_screen for screenshots of the enrolled USB iPhone.',
  phone && 'For Pinky semantic navigation use ensure_tab or phone_batch when available.',
  workspace && 'Use iphone_workspace for commands in the paired iSH environment.',
  'Respect device approval, pause and handoff. Consult the matching receipt after an uncertain action.',
].filter(Boolean).join(' ');
const server = new McpServer({name:'Iphone use',version:'1.0.0'}, {instructions});
if (usb) {
  server.registerTool('iphone_usb',{title:'iPhone USB',description:usbDescription,inputSchema:usbInput,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},
    (input,extra)=>measuredTool(usb.invoke,input,extra,redactSensitiveText,'iphone_usb'));
  server.registerTool('iphone_screen',{title:'查看 iPhone 畫面',description:'Read the paired iPhone screen as actual image pixels. Omit observationId for a fresh PNG. Supply the returned observationId to retrieve the same pixels, without another device capture. Use iphone_usb for input.',
    inputSchema:z.object({observationId:z.string().uuid().optional()}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
    (input,extra)=>measuredTool(()=>usb.invoke(input.observationId?{action:'image',...input}:{action:'observe'}),input,extra,redactSensitiveText,'iphone_screen'));
}

if (phone) {
  registerPhoneTool((name, description, shape, handler, annotations) => {
    server.registerTool(name, {title:'Pinky',description,inputSchema:z.object(shape).strict(),annotations},
      (input,extra)=>measuredTool(handler,input,extra,redactSensitiveText,name));
  }, phone, permissions);
}

if (workspace) {
  server.registerTool('iphone_receipt', {
    title:'iPhone workspace receipt', description:'Read a background workspace job result without dispatching any action.',
    inputSchema:z.object({requestId:z.string().uuid()}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  }, (input,extra)=>measuredTool(async ({requestId})=>({requestId,...await backgroundQueue.invoke({action:'receipt',requestId})}),
    input,extra,redactSensitiveText,'iphone_receipt'));
  server.registerTool('iphone_workspace', {
    description:'Run shell in ~/workspace on the paired iPhone. Combine read, edit and test in one run. For work that must survive switching apps, use background with a visible title and 1–10 sequential scripts (60s each); requires iSH Workspace on iOS 26 and one foreground Start tap. For a short batch, pass waitMs (up to 40000) to receive the final exitCode/output in the same call; zero returns immediately. If still awaiting, query receipt with the same UUID and environment continued. Each app has separate files. Never replay uncertain work.',
    inputSchema:z.object({action:z.enum(['status','run','background','receipt','cancel_wait']),requestId:z.string().uuid().optional(),script:z.string().min(1).max(16384).optional(),
      environment:z.enum(['standard','continued']).optional(),title:z.string().min(1).max(160).optional(),steps:z.array(z.string().min(1).max(16384)).min(1).max(10).optional(),
      waitMs:z.number().int().min(0).max(40000).optional(),
      queueUntilOpenMs:z.number().int().min(1000).max(600000).optional().describe('Return immediately and wait up to this many milliseconds for iSH Workspace to open. Only for background; use receipt or cancel_wait with the same requestId. Host restart clears pending waits.')}).strict(),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  }, (input,extra)=>measuredTool(async request=>{
    const backgroundAction=['background','cancel_wait'].includes(request.action);
    const environment=request.environment ?? (backgroundAction?'continued':'standard');
    if (backgroundAction && environment!=='continued') throw Error('Background tasks use the continued environment.');
    if (request.queueUntilOpenMs!==undefined && (request.action!=='background'||request.waitMs)) throw Error('Use queueUntilOpenMs on background with no synchronous wait.');
    const target=environment==='continued'?backgroundQueue:workspace;
    return {environment,...await target.invoke(request)};
  },input,extra,redactSensitiveText,'iphone_workspace'));
}

let checking = false;
const monitor = setInterval(async () => {
  if (checking) return;
  checking = true;
  try {
    const policy = await permissions.status().catch(()=>({enabled:false}));
    usb?.prune();
    await usb?.check();
    if(!policy.enabled || !policy.capabilities?.commands){backgroundQueue?.close();workspace?.close();continuedWorkspace?.close();}
    await phone?.enforceRevocation(policy);
  } catch { /* Keep monitoring until the outstanding session closes. */ }
  finally { checking = false; }
}, 1000);
monitor.unref();
const cleanup = createHostCleanup({
  services: [{closeAll:async()=>{clearInterval(monitor); usb?.close(); backgroundQueue?.close(); workspace?.close(); continuedWorkspace?.close(); await phone?.close();}}],
  exit:code=>process.exit(code),report:message=>process.stderr.write(message+'\n'),
});
process.on('SIGTERM',cleanup);
process.on('SIGINT',cleanup);
const transport = new StdioServerTransport();
await server.connect(transport);
instrumentTransport(transport);
process.stdin.on('end',cleanup);
