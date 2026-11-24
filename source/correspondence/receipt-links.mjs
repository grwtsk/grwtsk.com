import {createHmac} from 'node:crypto';
import {uuid,requireThat} from './core.mjs';
import {eligible,REPORT_PREFIX,SCOPE,sections,OWNER_ID} from './report-lifecycle.mjs';
const API='https://api.github.com/repos/grwtsk/grwtsk.com';
const BOT=41898282;
const num=n=>Number.isSafeInteger(n)&&n>0&&n<=1e9;
const opaque=(key,label,id)=>createHmac('sha256',key).update('review-receipt:v1:'+label+':'+id).digest('hex').slice(0,24);
export const receiptMarker=id=>'<!-- healthcare-receipt-scope-v1:'+id+' -->';
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
export function approvedGroups(state,config){
 const groups=new Map();
 for(const e of state.publicRecords?.entries||[]){
   if(!uuid(e.id)||!validDay(e.day)||!e.reviewedAt||!['receipt','summary'].includes(e.mode))continue;
   const matches=[];
   for(const c of state.cases){
     if(c.office.id==='owner-test'||!config.offices.some(o=>o.id===c.office.id&&o.email===c.office.email&&o.basis===c.office.basis))continue;
     if(e.direction==='outbound'&&e.receipt==='provider accepted; delivery not established'){
       const m=c.outgoing.find(m=>e.sourceKey==='outbound:'+m.id&&m.status==='accepted'&&uuid(m.providerId));
       if(m)matches.push({c,m});
     }else if(e.direction==='inbound'&&e.receipt==='received; content not independently verified'){
       const r=c.incoming.find(r=>e.sourceKey==='inbound:'+r.providerId&&r.reviewed===true&&r.from===c.office.email&&r.authentication?.dmarc==='pass');
       if(r)matches.push({c,r});
     }
   }
   if(matches.length!==1)continue;
   const {c,m}=matches[0],scope=opaque(config.key,'case',c.id);
   const status=m?(state.delivery.some(x=>x.providerId===m.providerId&&x.to===m.to&&x.type==='email.delivered')?'delivered':'accepted'):'received';
   const g=groups.get(scope)||{scope,receipts:[]};
   g.receipts.push({id:opaque(config.key,'record',e.id),day:e.day,direction:e.direction,status});
   groups.set(scope,g);
 }
 return [...groups.values()];
}
function reportOkay(i){
 return eligible(i)&&i.state==='open'&&i.title.startsWith(REPORT_PREFIX)&&sections(i.body)?.get('Public scope')?.split('\n').some(x=>x.trim()==='- [x] '+SCOPE);
}
async function read(path,fetcher){
 const r=await fetcher(API+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'GRWTSK-receipt-links'},redirect:'error',signal:AbortSignal.timeout(12000)});
 requireThat(r.ok&&!r.headers.get('link')?.includes('rel="next"'),503,'Receipt routing input unavailable');return r.json();
}
export function receiptDecision(comments,question){
 if(!Array.isArray(comments)||comments.length>100)return null;
 for(const c of comments.slice().sort((a,b)=>b.id-a.id)){
   if(c.user?.id!==OWNER_ID||c.issue_url!==API+'/issues/'+question||c.created_at!==c.updated_at||!Number.isSafeInteger(c.id)||c.id<1||typeof c.body!=='string')continue;
   const text=c.body.trim();
   if(/^archive only\.?$/i.test(text))return {report:null,comment:c.id};
   const m=/^link to #([1-9]\d{0,8})\.?$/i.exec(text);
   if(m)return {report:Number(m[1]),comment:c.id};
 }
 return null;
}
export async function receiptLinkTick(store,config,fetcher=fetch){
 const {state}=await store.read(),groups=approvedGroups(state,config);
 if(!groups.length)return;
 const known=state.receiptLinks||[],pending=groups.filter(g=>!known.some(r=>r.scope===g.scope));
 if(!pending.length)return;
 const questions=await read('/issues?creator=github-actions%5Bbot%5D&state=all&per_page=100',fetcher);
 requireThat(Array.isArray(questions)&&questions.length<=100,503,'Invalid receipt questions');
 for(const g of pending.slice(0,3)){
   const candidates=questions.filter(q=>q.user?.id===BOT&&!q.pull_request&&num(q.number)&&typeof q.body==='string'&&q.body.startsWith(receiptMarker(g.scope)));
   if(candidates.length!==1)continue;
   const q=candidates[0],comments=await read('/issues/'+q.number+'/comments?per_page=100',fetcher),decision=receiptDecision(comments,q.number);
   if(!decision)continue;
   if(decision.report!==null){
     const report=await read('/issues/'+decision.report,fetcher);
     if(!reportOkay(report)||report.number!==decision.report)continue;
   }
   await store.mutate(s=>{
     s.receiptLinks||=[];
     if(!s.receiptLinks.some(r=>r.scope===g.scope)&&s.receiptLinks.length<100)
       s.receiptLinks.push({scope:g.scope,report:decision.report,question:q.number,comment:decision.comment});
   });
 }
}
export function receiptLinkProjection(state,config){
 const all=approvedGroups(state,config),known=state.receiptLinks||[];
 return {complete:all.length<=12&&all.every(g=>g.receipts.length<=40),groups:all.slice(0,12).map(g=>{
   const link=known.find(x=>x.scope===g.scope);
   return {scope:g.scope,receipts:g.receipts.slice(-40),status:link?(link.report===null?'archived':'linked'):'needs-link',
     ...(link?{report:link.report,question:link.question,comment:link.comment}:{})};
 })};
}
