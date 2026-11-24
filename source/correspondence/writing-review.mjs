// Review-only public writing corpus. No addresses, mail, private case data,
// or untrusted free text enter this writing qualification.
import {digest, requireThat} from './core.mjs';

export const WRITING_REVIEW_ONLY=true;
export const ISSUE=11;
const API='https://api.github.com/repos/grwtsk/grwtsk.com/issues/'+ISSUE;
const OWNER=176085483;
const STYLE=['balanced','concise','formal','plain','direct'];
const PURPOSE=['initial','acknowledgment','follow-up','corrective-action','outcome'];
const brief=Object.freeze({
  source:'Healthcare improvement lifecycle, issue #7; writing review, issue #11',
  intent:'Test accessible, evidence-conscious healthcare process correspondence; not a complaint or an actual submission.',
  limits:'No personal allegations, recipient selection, clinical or legal claims, threats, requests for sensitive records, or dispatch.'
});
const subjects=Object.freeze({
 initial:'Accessible process for healthcare concerns',
 acknowledgment:'Request for acknowledgment and next steps',
 'follow-up':'Request for a written process update',
 'corrective-action':'Clarification of proposed healthcare process improvements',
 outcome:'Evidence of healthcare process improvement'
});
const requests=Object.freeze({
 initial:'Please explain how a patient can submit a concern in an accessible written format, obtain acknowledgment, request independent review where available, and learn what follow-up to expect.',
 acknowledgment:'Please explain how a patient can confirm that a concern has been received and determine the next steps through an accessible written channel.',
 'follow-up':'Please explain how a patient can request a written status update, identify remaining steps, and learn when further information may be available.',
 'corrective-action':'Please explain how proposed changes to a healthcare process can be documented, how responsibility for implementation is established, and how patients may receive an update.',
 outcome:'Please explain what evidence and criteria can be used to determine whether a healthcare process improvement was implemented and whether it achieved its intended result.'
});
const openings=Object.freeze({
 balanced:'I am requesting information about the written process for addressing healthcare concerns.',
 concise:'I am seeking clarification of your healthcare concern process.',
 formal:'I respectfully request clarification of the procedures available to patients who wish to raise a healthcare process concern.',
 plain:'I would like to understand how a patient can raise a concern and get a written response.',
 direct:'Please clarify the process available to patients seeking documented review of a healthcare concern.'
});
const closes=Object.freeze({
 balanced:'The objective is an accessible and reliable process that reduces administrative burden and supports documented improvements in healthcare.\n\nThank you for your assistance.',
 concise:'Thank you for clarifying the process.',
 formal:'A clear description of the applicable process would help identify the appropriate next steps. Thank you for your consideration.',
 plain:'A clear explanation would help patients know what to do next. Thank you.',
 direct:'Please provide the applicable written instructions or direct patients to the appropriate official process. Thank you.'
});
export const BASELINE=Object.freeze({purpose:'initial',style:'balanced'});
export function renderWriting(choice){
 requireThat(choice&&Object.keys(choice).length===2&&PURPOSE.includes(choice.purpose)&&STYLE.includes(choice.style),400,'Invalid writing selection');
 return {subject:subjects[choice.purpose],text:[openings[choice.style],requests[choice.purpose],closes[choice.style]].join('\n\n'),source:brief.source};
}
// Ordinary short style feedback is interpreted as preference data, not
// executable instructions. No comment body is passed to the model.
export function feedbackPreference(comments){
 requireThat(Array.isArray(comments)&&comments.length<=100,503,'Public writing feedback unavailable');
 let selected={...BASELINE},last=0;
 for(const c of comments.slice().sort((a,b)=>(a.id||0)-(b.id||0))){
  if(c.user?.id!==OWNER||c.issue_url!==API||c.created_at!==c.updated_at||!Number.isSafeInteger(c.id)||typeof c.body!=='string')continue;
  const t=c.body.trim().toLowerCase().replace(/[.!]$/,'');
  const styles={'shorter':'concise','more concise':'concise','more formal':'formal','plain language':'plain','more direct':'direct','balanced':'balanced'};
  const stages={'initial report':'initial','acknowledgment':'acknowledgment','follow-up':'follow-up','corrective action':'corrective-action','outcome verification':'outcome'};
  if(Object.hasOwn(styles,t)){selected.style=styles[t];last=c.id;}
  if(Object.hasOwn(stages,t)){selected.purpose=stages[t];last=c.id;}
 }
 return {...selected,last};
}
export async function chooseWriting(config,preference,fetcher=fetch){
 if(!config.openaiKey||!config.model)return {choice:{purpose:preference.purpose,style:preference.style},method:'baseline'};
 const r=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
  headers:{Authorization:'Bearer '+config.openaiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model:config.model,store:false,max_output_tokens:300,
   instructions:'Select a writing sample for review from the permitted purpose and style. Respect the supplied preferences; never generate message text or infer facts. No send or tool authority. Return the two fields only.',
   input:JSON.stringify({brief,preference:{purpose:preference.purpose,style:preference.style},allowed:{purpose:PURPOSE,style:STYLE}}),
   text:{format:{type:'json_schema',name:'writing_review_selection',strict:true,schema:{type:'object',properties:{purpose:{type:'string',enum:PURPOSE},style:{type:'string',enum:STYLE}},required:['purpose','style'],additionalProperties:false}}}})});
 requireThat(r.ok,503,'Writing review model unavailable');
 const output=await r.json(),items=(output.output||[]).flatMap(x=>x.content||[]);
 requireThat(output.status==='completed'&&!items.some(x=>x.type==='refusal'),502,'Writing selection unavailable');
 const choice=JSON.parse(items.filter(x=>x.type==='output_text').map(x=>x.text).join(''));
 renderWriting(choice);
 requireThat(choice.purpose===preference.purpose&&choice.style===preference.style,502,'Writing selection conflicts with review preference');
 return {choice,method:'ai-selected'};
}
export async function writingReviewTick(store,config,fetcher=fetch,choose=chooseWriting){
 const response=await fetcher(API+'/comments?per_page=100',{headers:{Accept:'application/vnd.github+json','User-Agent':'GRWTSK-writing-review'},redirect:'error',signal:AbortSignal.timeout(12000)});
 requireThat(response.ok&&!response.headers.get('link')?.includes('rel="next"'),503,'Review feedback unavailable');
 const preference=feedbackPreference(await response.json());
 const fingerprint=digest(JSON.stringify({version:1,preference,brief}));
 const reservation=await store.mutate(s=>{
  s.writingReview||={revisions:[]};
  const existing=s.writingReview.revisions.find(r=>r.fingerprint===fingerprint);
  if(existing)return null; // At most one model request per exact feedback revision.
  const rec={fingerprint,preference,method:'pending'};
  if(s.writingReview.revisions.length>=24)return null;
  s.writingReview.revisions.push(rec);return rec;
 });
 if(!reservation)return;
 let result;
 try{result=await choose(config,preference,fetcher);}catch{result={choice:{purpose:preference.purpose,style:preference.style},method:'baseline'};}
 renderWriting(result.choice);
 requireThat(['ai-selected','baseline'].includes(result.method),503,'Invalid review method');
 await store.mutate(s=>{
  const r=s.writingReview.revisions.find(x=>x.fingerprint===fingerprint);
  requireThat(r?.method==='pending',409,'Review reservation changed');
  r.method=result.method;r.choice=result.choice;
 });
}
export function writingProjection(state){
 const revisions=(state.writingReview?.revisions||[]).filter(r=>r.choice&&['ai-selected','baseline'].includes(r.method));
 return {version:1,mode:'review-only',revisions:revisions.map(r=>({fingerprint:r.fingerprint,choice:r.choice,method:r.method,feedback:r.preference.last}))};
}
