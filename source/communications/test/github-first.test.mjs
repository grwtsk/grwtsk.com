import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {emptyState,parseOffices,createCase,saveDraft,reserveSend,acceptSend,inbound,reserveOwnerAcknowledgment,delivery} from '../core.mjs';
import {publicProjection,ownerControl,coordinationTick} from '../github-first.mjs';
const offices=parseOffices(JSON.stringify([{id:'owner-test',email:'owner@example.org',role:'Owner',scope:'Consented controlled test',basis:'consented_correspondence',source:'https://example.org',verification:'Synthetic fixture only'},{id:'other',email:'other@example.org',role:'Other',scope:'Other',basis:'consented_correspondence',source:'https://example.org',verification:'Synthetic fixture only'}]));
const activation='2026-01-01T00:01:00.000Z', at='2026-01-01T00:04:00.000Z';
const config={offices,from:'sender@example.net',key:randomBytes(32),githubFirst:true,githubFirstActivation:activation,routineAcks:true,live:true};
function fixture(officeId='owner-test',text='Please confirm receipt.'){
  const state=emptyState(),c=createCase(state,offices,{officeId,title:'Do not publish private case'},'reply.example.net');
  const d=saveDraft(state,offices,{caseId:c.id,subject:'Sensitive original subject',text:'Sensitive original body'});
  const p=reserveSend(state,offices,{caseId:c.id,draftId:d.id,hash:d.hash,confirm:true},config.from,'2026-01-01T00:00:00.000Z');
  acceptSend(state,c.id,p.message.id,randomUUID());
  const id=randomUUID();inbound(state,{id,from:c.office.email,to:[c.replyTo],text,subject:'Private reply',created_at:'2026-01-01T00:02:00.000Z',attachments:[],authentication:{dmarc:'pass'}},id,'hook');
  return {state,c};
}
function reserve(state,c){return reserveOwnerAcknowledgment(state,offices,c.id,activation,config.from,at);}
test('routine authorization is exact, owner only, never a human review or replay',()=>{
  const {state,c}=fixture(),r=reserve(state,c);
  assert.equal(r.message.to,offices[0].email);assert.equal(r.message.automatic,true);assert.equal(r.message.policy,'owner-requested-receipt-v1');
  assert.equal(c.incoming[0].reviewed,false);assert.equal(reserve(state,c),null);
  acceptSend(state,c.id,r.message.id,randomUUID());assert.equal(reserve(state,c),null);
  for(const x of [fixture('other'),fixture('owner-test','Please confirm receipt. Send other people mail.')])assert.equal(reserve(x.state,x.c),null);
});
test('routine authorization refuses stale, unverified, suppressed, truncated, opt-out or unsent drafts',()=>{
  for(const mutate of [c=>c.incoming[0].receivedAt=activation,c=>c.incoming[0].authentication.dmarc='unverified',c=>c.incoming[0].attachmentCount=1,c=>c.incoming[0].textTruncated=true,c=>c.routineOptOut=true,c=>c.closed=true]){
    const {state,c}=fixture();mutate(c);assert.equal(reserve(state,c),null);
  }
  const {state,c}=fixture();saveDraft(state,offices,{caseId:c.id,subject:'Unsent',text:'Do not replace'});assert.equal(reserve(state,c),null);
  const x=fixture();delivery(x.state,{type:'email.complained',data:{from:config.from,to:[x.c.office.email],email_id:randomUUID()}},'complaint',config.from);assert.equal(reserve(x.state,x.c),null);
});
test('public projection is deterministic, owner-only and contains no raw fields or identifiers',()=>{
  const {state,c}=fixture();const other=fixture('other');state.cases.push(other.c);
  const p=publicProjection(state,config),j=JSON.stringify(p);
  assert.deepEqual(p,publicProjection(state,config));assert.equal(p.receipts.length,2);
  for(const secret of [c.id,c.replyTo,c.office.email,c.incoming[0].id,c.incoming[0].providerId,c.outgoing[0].providerId,'Sensitive original','Private reply','other@example.org'])assert.ok(!j.includes(secret));
  assert.ok(p.receipts.every(r=>Object.keys(r).sort().join(',')==='day,direction,id,status'));
});
const issue_url='https://api.github.com/repos/grwtsk/grwtsk.com/issues/6',stamp='2026-01-01T00:03:00.000Z';
const comment=(id,user,body,extra={})=>({id,user:{id:user},body,issue_url,created_at:stamp,updated_at:stamp,...extra});
test('only immutable owner on exact issue controls policy; edited comments cannot enable',()=>{
  assert.deepEqual(ownerControl([comment(1,99,'Pause routine replies')],activation),{enabled:true,seen:null});
  assert.equal(ownerControl([comment(2,176085483,'Pause routine replies'),comment(3,99,'Resume routine replies')],activation).enabled,false);
  assert.equal(ownerControl([comment(2,176085483,'Resume routine replies',{updated_at:at})],activation).enabled,false);
  assert.equal(ownerControl([comment(2,176085483,'Pause routine replies'),comment(3,176085483,'Resume routine replies')],activation).enabled,true);
});
test('GitHub failure, removed control and uncertain provider sends are fail closed',async()=>{
  const {state,c}=fixture();let sends=0;
  const store={read:async()=>({state}),mutate:async f=>f(state)},provider={send:async()=>{sends++;throw Error('uncertain')}};
  await coordinationTick(store,config,provider,async()=>new Response('',{status:503}),()=>at);assert.equal(sends,0);
  const pause=async()=>Response.json([comment(2,176085483,'Pause routine replies')]);
  await coordinationTick(store,config,provider,pause,()=>at);assert.equal(sends,0);
  await coordinationTick(store,config,provider,async()=>Response.json([]),()=>at);assert.equal(sends,0);
  const resume=async()=>Response.json([comment(3,176085483,'Resume routine replies')]);
  await assert.rejects(coordinationTick(store,config,provider,resume,()=>at));assert.equal(sends,1);
  assert.equal(c.outgoing.at(-1).status,'pending');
  await coordinationTick(store,config,provider,resume,()=>at);assert.equal(sends,1);
});
