import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { Fault,emptyState,createCase,parseOffices,inbound,reviewReply } from '../core.mjs';
import { mailboxRoute,admission,archiveMessage,PersonalArchive,ingestPersonal,attachPersonalReply } from '../personal-mailbox.mjs';
import { recordQuality,qualitySummary,prepareQualityReview } from '../quality.mjs';
import { suggestWritingImprovements } from '../adapters.mjs';
const offices=parseOffices(JSON.stringify([{id:'office',email:'office@example.org',role:'Synthetic office',scope:'Synthetic',basis:'official_casework',source:'https://example.org/intake',verification:'Fixture'}]));
const config={primary:'owner@example.net',primaryAlias:'forward@example.net',offices};
function fixture(){
  const state=emptyState(),c=createCase(state,offices,{officeId:'office',title:'Example'},'replies.example.net');
  const id=randomUUID(),mail={id,created_at:'2026-11-24T10:00:00.123Z',to:[config.primary],received_for:[config.primary],from:'office@example.org',subject:'Synthetic subject',text:'Private test body',html:'<script>untrusted</script>',authentication:{dmarc:'pass'},attachments:[{id:randomUUID(),filename:'test.pdf',size:1}]};
  return {state,c,id,mail};
}
test('primary and forwarding alias use envelope addresses; unrelated messages ignored',()=>{
  const {state,mail,c}=fixture();
  assert.equal(mailboxRoute(mail,state,config).primary,true);
  assert.equal(mailboxRoute({...mail,received_for:[config.primaryAlias]},state,config).primary,true);
  assert.equal(mailboxRoute({...mail,received_for:['other@example.net']},state,config).owned,false);
  assert.deepEqual(mailboxRoute({...mail,received_for:[c.replyTo]},state,config).caseIds,[c.id]);
});
test('archive address path deterministic; bounded message content',()=>{
  const {state,mail,id}=fixture(),route=mailboxRoute(mail,state,config);
  const a=archiveMessage({...mail,text:'x'.repeat(60_000)},id,route);
  assert.equal(a.day,'2026-11-24');assert.equal(a.name,'100000123-'+id+'.enc.json');
  assert.equal(a.bodyTruncated,true);assert.ok(Buffer.byteLength(a.text)<=48_000);assert.equal(a.attachmentCount,1);
});
test('private archive write once, replay reads original and no plaintext persisted',async()=>{
  const {state,mail,id}=fixture();const m=archiveMessage(mail,id,mailboxRoute(mail,state,config));
  const blobs=new Map();
  const store={repo:'test/private',branch:'main',key:randomBytes(32),ensurePrivate:async()=>{},
    call:async(p,o={})=>{
      const key=p.split('?')[0];if(o.method==='PUT'){
        if(blobs.has(key))throw new Fault(422,'exists');blobs.set(key,o.body.content);return {};
      }
      if(!blobs.has(key))throw new Fault(404,'missing');
      return {type:'file',encoding:'base64',content:blobs.get(key)};
    }};
  const a=new PersonalArchive(store);assert.equal((await a.put(m)).created,true);
  assert.equal((await a.put({...m,text:'Different'})).created,false);
  assert.equal((await a.get(m.day,m.name)).text,mail.text);
  assert.ok(!Buffer.from([...blobs.values()][0],'base64').toString().includes(mail.text));
});
test('direct primary archived without case assignment; case alias archived before link',async()=>{
  const {state,mail,c,id}=fixture(),seq=[];
  const store={read:async()=>({state}),mutate:async fn=>{seq.push('ledger');return fn(state);}};
  const archive={put:async m=>{seq.push('archive');return {created:true,record:m};}};
  await ingestPersonal(store,archive,config,mail,id,'hook',inbound);
  assert.deepEqual(seq,['archive']);assert.equal(c.incoming.length,0);
  await ingestPersonal(store,archive,config,{...mail,received_for:[c.replyTo]},id,'hook',inbound);
  assert.deepEqual(seq,['archive','archive','ledger']);assert.equal(c.incoming.length,1);
});
test('direct inbox attachment requires authorized sender, authentication, explicit confirmation; no send',()=>{
  const {state,mail,c,id}=fixture(),r=archiveMessage(mail,id,admission(mail,state,config).route);
  const args={caseId:c.id,confirm:true};
  assert.throws(()=>attachPersonalReply(state,offices,args,{...r,from:'unrelated@example.org'}),/matching/);
  assert.throws(()=>attachPersonalReply(state,offices,args,{...r,authentication:{dmarc:'unverified'}}),/matching/);
  const p=attachPersonalReply(state,offices,args,r);assert.equal(p.reviewed,false);assert.equal(c.outgoing.length,0);
  assert.throws(()=>attachPersonalReply(state,offices,args,r),/already/);
  reviewReply(state,{caseId:c.id,replyId:p.id,confirm:true});assert.equal(p.reviewed,true);
});
test('quality feedback aggregates only labels and prepares once without contacting a recipient',async()=>{
  const state=emptyState();state.knowledge={proposals:Array.from({length:5},()=>({id:randomUUID(),status:'ready',output:{text:'Sensitive synthetic message'}}))};
  for(const p of state.knowledge.proposals)recordQuality(state,{proposalId:p.id,categories:['missing-context'],confirm:true});
  assert.equal(qualitySummary(state).counts['missing-context'],5);
  let calls=0;const store={read:async()=>({state}),mutate:async fn=>fn(state)};
  const generate=async(_,summary)=>{calls++;assert.deepEqual(Object.keys(summary).sort(),['counts','sampleCount']);assert.ok(!JSON.stringify(summary).includes('Sensitive'));return {suggestions:['Use existing facts before asking questions.']};};
  assert.equal((await prepareQualityReview(store,{},generate)).status,'ready');
  assert.equal(await prepareQualityReview(store,{},generate),null);assert.equal(calls,1);
  assert.equal(state.cases.length,0);
});
test('quality API request is aggregate only and no tools',async()=>{
  const result=await suggestWritingImprovements({openaiKey:'synthetic',model:'synthetic'},{sampleCount:5,counts:{clear:3}},async(url,opts)=>{
    const b=JSON.parse(opts.body);assert.equal(b.store,false);assert.equal(b.tools,undefined);
    assert.deepEqual(JSON.parse(b.input),{sampleCount:5,counts:{clear:3}});
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"suggestions":["Be concise."]}'}]}]});
  });assert.deepEqual(result,{suggestions:['Be concise.']});
});

test('unknown and unauthenticated messages do not enter archive or ledger',async()=>{
  const {state,mail,id}=fixture();
  const store={read:async()=>({state}),mutate:async()=>assert.fail('Must not mutate ledger')};
  const archive={put:async()=>assert.fail('Must not archive excluded message')};
  assert.equal((await ingestPersonal(store,archive,config,{...mail,from:'unknown@example.org'},id,'hook',inbound)).reason,'not-on-authorized-list');
  assert.equal((await ingestPersonal(store,archive,config,{...mail,authentication:{dmarc:'fail'},headers:{'authentication-results':'dmarc=pass'}},id,'hook',inbound)).reason,'authentication-not-verified');
  assert.equal(state.cases[0].incoming.length,0);
});
test('automated listed sender is held without active case indexing',async()=>{
  const {state,mail,id,c}=fixture();let saved;
  const store={read:async()=>({state}),mutate:async()=>assert.fail('Held mail must not index')};
  const archive={put:async m=>{saved=m;return {created:true,record:m}}};
  const r=await ingestPersonal(store,archive,config,{...mail,received_for:[c.replyTo],headers:{'Auto-Submitted':'auto-replied'}},id,'hook',inbound);
  assert.equal(r.disposition,'held');assert.equal(r.caseLinked,false);
  assert.equal(saved.route.disposition,'held');
  assert.throws(()=>attachPersonalReply(state,offices,{caseId:c.id,confirm:true},saved),/admitted/);
});
