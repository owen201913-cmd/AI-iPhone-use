import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { installedFeatures } from './lib/features.mjs';
import { createPermissions } from './lib/permissions.mjs';
import { instrumentTransport } from './lib/transport-trace.mjs';
import { createHostCleanup } from './lib/host-lifecycle.mjs';

const features = await installedFeatures();
const permissions = createPermissions();
const instructions = [
  features.has('usb') && 'Use iphone_usb for input and iphone_screen for screenshots of the enrolled USB iPhone.',
  features.has('pinky') && 'For Pinky semantic navigation use ensure_tab or phone_batch when available.',
  features.has('ish') && 'Use iphone_workspace for commands in the paired iSH environment.',
  'Respect device approval, pause and handoff. Consult the matching receipt after an uncertain action.',
].filter(Boolean).join(' ');
const server = new McpServer({name:'Iphone use',title:'AI-iPhone-use',version:'1.0.1'}, {instructions});
const services = [];
for (const feature of features) {
  const backend = await import('./lib/backends/' + feature + '.mjs');
  services.push(backend.register(server, permissions));
}

let checking = false;
const monitor = setInterval(async () => {
  if (checking) return;
  checking = true;
  try {
    const policy = await permissions.status().catch(() => ({enabled:false}));
    await Promise.allSettled(services.map(async service => service.check(policy)));
  } finally { checking = false; }
}, 1000);
monitor.unref();
const cleanup = createHostCleanup({
  services: [{closeAll() { clearInterval(monitor); }}, ...services],
  exit:code=>process.exit(code),report:message=>process.stderr.write(message+'\n'),
});
process.on('SIGTERM',cleanup);
process.on('SIGINT',cleanup);
const transport = new StdioServerTransport();
await server.connect(transport);
instrumentTransport(transport);
process.stdin.on('end',cleanup);
