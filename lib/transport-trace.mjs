import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { withTraceContext } from './call-trace.mjs';

const completed = [];
const pending = new Map();
const round = n => Math.round(n * 1000) / 1000;
// Parsed JSON-RPC ingress and completion of the LOCAL transport write only.
// Never records arguments, response bodies, credentials or image pixels.
export function instrumentTransport(transport) {
  const receive = transport.onmessage, send = transport.send.bind(transport);
  const local = new Map();
  transport.onmessage = (message, extra) => {
    if (message?.method !== 'tools/call' || message.id === undefined) return receive?.(message, extra);
    const span = { traceId: randomUUID(), spanId: randomUUID(), receivedAtMs: Date.now(), started: performance.now(), phases: [] };
    const record = { traceId: span.traceId, ingressAtMs: span.receivedAtMs, started: span.started };
    local.set(message.id, record); pending.set(span.traceId, record);
    // Hard bounds even if a client abandons calls without receiving a response.
    if (local.size > 512) { const key = local.keys().next().value; pending.delete(local.get(key).traceId); local.delete(key); }
    if (pending.size > 512) pending.delete(pending.keys().next().value);
    return withTraceContext(span, () => receive?.(message, extra));
  };
  transport.send = async (message, options) => {
    const record = !message?.method && local.get(message?.id);
    const writeStarted = performance.now(); let failed = false;
    try { return await send(message, options); }
    catch (error) { failed = true; throw error; }
    finally {
      if (record) {
        local.delete(message.id); pending.delete(record.traceId);
        const { started, ...identity } = record;
        completed.push({ ...identity, localWriteCompletedAtMs: failed ? null : Date.now(), writeFailed: failed,
          localWriteMs: round(performance.now() - writeStarted), ingressToLocalWriteMs: round(performance.now() - started) });
        if (completed.length > 512) completed.shift();
      }
    }
  };
}

export function readTransportTrace(traceId) {
  const record = completed.find(value => value.traceId === traceId);
  if (record) return { ...record };
  const active = pending.get(traceId);
  return active ? { traceId, ingressAtMs: active.ingressAtMs, localWriteCompletedAtMs: null, pending: true } : null;
}
