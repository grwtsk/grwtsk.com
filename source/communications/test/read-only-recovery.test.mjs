import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyState,parseOffices,createCase,saveDraft,reserveSend} from '../core.mjs';
import {recoverIntake,reconcilePending} from '../read-only-recovery.mjs';
const offices=parseOffices(JSON.stringify([{id:'owner-test',email:'owner@example.org',role:'Owner',scope:'Test',basis:'consented_correspondence',source:'https://example.org',verification:'Synthetic'}]));
const config={offices,from:'sender@example.net',primary:'sender@example.net',domain:'reply.example.net',githubFirst:true};
function fixture(){const state=emptyState(),c=createCase(state,offices,{officeId:'owner-test',title:'Test'},config.domain);return {state,c,store:{read:async()=>({state}),mutate:async f=>f(state)}};}
test('read-only intake recovers admitted mail and never retrieves unknown sender',async()=>{
 const {state,c,store}=fixture(),id=randomUUID(),other=randomUUID(),records=new Map();let fetches=0;
 const mail={id,from:c.office.email,to:[c.replyTo],text:'test',subject:'test',created_at:'2026-11-24T10:00:00Z',authentication:{dmarc:'pass'},attachments:[]};
 const provider={listReceived:async()=>({has_more:false,data:[mail,{...mail,id:other,from:'unknown@example.org'}]}),receive:async i=>{assert.equal(i,id);fetches++;return mail;}};
 const archive={byProviderId:async i=>records.get(i)||null,put:async r=>{records.set(r.id,r);return {created:true,record:r};}};
 assert.deepEqual(await recoverIntake(store,archive,config,provider),{complete:true});
 await recoverIntake(store,archive,config,provider);assert.equal(fetches,1);assert.equal(c.incoming.length,1);
});
test('uncertain pending receipt is reconciled only from exact evidence; never resent',async()=>{
 const {c,store,state}=fixture(),d=saveDraft(state,offices,{caseId:c.id,subject:'Test',text:'Exact text'}),m=reserveSend(state,offices,{caseId:c.id,draftId:d.id,hash:d.hash,confirm:true},config.from,'2026-11-24T00:00:00Z').message,id=randomUUID();
 const summary={id,to:[m.to],from:m.from,subject:m.subject};
 let exact=false;
 const provider={listSent:async()=>({has_more:false,data:[summary]}),sent:async()=>({...summary,text:exact?m.text:'wrong',reply_to:[m.replyTo],tags:[{name:'correspondence_id',value:m.id}]}),send:async()=>{throw Error('must never send');}};
 assert.deepEqual(await reconcilePending(store,provider),{complete:false,pending:1});assert.equal(m.status,'pending');
 exact=true;assert.deepEqual(await reconcilePending(store,provider),{complete:true,pending:0});assert.equal(m.providerId,id);
});
