import {marker,TOPICS,renderReportDraft} from './report-review.mjs';
import {IMPROVEMENTS} from './review-improvement.mjs';
import {OWNER_ID,REPORT_PREFIX,SCOPE,eligible,sections} from './report-lifecycle.mjs';
const API='https://api.github.com/repos/grwtsk/grwtsk.com';
const BOT=41898282;
const number=n=>Number.isSafeInteger(n)&&n>0&&n<=1e9;
const id=n=>Number.isSafeInteger(n)&&n>0;
const hash=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const status=['needs-scope','draft-pending','review-ready'];
const metrics=['reports','active','outcomeEvidenceReported','outstandingOwnerQuestions','overduePlannedFollowUps','improvementProposals','heldRecords','scopeQuestions'];
function validPlan(r){
  if(!r.plan||r.plan.report!==r.report||!hash(r.fingerprint)||!['ai-composed','baseline'].includes(r.method))throw Error('Invalid review plan');
  if(!Object.keys(r.plan).every(k=>['report','topic','stage','preference','sources','style','order'].includes(k)))throw Error('Unknown plan field');
  renderReportDraft(r.plan);
}
export function validateReportProjection(p){
  if(!p||p.version!==1||p.mode!=='review-only'||!Array.isArray(p.records)||p.records.length>12||!Array.isArray(p.history)||p.history.length>48)throw Error('Invalid report review projection');
  if(p.metrics===null){if(p.records.length||p.history.length)throw Error('Missing metrics');return p;}
  if(!p.metrics||!metrics.every(k=>Number.isSafeInteger(p.metrics[k])&&p.metrics[k]>=0&&p.metrics[k]<=10000)||typeof p.metrics.reportCoverage!=='boolean')throw Error('Invalid review metrics');
  const unique=new Set();
  for(const r of p.records){
    if(!r||!number(r.report)||unique.has(r.report)||!status.includes(r.status))throw Error('Invalid review record');
    unique.add(r.report);
    if(r.status==='review-ready')validPlan(r);
    if(r.answer&&(!number(r.answer.issue)||!id(r.answer.comment)||!Object.hasOwn(TOPICS,r.answer.topic)))throw Error('Invalid scope source');
  }
  for(const h of p.history){if(!number(h.report))throw Error('Invalid history');validPlan(h);}
  return p;
}
function validReport(issue){
  const s=sections(issue?.body);
  return eligible(issue)&&issue.state==='open'&&issue.title.startsWith(REPORT_PREFIX)&&
    !!s?.get('Public scope')?.split('\n').some(x=>x.trim()==='- [x] '+SCOPE);
}
function draftComment(r,history){
  const d=renderReportDraft(r.plan);
  return ['<!-- healthcare-review-v1:'+r.report+' -->','## Unsent draft for writing review','No recipient has been selected. No email may be sent in the current review phase.','',
    '**Subject:** '+d.subject,'',d.text,'','Process category: '+TOPICS[r.plan.topic].label+'.',
    'Public source issues: '+d.sourceIssues.map(n=>'#'+n).join(', ')+'.',
    'Method: '+r.method+'. Revision: '+r.fingerprint.slice(0,12)+'.',
    ...(r.answer?['Scope decision: [owner answer](https://github.com/grwtsk/grwtsk.com/issues/'+r.answer.issue+'#issuecomment-'+r.answer.comment+').']:[]),
    '','Review the wording here using ordinary feedback such as Shorter, More formal, More direct, or Plain language. Comment Writing approved when the wording is acceptable. Approval records review only and cannot authorize email delivery. General preferences are recorded in #11. This draft is a process inquiry, not an actual submission or a determination of misconduct.','',
    'Recent revision IDs: '+history.filter(h=>h.report===r.report).slice(-8).map(h=>h.fingerprint.slice(0,12)).join(', ')+'.'].join('\n');
}
const questionBody=r=>marker(r)+'\n\nA writing draft for report #'+r+' needs its process category. No private correspondence is needed.\n\nPlease reply with the applicable category:\n'+Object.values(TOPICS).map(t=>'- '+t.label).join('\n')+'\n\nYour answer is reused for this report. This issue does not authorize a recipient, disclosure, or email.';
export async function syncReportReview({token=process.env.GITHUB_TOKEN,fetcher=fetch}={}){
 if(!token)throw Error('Missing Actions token');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'GRWTSK-report-review'};
 async function call(path,method='GET',body){
   const r=await fetcher(API+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(15000),...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw Error('GitHub review synchronization failed: '+r.status);
   return {data:await r.json(),more:!!r.headers.get('link')?.includes('rel="next"')};
 }
 async function completeList(path,maxPages=5){
   const all=[];for(let page=1;page<=maxPages;page++){
     const {data,more}=await call(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page);
     if(!Array.isArray(data)||data.length>100)throw Error('Invalid issue listing');
     all.push(...data);if(!more)return all;
   }throw Error('Incomplete issue listing; refusing writes');
 }
 const response=await fetcher('https://personal-correspondence-production.up.railway.app/report-review/status',{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Report review unavailable');
 const p=validateReportProjection(await response.json());
 if(p.metrics===null)return {pending:true};
 const questions=await completeList('/issues?creator=github-actions%5Bbot%5D&state=all');
 const own=questions.filter(i=>i.user?.id===BOT&&!i.pull_request&&number(i.number)&&typeof i.body==='string');
 let created=0;
 for(const r of p.records){
   const issue=(await call('/issues/'+r.report)).data;
   if(!validReport(issue)||issue.number!==r.report)continue;
   const found=own.filter(q=>q.body.startsWith(marker(r.report)));
   if(found.length>1)throw Error('Duplicate scope marker');
   const q=found[0];
   if(r.status==='needs-scope'&&!q&&created<2&&!Object.values(TOPICS).some(t=>t.label===sections(issue.body)?.get('Process category'))){
     await call('/issues','POST',{title:'Healthcare review: process category for #'+r.report,body:questionBody(r.report)});
     created++;continue;
   }
   if(r.status!=='review-ready')continue;
   // Re-read only this report. Do not overwrite the report or any owner's comment.
   const comments=await completeList('/issues/'+r.report+'/comments',2);
   const prefix='<!-- healthcare-review-v1:'+r.report+' -->';
   const prior=comments.filter(c=>c.user?.id===BOT&&id(c.id)&&typeof c.body==='string'&&c.body.startsWith(prefix));
   if(prior.length>1)throw Error('Duplicate draft marker');
   const body=draftComment(r,p.history);
   if(!prior.length)await call('/issues/'+r.report+'/comments','POST',{body});
   else if(prior[0].body!==body)await call('/issues/comments/'+prior[0].id,'PATCH',{body});
   if(q?.state==='open'){
     // A currently supplied category or exact owner answer has resolved the one question.
     const field=sections(issue.body)?.get('Process category');
     const resolved=Object.values(TOPICS).some(t=>t.label===field)||r.answer?.issue===q.number;
     if(resolved)await call('/issues/'+q.number,'PATCH',{state:'closed'});
   }
 }
 // Keep one bounded, fixed improvement comment on the existing program issue.
 const improvement=p.improvement;
 if(improvement){
   const parent=(await call('/issues/10')).data;
   if(parent.number!==10||parent.user?.id!==OWNER_ID||parent.pull_request)throw Error('Unexpected improvement issue');
   const comments=await completeList('/issues/10/comments',2),tag='<!-- measured-review-improvement-v1 -->';
   const prior=comments.filter(c=>c.user?.id===BOT&&id(c.id)&&typeof c.body==='string'&&c.body.startsWith(tag));
   if(prior.length>1)throw Error('Duplicate improvement marker');
   const lines=[tag,'## Measured workflow review','Public report index: #8. These are workflow measurements, not clinical findings.','','- Tracked reports: '+p.metrics.reports,'- Open tracking: '+p.metrics.active,'- Missing process categories: '+p.metrics.scopeQuestions,'- Held lifecycle records: '+p.metrics.heldRecords,'- Outstanding owner questions: '+p.metrics.outstandingOwnerQuestions,'- Overdue planned follow-ups: '+p.metrics.overduePlannedFollowUps,'- Report coverage complete: '+(p.metrics.reportCoverage?'yes':'no'),'- Current review-ready drafts: '+p.records.filter(r=>r.status==='review-ready').length,'- Exact writing approvals: '+p.records.filter(r=>r.approval?.fingerprint===r.fingerprint&&id(r.approval.comment)).length,''];
   if(improvement.status==='proposal'){
     const item=IMPROVEMENTS[improvement.choice];
     if(!item||!Object.hasOwn(IMPROVEMENTS,improvement.choice)||!Number.isSafeInteger(improvement.count)||improvement.count<=0||p.metrics[item.metric]!==improvement.count||!hash(improvement.fingerprint)||!['ai-selected','baseline'].includes(improvement.method))throw Error('Invalid improvement projection');
     lines.push('### '+item.title,'Observed count: '+improvement.count+'. Method: '+improvement.method+'.','',item.proposal,'','Acceptance test: '+item.test,'','Proposed only; no code change or email is authorized.');
   }else if(['pending','no-actionable-signal'].includes(improvement.status))lines.push('No evidence-backed improvement proposal is currently available.');
   else throw Error('Invalid improvement status');
   const body=lines.join('\n');
   if(!prior.length)await call('/issues/10/comments','POST',{body});
   else if(prior[0].body!==body)await call('/issues/comments/'+prior[0].id,'PATCH',{body});
 }
 return {reportCount:p.records.length,created};
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)syncReportReview().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
