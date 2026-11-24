import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyState,createCase,parseOffices,saveDraft,reserveSend,acceptSend,inbound,reviewReply} from '../core.mjs';
import {parseSignals,planForCase,reserveProposal,finishProposal,currentProvenance,validateProposal,prepareProposal,prepareNext} from '../knowledge.mjs';
import {draftFromSignals,GitHubStore} from '../adapters.mjs';
const offices=parseOffices(JSON.stringify([{id:'office-one',email:'intake@example.org',role:'Test office',scope:'Test scope',basis:'official_casework',source:'https://example.org/intake',verification:'Synthetic'}]));
function note(id,scope,kind='request',body='Request a process explanation.',extra={}) {
  return {id,scope,kind,body,state:'active',evidence:kind==='reply-summary'?'reported':kind==='fact'?'documented':kind==='question'?'uncertain':'instruction',source:'Synthetic',reply:'none',ai:'approved',...extra};
}
function markdown(entries){return '## Communication signals v1\n\n'+entries.map(n=>'### '+n.id+'\n'+['kind','scope','state','evidence','source','reply','ai'].map(k=>k+': '+n[k]).join('\n')+'\n\n'+n.body).join('\n\n');}
function fixture(){
  const s=emptyState(),c=createCase(s,offices,{officeId:'office-one',title:'Synthetic'},'reply.example.org');
  const entries=[note('request','case:'+c.id),note('known-fact','case:'+c.id,'fact','Known fact.'),note('preference','general','preference','Be concise.')];
  return {s,c,snapshot:{entries,blob:'a'.repeat(40),commit:'b'.repeat(40)}};
}
const output=plan=>({subject:'Question',text:'Please clarify the process.',usedSignalIds:[plan.signals[0].id],missingInformation:[],coordination:'If appropriate, ask about an authorized referral.'});
test('Markdown parses strictly, rejects duplicate IDs, cross-case shared facts and unknown fields',()=>{
  const {snapshot}=fixture();
  assert.deepEqual(parseSignals(markdown(snapshot.entries)),snapshot.entries);
  assert.throws(()=>parseSignals(markdown([...snapshot.entries,snapshot.entries[0]])),/Duplicate/);
  assert.throws(()=>parseSignals(markdown([note('shared-fact','general','fact')])),/Shared signals/);
  assert.throws(()=>parseSignals(markdown(snapshot.entries).replace('kind: request','kind: unknown')),/Invalid signal/);
});
test('scope and AI approval filter; unrelated changes do not invalidate fingerprint',()=>{
  const {s,c,snapshot}=fixture();
  const p=planForCase(s,offices,c.id,snapshot);
  const q=planForCase(s,offices,c.id,{...snapshot,blob:'c'.repeat(40),entries:[...snapshot.entries,note('other','case:'+randomUUID(),'fact','Private other case.'),note('local','case:'+c.id,'fact','Do not share.',{ai:'local-only'}),note('retired','case:'+c.id,'fact','Old.',{state:'retired'})]});
  assert.equal(p.fingerprint,q.fingerprint);assert.equal(q.signals.length,3);
  const changed={...snapshot,entries:snapshot.entries.map(n=>n.id==='known-fact'?{...n,body:'Corrected fact.'}:n)};
  assert.notEqual(planForCase(s,offices,c.id,changed).fingerprint,p.fingerprint);
});
test('after first send require an authenticated reviewed reply and matching redacted summary',()=>{
  const {s,c,snapshot}=fixture();
  const d=saveDraft(s,offices,{caseId:c.id,subject:'Initial',text:'Test.'});
  const m=reserveSend(s,offices,{caseId:c.id,draftId:d.id,hash:d.hash,confirm:true},'casework@example.net','2025-01-01T00:00:00.000Z').message;
  acceptSend(s,c.id,m.id,randomUUID());
  assert.equal(planForCase(s,offices,c.id,snapshot),null);
  const id=randomUUID();inbound(s,{id,to:[c.replyTo],from:offices[0].email,text:'Sensitive raw reply',authentication:{dmarc:'pass'}},id,'hook');
  const r=c.incoming[0];reviewReply(s,{caseId:c.id,replyId:r.id,confirm:true});
  assert.equal(planForCase(s,offices,c.id,snapshot),null);
  snapshot.entries.push(note('summary','case:'+c.id,'reply-summary','The office asked for the procedure.',{reply:r.id}));
  const p=planForCase(s,offices,c.id,snapshot);
  assert.equal(p.replyId,r.id);assert.ok(!JSON.stringify(p).includes('Sensitive raw reply'));
});
test('reservation is durable and deduplicated, stale source cannot be adopted or sent',()=>{
  const {s,c,snapshot}=fixture();
  const a=reserveProposal(s,offices,c.id,snapshot);
  assert.equal(reserveProposal(s,offices,c.id,snapshot).existing,true);
  assert.throws(()=>validateProposal({...output(a.plan),usedSignalIds:['invented']},a.plan),/unknown/);
  finishProposal(s,a.proposal.id,validateProposal(output(a.plan),a.plan));
  const provenance=currentProvenance(s,offices,c.id,a.proposal.id,snapshot);
  const draft=saveDraft(s,offices,{caseId:c.id,subject:'Question',text:'Please clarify.'},provenance);
  const approval={caseId:c.id,draftId:draft.id,hash:draft.hash,confirm:true};
  assert.throws(()=>reserveSend(s,offices,approval,'casework@example.net'),/knowledge source/);
  const altered={...snapshot,entries:snapshot.entries.map(n=>n.id==='known-fact'?{...n,body:'Changed.'}:n)};
  assert.throws(()=>currentProvenance(s,offices,c.id,a.proposal.id,altered),/stale/);
  const m=reserveSend(s,offices,approval,'casework@example.net',new Date().toISOString(),provenance.fingerprint).message;
  assert.equal(m.knowledge.proposalId,a.proposal.id);
});
test('automatic worker only prepares a single internal proposal per fingerprint',async()=>{
  const {s,snapshot}=fixture();let calls=0;
  const store={readSignals:async()=>snapshot,read:async()=>({state:s}),mutate:async fn=>fn(s)};
  const generate=async(_,p)=>{calls++;return output(p);};
  const first=await prepareNext(store,{offices},generate);
  assert.equal(first.status,'ready');assert.equal(await prepareNext(store,{offices},generate),null);
  assert.equal(calls,1);assert.equal(s.cases[0].outgoing.length,0);
});
test('model receives approved bodies and role only, no raw replies, email or tools',async()=>{
  const {s,c,snapshot}=fixture(),p=planForCase(s,offices,c.id,snapshot);
  const o=await draftFromSignals({openaiKey:'fake',model:'fake'},p,async(url,opts)=>{
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);
    assert.ok(!body.input.includes(offices[0].email));assert.ok(!body.input.includes(c.id));assert.ok(!body.input.includes('Synthetic'));
    assert.ok(body.input.includes('Known fact.'));
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output(p))}]}]});
  });
  assert.equal(validateProposal(o,p).subject,'Question');
});
test('GitHub source read is private and pinned to a commit',async()=>{
  const {snapshot}=fixture(),sha='a'.repeat(40),commit='b'.repeat(40);
  const store=new GitHubStore({repo:'test/private',branch:'main',token:'fake'},async(url)=>{
    if(url.endsWith('/repos/test/private'))return Response.json({private:true,visibility:'private',full_name:'test/private'});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:commit}});
    assert.ok(url.endsWith('/contents/signals/approved.md?ref='+commit));
    return Response.json({type:'file',encoding:'base64',sha,content:Buffer.from(markdown(snapshot.entries)).toString('base64')});
  });
  const r=await store.readSignals();assert.equal(r.commit,commit);assert.equal(r.blob,sha);assert.equal(r.entries.length,3);
});
