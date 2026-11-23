export const hasSettleTimeout = text => /^(?:\s*settle: timeout\b|(?:settled\b|step \d+: settled\b)[^\n]*\bsettle: timeout\b)/m.test(text);

export function pinkyOutcome(input, result, previous = {}) {
 const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
 const upstreamStatus = /^([a-z_]+)/.exec(text)?.[1] ?? 'unknown';
 const settleTimedOut = hasSettleTimeout(text);
 let currentApp = input.tool === 'phone_connect' || input.tool === 'phone_release' ? undefined : previous.app;
 let selectedTab = currentApp ? previous.selectedTab : undefined;
 let freshHeader=false,freshSelected=false,lastElement=false,lastOcr=false;
 // Only the terminal frame/diff can prove a goal. The carried application is
 // context for a fresh, explicit tab change, never proof on its own.
 for (const raw of text.split('\n')) {
  const line = raw.trimStart();
  if(/^step \d+:/i.test(line)){freshHeader=false;freshSelected=false;lastElement=false;lastOcr=false;continue;}
  if(/^(?:[+~] )?\[\d+\] /.test(line))lastElement=true;
  if(/\bocr "/.test(line))lastOcr=true;
  if (/^(?:[+~-] )?screen\b/.test(line)) {
    currentApp = /^(?:[+~] )?screen .*?\bapp: [^\n]*\(([^)]+)\)/.exec(line)?.[1];
    selectedTab = undefined; freshHeader=!!currentApp;freshSelected=false;lastElement=false;lastOcr=false;
  }
  const match = /^([+~\-] )?\[\d+\] tab "([^"]+)" (.*)$/.exec(line);
  if (!match) continue;
  if (match[1] === '- ' || !/(?:^|\s)selected(?:\s|$)/.test(match[3])) { if (selectedTab === match[2]) {selectedTab = undefined;freshSelected=false;} }
  else {selectedTab = match[2];freshSelected=true;}
 }
 const requestedSteps = input.tool === 'phone_batch' ? input.arguments?.steps?.length : undefined;
 const steps = [...text.matchAll(/^step (\d+):[ \t]*([a-z_]+)/gmi)].map(m => ({ index: Number(m[1]), status: m[2].toLowerCase() }));
 const partial = requestedSteps !== undefined && (/^(?:Not done:|Ran steps .+ of )/mi.test(text) || steps.length !== requestedSteps || steps.some((s, i) => s.index !== i + 1 || s.status !== 'settled'));
 const eligible = !result.isError && upstreamStatus === 'settled' && !partial && !settleTimedOut;
 const expectedApp = input.expected?.app ?? (input.tool === 'phone_launch' && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}$/.test(input.arguments?.app ?? '') ? input.arguments.app : null);
 const taskVerified = !!(input.expected && eligible && currentApp === input.expected.app && (input.expected.selectedTab
   ? freshSelected && selectedTab === input.expected.selectedTab : freshHeader));
 const range=/^Ran steps 1-(\d+) of (\d+), then stopped\b/im.exec(text);
 const upstreamReportedPrefix=range&&+range[2]===requestedSteps&&+range[1]>0&&+range[1]<requestedSteps?+range[1]:undefined;
 return { upstreamStatus, settleTimedOut, taskVerified,
  verification: taskVerified ? 'expected_semantic_state' : !eligible || input.expected ? 'uncertain' : 'upstream_settled_only',
  ...(expectedApp && currentApp ? { expectedAppMatches: expectedApp === currentApp } : {}),
  ...(requestedSteps !== undefined && { batch: { requestedSteps, reportedSteps: steps.length, upstreamSettledSteps: steps.filter(s=>s.status==='settled').length, ...(upstreamReportedPrefix!==undefined&&{upstreamReportedPrefix}), complete: !partial, steps } }),
  semanticState: eligible ? { app: currentApp, selectedTab } : {},
  observationQuality: lastElement ? 'semantic_elements' : lastOcr ? 'ocr_only' : 'no_element_evidence',
  dispatch: 'upstream_response_only', needsObservation: !eligible || (!!input.expected && !taskVerified),
  retryInput: false };
}
