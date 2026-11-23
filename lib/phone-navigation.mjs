// Pinky's own full accessibility screen is the sole source of tap references.
// Never infer a tab from OCR, a cached label, or arbitrary screen coordinates.
export const PHONE_APP_IDENTIFIER = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;

export function parsePhoneScreen(text) {
  let app, tabs = [], ambiguous = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^(?:[+~-] )?screen\b/.test(line)) {
      const fields = line.split(' · ');
      const description = fields.find(field=>field.startsWith('app: '))?.slice(5) ?? '';
      const id = /\(([^()]+)\)$/.exec(description)?.[1];
      app = /^screen \d+x\d+$/.test(fields[0]) && !fields.includes('locked')
        ? id ?? (PHONE_APP_IDENTIFIER.test(description) ? description : undefined)
        : undefined;
      tabs = []; ambiguous = false; continue;
    }
    const tab = /^\[(\d+)\] tab "([^"\r\n]+)" (.+)$/.exec(line);
    if (tab && app) {
      if (tabs.some(t => t.ref === +tab[1])) ambiguous = true;
      tabs.push({ ref: +tab[1], name: tab[2], selected: /(?:^|\s)selected(?:\s|$)/.test(tab[3]),
        enabled: !/(?:^|\s)(?:disabled|hidden|offscreen)(?:\s|$)/i.test(tab[3]) });
    }
  }
  return { app, tabs, ambiguous };
}
export const phoneText = result => (result?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');

function settled(result) {
  return !!result && !result.isError && /^settled\b/.test(phoneText(result));
}

function missingPhoneLease(result, device) {
  if (result?.isError !== true) return false;
  const [status, message] = phoneText(result).split(/\r?\n/);
  if (status !== 'error: invalid_argument') return false;
  return message === 'No phone is connected in this session; call phone_connect first.' ||
    !!device && /^This session is not connected to [^\r\n]+; call phone_connect with device "[^"\r\n]+" first\.$/.test(message);
}

function tabTarget(screen, label) {
  if (screen.ambiguous || screen.tabs.filter(t => t.selected).length !== 1) return undefined;
  const matches = screen.tabs.filter(t => t.name === label);
  return matches.length === 1 && matches[0].enabled ? matches[0] : undefined;
}

// A goal is not an instruction to press an already-selected button. Each
// mutation uses the upstream lease and ref from a full, current observation.
export async function ensurePhoneTab({ expected, device, intent, openApp, connectTask, call, markInput, markConnect, initialScreen }) {
  const scope = device ? { device } : {};
  let reads = 0, taps = 0, launches = 0, connects = 0;
  const observe = async () => { reads++; return call('phone_observe', { ...scope, screenshot:false }); };
  const receipt = (result,status,reason) => ({ result, goal: { status, reason, reads, taps,
    ...(openApp && { connects, launches }),
    inputMayHaveRun:taps > 0 || launches > 0, taskVerified:status === 'verified', retryInput:false } });

  let initial = initialScreen ?? await observe();
  if (connectTask && missingPhoneLease(initial, device)) {
    await markConnect();
    connects++;
    initial = await call('phone_connect', { ...scope, task:connectTask, apps:[expected.app] });
    if (!settled(initial)) return receipt(initial,'blocked','connection_not_confirmed');
  }
  if (!settled(initial)) return receipt(initial,'blocked','observation_not_settled');
  let current = parsePhoneScreen(phoneText(initial));
  // A fresh, complete connect or launch result is itself an observation.
  // When a step supplied only a partial screen, read once before planning input.
  async function refreshIncompleteScreen() {
    if (current.app && (current.app !== expected.app || current.tabs.length)) return;
    initial = await observe();
    current = settled(initial) ? parsePhoneScreen(phoneText(initial)) : {};
  }
  if (connects) await refreshIncompleteScreen();
  if (current.app !== expected.app) {
    if (!openApp || !current.app) return receipt(initial,'blocked','expected_app_not_foreground');
    await markInput();
    launches++;
    initial = await call('phone_launch', { ...scope, app:expected.app, intent });
    if (!settled(initial)) return receipt(initial,'uncertain','launch_not_confirmed');
    current = parsePhoneScreen(phoneText(initial));
    await refreshIncompleteScreen();
    if (current.app !== expected.app) return receipt(initial,'uncertain','launched_app_not_verified');
  }
  const target = tabTarget(current, expected.selectedTab);
  if (!target) return receipt(initial, launches ? 'uncertain' : 'blocked','tab_missing_disabled_or_ambiguous');
  if (target.selected) return receipt(initial,'verified',launches ? 'selected_on_app_open' : 'already_selected');
  await markInput();
  taps++;
  const action = await call('phone_tap', { ...scope, ref:target.ref, intent });
  if (!settled(action)) return receipt(action,'uncertain','tap_not_confirmed');
  const verify = r => {
    if (!settled(r)) return false;
    const screen = parsePhoneScreen(phoneText(r));
    return screen.app === expected.app && tabTarget(screen,expected.selectedTab)?.selected === true;
  };
  if (verify(action)) return receipt(action,'verified','tab_selected');
  const lines=phoneText(action).split('\n').map(s=>s.trim());
  const changed=lines.flatMap(l=>{
    const m=/^([+~-]) \[(\d+)\] tab "([^"]+)" (.*)$/.exec(l);
    return m ? [{op:m[1],ref:+m[2],name:m[3],selected:/(?:^|\s)selected(?:\s|$)/.test(m[4]),enabled:!/(?:^|\s)(?:disabled|hidden|offscreen)(?:\s|$)/i.test(m[4])}] : [];
  });
  if (!lines.some(l=>/^(?:[+~-] )?screen\b|\bapp:|\b(?:approval_pending|paused)\b/i.test(l)) &&
      changed.filter(t=>t.ref===target.ref).length===1 && changed.filter(t=>t.op!=='-'&&t.selected).length===1 &&
      changed.some(t=>t.ref===target.ref&&t.name===target.name&&t.op!=='-'&&t.selected&&t.enabled))
    return receipt(action,'verified','current_ref_selected_in_diff');
  // One read-only full check if the action returned a diff/no proof. Never tap twice.
  const afterApp = parsePhoneScreen(phoneText(action)).app;
  if (afterApp && afterApp !== expected.app) return receipt(action,'uncertain','foreground_changed');
  const check = await observe();
  return verify(check) ? receipt(check,'verified','selected_on_readback') : receipt(check,'uncertain','selection_not_verified');
}

// Only a complete same-call screen can supply refs for the next selection.
// Diffs can verify the preceding step but require a fresh read for a new target.
export async function navigatePhoneTabs(input, recordStep) {
  const steps=[];
  let initialScreen, answer;
  let reads=0, taps=0, launches=0, connects=0;
  for (const [index,tab] of input.tabs.entries()) {
    answer=await ensurePhoneTab({...input, initialScreen,
      openApp:index===0 && input.openApp, connectTask:index===0 ? input.connectTask : undefined,
      expected:{app:input.expected.app,selectedTab:tab}});
    reads+=answer.goal.reads; taps+=answer.goal.taps;
    launches+=answer.goal.launches??0; connects+=answer.goal.connects??0;
    steps.push({tab,status:answer.goal.status,taps:answer.goal.taps,reason:answer.goal.reason});
    await recordStep(steps);
    if (!answer.goal.taskVerified) break;
    const screen=parsePhoneScreen(phoneText(answer.result));
    initialScreen=settled(answer.result) && screen.app===input.expected.app &&
      !screen.ambiguous && screen.tabs.length ? answer.result : undefined;
  }
  return {result:answer.result,goal:{...answer.goal,reads,taps,launches,connects,steps,
    inputMayHaveRun:taps>0||launches>0,completedSteps:steps.filter(step=>step.status==='verified').length}};
}
