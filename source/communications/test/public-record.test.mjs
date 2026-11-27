import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyState,parseOffices,createCase,saveDraft,reserveSend,acceptSend,inbound,reviewReply} from '../core.mjs';
import {sourceForCase,sourceForArchive,preparePublicRecord,casePublicCoverage} from '../public-record.mjs';
const offices=parseOffices(JSON.stringify([{id:'official',email:'intake@example.org',role:'Synthetic office',scope:'Synthetic',basis:'official_casework',source:'https://example.org/intake',verification:'Synthetic'}]));
function fixture(){
 const s=emptyState(),c=createCase(s,offices,{officeId:'official',title:'Private title'},'replies.example.net');
 const d=saveDraft(s,offices,{caseId:c.id,subject:'Private subject',text:'PRIVATE ORIGINAL'});
 const m=reserveSend(s,offices,{caseId:c.id,draftId:d.id,hash:d.hash,confirm:true},'owner@example.net').message;
 return {s,c,m};
}
const approved={mode:'receipt',confirm:true,privacyReviewed:true,disclosureAuthorized:true};
test('only a real accepted send can generate a receipt; no private source metadata exported',()=>{
 const {s,c,m}=fixture(),input={caseId:c.id,direction:'outbound',messageId:m.id};
 assert.throws(()=>sourceForCase(s,offices,input),/provider-accepted/);
 acceptSend(s,c.id,m.id,randomUUID());const source=sourceForCase(s,offices,input);
 const r=preparePublicRecord(s,source,approved);
 for(const v of ['PRIVATE ORIGINAL','Private subject','Private title',c.office.email,m.id,m.providerId,c.id])assert.ok(!r.markdown.includes(v));
 assert.equal(r.path,'source/data/articles/formal-complaint-and-demand-for-independent-investigation/public-correspondence/'+source.day+'-'+r.id+'.md');
 assert.ok(r.markdown.includes('delivery not established'));assert.equal(r.status,'prepared-not-published');
 assert.equal(preparePublicRecord(s,source,approved).id,r.id);
 assert.equal(casePublicCoverage(s,c.id).prepared,1);
});
test('public summaries require exact disclosure review and reject contacts/links/active markup',()=>{
 const {s,c,m}=fixture();acceptSend(s,c.id,m.id,randomUUID());
 const source=sourceForCase(s,offices,{caseId:c.id,direction:'outbound',messageId:m.id});
 assert.throws(()=>preparePublicRecord(s,source,{...approved,disclosureAuthorized:false}),/authorize/);
 for(const summary of ['Contact a@example.org','Read https://example.org','<img src=x>','Call 555-123-4567'])
   assert.throws(()=>preparePublicRecord(s,source,{...approved,mode:'summary',summary}),/plain text/);
 const r=preparePublicRecord(s,source,{...approved,mode:'summary',summary:'A request for review was submitted.'});
 assert.ok(r.markdown.includes('A request for review was submitted.'));
 assert.throws(()=>preparePublicRecord(s,source,approved),/already exists/);
});
test('received record requires authenticated, reviewed reply; held archive cannot export',()=>{
 const {s,c}=fixture(),pid=randomUUID();
 inbound(s,{id:pid,from:c.office.email,to:[c.replyTo],authentication:{dmarc:'pass'},text:'PRIVATE RESPONSE'},pid,'hook');
 const r=c.incoming[0],input={caseId:c.id,direction:'inbound',messageId:r.id};
 assert.throws(()=>sourceForCase(s,offices,input),/reviewed authenticated/);
 reviewReply(s,{caseId:c.id,replyId:r.id,confirm:true});
 const source=sourceForCase(s,offices,input);
 const ar={id:pid,createdAt:r.receivedAt,from:c.office.email,authentication:{dmarc:'pass'},route:{officeId:c.office.id,disposition:'held'}};
 assert.throws(()=>sourceForArchive(ar,offices),/admitted/);
 assert.equal(sourceForArchive({...ar,route:{...ar.route,disposition:'admitted'}},offices).key,source.key);
 const p=preparePublicRecord(s,source,approved);
 assert.ok(!p.markdown.includes('PRIVATE RESPONSE'));assert.ok(!p.markdown.includes(pid));
});
