import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReportDraft,reportReviewTick,reportReviewProjection,questionTopic,marker} from '../report-review.mjs';
import {OWNER_ID,SCOPE} from '../report-lifecycle.mjs';
const stamp='2026-11-24T00:00:00Z';
const report=(n=20,topic='Accessible written communication',uid=OWNER_ID)=>({number:n,title:'[Healthcare report] Example',user:{id:uid},created_at:stamp,updated_at:stamp,body:'### Public process concern\n\nPRIVATE PROSE MUST NOT BE COPIED\n\n### Desired outcome\n\nA process improvement\n\n### Process category\n\n'+topic+'\n\n### Public scope\n\n- [x] '+SCOPE});
test('only closed catalog text appears in drafts',()=>{
 const p={report:20,topic:'records',stage:'initial',style:'plain',order:'topic-first',sources:[20]};
 const d=renderReportDraft(p);assert.match(d.text,/record/);assert.ok(!d.text.includes('@'));
 assert.throws(()=>renderReportDraft({...p,topic:'untrusted'}));
});
test('report-linked draft revision is deduplicated and raw public prose is excluded',async()=>{
 const state={},store={read:async()=>({state}),mutate:async f=>f(state)};
 let calls=0;
 const fetcher=async url=>Response.json([report(),report(21,'Record integrity',99)]);
 const generate=async(c,p)=>{calls++;return {plan:{...p,style:'balanced',order:'topic-first'},method:'ai-composed'};};
 await reportReviewTick(store,{},fetcher,generate,'2026-11-24');await reportReviewTick(store,{},fetcher,generate,'2026-11-24');
 assert.equal(calls,1);
 const p=reportReviewProjection(state);assert.equal(p.records.length,1);assert.equal(p.records[0].report,20);assert.equal(p.records[0].status,'review-ready');assert.ok(!JSON.stringify(p).includes('PRIVATE'));
});
test('missing scope becomes a bounded question, exact owner reply resolves it',async()=>{
 const state={},store={read:async()=>({state}),mutate:async f=>f(state)};
 let answer=false;
 const comment={id:100,user:{id:OWNER_ID},issue_url:'https://api.github.com/repos/grwtsk/grwtsk.com/issues/21',created_at:stamp,updated_at:stamp,body:'Record integrity'};
 const fetcher=async url=>url.includes('/comments?')?Response.json(answer?[comment]:[]):url.includes('github-actions')?Response.json([{number:21,user:{id:41898282},body:marker(20)}]):Response.json([report(20,'')]);
 const generate=async(c,p)=>({plan:{...p,style:'balanced',order:'topic-first'},method:'baseline'});
 await reportReviewTick(store,{},fetcher,generate,'2026-11-24');assert.equal(reportReviewProjection(state).records[0].status,'needs-scope');
 answer=true;await reportReviewTick(store,{},fetcher,generate,'2026-11-24');assert.equal(reportReviewProjection(state).records[0].plan.topic,'records');
 assert.equal(questionTopic([{...comment,user:{id:9}}],21,20),null);
});

test('synchronizer writes a safe scope question once and never sends mail',async()=>{
 const {syncReportReview}=await import('../sync-report-review.mjs');
 let created=0;
 const p={version:1,mode:'review-only',day:'2026-11-24',records:[{report:20,status:'needs-scope'}],history:[],metrics:{reports:1,active:1,outcomeEvidenceReported:0,outstandingOwnerQuestions:0,overduePlannedFollowUps:0,improvementProposals:0,heldRecords:0,scopeQuestions:1,reportCoverage:true}};
 const fetcher=async(url,opts={})=>{
   if(url.endsWith('/report-review/status'))return Response.json(p);
   if(url.includes('creator=github-actions'))return Response.json(created?[{number:21,user:{id:41898282},state:'open',body:marker(20)}]:[]);
   if(url.endsWith('/issues/20'))return Response.json({...report(20,''),state:'open'});
   if(url.endsWith('/issues')&&opts.method==='POST'){
     created++;const b=JSON.parse(opts.body);assert.ok(b.body.startsWith(marker(20)));assert.ok(!b.body.includes('PRIVATE'));return Response.json({number:21});
   }
   throw Error('Unexpected path');
 };
 await syncReportReview({token:'synthetic',fetcher});await syncReportReview({token:'synthetic',fetcher});assert.equal(created,1);
});
test('report synchronization comments only on owner-authored report using rendered catalog',async()=>{
 const {syncReportReview}=await import('../sync-report-review.mjs');
 const plan={report:20,topic:'records',stage:'initial',style:'plain',order:'topic-first',sources:[20]};
 const rec={report:20,status:'review-ready',method:'ai-composed',fingerprint:'a'.repeat(64),plan};
 const p={version:1,mode:'review-only',day:'2026-11-24',records:[rec],history:[rec],metrics:{reports:1,active:1,outcomeEvidenceReported:0,outstandingOwnerQuestions:0,overduePlannedFollowUps:0,improvementProposals:0,heldRecords:0,scopeQuestions:0,reportCoverage:true}};
 let writes=0;
 const fetcher=async(url,opts={})=>{
  if(url.endsWith('/report-review/status'))return Response.json(p);
  if(url.includes('creator=github-actions'))return Response.json([]);
  if(url.endsWith('/issues/20'))return Response.json({...report(20),state:'open'});
  if(url.includes('/comments?'))return Response.json([]);
  if(url.endsWith('/issues/20/comments')&&opts.method==='POST'){
   writes++;const body=JSON.parse(opts.body).body;assert.match(body,/Unsent draft/);assert.ok(!body.includes('PRIVATE'));return Response.json({id:99});
  }throw Error('Unexpected path');
 };
 await syncReportReview({token:'synthetic',fetcher});assert.equal(writes,1);
});
