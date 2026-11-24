// Read-only interpretation of public owner-authored issue records.
// No email, clinical judgment, arbitrary code execution, or private data input.
export const OWNER_ID=176085483;
export const REPORT_PREFIX='[Healthcare report] ';
export const UPDATE_PREFIX='[Healthcare update] ';
export const IMPROVEMENT_PREFIX='[Healthcare improvement] ';
export const SCOPE='I have excluded confidential information and identifying third-party details.';
export const EVENTS=Object.freeze([
 'Submission planned','Submission documented','Transport receipt recorded',
 'Institutional acknowledgment reported','Institutional response reported',
 'Follow-up planned','Owner input requested','Owner input recorded',
 'Corrective action reported','Outcome evidence recorded','Close tracking','Reopen tracking'
]);
const evidenceRequired=new Set(['Submission documented','Transport receipt recorded','Institutional acknowledgment reported','Institutional response reported','Owner input requested','Owner input recorded','Corrective action reported','Outcome evidence recorded','Close tracking','Reopen tracking']);
const stageLabels=Object.freeze({
 'Submission planned':'Submission planned',
 'Submission documented':'Submission documented by reporter',
 'Transport receipt recorded':'Transport receipt reported',
 'Institutional acknowledgment reported':'Institutional acknowledgment reported',
 'Institutional response reported':'Institutional response reported',
 'Corrective action reported':'Corrective action reported',
 'Outcome evidence recorded':'Outcome evidence reported; independent verification not established'
});
export function sections(body){
 const out=new Map(),a=String(body||'').split(/^### /m);
 for(const block of a.slice(1)){
   const i=block.indexOf('\n');if(i<0)continue;
   const key=block.slice(0,i).trim(),value=block.slice(i+1).trim();
   if(out.has(key))return null;
   out.set(key,value==='_No response_'?'':value);
 }
 return out;
}
function safeNumber(n){return Number.isSafeInteger(n)&&n>0&&n<=1e9;}
function issueRef(s){const m=/^#([1-9]\d{0,8})$/.exec(s||'');return m?Number(m[1]):null;}
function isoDay(s){
 return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
function evidenceReference(s){return !!issueRef(s)||(/^https:\/\/[^\s<>"']{1,500}$/.test(s||''));}
export function eligible(i){return i&&i.user?.id===OWNER_ID&&!i.pull_request&&safeNumber(i.number)&&typeof i.title==='string'&&typeof i.body==='string'&&i.body.length<=24000&&Number.isFinite(Date.parse(i.created_at));}
function parse(i){
 if(!eligible(i))return null;
 const kind=i.title.startsWith(REPORT_PREFIX)?'report':i.title.startsWith(UPDATE_PREFIX)?'update':i.title.startsWith(IMPROVEMENT_PREFIX)?'improvement':null;
 if(!kind)return null;
 const f=sections(i.body);
 if(!f||!f.get('Public scope')?.split('\n').some(s=>s.trim()==='- [x] '+SCOPE))return {kind:'invalid',number:i.number};
 const base={kind,number:i.number,createdAt:i.created_at};
 if(kind==='report'){
   if(!f.get('Public process concern')||!f.get('Desired outcome'))return {kind:'invalid',number:i.number};
   return base;
 }
 const report=issueRef(f.get('Report issue'));
 if(!report||report===i.number)return {kind:'invalid',number:i.number};
 if(kind==='improvement'){
   if(!f.get('Observed workflow limitation')||!f.get('Proposed improvement')||!f.get('Acceptance criterion')||!evidenceReference(f.get('Evidence reference')))return {kind:'invalid',number:i.number};
   return {...base,report};
 }
 const event=f.get('Event'),evidence=f.get('Evidence reference')||'',date=f.get('Follow-up date (UTC)')||'',
   dateBasis=f.get('Date basis')||'',question=issueRef(f.get('Owner question issue'));
 if(!EVENTS.includes(event)||(evidenceRequired.has(event)&&!evidenceReference(evidence))||
   (event==='Follow-up planned'&&(!isoDay(date)||!['Internal planning date','Date communicated by institution'].includes(dateBasis)))||
   (['Owner input requested','Owner input recorded'].includes(event)&&!question))return {kind:'invalid',number:i.number};
 return {...base,report,event,...(date?{date,dateBasis}:{}),...(question?{question}:{})};
}
function model(report){return {number:report.number,stage:'Initial concern reported',closed:false,timeline:[report.number],milestones:new Set(),questions:new Map(),followUp:null,improvements:[]};}
function apply(s,u){
 if(s.closed&&u.event!=='Reopen tracking')return false;
 const had=e=>s.milestones.has(e);
 switch(u.event){
  case 'Reopen tracking':if(!s.closed)return false;s.closed=false;break;
  case 'Close tracking':s.closed=true;break;
  case 'Transport receipt recorded':
  case 'Institutional acknowledgment reported':
  case 'Institutional response reported':
   if(!had('Submission documented'))return false;
   break;
  case 'Outcome evidence recorded':
   if(!had('Corrective action reported'))return false;break;
  case 'Owner input requested':
   if(s.questions.has(u.question))return false;s.questions.set(u.question,u.number);break;
  case 'Owner input recorded':
   if(!s.questions.has(u.question)||s.questions.get(u.question)===null)return false;s.questions.set(u.question,null);break;
  case 'Follow-up planned':
   s.followUp={date:u.date,basis:u.dateBasis,source:u.number};break;
 }
 s.milestones.add(u.event);s.timeline.push(u.number);
 if(Object.hasOwn(stageLabels,u.event)){
   // A late receipt does not downgrade a reported response or outcome.
   const rank=Object.keys(stageLabels);
   if(rank.indexOf(u.event)>=rank.indexOf(Object.keys(stageLabels).find(k=>stageLabels[k]===s.stage)))s.stage=stageLabels[u.event];
 }
 return true;
}
export function buildLifecycle(issues,today){
 if(!Array.isArray(issues)||issues.length>500||!isoDay(today))throw Error('Incomplete or invalid lifecycle input');
 const seen=new Set();
 for(const i of issues){if(!safeNumber(i?.number)||seen.has(i.number))throw Error('Invalid or duplicate issue reference');seen.add(i.number);}
 const parsed=issues.map(parse).filter(Boolean).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.number-b.number);
 const reports=new Map(parsed.filter(x=>x.kind==='report').map(x=>[x.number,model(x)]));
 const held=[];
 for(const u of parsed){
   if(u.kind==='report')continue;
   if(u.kind==='invalid'){held.push(u.number);continue;}
   const s=reports.get(u.report);
   if(!s||u.number<=s.number){held.push(u.number);continue;}
   if(u.kind==='improvement'){s.improvements.push(u.number);continue;}
   if(u.question&&(!seen.has(u.question)||u.question===u.report||u.question===u.number)){held.push(u.number);continue;}
   if(!apply(s,u))held.push(u.number);
 }
 const rows=[...reports.values()].sort((a,b)=>a.number-b.number).map(s=>({
   number:s.number,stage:s.stage,tracking:s.closed?'Closed tracking':'Open tracking',
   outcomeEvidence:s.milestones.has('Outcome evidence recorded'),
   timeline:s.timeline,ownerQuestions:[...s.questions].filter(([,v])=>v!==null).map(([q])=>q),
   followUp:s.followUp?{...s.followUp,overdue:!s.closed&&s.followUp.date<today}:null,
   improvements:s.improvements
 }));
 return {reports:rows,held:held.sort((a,b)=>a-b),metrics:{
   reports:rows.length,active:rows.filter(r=>r.tracking==='Open tracking').length,
   outcomeEvidenceReported:rows.filter(r=>r.outcomeEvidence).length,
   outstandingOwnerQuestions:new Set(rows.flatMap(r=>r.ownerQuestions)).size,
   overduePlannedFollowUps:rows.filter(r=>r.followUp?.overdue).length,
   improvementProposals:rows.reduce((n,r)=>n+r.improvements.length,0)
 }};
}
const links=ns=>ns.length?ns.map(n=>'#'+n).join(', '):'—';
export function renderLifecycle(p){
 const out=['# Healthcare improvement lifecycle','Public program: #7. Correspondence infrastructure: #5 and #6. This index contains source issue references and bounded status fields only; it never sends mail.','','## Owner actions'];
 const questions=[...new Set(p.reports.flatMap(r=>r.ownerQuestions))];
 out.push(questions.length?links(questions):'No outstanding owner questions recorded.');
 out.push('','## Active and historical reports','','| Report | Latest recorded milestone | Tracking | Follow-up | Owner questions |','|---|---|---|---|---|');
 for(const r of p.reports)out.push('| #'+r.number+' | '+r.stage+' | '+r.tracking+' | '+(r.followUp?r.followUp.date+' ('+r.followUp.basis+(r.followUp.overdue?'; overdue':'')+', #'+r.followUp.source+')':'—')+' | '+links(r.ownerQuestions)+' |');
 out.push('','## Evidence and improvement links');
 for(const r of p.reports)out.push('- #'+r.number+': timeline '+links(r.timeline)+'; improvement proposals '+links(r.improvements)+'.');
 out.push('','## Process indicators','- Reports: '+p.metrics.reports,'- Active tracking: '+p.metrics.active,'- Reports with outcome evidence recorded: '+p.metrics.outcomeEvidenceReported+' (not an independent clinical finding)','- Outstanding owner questions: '+p.metrics.outstandingOwnerQuestions,'- Overdue planned follow-ups: '+p.metrics.overduePlannedFollowUps,'- Improvement proposals: '+p.metrics.improvementProposals,'','Held records (missing evidence, inconsistent progression or scope): '+links(p.held)+'.','','Milestones represent public records, not verified legal or clinical findings. Transport delivery is distinct from institutional acknowledgment. A closed issue does not establish a resolved healthcare outcome.');
 return out.join('\n');
}
