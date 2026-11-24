import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyState,parseOffices,createCase,inbound,reviewReply} from '../core.mjs';
import {createIssue,updateIssue,attachCase,linkIssues,recordFeedback,withdrawFeedbackSharing,nominateRoute,reviewNomination,issueView,groupPreview} from '../coordination.mjs';
const offices=parseOffices(JSON.stringify([{id:'office-a',email:'intake@example.org',role:'Synthetic office A',scope:'Test only',basis:'official_casework',source:'https://example.org/intake',verification:'Synthetic'}]));
function fixture(){
  const s=emptyState(),c=createCase(s,offices,{officeId:'office-a',title:'Private case title'},'reply.example.net');
  const a=createIssue(s,{title:'Private issue title',owner:'Private role label',nextAction:'Private next action',shareSummary:'Approved general process question.',shareReviewed:true});
  const b=createIssue(s,{title:'Other issue',owner:'Other role',nextAction:'Other action',shareSummary:'Other approved summary.',shareReviewed:true});
  return {s,c,a,b};
}
function reply(s,c){
  const id=randomUUID();inbound(s,{id,to:[c.replyTo],from:offices[0].email,text:'PRIVATE RAW REPLY',subject:'PRIVATE SUBJECT',authentication:{dmarc:'pass'}},id,'hook');
  return c.incoming.at(-1);
}
test('issue creation, updates and case activity are tracked without outbound changes',()=>{
  const {s,c,a}=fixture();attachCase(s,{issueId:a.id,caseId:c.id});attachCase(s,{issueId:a.id,caseId:c.id});
  const r=reply(s,c);assert.equal(issueView(s,a.id).cases[0].replies[0].id,r.id);
  assert.equal(issueView(s,a.id).cases[0].replies[0].summarized,false);
  assert.equal(a.caseIds.length,1);
  updateIssue(s,{issueId:a.id,status:'waiting',owner:'New role',nextAction:'Await review'});
  assert.equal(a.status,'waiting');assert.equal(a.shareSummary,null);
  assert.equal(c.outgoing.length,0);assert.ok(s.events.some(e=>e.type==='issue.updated'));
});
test('related links deduplicate and consolidation never transfers cases or sharing',()=>{
  const {s,c,a,b}=fixture();attachCase(s,{issueId:a.id,caseId:c.id});
  const first=linkIssues(s,{issueId:a.id,otherIssueId:b.id,relation:'related'});
  assert.equal(linkIssues(s,{issueId:b.id,otherIssueId:a.id,relation:'related'}).id,first.id);
  assert.throws(()=>linkIssues(s,{issueId:a.id,otherIssueId:b.id,relation:'consolidated-into'}),/Confirm/);
  linkIssues(s,{issueId:a.id,otherIssueId:b.id,relation:'consolidated-into',confirm:true});
  assert.equal(a.status,'consolidated');assert.deepEqual(a.caseIds,[c.id]);assert.deepEqual(b.caseIds,[]);
  assert.ok(!groupPreview(s,b.id).markdown.includes(a.shareSummary));
  assert.throws(()=>linkIssues(s,{issueId:b.id,otherIssueId:a.id,relation:'consolidated-into',confirm:true}),/active/);
});
test('feedback requires linked, reviewed authenticated reply and is deduplicated',()=>{
  const {s,c,a}=fixture(),r=reply(s,c);
  const req={issueId:a.id,caseId:c.id,replyId:r.id,summary:'Private reviewed summary',confirm:true};
  assert.throws(()=>recordFeedback(s,req),/linked/);
  attachCase(s,{issueId:a.id,caseId:c.id});assert.throws(()=>recordFeedback(s,req),/reviewed reply/);
  reviewReply(s,{caseId:c.id,replyId:r.id,confirm:true});
  const f=recordFeedback(s,req);
  assert.equal(f.evidence,'reported');assert.equal(f.shareSummary,null);
  assert.equal(issueView(s,a.id).cases[0].replies[0].summarized,true);
  assert.throws(()=>recordFeedback(s,req),/already/);
  assert.ok(!groupPreview(s,a.id).markdown.includes(f.summary));
});
test('group preview only contains explicit shareable text, not private details or other issues',()=>{
  const {s,c,a,b}=fixture();attachCase(s,{issueId:a.id,caseId:c.id});
  const r=reply(s,c);reviewReply(s,{caseId:c.id,replyId:r.id,confirm:true});
  const f=recordFeedback(s,{issueId:a.id,caseId:c.id,replyId:r.id,summary:'PRIVATE NOTE',confirm:true,
    shareSummary:'The office reported that a process review is pending.',shareReviewed:true});
  linkIssues(s,{issueId:a.id,otherIssueId:b.id,relation:'related'});
  const p=groupPreview(s,a.id);
  assert.equal(p.publication,'not_published');assert.equal(p.feedbackCount,1);
  assert.ok(p.markdown.includes(f.shareSummary));assert.ok(p.markdown.includes(a.shareSummary));
  for(const x of ['PRIVATE RAW REPLY','PRIVATE SUBJECT','PRIVATE NOTE',a.title,a.owner,a.nextAction,b.shareSummary,c.id,r.id,c.office.email])
    assert.ok(!p.markdown.includes(x),'Unexpected disclosure: '+x);
  withdrawFeedbackSharing(s,{issueId:a.id,feedbackId:f.id,confirm:true});
  assert.equal(groupPreview(s,a.id).feedbackCount,0);
});
test('no shareable summary without explicit approval and addresses rejected',()=>{
  const {s,a}=fixture();
  assert.throws(()=>createIssue(s,{title:'New',owner:'Role',nextAction:'Action',shareSummary:'Share this'}),/Explicitly review/);
  assert.throws(()=>updateIssue(s,{issueId:a.id,status:'open',owner:'Role',nextAction:'Action',shareSummary:'Contact x@example.org',shareReviewed:true}),/email addresses/);
  updateIssue(s,{issueId:a.id,status:'open',owner:'Role',nextAction:'Action'});
  assert.throws(()=>groupPreview(s,a.id),/Approve/);
});
test('nomination records official URL and review only; never authorizes email',()=>{
  const {s,a,c}=fixture();
  const input={issueId:a.id,role:'Test public office',url:'https://example.org/intake',reason:'Relevant synthetic jurisdiction'};
  const n=nominateRoute(s,input);
  assert.equal(n.status,'proposed');assert.equal(nominateRoute(s,input).id,n.id);
  assert.throws(()=>nominateRoute(s,{...input,url:'mailto:test@example.org'}),/HTTPS/);
  assert.throws(()=>nominateRoute(s,{...input,url:'https://example.org/?email=test%40example.org'}),/personal contact/);
  assert.throws(()=>nominateRoute(s,{...input,role:'test@example.org'}),/individual email/);
  const reviewed=reviewNomination(s,{nominationId:n.id,status:'route-verified',note:'Official test route checked',confirm:true});
  assert.equal(reviewed.status,'route-verified');assert.equal(s.cases.length,1);
  assert.equal(c.office.email,offices[0].email);assert.equal(c.outgoing.length,0);
  assert.equal(offices.length,1);
});
