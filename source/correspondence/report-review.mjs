// Public healthcare process review. Closed vocabulary; no private mail,
// recipient selection, external claims, or dispatch capability.
import {digest,requireThat} from './core.mjs';
import {buildLifecycle,eligible,sections,REPORT_PREFIX,SCOPE,OWNER_ID} from './report-lifecycle.mjs';
export const TOPICS=Object.freeze({
 accessibility:{label:'Accessible written communication',request:'Please describe the accessible written channels available for raising a concern and receiving a response.',goal:'A clear written process that reduces avoidable administrative burden.'},
 review:{label:'Independent review',request:'Please explain the available review process, including how independence and potential conflicts are addressed.',goal:'A documented and appropriately independent review process.'},
 records:{label:'Record integrity',request:'Please explain the process for requesting review or correction of a record while preserving the original and its audit history.',goal:'A reliable, traceable process for addressing record accuracy.'},
 continuity:{label:'Continuity of care',request:'Please explain how a patient can request an appropriate care coordinator, accessible communication and continuity of care.',goal:'A documented process for coordinating access to care.'},
 accountability:{label:'Corrective action accountability',request:'Please explain how process improvements are documented, assigned and evaluated.',goal:'Observable corrective actions supported by evidence.'}
});
export const STAGES=Object.freeze({
 initial:{subject:'Request for an accessible healthcare process',request:'Please identify the applicable intake procedure and how acknowledgment and next steps can be obtained.'},
 acknowledgment:{subject:'Request for documented acknowledgment',request:'Please clarify how acknowledgment is recorded and how the responsible office and next steps are identified.'},
 followup:{subject:'Request for a written process update',request:'Please explain how a written status update and any applicable next steps can be obtained.'},
 corrective:{subject:'Request for clarification of corrective actions',request:'Please identify the process for documenting proposed changes, implementation responsibility and completion criteria.'},
 outcome:{subject:'Request for outcome evidence',request:'Please explain what evidence can demonstrate implementation and whether the intended improvement was achieved.'}
});
const STYLES={balanced:'I am requesting information about the applicable healthcare process.',concise:'I am seeking clarification of the applicable process.',formal:'I respectfully request clarification of the applicable healthcare procedures.',plain:'I would like to understand the process and what a patient can do next.',direct:'Please clarify the applicable healthcare process.'};
const URL='https://api.github.com/repos/grwtsk/grwtsk.com';
const num=n=>Number.isSafeInteger(n)&&n>0&&n<=1e9;
const valid=(o,k)=>o&&Object.hasOwn(o,k);
export const marker=n=>'<!-- healthcare-scope-v1:'+n+' -->';
export function questionTopic(comments,questionNumber,reportNumber){
  if(!num(questionNumber)||!num(reportNumber)||!Array.isArray(comments)||comments.length>100)return null;
  for(const c of comments.slice().sort((a,b)=>b.id-a.id)){
    if(c.user?.id!==OWNER_ID||c.issue_url!==URL+'/issues/'+questionNumber||c.created_at!==c.updated_at||(!Number.isSafeInteger(c.id)||c.id<1)||typeof c.body!=='string')continue;
    const topic=Object.keys(TOPICS).find(k=>TOPICS[k].label.toLowerCase()===c.body.trim().toLowerCase()||k===c.body.trim().toLowerCase());
    if(topic)return {topic,comment:c.id,issue:questionNumber};
  }
  return null;
}
function scope(i){
  if(!eligible(i)||!i.title.startsWith(REPORT_PREFIX))return null;
  const fields=sections(i.body);
  if(!fields?.get('Public scope')?.split('\n').some(x=>x.trim()==='- [x] '+SCOPE))return null;
  const topic=Object.keys(TOPICS).find(k=>TOPICS[k].label===fields.get('Process category'))||null;
  return {number:i.number,topic,revision:String(i.updated_at||i.created_at)};
}
export function nextStage(report){
  if(report.tracking==='Closed tracking')return null;
  if(report.stage.startsWith('Outcome evidence'))return 'outcome';
  if(report.stage==='Corrective action reported')return 'outcome';
  if(report.stage==='Institutional response reported')return 'corrective';
  if(report.stage==='Institutional acknowledgment reported')return 'followup';
  if(['Submission documented by reporter','Transport receipt reported'].includes(report.stage))return 'acknowledgment';
  return 'initial';
}
export function renderReportDraft(plan){
  requireThat(plan&&num(plan.report)&&valid(TOPICS,plan.topic)&&valid(STAGES,plan.stage)&&valid(STYLES,plan.style)&&['topic-first','stage-first'].includes(plan.order)&&Array.isArray(plan.sources)&&plan.sources.length>=1&&plan.sources.length<=100&&plan.sources.every(num)&&plan.sources[0]===plan.report,400,'Invalid report writing plan');
  const t=TOPICS[plan.topic],s=STAGES[plan.stage];
  const requests=plan.order==='topic-first'?[t.request,s.request]:[s.request,t.request];
  return {subject:s.subject,text:[STYLES[plan.style],...requests,t.goal,'Thank you for your assistance.'].join('\n\n'),sourceIssues:[...plan.sources]};
}
async function get(path,fetcher){
  const r=await fetcher(URL+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'GRWTSK-report-review'},redirect:'error',signal:AbortSignal.timeout(12000)});
  requireThat(r.ok,503,'GitHub report input unavailable');return {data:await r.json(),more:!!r.headers.get('link')?.includes('rel="next"')};
}
async function list(path,fetcher,limit=5){
  const all=[];for(let page=1;page<=limit;page++){
    const {data,more}=await get(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page,fetcher);
    requireThat(Array.isArray(data)&&data.length<=100,503,'Invalid issue listing');all.push(...data);
    if(!more)return all;
  }
  throw Error('Incomplete public issue listing');
}
export async function compose(config,plan,fetcher=fetch){
  const fallback={...plan,style:'balanced',order:'topic-first'};
  if(!config.openaiKey||!config.model)return {plan:fallback,method:'baseline'};
  const r=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
   headers:{Authorization:'Bearer '+config.openaiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model:config.model,store:false,max_output_tokens:300,
    instructions:'Choose a style and request ordering for an unsent healthcare process inquiry. Use the supplied neutral process topic and lifecycle stage only. Never invent facts, mention people, or select recipients. Prefer an accessible, clear style.',
    input:JSON.stringify({topic:TOPICS[plan.topic],stage:STAGES[plan.stage],stylePreference:plan.preference||'balanced'}),
    text:{format:{type:'json_schema',name:'report_review_composition',strict:true,schema:{type:'object',properties:{style:{type:'string',enum:Object.keys(STYLES)},order:{type:'string',enum:['topic-first','stage-first']}},required:['style','order'],additionalProperties:false}}}})});
  requireThat(r.ok,503,'Review composition unavailable');
  const response=await r.json(),items=(response.output||[]).flatMap(x=>x.content||[]);
  requireThat(response.status==='completed'&&!items.some(x=>x.type==='refusal'),502,'Review composition unavailable');
  const result=JSON.parse(items.filter(x=>x.type==='output_text').map(x=>x.text).join(''));
  requireThat(Object.keys(result).length===2&&valid(STYLES,result.style)&&['topic-first','stage-first'].includes(result.order),502,'Invalid review composition');
  const final={...plan,style:plan.preference||result.style,order:result.order};renderReportDraft(final);
  return {plan:final,method:'ai-composed'};
}
export async function reportReviewTick(store,config,fetcher=fetch,generate=compose,today=new Date().toISOString().slice(0,10)){
  const issues=await list('/issues?creator=grwtsk&state=all',fetcher);
  const projection=buildLifecycle(issues,today);
  const scopes=new Map(issues.map(scope).filter(Boolean).map(r=>[r.number,r]));
  const active=projection.reports.filter(r=>r.tracking==='Open tracking');
  const needs=active.filter(r=>!scopes.get(r.number)?.topic);
  const questions=needs.length?await list('/issues?creator=github-actions%5Bbot%5D&state=all',fetcher):[];
  const planned=[];
  for(const report of active.slice(0,12)){
    const sc=scopes.get(report.number);if(!sc)continue;
    let topic=sc.topic,answer=null;
    if(!topic){
      const matches=questions.filter(q=>!q.pull_request&&q.user?.id===41898282&&num(q.number)&&q.body?.startsWith(marker(report.number)));
      if(matches.length===1){
        const {data,more}=await get('/issues/'+matches[0].number+'/comments?per_page=100',fetcher);
        if(!more)answer=questionTopic(data,matches[0].number,report.number);
        if(answer)topic=answer.topic;
      }
    }
    const stage=nextStage(report);
    if(!topic){planned.push({report:report.number,status:'needs-scope'});continue;}
    if(!stage)continue;
    const {state}=await store.read(),old=state.reportReview?.records?.find(x=>x.report===report.number);
    const preference=state.writingReview?.revisions?.filter(r=>r.choice).at(-1)?.choice?.style||'balanced';
    const plan={report:report.number,topic,stage,preference,sources:report.timeline.slice(-98)};
    if(plan.sources[0]!==report.number)plan.sources.unshift(report.number);
    if(answer&&!plan.sources.includes(answer.issue))plan.sources.push(answer.issue);
    const fingerprint=digest(JSON.stringify({policy:1,plan,scopeRevision:sc.revision,answer}));
    if(old?.fingerprint===fingerprint&&old.plan){
      planned.push(old);continue;
    }
    planned.push({report:report.number,status:'draft-pending',fingerprint,planInput:plan,...(answer?{answer}: {})});
  }
  await store.mutate(s=>{
    const previous=s.reportReview?.records||[];
    s.reportReview={version:1,records:planned.map(p=>{
      const same=previous.find(r=>r.report===p.report&&r.fingerprint&&r.fingerprint===p.fingerprint);
      return same?.plan?same:p;
    }),metrics:{...projection.metrics,heldRecords:projection.held.length,reportCoverage:active.length<=12,scopeQuestions:planned.filter(p=>p.status==='needs-scope').length},at:today,history:s.reportReview?.history||[]};
  });
  // One model call per cycle. A repeated pending plan may be retried after an
  // interruption: it cannot trigger a delivery or new external recipient.
  const pending=planned.find(p=>p.status==='draft-pending');
  if(!pending)return;
  let result;
  try{result=await generate(config,pending.planInput,fetcher);}catch{
    result={plan:{...pending.planInput,style:pending.planInput.preference,order:'topic-first'},method:'baseline'};
  }
  renderReportDraft(result.plan);
  requireThat(['ai-composed','baseline'].includes(result.method)&&result.plan.report===pending.report&&result.plan.topic===pending.planInput.topic&&result.plan.stage===pending.planInput.stage&&JSON.stringify(result.plan.sources)===JSON.stringify(pending.planInput.sources),502,'Invalid review result');
  await store.mutate(s=>{
    const r=s.reportReview.records.find(x=>x.report===pending.report&&x.fingerprint===pending.fingerprint);
    if(!r||r.status!=='draft-pending')return;
    r.status='review-ready';r.plan=result.plan;r.method=result.method;delete r.planInput;
    const history=s.reportReview.history;
    if(!history.some(h=>h.fingerprint===r.fingerprint))history.push({report:r.report,fingerprint:r.fingerprint,plan:r.plan,method:r.method});
    if(history.length>48)history.shift();
  });
}
export function reportReviewProjection(state){
  const r=state.reportReview;
  return {version:1,mode:'review-only',day:r?.at||null,metrics:r?.metrics||null,history:(r?.history||[]).map(h=>({report:h.report,fingerprint:h.fingerprint,plan:h.plan,method:h.method})),records:(r?.records||[]).map(x=>({
    report:x.report,status:x.status,...(x.plan?{plan:x.plan,method:x.method,fingerprint:x.fingerprint}:{}),...(x.answer?{answer:x.answer}: {})
  }))};
}
