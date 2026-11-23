import { performance } from 'node:perf_hooks';
import { traceTool } from './call-trace.mjs';
import { mcpContentBytes } from './mcp-content-size.mjs';

export const PERFORMANCE_BUILD = 'measured-content-accounting-v4-20260926';
export const TOOL_RESULT_META = Symbol('MCP tool result metadata');
export const TOOL_RESULT_CONTENT = Symbol('MCP native extra content');
const ms = value => Math.round(value * 1000) / 1000;

// Call-local timings only: no arguments, results, credentials, or user data are
// retained. handlerMs includes awaited I/O/model calls; it is NOT a claim about
// end-to-end transport latency or completion of an intentionally background job.
export async function measuredTool(handler, input, extra, redact, toolName = 'canonical') {
 return traceTool(toolName, async span => {
  const start = performance.now(); let handlerEnd;
  let bytesIn = null;
  try { bytesIn = Buffer.byteLength(JSON.stringify(input)); } catch { /* Unknown is not zero. */ }
  try {
    const { [TOOL_RESULT_META]: resultMeta, [TOOL_RESULT_CONTENT]: nativeContent, ...payload } = await handler(input, extra);
    handlerEnd = performance.now();
    if (toolName === 'pinky') payload.trace = { traceId: span.traceId, handlerStartedAtMs: span.receivedAtMs, handlerMs: ms(handlerEnd-start), lookup: { tool: toolName, action: 'trace' }, clientSentAtMs: null, clientReceivedAtMs: null, modelMs: null };
    const serialized = JSON.stringify(payload);
    const nativeOnly = ['pinky','iphone_usb','iphone_screen'].includes(toolName);
    const content = [...(nativeContent || []), { type: 'text', text: serialized }];
    const bytesOut = mcpContentBytes(content);
    const end = performance.now();
    span.phases.push({name:'mcp.packaging',elapsedMs:ms(end-handlerEnd)});
    return { content, ...(nativeOnly ? {} : { structuredContent: { result: JSON.parse(serialized) } }), _meta: { ...resultMeta, 'iphone-use/trace': { traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, receivedAtMs: span.receivedAtMs }, 'iphone-use/performance': {
      build: PERFORMANCE_BUILD, handlerMs: ms(handlerEnd-start), packagingMs: ms(end-handlerEnd), serverUntilEnvelopeMs: ms(end-start),
      executionMs: ms(handlerEnd-start), serializationMs: ms(end-handlerEnd), totalMs: ms(end-start),
      queueMs: null, bytesIn, bytesOut,
      cacheHit: null, metricScope: 'Local handler and MCP content construction; bytesOut excludes transport framing and metadata.',
      excludes: 'MCP schema validation, queue time, network, host-model reasoning; background job completion is separate',
    } } };
  } catch (error) {
    span.error = true;
    const end = performance.now();
    const content = [{ type: 'text', text: redact(error?.message || '工具執行失敗。').slice(0, 600) }];
    return { isError: true, content,
      _meta: { 'iphone-use/trace': { traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, receivedAtMs: span.receivedAtMs }, 'iphone-use/performance': { build: PERFORMANCE_BUILD, serverUntilErrorMs: ms(end-start), totalMs: ms(end-start), bytesIn, bytesOut: null, queueMs: null, cacheHit: null, error: true } } };
  }
 });
}

