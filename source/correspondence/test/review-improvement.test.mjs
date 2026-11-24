import test from 'node:test';
import assert from 'node:assert/strict';
import {improvementCandidates,improvementTick,improvementProjection} from '../review-improvement.mjs';
test('no actionable improvement is invented from empty or incomplete metrics',()=>{
 assert.deepEqual(improvementCandidates({reportCoverage:true,scopeQuestions:0,heldRecords:0}),[]);
 assert.deepEqual(improvementCandidates({reportCoverage:false,scopeQuestions:3}),[]);
});
test('improvement selection is measured, bounded and deduplicated',async()=>{
 const state={reportReview:{metrics:{reportCoverage:true,scopeQuestions:2,heldRecords:0,outstandingOwnerQuestions:0,overduePlannedFollowUps:0}}},store={read:async()=>({state}),mutate:async f=>f(state)};
 let calls=0;
 const choose=async(c,m,options)=>{calls++;assert.deepEqual(options,['scope']);return {choice:'scope',method:'ai-selected'};};
 await improvementTick(store,{},undefined,choose);await improvementTick(store,{},undefined,choose);
 assert.equal(calls,1);assert.equal(improvementProjection(state).choice,'scope');assert.equal(improvementProjection(state).count,2);
 state.reportReview.metrics.scopeQuestions=0;await improvementTick(store,{},undefined,choose);assert.equal(improvementProjection(state).status,'no-actionable-signal');
});
