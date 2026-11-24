import {digest,requireThat} from './core.mjs';

// Improvement proposals are generated from measured process indicators only.
// The catalog limits the model to selecting a testable engineering proposal.
export const IMPROVEMENTS=Object.freeze({
 scope:{metric:'scopeQuestions',title:'Reduce missing scope questions',proposal:'Improve process-category guidance and reuse recorded scope decisions.',test:'Replay an unchanged report twice and verify that it generates no duplicate question.'},
 evidence:{metric:'heldRecords',title:'Improve evidence-entry validation',proposal:'Provide earlier feedback on missing evidence and contradictory milestones.',test:'Invalid milestone records are held with a clear reason; valid updates progress without redundant input.'},
 followup:{metric:'overduePlannedFollowUps',title:'Improve follow-up visibility',proposal:'Prioritize unresolved planned follow-ups in the public tracking index without dispatching messages.',test:'An overdue planning date appears once and disappears after a documented resolution or revised plan.'},
 decisions:{metric:'outstandingOwnerQuestions',title:'Reduce unresolved owner decisions',proposal:'Reuse source-bound prior answers and consolidate duplicate questions.',test:'A previously answered question is linked to its original answer rather than asked again.'}
});
export function improvementCandidates(metrics){
 if(!metrics||metrics.reportCoverage!==true)return [];
 return Object.keys(IMPROVEMENTS).filter(k=>Number.isSafeInteger(metrics[IMPROVEMENTS[k].metric])&&metrics[IMPROVEMENTS[k].metric]>0);
}
export async function chooseImprovement(config,metrics,candidates,fetcher=fetch){
 if(!config.openaiKey||!config.model)return {choice:candidates[0],method:'baseline'};
 const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
  headers:{Authorization:'Bearer '+config.openaiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model:config.model,store:false,max_output_tokens:200,
   instructions:'Choose one engineering improvement based only on measured workflow gaps. Do not infer clinical or legal findings, modify code or authorize correspondence. Return a listed identifier only.',
   input:JSON.stringify(candidates.map(k=>({id:k,count:metrics[IMPROVEMENTS[k].metric],...IMPROVEMENTS[k]}))),
   text:{format:{type:'json_schema',name:'workflow_improvement',strict:true,schema:{type:'object',properties:{choice:{type:'string',enum:candidates}},required:['choice'],additionalProperties:false}}}})});
 requireThat(response.ok,503,'Improvement analysis unavailable');
 const r=await response.json(),items=(r.output||[]).flatMap(x=>x.content||[]);
 requireThat(r.status==='completed'&&!items.some(x=>x.type==='refusal'),502,'Improvement analysis unavailable');
 const output=JSON.parse(items.filter(x=>x.type==='output_text').map(x=>x.text).join(''));
 requireThat(Object.keys(output).length===1&&candidates.includes(output.choice),502,'Unknown improvement proposal');
 return {choice:output.choice,method:'ai-selected'};
}
export async function improvementTick(store,config,fetcher=fetch,choose=chooseImprovement){
 const state=(await store.read()).state,metrics=state.reportReview?.metrics;
 if(!metrics)return;
 const candidates=improvementCandidates(metrics);
 const evidence=candidates.map(k=>[k,metrics[IMPROVEMENTS[k].metric]]);
 const fingerprint=digest(JSON.stringify({version:1,evidence,coverage:metrics.reportCoverage}));
 if(state.improvementReview?.fingerprint===fingerprint)return;
 if(!candidates.length){await store.mutate(s=>{s.improvementReview={fingerprint,status:'no-actionable-signal'};});return;}
 let result;
 try{result=await choose(config,metrics,candidates,fetcher);}catch{result={choice:candidates[0],method:'baseline'};}
 requireThat(candidates.includes(result.choice)&&['ai-selected','baseline'].includes(result.method),502,'Invalid improvement selection');
 const choice=result.choice,count=metrics[IMPROVEMENTS[choice].metric];
 await store.mutate(s=>{
  // Do not publish a choice from an older metrics snapshot.
  const latest=s.reportReview?.metrics;
  if(!latest||latest.reportCoverage!==true||latest[IMPROVEMENTS[choice].metric]!==count)return;
  s.improvementReview={fingerprint,status:'proposal',choice,count,method:result.method};
 });
}
export function improvementProjection(state){
 const x=state.improvementReview;
 return x?{status:x.status,...(x.status==='proposal'?{choice:x.choice,count:x.count,method:x.method,fingerprint:x.fingerprint}:{})}:{status:'pending'};
}
