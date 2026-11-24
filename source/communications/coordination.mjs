import { randomUUID } from 'node:crypto';
import { requireThat, field, uuid, now, findCase } from './core.mjs';

const statuses=new Set(['open','waiting','resolved','closed']);
const active=i=>i.status==='open'||i.status==='waiting';
const cap=(n,max,name)=>requireThat(n<max,507,name+' capacity reached');
const noAddress=/[^\s<>]+@[^\s<>]+\.[^\s<>]+/u;
const getBoard=state=>{
  const b=state.coordination||{version:1,issues:[],links:[],nominations:[]};
  requireThat(b.version===1&&Array.isArray(b.issues)&&Array.isArray(b.links)&&Array.isArray(b.nominations),503,'Invalid issue ledger');
  return b;
};
function writeBoard(state){const b=getBoard(state);state.coordination=b;return b;}
function audit(state,type,issueId,more={}){
  state.events.push({id:randomUUID(),at:now(),type,caseId:null,issueId,...more});
}
function issue(board,id){
  requireThat(uuid(id),400,'Invalid issue identifier');
  const i=board.issues.find(x=>x.id===id);
  requireThat(i,404,'Issue not found');return i;
}
function single(s,label,max){return field(s,label,max,{multiline:false});}
function reviewedSummary(s,label,max){
  const out=field(s,label,max);
  requireThat(!noAddress.test(out),400,'Do not include email addresses in a shared summary');
  return out;
}
function optionalSummary(input){
  if(input.shareSummary===undefined||input.shareSummary===null||input.shareSummary==='')return null;
  requireThat(input.shareReviewed===true,400,'Explicitly review the de-identified sharing summary');
  return reviewedSummary(input.shareSummary,'de-identified sharing summary',1600);
}
export function createIssue(state,input){
  const b=writeBoard(state);
  const title=single(input.title,'issue title',140),owner=single(input.owner,'responsible office or role',140);
  const nextAction=field(input.nextAction,'requested action',1000),shareSummary=optionalSummary(input);
  requireThat(!b.issues.some(i=>i.title.toLowerCase()===title.toLowerCase()&&active(i)),409,'An active issue already uses this title');
  cap(b.issues.length,150,'Issue');
  const i={id:randomUUID(),title,owner,nextAction,shareSummary,status:'open',caseIds:[],feedback:[],createdAt:now(),updatedAt:now()};
  b.issues.push(i);audit(state,'issue.created',i.id);return i;
}
export function updateIssue(state,input){
  const b=writeBoard(state),i=issue(b,input.issueId);
  requireThat(i.status!=='consolidated',409,'A consolidated issue remains a historical record');
  requireThat(statuses.has(input.status),400,'Invalid issue status');
  const owner=single(input.owner,'responsible office or role',140),nextAction=field(input.nextAction,'requested action',1000);
  const shareSummary=optionalSummary(input);
  const previous={status:i.status,owner:i.owner,nextAction:i.nextAction,shareSummary:i.shareSummary};
  Object.assign(i,{status:input.status,owner,nextAction,shareSummary,updatedAt:now()});
  audit(state,'issue.updated',i.id,{previous});return i;
}
export function attachCase(state,input){
  const b=writeBoard(state),i=issue(b,input.issueId),c=findCase(state,input.caseId);
  requireThat(active(i),409,'Attach correspondence to an active issue');
  if(i.caseIds.includes(c.id))return i;
  cap(i.caseIds.length,25,'Case references per issue');
  i.caseIds.push(c.id);i.updatedAt=now();
  audit(state,'issue.case_linked',i.id,{linkedCaseId:c.id});return i;
}
export function linkIssues(state,input){
  const b=writeBoard(state),a=issue(b,input.issueId),z=issue(b,input.otherIssueId);
  requireThat(a.id!==z.id,400,'Cannot link an issue to itself');
  requireThat(['related','consolidated-into'].includes(input.relation),400,'Invalid issue relationship');
  if(input.relation==='related'){
    const [from,to]=[a.id,z.id].sort();
    const exists=b.links.find(x=>x.relation==='related'&&x.from===from&&x.to===to);
    if(exists)return exists;
    cap(b.links.length,300,'Issue relationship');
    const link={id:randomUUID(),relation:'related',from,to,at:now()};b.links.push(link);
    audit(state,'issue.related',a.id,{otherIssueId:z.id,linkId:link.id});return link;
  }
  // Consolidation is organizational grouping only. Never transfer recipient
  // authorization, private correspondence, knowledge, or sharing approval.
  requireThat(input.confirm===true&&active(a)&&active(z),409,'Confirm consolidation of two active issues');
  requireThat(!b.links.some(x=>x.relation==='consolidated-into'&&x.from===a.id),409,'Issue already consolidated');
  const next=new Map(b.links.filter(x=>x.relation==='consolidated-into').map(x=>[x.from,x.to]));
  const visited=new Set([a.id]);let cursor=z.id;
  while(cursor){requireThat(!visited.has(cursor),409,'Consolidation cycle');visited.add(cursor);cursor=next.get(cursor);}
  cap(b.links.length,300,'Issue relationship');
  const link={id:randomUUID(),relation:'consolidated-into',from:a.id,to:z.id,at:now()};
  b.links.push(link);a.status='consolidated';a.updatedAt=now();
  audit(state,'issue.consolidated',a.id,{otherIssueId:z.id,linkId:link.id});return link;
}
export function recordFeedback(state,input){
  const b=writeBoard(state),i=issue(b,input.issueId),c=findCase(state,input.caseId);
  requireThat(active(i)&&i.caseIds.includes(c.id),409,'Select an active issue linked to this case');
  requireThat(input.confirm===true,400,'Review and confirm the redacted feedback summary');
  const r=c.incoming.find(x=>x.id===input.replyId);
  requireThat(r&&r.reviewed===true&&r.from===c.office.email&&r.authentication?.dmarc==='pass',409,'Feedback requires a reviewed reply from the authorized office');
  requireThat(!i.feedback.some(x=>x.caseId===c.id&&x.replyId===r.id),409,'This reply already has a feedback record for this issue');
  cap(i.feedback.length,120,'Feedback per issue');
  const summary=field(input.summary,'private redacted feedback summary',2000);
  const shareSummary=optionalSummary(input);
  const f={id:randomUUID(),caseId:c.id,replyId:r.id,evidence:'reported',summary,shareSummary,at:now()};
  i.feedback.push(f);i.updatedAt=now();
  audit(state,'issue.feedback_recorded',i.id,{feedbackId:f.id,linkedCaseId:c.id,replyId:r.id});return f;
}
export function withdrawFeedbackSharing(state,input){
  const b=writeBoard(state),i=issue(b,input.issueId);
  const f=i.feedback.find(x=>x.id===input.feedbackId);
  requireThat(f&&input.confirm===true,400,'Select and confirm the feedback sharing withdrawal');
  if(f.shareSummary!==null){f.shareSummary=null;f.shareWithdrawnAt=now();i.updatedAt=now();audit(state,'issue.feedback_sharing_withdrawn',i.id,{feedbackId:f.id});}
  return f;
}
export function nominateRoute(state,input){
  const b=writeBoard(state),i=issue(b,input.issueId);
  requireThat(active(i),409,'Select an active issue');
  const role=single(input.role,'institutional office or role',140);
  const reason=field(input.reason,'jurisdiction or relevant responsibility',800);
  requireThat(!noAddress.test(role)&&!noAddress.test(reason),400,'Nominate the official role, not an individual email address');
  const raw=single(input.url,'published institutional intake URL',500);
  let url;try{url=new URL(raw);}catch{requireThat(false,400,'Invalid source URL');}
  requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!noAddress.test(decodeSafe(url.href)),400,'Use a published official HTTPS intake page, without personal contact data');
  const prior=b.nominations.find(x=>x.issueId===i.id&&x.url===url.href&&x.status==='proposed');
  if(prior)return prior;
  cap(b.nominations.length,150,'Nomination');
  const n={id:randomUUID(),issueId:i.id,role,reason,url:url.href,status:'proposed',createdAt:now()};
  b.nominations.push(n);audit(state,'issue.route_nominated',i.id,{nominationId:n.id});return n;
}
function decodeSafe(s){try{return decodeURIComponent(s);}catch{return s;}}
export function reviewNomination(state,input){
  const b=writeBoard(state),n=b.nominations.find(x=>x.id===input.nominationId);
  requireThat(n&&n.status==='proposed',409,'Nomination already reviewed or missing');
  requireThat(input.confirm===true&&['route-verified','declined'].includes(input.status),400,'Confirm review outcome');
  const reviewNote=field(input.note,'review note',600);
  requireThat(!noAddress.test(reviewNote),400,'Do not add individual addresses to nomination notes');
  Object.assign(n,{status:input.status,reviewNote,reviewedAt:now()});
  audit(state,'issue.route_reviewed',n.issueId,{nominationId:n.id,status:n.status});
  // A reviewed route is not a new authorized recipient. Only the separately
  // managed operator configuration can authorize an actual casework address.
  return n;
}
export function issueView(state,id){
  const b=getBoard(state),i=issue(b,id);
  const cases=i.caseIds.map(id=>findCase(state,id)).map(c=>{
    const replies=c.incoming.map(r=>({id:r.id,receivedAt:r.receivedAt,reviewed:r.reviewed===true,
      summarized:i.feedback.some(f=>f.caseId===c.id&&f.replyId===r.id)}));
    return {id:c.id,role:c.office.role,closed:c.closed,outgoing:c.outgoing.map(m=>({id:m.id,status:m.status,at:m.at})),replies};
  });
  return {issue:i,cases,links:b.links.filter(x=>x.from===id||x.to===id),
    nominations:b.nominations.filter(n=>n.issueId===id)};
}
export function groupPreview(state,id){
  const b=getBoard(state),i=issue(b,id);
  requireThat(i.shareSummary,409,'Approve a separate de-identified issue summary first');
  const feedback=i.feedback.filter(f=>f.shareSummary!==null);
  // The export intentionally omits private titles, case IDs, linked cases,
  // office addresses, raw messages, subjects, private notes, and other issues.
  // It is a preview only; no publication or sending side effect exists.
  const md=['# Reviewed issue update','','Issue: '+i.id,'Status: '+i.status,'',
    '## De-identified summary','',i.shareSummary,'',
    '## Reviewed feedback (reported, not independently verified)','',
    ...(feedback.length?feedback.flatMap((f,index)=>['### Update '+(index+1),'',f.shareSummary,'']):['No feedback approved for this preview.','']),
    '## Coordination','',
    'Confirm jurisdiction, the next responsible step and whether referral or collaboration is appropriate. Share only with authorized participants.',''].join('\n');
  return {issueId:i.id,markdown:md,feedbackCount:feedback.length,publication:'not_published'};
}
