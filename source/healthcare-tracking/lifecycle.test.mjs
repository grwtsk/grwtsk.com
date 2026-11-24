import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLifecycle,renderLifecycle,SCOPE,OWNER_ID} from './lifecycle.mjs';
import {sync} from './sync.mjs';
const day='2026-11-24',scope='\n\n### Public scope\n\n- [x] '+SCOPE;
const issue=(number,title,body,uid=OWNER_ID)=>({number,title,body,user:{id:uid},created_at:'2026-11-24T01:00:00Z',state:'open'});
const report=(number=10)=>issue(number,'[Healthcare report] Synthetic process gap','### Public process concern\n\nPrivate-looking text must not be copied.\n\n### Desired outcome\n\nAccessible process'+scope);
const update=(number,event,extra='')=>issue(number,'[Healthcare update] Synthetic','### Report issue\n\n#10\n\n### Event\n\n'+event+'\n\n### Evidence reference\n\nhttps://example.org/public-source'+extra+scope);
test('stages, evidence, questions and follow-up are distinct',()=>{
 const data=[report(),update(11,'Submission documented'),update(12,'Transport receipt recorded'),update(13,'Institutional acknowledgment reported'),update(14,'Institutional response reported'),issue(15,'Public question','Need public information'),update(16,'Owner input requested','\n\n### Owner question issue\n\n#15'),update(17,'Follow-up planned','\n\n### Follow-up date (UTC)\n\n2026-11-23\n\n### Date basis\n\nInternal planning date'),update(18,'Corrective action reported'),update(19,'Outcome evidence recorded')];
 const p=buildLifecycle(data,day),r=p.reports[0];
 assert.equal(r.outcomeEvidence,true);assert.equal(r.followUp.overdue,true);assert.deepEqual(r.ownerQuestions,[15]);assert.equal(p.metrics.outcomeEvidenceReported,1);assert.deepEqual(p.held,[]);
 assert.ok(!renderLifecycle(p).includes('Private-looking text'));assert.ok(!renderLifecycle(p).includes('example.org'));
 const after=buildLifecycle([...data,update(20,'Owner input recorded','\n\n### Owner question issue\n\n#15'),update(21,'Close tracking')],day);
 assert.equal(after.metrics.outstandingOwnerQuestions,0);assert.equal(after.metrics.active,0);assert.equal(after.reports[0].followUp.overdue,false);
});
test('missing evidence, premature outcome, forged update and duplicate question do not advance',()=>{
 const bad=issue(11,'[Healthcare update] Missing evidence','### Report issue\n\n#10\n\n### Event\n\nSubmission documented'+scope);
 const unauthorized={...update(13,'Submission documented'),user:{id:99}};
 const p=buildLifecycle([report(),bad,update(12,'Outcome evidence recorded'),unauthorized,update(14,'Transport receipt recorded')],day);
 assert.deepEqual(p.held,[11,12,14]);assert.equal(p.reports[0].stage,'Initial concern reported');
});
test('closing tracking is not outcome verification; replay and input order are deterministic',()=>{
 const input=[report(),update(11,'Close tracking'),update(12,'Submission documented')];
 const p=buildLifecycle(input,day);assert.equal(p.reports[0].outcomeEvidence,false);assert.equal(p.metrics.active,0);assert.deepEqual(p.held,[12]);
 assert.deepEqual(buildLifecycle(input.slice().reverse(),day),p);
 const reopened=buildLifecycle([...input,update(13,'Reopen tracking'),update(14,'Submission documented')],day);
 assert.equal(reopened.metrics.active,1);assert.equal(reopened.reports[0].stage,'Submission documented by reporter');
});
test('improvement record uses issue link and acceptance criterion, not copied prose',()=>{
 const i=issue(11,'[Healthcare improvement] Synthetic','### Report issue\n\n#10\n\n### Observed workflow limitation\n\nManual repeated work\n\n### Proposed improvement\n\nDeduplication\n\n### Acceptance criterion\n\nOne request\n\n### Evidence reference\n\n#10'+scope);
 const p=buildLifecycle([report(),i],day);assert.deepEqual(p.reports[0].improvements,[11]);assert.equal(p.metrics.improvementProposals,1);assert.ok(!renderLifecycle(p).includes('Manual repeated work'));
});
test('sync only writes fixed index and refuses incomplete input',async()=>{
 const calls=[],fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method,body:opts.body});
  if(url.includes('/issues?'))return Response.json([report(),update(11,'Submission documented')]);
  if(opts.method==='GET')return Response.json({number:8,user:{id:OWNER_ID},body:'old'});
  return Response.json({number:8});
 };
 await sync({token:'synthetic',fetcher,today:day});
 assert.deepEqual(calls.filter(c=>c.method!=='GET').map(c=>[c.method,c.url]),[['PATCH','https://api.github.com/repos/grwtsk/grwtsk.com/issues/8']]);
 assert.ok(!calls.at(-1).body.includes('Private-looking text'));
 await assert.rejects(sync({token:'synthetic',today:day,fetcher:async()=>Response.json([],{headers:{link:'<https://api.github.com/next>; rel="next"'}})}),/incomplete/);
});
