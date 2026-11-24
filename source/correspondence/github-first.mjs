import { createHmac } from 'node:crypto';
import { reserveOwnerAcknowledgment, acceptSend, requireThat, uuid } from './core.mjs';

export const POLICY='owner-requested-receipt-v1';
const ISSUE='https://api.github.com/repos/grwtsk/grwtsk.com/issues/6';
const OWNER=176085483;
const statusKeys=['received','accepted','delivered','pending','failed','bounced','complained','suppressed','delivery_delayed','sent'];
const ownerCase=(state,config)=>state.cases.find(c=>config.offices.some(o=>o.id==='owner-test'&&o.basis==='consented_correspondence'&&o.id===c.office.id&&o.email===c.office.email&&o.basis===c.office.basis));

export function ownerControl(comments,activation){
  requireThat(Array.isArray(comments)&&comments.length<=100,503,'Owner control unavailable');
  let enabled=true,latest=0,seen=null;
  for(const c of comments){
    if(c?.user?.id!==OWNER||c.issue_url!==ISSUE||!Number.isSafeInteger(c.id)||!Number.isFinite(Date.parse(c.created_at))||Date.parse(c.created_at)<Date.parse(activation))continue;
    const command=typeof c.body==='string'?c.body.trim().toLowerCase():'';
    if(!['pause routine replies','resume routine replies'].includes(command))continue;
    if(c.id>latest){latest=c.id;enabled=c.updated_at===c.created_at&&command==='resume routine replies';seen=c.id;}
  }
  return {enabled,seen};
}
async function readControl(activation,fetcher=fetch){
  const response=await fetcher(ISSUE+'/comments?per_page=100',{headers:{Accept:'application/vnd.github+json','User-Agent':'GRWTSK-correspondence'},redirect:'error',signal:AbortSignal.timeout(10_000)});
  requireThat(response.ok&&!response.headers.get('link')?.includes('rel="next"'),503,'Owner control unavailable');
  return ownerControl(await response.json(),activation);
}
function opaque(key,direction,id){
  return createHmac('sha256',key).update('public-owner-receipt:v1:'+direction+':'+id).digest('hex').slice(0,24);
}
function day(t){return typeof t==='string'&&Number.isFinite(Date.parse(t))?new Date(t).toISOString().slice(0,10):null;}
export function publicProjection(state,config){
  const c=ownerCase(state,config),receipts=[];
  if(c){
    for(const r of c.incoming){
      const date=day(r.receivedAt);
      if(date&&uuid(r.id)&&r.from===c.office.email&&r.authentication?.dmarc==='pass')receipts.push({id:opaque(config.key,'in',r.id),day:date,direction:'in',status:'received'});
    }
    for(const m of c.outgoing){
      const date=day(m.at);if(!date||!uuid(m.id))continue;
      let status=m.status==='accepted'?'accepted':'pending';
      if(m.providerId&&m.status==='accepted'){
        const event=state.delivery.filter(e=>e.providerId===m.providerId&&e.to===c.office.email).at(-1);
        const type=event?.type?.replace(/^email\./,'');
        if(statusKeys.includes(type)&&type!=='received')status=type;
      }
      receipts.push({id:opaque(config.key,'out',m.id),day:date,direction:'out',status});
    }
  }
  const control=state.githubFirst?.control;
  return {version:1,policy:POLICY,ownerCase:!!c,mode:!config.routineAcks||!config.live?'disabled':control?.available!==true?'control-unavailable':control.enabled&&!c?.routineOptOut?'enabled':'paused',
    pending:c?.outgoing.some(m=>m.status==='pending')||false,receipts:receipts.slice(-40)};
}
export async function coordinationTick(store,config,provider,fetcher=fetch,clock=()=>new Date().toISOString()){
  if(!config.githubFirst)return;
  let control;
  try{control=await readControl(config.githubFirstActivation,fetcher);}
  catch{await store.mutate(s=>{s.githubFirst={...s.githubFirst,control:{...s.githubFirst?.control,available:false,enabled:false}};});return;}
  const reserved=await store.mutate(s=>{
    const previous=s.githubFirst?.control;
    if(previous?.seen&&(!control.seen||control.seen<previous.seen)){control={enabled:false,seen:previous.seen};}
    s.githubFirst={...s.githubFirst,control:{available:true,...control}};
    const c=ownerCase(s,config);
    if(!c)return null;
    if(c.incoming.some(r=>r.from===c.office.email&&r.authentication?.dmarc==='pass'&&Date.parse(r.receivedAt)>Date.parse(config.githubFirstActivation)&&
      !r.textTruncated&&!r.htmlOnly&&r.text.trim().toLowerCase()==='stop automated acknowledgments.'))c.routineOptOut=true;
    if(!config.live||!config.routineAcks||!control.enabled)return null;
    return reserveOwnerAcknowledgment(s,config.offices,c.id,config.githubFirstActivation,config.from,clock());
  });
  if(!reserved)return;
  const {state}=await store.read(),c=ownerCase(state,config);
  const reference=c?.incoming.find(r=>r.id===reserved.message.replyId)?.messageId;
  const providerId=await provider.send(reserved.message,reference);
  await store.mutate(s=>acceptSend(s,reserved.caseId,reserved.message.id,providerId));
}
