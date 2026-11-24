import {uuid,mailbox,inbound,acceptSend,requireThat} from './core.mjs';
import {ingestPersonal,mailboxRoute} from './personal-mailbox.mjs';
import {reconcile} from './adapters.mjs';

// Bounded GET-only provider reconciliation. Never retry or create a send.
const BOUND=20;
function checkedPage(page){
 requireThat(page&&Array.isArray(page.data)&&page.data.length<=BOUND&&typeof page.has_more==='boolean'&&page.data.every(m=>uuid(m.id)),503,'Invalid provider page');
 return page;
}
export async function recoverIntake(store,archive,config,provider){
 const page=checkedPage(await provider.listReceived(BOUND)),{state}=await store.read();
 const authorized=new Set(config.offices.map(o=>o.email));
 let attempted=0;
 for(const entry of page.data.slice().reverse()){
   if(!authorized.has(mailbox(entry.from))||!mailboxRoute(entry,state,config).owned||
      state.cases.some(c=>c.incoming.some(r=>r.providerId===entry.id)))continue;
   const prior=await archive.byProviderId(entry.id);
   if(prior&&prior.route.disposition!=='admitted')continue;
   // Recover only a new admitted record or a previously archived but not
   // indexed direct/case-alias message. Existing admission is rechecked.
   if(attempted>=5)return {complete:false};
   const mail=await provider.receive(entry.id);
   await ingestPersonal(store,archive,config,mail,entry.id,'read-only-recovery',inbound);
   attempted++;
 }
 // A truncated listing is explicitly incomplete, never a claim of absence.
 return {complete:!page.has_more};
}
export async function reconcilePending(store,provider){
 const {state}=await store.read();
 const pending=state.cases.flatMap(c=>c.outgoing.filter(m=>m.status==='pending').map(m=>({caseId:c.id,message:m})));
 if(!pending.length)return {complete:true,pending:0};
 const page=checkedPage(await provider.listSent(BOUND));
 for(const {caseId,message:m} of pending.slice(0,3)){
   const candidates=page.data.filter(e=>Array.isArray(e.to)&&e.to.length===1&&mailbox(e.to[0])===m.to&&mailbox(e.from)===m.from&&e.subject===m.subject).slice(0,5);
   for(const candidate of candidates){
     let matched;
     try{matched=await reconcile(store,provider,{caseId,messageId:m.id,providerId:candidate.id});}
     catch{continue;}
     await store.mutate(s=>acceptSend(s,matched.caseId,matched.messageId,matched.providerId));break;
   }
 }
 const current=(await store.read()).state.cases.reduce((n,c)=>n+c.outgoing.filter(m=>m.status==='pending').length,0);
 return {complete:current===0,pending:current};
}
export async function recoveryTick(store,archive,config,provider){
 const stamp=new Date().toISOString().slice(0,10);
 let intake='unavailable',reconciliation='unavailable';
 try{intake=(await recoverIntake(store,archive,config,provider)).complete?'verified':'bounded';}catch{}
 try{reconciliation=(await reconcilePending(store,provider)).complete?'verified':'unresolved';}catch{}
 await store.mutate(s=>{s.recovery={day:stamp,intake,reconciliation};});
}
export function recoveryProjection(state){
 return state.recovery?{day:state.recovery.day,intake:state.recovery.intake,reconciliation:state.recovery.reconciliation}:null;
}
