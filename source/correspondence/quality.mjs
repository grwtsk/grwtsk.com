import { randomUUID } from 'node:crypto';
import { requireThat, uuid, now, digest, field } from './core.mjs';

export const qualityCategories=['clear','grounded','complete','missing-context','too-verbose','unsupported-claim','wrong-tone','irrelevant'];
function quality(state){
  if(!state.quality)state.quality={version:1,feedback:[],reviews:[]};
  const q=state.quality;
  requireThat(q.version===1&&Array.isArray(q.feedback)&&Array.isArray(q.reviews),503,'Invalid quality ledger');
  return q;
}
export function recordQuality(state,input){
  const q=quality(state);
  requireThat(uuid(input.proposalId)&&state.knowledge?.proposals.some(p=>p.id===input.proposalId&&p.status==='ready'),404,'Select a prepared proposal');
  requireThat(input.confirm===true&&Array.isArray(input.categories)&&input.categories.length>0&&input.categories.length<=qualityCategories.length&&
    new Set(input.categories).size===input.categories.length&&input.categories.every(x=>qualityCategories.includes(x)),400,'Select valid quality feedback labels');
  requireThat(!q.feedback.some(f=>f.proposalId===input.proposalId),409,'Feedback already recorded for this proposal');
  requireThat(q.feedback.length<200,507,'Quality feedback capacity reached');
  const f={id:randomUUID(),proposalId:input.proposalId,categories:[...input.categories].sort(),at:now()};
  q.feedback.push(f);return f;
}
export function qualitySummary(state){
  const q=state.quality||{feedback:[],reviews:[]};
  const counts=Object.fromEntries(qualityCategories.map(c=>[c,0]));
  for(const f of q.feedback)for(const c of f.categories)counts[c]++;
  return {sampleCount:q.feedback.length,counts,latestReview:q.reviews.at(-1)||null};
}
export function reserveQualityReview(state,at=now()){
  const q=quality(state),summary=qualitySummary(state);
  const fingerprint=digest(JSON.stringify([summary.sampleCount,summary.counts]));
  if(summary.sampleCount<5||q.reviews.some(r=>r.fingerprint===fingerprint)||q.reviews.length>=60)return null;
  if(q.reviews.some(r=>Date.parse(at)-Date.parse(r.createdAt)<86_400_000))return null;
  const r={id:randomUUID(),fingerprint,createdAt:at,status:'pending',sampleCount:summary.sampleCount,counts:summary.counts};
  q.reviews.push(r);return r;
}
export function finishQualityReview(state,id,output){
  const r=quality(state).reviews.find(x=>x.id===id);
  requireThat(r&&r.status==='pending',409,'Quality review reservation unavailable');
  if(output){
    requireThat(Array.isArray(output.suggestions)&&output.suggestions.length<=4,502,'Invalid quality suggestions');
    r.suggestions=output.suggestions.map(x=>field(x,'writing suggestion',350));
  }
  r.status=output?'ready':'failed';r.finishedAt=now();return r;
}
export async function prepareQualityReview(store,config,generate){
  const {state}=await store.read(),q=state.quality;
  if(!q||q.feedback.length<5||q.reviews.length>=60)return null;
  const r=await store.mutate(s=>reserveQualityReview(s));
  if(!r)return null;
  try{
    // No message, address, source text, recipient, issue or case ID is supplied.
    const output=await generate(config,{sampleCount:r.sampleCount,counts:r.counts});
    return await store.mutate(s=>finishQualityReview(s,r.id,output));
  }catch{
    await store.mutate(s=>finishQualityReview(s,r.id,null));
    return null;
  }
}
