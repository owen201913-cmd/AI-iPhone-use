import { z } from 'zod';
import { createUsbUi, usbDescription, usbInput } from '../mcp-iphone-usb.mjs';
import { measuredTool } from '../tool-performance.mjs';
import { redactSensitiveText } from '../redact.mjs';

export function register(server, permissions) {
  const usb = createUsbUi({permissions});
  server.registerTool('iphone_usb',{title:'iPhone USB',description:usbDescription,inputSchema:usbInput,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},
    (input,extra)=>measuredTool(usb.invoke,input,extra,redactSensitiveText,'iphone_usb'));
  server.registerTool('iphone_screen',{title:'查看 iPhone 畫面',description:'Read the paired iPhone screen as actual image pixels. Omit observationId for a fresh PNG. Supply the returned observationId to retrieve the same pixels, without another device capture. Use iphone_usb for input.',
    inputSchema:z.object({observationId:z.string().uuid().optional()}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
    (input,extra)=>measuredTool(()=>usb.invoke(input.observationId?{action:'image',...input}:{action:'observe'}),input,extra,redactSensitiveText,'iphone_screen'));
  return {
    check() { usb.prune(); return usb.check(); },
    closeAll() { usb.close(); }
  };
}
