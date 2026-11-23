import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const context = new AsyncLocalStorage();
const receipts = [];
const CAPACITY = 512;
const round = value => Math.round(value * 1000) / 1000;
const safeName = value => /^[a-zA-Z0-9_.:-]{1,96}$/.test(value ?? '') ? value : 'tool';
export const activeTrace = () => context.getStore();
export const withTraceContext = (span, callback) => context.run(span, callback);

// Automatic bounded metadata only. No prompt, input text, result text, titles,
// image bytes, credentials or conversation history are retained.
export async function traceTool(name, callback) {
  const parent = activeTrace();
  const span = { traceId: parent?.traceId ?? randomUUID(), spanId: randomUUID(), parentSpanId: parent?.spanId ?? null,
    tool: safeName(name), receivedAtMs: Date.now(), started: performance.now(), phases: [] };
  return context.run(span, async () => {
    try { return await callback(span); }
    catch (error) { span.error = true; throw error; }
    finally {
      receipts.push({ traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, tool: span.tool,
        receivedAtMs: span.receivedAtMs, serviceEnvelopeMs: round(performance.now() - span.started),
        phases: span.phases.slice(0, 32), error: span.error === true,
        ...(span.outcome ? { outcome: { ...span.outcome } } : {}),
        boundaries: 'Monotonic local service span; child spans/phases overlap this inclusive total. Host queue, model and network timing are unknown.' });
      if (receipts.length > CAPACITY) receipts.splice(0, receipts.length - CAPACITY);
    }
  });
}

export function recordTraceOutcome(value) {
  const span = activeTrace(); if (!span) return;
  const outcome = {};
  for (const key of ['dispatchStatus', 'observationStatus', 'failureKind']) if (/^[a-z_]{1,64}$/.test(value?.[key] ?? '')) outcome[key] = value[key];
  if (Number.isInteger(value?.completedActions) && value.completedActions >= 0 && value.completedActions <= 8) outcome.completedActions = value.completedActions;
  if (/^[a-z_]{1,64}$/.test(value?.waitResult?.status ?? '')) outcome.waitStatus = value.waitResult.status;
  span.outcome = outcome;
}

export async function tracePhase(name, callback) {
  const span = activeTrace(), start = performance.now();
  try { return await callback(); }
  finally { if (span && span.phases.length < 32) span.phases.push({ name: safeName(name), elapsedMs: round(performance.now() - start) }); }
}

export function readTrace(traceId) {
  if (!/^[0-9a-f-]{36}$/i.test(traceId ?? '')) throw new Error('traceId must be copied from an actual receipt.');
  const spans = receipts.filter(item => item.traceId === traceId);
  return { traceId, spans: structuredClone(spans), retained: spans.length > 0, retention: 'Latest 512 local spans; absent/evicted is not zero duration.',
    hostQueueMs: null, modelMs: null, transportMs: null, totalUserWaitMs: null };
}
