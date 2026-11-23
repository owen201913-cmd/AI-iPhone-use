import test from 'node:test';
import assert from 'node:assert/strict';
import {pinkyOutcome} from '../lib/pinky-result.mjs';
test('a matching tab on a timed-out frame cannot verify a raw Pinky call', () => {
  const expected = {app:'com.apple.mobiletimer', selectedTab:'World Clock'};
  const result = pinkyOutcome({tool:'phone_tap', expected}, {content:[{type:'text', text:
    'settled · phone · settle: timeout\nscreen 390x844 · app: Clock (com.apple.mobiletimer)\n[1] tab "World Clock" @42,790 selected'
  }]});
  assert.equal(result.settleTimedOut, true);
  assert.equal(result.taskVerified, false);
  assert.equal(result.needsObservation, true);
  assert.deepEqual(result.semanticState, {});
});
test('settle timeout and app mismatch never claim task completion',()=>{
 const r=pinkyOutcome({tool:'phone_launch',arguments:{app:'com.apple.mobiletimer'}},{content:[{type:'text',text:'settled · phone · settle: timeout\nscreen 1170x2532 · app: Home Screen (com.apple.springboard)'}]});
 assert.equal(r.verification,'uncertain');assert.equal(r.expectedAppMatches,false);assert.equal(r.taskVerified,false);assert.equal(r.retryInput,false);
 const p=pinkyOutcome({tool:'phone_tap'},{content:[{type:'text',text:'approval_pending · approval_id: test'}]});assert.equal(p.upstreamStatus,'approval_pending');assert.equal(p.taskVerified,false);
});
