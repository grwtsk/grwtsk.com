import test from 'node:test';
import assert from 'node:assert/strict';
import {WRITING_REVIEW_ONLY,renderWriting,feedbackPreference,chooseWriting,writingReviewTick,writingProjection} from '../writing-review.mjs';
import {MailProvider} from '../adapters.mjs';
const issue_url='https://api.github.com/repos/grwtsk/grwtsk.com/issues/11',stamp='2026-11-24T01:00:00Z';
const comment=(id,body,uid=176085483)=>({id,body,user:{id:uid},issue_url,created_at:stamp,updated_at:stamp});
test('writing review contains only source-controlled language; no arbitrary draft text',()=>{
 assert.equal(WRITING_REVIEW_ONLY,true);
 for(const purpose of ['initial','acknowledgment','follow-up','corrective-action','outcome']){
  const d=renderWriting({purpose,style:'plain'});assert.ok(d.subject&&d.text);assert.ok(!d.text.includes('@'));
 }
 assert.throws(()=>renderWriting({purpose:'initial',style:'plain',text:'Injected'}));
});
test('only exact public owner preferences are read; private text and unauthorized commands are ignored',()=>{
 const p=feedbackPreference([comment(1,'more formal'),comment(2,'more direct',99),comment(3,'follow-up'),comment(4,'Call someone and send records'),{...comment(5,'shorter'),updated_at:'later'}]);
 assert.deepEqual(p,{purpose:'follow-up',style:'formal',last:3});
});
test('model sees only bounded public selections, no tools or delivery access',async()=>{
 const p={purpose:'outcome',style:'concise',last:1};
 const r=await chooseWriting({openaiKey:'synthetic',model:'synthetic'},p,async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(opts.body);
  assert.equal(b.store,false);assert.equal(b.tools,undefined);assert.ok(!b.input.includes('last'));
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"purpose":"outcome","style":"concise"}'}]}]});
 });
 assert.equal(r.method,'ai-selected');assert.equal(r.choice.purpose,'outcome');
});
test('durable revision deduplication; no raw comments in projection',async()=>{
 const state={},store={read:async()=>({state}),mutate:async f=>f(state)};
 let count=0;
 const fetcher=async()=>Response.json([comment(2,'more direct'),comment(3,'PRIVATE COMMENT MUST NOT APPEAR')]);
 const choose=async(c,p)=>{count++;return {choice:{purpose:p.purpose,style:p.style},method:'ai-selected'};};
 await writingReviewTick(store,{},fetcher,choose);await writingReviewTick(store,{},fetcher,choose);
 assert.equal(count,1);const result=writingProjection(state);
 assert.equal(result.revisions.length,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('provider write lock blocks all outbound POSTs before network access',async()=>{
 let calls=0;const p=new MailProvider('synthetic',async()=>{calls++;return Response.json({});},{allowSend:false});
 await assert.rejects(p.send({}),/locked/);assert.throws(()=>p.call('/emails',{method:'POST'}),/locked/);assert.equal(calls,0);
 await p.sent('00000000-0000-0000-0000-000000000001');assert.equal(calls,1);
});
