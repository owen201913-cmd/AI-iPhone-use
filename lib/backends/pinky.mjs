import { z } from 'zod';
import { createPinkyBridge } from '../pinky-bridge.mjs';
import { registerPhoneTool } from '../mcp-phone.mjs';
import { measuredTool } from '../tool-performance.mjs';
import { redactSensitiveText } from '../redact.mjs';

export function register(server, permissions) {
  const phone = createPinkyBridge({permissions, clientName:'Iphone use'});
  registerPhoneTool((name, description, shape, handler, annotations) => {
    server.registerTool(name, {title:'Pinky',description,inputSchema:z.object(shape).strict(),annotations},
      (input,extra)=>measuredTool(handler,input,extra,redactSensitiveText,name));
  }, phone, permissions);
  return {
    check(policy) { return phone.enforceRevocation(policy); },
    closeAll() { return phone.close(); }
  };
}
