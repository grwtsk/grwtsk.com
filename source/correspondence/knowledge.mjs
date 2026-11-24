import { randomUUID } from 'node:crypto';
import { Fault, requireThat, digest, field, uuid, now, currentOffice, findCase, suppressed, validateDraft, MAX_STATE_BYTES } from './core.mjs';

export const SIGNAL_PATH = 'signals/approved.md';
const MAX_SIGNALS_BYTES=48_000, MAX_ENTRIES=80, MAX_SELECTED_BYTES=24_000;
const kinds=new Set(['fact','request','preference','decision','question','coordination','reply-summary']);
const evidenceKinds=new Set(['documented','firsthand','reported','uncertain','instruction']);
const idPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;

// A deliberately small Markdown grammar: fixed metadata, then free-form Markdown.
// Reject ambiguous or malformed entries instead of silently ignoring them.
export function parseSignals(raw) {
  requireThat(typeof raw==='string'&&Buffer.byteLength(raw)<=MAX_SIGNALS_BYTES,400,'Signal file exceeds 48 KB');
  const text=raw.replace(/\r\n/g,'\n').trim();
  requireThat(text==='## Communication signals v1'||text.startsWith('## Communication signals v1\n'),400,'Missing signal file heading');
  const rest=text.slice('## Communication signals v1'.length).trim();
  if(!rest)return [];
  requireThat(rest.startsWith('### '),400,'Expected signal headings');
  const entries=rest.split(/(?:^|\n)### /).slice(1);
  requireThat(entries.length<=MAX_ENTRIES,400,'Too many signal entries');
  const seen=new Set();
  return entries.map(entry=>{
    const lines=entry.split('\n'),id=lines.shift();
    requireThat(idPattern.test(id)&&!seen.has(id),400,'Duplicate or invalid signal ID');
    seen.add(id);
    const meta={};
    for(const key of ['kind','scope','state','evidence','source','reply','ai']){
      const line=lines.shift()||'';
      requireThat(line.startsWith(key+': '),400,'Signal '+id+': expected '+key);
      meta[key]=line.slice(key.length+2).trim();
    }
    requireThat(lines.shift()==='',400,'Signal '+id+': separate metadata and Markdown body with a blank line');
    const body=field(lines.join('\n'),'signal body',2500);
    requireThat(kinds.has(meta.kind)&&evidenceKinds.has(meta.evidence)&&['active','retired'].includes(meta.state)&&
      ['approved','local-only'].includes(meta.ai)&&meta.source.length>0&&meta.source.length<=500,400,'Invalid signal metadata: '+id);
    const scope=meta.scope;
    const caseScope=scope.startsWith('case:')&&uuid(scope.slice(5));
    const officeScope=scope.startsWith('office:')&&/^[a-z0-9-]{1,64}$/.test(scope.slice(7));
    requireThat(caseScope||officeScope||scope==='general',400,'Invalid signal scope: '+id);
    if(!caseScope)requireThat(['preference','coordination'].includes(meta.kind)&&meta.evidence==='instruction',400,'Shared signals may contain generic communication preferences only');
    if(meta.kind==='reply-summary')requireThat(caseScope&&uuid(meta.reply)&&meta.evidence==='reported',400,'Reply summary must reference a specific case reply and use reported evidence');
    else requireThat(meta.reply==='none',400,'Only reply summaries may reference an incoming reply');
    if(meta.kind==='fact')requireThat(meta.evidence!=='instruction',400,'A factual signal must classify its evidence');
    if(meta.kind==='question')requireThat(meta.evidence==='uncertain',400,'Questions must remain explicitly uncertain');
    return {id,...meta,body};
  });
}
function proposals(state) {
  if(!state.knowledge)state.knowledge={proposals:[]};
  requireThat(Array.isArray(state.knowledge.proposals),503,'Invalid knowledge ledger');
  return state.knowledge.proposals;
}
export function planForCase(state,offices,caseId,snapshot) {
  const c=findCase(state,caseId),o=currentOffice(c,offices);
  if(c.closed||suppressed(state,c)||c.outgoing.some(m=>m.status==='pending'))return null;
  const latest=c.outgoing.at(-1);
  if(latest&&latest.status!=='accepted')return null;
  const notes=snapshot.entries.filter(n=>n.state==='active'&&n.ai==='approved'&&
    (n.scope==='general'||n.scope==='office:'+o.id||n.scope==='case:'+c.id));
  const requests=notes.filter(n=>n.scope==='case:'+c.id&&n.kind==='request');
  if(!requests.length)return null;
  let reply=null;
  if(latest){
    const candidates=c.incoming.filter(r=>r.reviewed===true&&r.from===o.email&&r.authentication?.dmarc==='pass'&&
      r.receivedAt>latest.at&&!c.outgoing.some(m=>m.replyId===r.id));
    reply=candidates.at(-1);
    if(!reply||!notes.some(n=>n.kind==='reply-summary'&&n.reply===reply.id))return null;
  }
  const selected=notes.filter(n=>n.kind!=='reply-summary'||(reply&&n.reply===reply.id)).sort((a,b)=>a.id.localeCompare(b.id));
  requireThat(Buffer.byteLength(JSON.stringify(selected))<=MAX_SELECTED_BYTES,413,'Too much approved context; retire or narrow notes for this case');
  const fingerprint=digest(JSON.stringify([1,c.id,o.id,o.email,o.role,o.scope,latest?.id||null,reply?.id||null,selected]));
  return {caseId:c.id,office:{role:o.role,scope:o.scope},mode:reply?'reply':'initial',replyId:reply?.id||null,
    fingerprint,source:{path:SIGNAL_PATH,blob:snapshot.blob,commit:snapshot.commit},signals:selected};
}
export function describePlan(plan,state) {
  if(!plan)return {ready:false,reason:'No active approved case request, or no new reviewed reply with an approved redacted summary.'};
  const p=(state.knowledge?.proposals||[]).find(x=>x.fingerprint===plan.fingerprint);
  return {ready:true,mode:plan.mode,replyId:plan.replyId,fingerprint:plan.fingerprint,source:plan.source,
    signals:plan.signals.map(({id,kind,evidence,source})=>({id,kind,evidence,source})),proposal:p||null};
}
export function reserveProposal(state,offices,caseId,snapshot) {
  const plan=planForCase(state,offices,caseId,snapshot);
  requireThat(plan,409,'Add an approved scoped request or approved redacted summary of the reviewed reply first');
  const all=proposals(state),existing=all.find(p=>p.fingerprint===plan.fingerprint);
  if(existing)return {existing:true,proposal:existing};
  requireThat(all.length<120 && Buffer.byteLength(JSON.stringify(state))<MAX_STATE_BYTES-28_000,507,'Knowledge ledger capacity reached');
  const t=Date.now();
  requireThat(!all.some(p=>t-Date.parse(p.createdAt)<60_000)&&all.filter(p=>t-Date.parse(p.createdAt)<86_400_000).length<12,429,'Draft preparation limit reached; existing notes are retained');
  const p={id:randomUUID(),caseId,mode:plan.mode,replyId:plan.replyId,fingerprint:plan.fingerprint,source:plan.source,
    signalIds:plan.signals.map(n=>n.id),createdAt:now(),status:'pending'};
  all.push(p);return {existing:false,proposal:p,plan};
}
export function validateProposal(input,plan) {
  const content=validateDraft(input);
  const keys=['subject','text','usedSignalIds','missingInformation','coordination'];
  requireThat(input&&typeof input==='object'&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k)),502,'Invalid structured proposal');
  requireThat(Array.isArray(input.usedSignalIds)&&input.usedSignalIds.length>0&&input.usedSignalIds.length<=plan.signals.length&&
    new Set(input.usedSignalIds).size===input.usedSignalIds.length&&input.usedSignalIds.every(id=>plan.signals.some(n=>n.id===id)),502,'Proposal contains an unknown or missing evidence reference');
  requireThat(Array.isArray(input.missingInformation)&&input.missingInformation.length<=8,502,'Invalid missing-information list');
  const missingInformation=input.missingInformation.map(x=>field(x,'missing information',300));
  requireThat(typeof input.coordination==='string'&&input.coordination.length<=500,502,'Invalid coordination note');
  return {...content,usedSignalIds:input.usedSignalIds,missingInformation,coordination:input.coordination};
}
export function finishProposal(state,id,output) {
  const p=proposals(state).find(x=>x.id===id);
  requireThat(p&&p.status==='pending',409,'Proposal reservation unavailable');
  p.status=output?'ready':'failed';p.finishedAt=now();
  if(output)p.output=output;
  return p;
}
export function currentProvenance(state,offices,caseId,proposalId,snapshot) {
  const plan=planForCase(state,offices,caseId,snapshot);
  const p=proposals(state).find(x=>x.id===proposalId&&x.caseId===caseId&&x.status==='ready');
  requireThat(plan&&p&&p.fingerprint===plan.fingerprint,409,'Proposal is stale or unavailable; refresh from current Markdown');
  return {proposalId:p.id,fingerprint:p.fingerprint,replyId:p.replyId,source:p.source,
    suppliedSignalIds:p.signalIds,modelReferencedSignalIds:p.output.usedSignalIds};
}
export async function prepareProposal(store,config,caseId,snapshot,generate) {
  const r=await store.mutate(s=>reserveProposal(s,config.offices,caseId,snapshot));
  if(r.existing)return r.proposal;
  // Only an internal draft. A durable reservation prevents a restart or another
  // worker from repeatedly calling the model for the same source fingerprint.
  let output;
  try{output=validateProposal(await generate(config,r.plan),r.plan);}
  catch{await store.mutate(s=>finishProposal(s,r.proposal.id,null));throw new Fault(502,'Draft preparation failed; saved signals remain available');}
  return store.mutate(s=>finishProposal(s,r.proposal.id,output));
}
export async function prepareNext(store,config,generate) {
  const snapshot=await store.readSignals(),{state}=await store.read();
  if(!snapshot)return null;
  for(const c of state.cases){
    const plan=planForCase(state,config.offices,c.id,snapshot);
    if(plan&&!(state.knowledge?.proposals||[]).some(p=>p.fingerprint===plan.fingerprint))
      return prepareProposal(store,config,c.id,snapshot,generate);
  }
  return null;
}
