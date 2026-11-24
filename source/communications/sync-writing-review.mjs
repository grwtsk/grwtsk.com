import {renderWriting,ISSUE} from './writing-review.mjs';
const api='https://api.github.com/repos/grwtsk/grwtsk.com/issues/'+ISSUE;
export function renderReview(p){
 if(!p||p.version!==1||p.mode!=='review-only'||!Array.isArray(p.revisions)||p.revisions.length>24)throw Error('Invalid writing projection');
 const lines=['## Writing review — no email delivery','Communication system: #5. Operations: #6. Healthcare tracking is a deferred specification in #7.','','**All drafts are unsent examples.** No recipient is selected and no approval comment can authorize a send. The initial qualification uses a source-controlled corpus and a bounded AI selection, not free-form accusation generation.','','## Latest review'];
 for(const r of p.revisions){
  if(!r||typeof r.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(r.fingerprint)||!['ai-selected','baseline'].includes(r.method)||!Number.isSafeInteger(r.feedback)||r.feedback<0)throw Error('Invalid revision');
  renderWriting(r.choice);
 }
 const latest=p.revisions.at(-1);
 if(latest){
  const d=renderWriting(latest.choice);
  lines.push('Method: '+latest.method+'; stage: '+latest.choice.purpose+'; style: '+latest.choice.style+'.','','**Subject:** '+d.subject,'',d.text,'','Source: '+d.source);
 }else lines.push('No model selection has yet been recorded. The service will prepare the review sample on its next available cycle.');
 lines.push('','## Review the writing','Comment in this issue. The automated qualification recognizes ordinary short feedback: **Shorter**, **More formal**, **More direct**, **Plain language**, **Balanced**; or stage names **Initial report**, **Acknowledgment**, **Follow-up**, **Corrective action**, **Outcome verification**. Other comments remain available for a later reviewed revision. Do not include confidential records or private details about others.','','Review criteria: one purpose; clear factual language; no invented evidence; no unnecessary disclosure; accessible written request; no assumption of a clinical or legal finding.','','## Revision history');
 for(const r of p.revisions)lines.push('- '+r.fingerprint.slice(0,12)+' — '+r.choice.purpose+' / '+r.choice.style+' / '+r.method+(r.feedback?' ([feedback](https://github.com/grwtsk/grwtsk.com/issues/11#issuecomment-'+r.feedback+'))':''));
 return lines.join('\n');
}
export async function syncWriting({token=process.env.GITHUB_TOKEN,fetcher=fetch}={}){
 if(!token)throw Error('Missing Actions token');
 const status=await fetcher('https://personal-correspondence-production.up.railway.app/writing-review/status',{redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!status.ok)throw Error('Writing projection unavailable');
 const body=renderReview(await status.json());
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'};
 const current=await fetcher(api,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!current.ok)throw Error('Review issue unavailable');
 const issue=await current.json();
 if(issue.number!==ISSUE||issue.user?.id!==176085483||issue.pull_request)throw Error('Unexpected review issue');
 if(issue.body===body)return;
 const updated=await fetcher(api,{method:'PATCH',headers,body:JSON.stringify({body}),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!updated.ok)throw Error('Review synchronization failed');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)syncWriting().catch(e=>{console.error(e.message);process.exitCode=1;});
