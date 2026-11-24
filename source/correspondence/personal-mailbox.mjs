import { randomUUID } from 'node:crypto';
import { Fault, requireThat, uuid, email, mailbox, now, emptyState, encryptState, decryptState, findCase, currentOffice, createCase, MAX_REPLY_CHARS } from './core.mjs';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const FILE=/^(\d{9})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.enc\.json$/;
function dayOk(d){return typeof d==='string'&&DAY.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}
function time(s){
  requireThat(typeof s==='string'&&Number.isFinite(Date.parse(s)),502,'Provider message has no valid creation time; recover from provider dashboard');
  return new Date(s).toISOString();
}
const bytes=(x,n)=>typeof x==='string'?Buffer.from(x).subarray(0,n).toString('utf8'):'';
export function mailboxRoute(mail,state,config){
  // Resend's received_for is derived from forwarding Received clauses, not
  // independently authenticated envelope data. Neither route field proves sender identity.
  const raw=Array.isArray(mail.received_for)&&mail.received_for.length?mail.received_for:mail.to;
  if(!Array.isArray(raw))return {owned:false};
  const addresses=new Set(raw.map(mailbox).filter(Boolean));
  const primary=[config.primary,config.primaryAlias].filter(Boolean).some(a=>addresses.has(a));
  const matches=state.cases.filter(c=>addresses.has(c.replyTo));
  return {owned:primary||matches.length>0,primary,caseIds:matches.map(c=>c.id),ambiguous:matches.length>1};
}
export function admission(mail,state,config){
  const route=mailboxRoute(mail,state,config);
  if(!route.owned)return {disposition:'ignored',reason:'not-addressed-to-mailbox'};
  const sender=mailbox(mail.from);
  const office=(config.offices||[]).find(o=>o.email===sender);
  if(!office)return {disposition:'ignored',reason:'not-on-authorized-list'};
  // Trust the provider's computed result, never a header supplied by the sender.
  // DMARC authenticates a sending domain, not a particular person.
  if(mail.authentication?.dmarc!=='pass')return {disposition:'ignored',reason:'authentication-not-verified'};
  const headers=mail.headers&&typeof mail.headers==='object'?Object.fromEntries(Object.entries(mail.headers).map(([k,v])=>[k.toLowerCase(),String(v)])):{};
  const automated=(headers['auto-submitted']&&headers['auto-submitted'].trim().toLowerCase()!=='no')||
    ['bulk','list','junk'].includes((headers.precedence||'').trim().toLowerCase())||
    !!headers['list-id']||!!headers['list-unsubscribe'];
  const exactCase=route.caseIds.length===1&&state.cases.some(c=>c.id===route.caseIds[0]&&!c.closed&&
    c.office.id===office.id&&c.office.email===office.email&&c.office.basis===office.basis);
  const held=!!automated||route.ambiguous||(route.caseIds.length===1&&!exactCase);
  const reason=automated?'automation-or-list-header':route.ambiguous?'ambiguous-case-route':route.caseIds.length===1&&!exactCase?'case-authorization-mismatch':'authorized-authenticated-sender';
  return {disposition:held?'held':'admitted',reason,
    route:{...route,disposition:held?'held':'admitted',officeId:office.id,reason},
    linkCase:!held&&exactCase};
}
export function archiveMessage(mail,id,route){
  requireThat(uuid(id)&&mail.id===id,400,'Mismatched provider email ID');
  requireThat(route.owned,400,'Email is not addressed to a configured mailbox');
  const createdAt=time(mail.created_at),day=createdAt.slice(0,10),stamp=createdAt.slice(11,23).replace(/[:.]/g,'');
  const name=stamp+'-'+id.toLowerCase()+'.enc.json';
  const text=bytes(mail.text,48_000),html=bytes(mail.html,72_000);
  const attachments=Array.isArray(mail.attachments)?mail.attachments.slice(0,50).map(a=>({
    id:uuid(a.id)?a.id:null,filename:bytes(a.filename,240),contentType:bytes(a.content_type,120),
    size:Number.isSafeInteger(a.size)&&a.size>=0?a.size:null
  })):[];
  return {version:1,id:id.toLowerCase(),day,name,createdAt,from:mailbox(mail.from),subject:bytes(mail.subject,500),
    text,html,bodyTruncated:Buffer.byteLength(mail.text||'')>48_000||Buffer.byteLength(mail.html||'')>72_000,
    attachmentCount:Array.isArray(mail.attachments)?mail.attachments.length:null,attachments,
    messageId:bytes(mail.message_id,500)||null,authentication:{dmarc:mail.authentication?.dmarc==='pass'?'pass':'unverified'},
    route:{primary:route.primary,caseIds:route.caseIds,ambiguous:route.ambiguous,disposition:route.disposition||'legacy-unreviewed',officeId:route.officeId||null,reason:route.reason||null},archivedAt:now()};
}
function validLocation(day,name){return dayOk(day)&&typeof name==='string'&&FILE.test(name);}
function path(day,name){requireThat(validLocation(day,name),400,'Invalid mailbox archive reference');return 'mailbox/inbound/'+day+'/'+name;}
function aad(store,p){return store.repo+'@'+store.branch+':'+p;}
function contentWrapper(m){return {...emptyState(),mailArchive:m};}
function decode(store,p,f){
  requireThat(f.type==='file'&&f.encoding==='base64'&&typeof f.content==='string',503,'Unexpected mailbox archive response');
  const a=decryptState(Buffer.from(f.content,'base64').toString('utf8'),store.key,aad(store,p)).mailArchive;
  requireThat(a&&a.version===1&&uuid(a.id)&&validLocation(a.day,a.name)&&path(a.day,a.name)===p&&a.name.endsWith(a.id+'.enc.json'),503,'Invalid archive record');
  return a;
}
export class PersonalArchive {
  constructor(store){this.store=store;}
  async get(day,name){
    const p=path(day,name);await this.store.ensurePrivate();
    return decode(this.store,p,await this.store.call('/contents/'+p+'?ref='+encodeURIComponent(this.store.branch)));
  }
  async put(m){
    const p=path(m.day,m.name);await this.store.ensurePrivate();
    const encrypted=encryptState(contentWrapper(m),this.store.key,aad(this.store,p));
    try{
      await this.store.call('/contents/'+p,{method:'PUT',body:{branch:this.store.branch,message:'Archive encrypted incoming mail',content:Buffer.from(encrypted).toString('base64')}});
      return {created:true,record:m};
    }catch(e){
      if(![409,422].includes(e.status))throw e;
      const prior=await this.get(m.day,m.name);
      requireThat(prior.id===m.id&&prior.createdAt===m.createdAt,409,'Conflicting mailbox archive record');
      return {created:false,record:prior};
    }
  }
  async list(day,cursor=null){
    requireThat(dayOk(day)&&(cursor===null||validLocation(day,cursor)),400,'Invalid mailbox date or cursor');
    await this.store.ensurePrivate();
    let entries;
    try{entries=await this.store.call('/contents/mailbox/inbound/'+day+'?ref='+encodeURIComponent(this.store.branch));}
    catch(e){if(e instanceof Fault&&e.status===404)return {day,items:[],next:null,directoryLimit:false};throw e;}
    requireThat(Array.isArray(entries),503,'Unexpected mailbox directory');
    const names=entries.filter(e=>e.type==='file'&&validLocation(day,e.name)).map(e=>e.name).sort().reverse();
    const selected=names.filter(n=>cursor===null||n<cursor).slice(0,10);
    // Do not fetch arbitrary URLs from the directory; every path is reconstructed
    // from the validated archive reference. Body and HTML stay out of this list.
    const rows=await Promise.all(selected.map(name=>this.get(day,name)));
    const items=rows.map(({id,name,createdAt,from,subject,authentication,bodyTruncated,attachmentCount,route})=>({id,name,createdAt,from,subject,authentication,bodyTruncated,attachmentCount,route}));
    return {day,items,next:selected.length&&names.some(n=>n<selected.at(-1))?selected.at(-1):null,directoryLimit:entries.length>=1000};
  }
}
export async function ingestPersonal(store,archive,config,mail,id,hook,normalInbound){
  requireThat(uuid(id)&&mail.id===id,400,'Mismatched provider email ID');
  const {state}=await store.read(),decision=admission(mail,state,config);
  // Unknown/unauthenticated senders are not persisted, sent to AI, or answered.
  // The provider may retain its own copy for manual screening/recovery.
  if(decision.disposition==='ignored')return {ignored:true,reason:decision.reason};
  const archived=await archive.put(archiveMessage(mail,id,decision.route));
  // The durable archive is written first. A subsequent failure must return a
  // non-2xx webhook response; replay is safe because the archive is create-once.
  let caseLinked=false;
  if(decision.linkCase&&archived.record.route.disposition==='admitted'){
    caseLinked=await store.mutate(s=>{
      const latest=admission(mail,s,config);
      if(!latest.linkCase)return false;
      const result=normalInbound(s,mail,id,hook);
      return !!(result.recorded||result.duplicate);
    });
  }
  if(config.githubFirst&&decision.disposition==='admitted'&&archived.record.route.disposition==='admitted'&&
    archived.record.route.primary&&archived.record.route.caseIds.length===0&&archived.record.route.officeId==='owner-test'){
    caseLinked=await store.mutate(s=>{
      const o=config.offices.find(x=>x.id==='owner-test'&&x.basis==='consented_correspondence'&&x.email===archived.record.from);
      const current=admission(mail,s,config);
      if(!o||current.disposition!=='admitted'||!current.route.primary||current.route.caseIds.length!==0)return false;
      if(s.cases.some(c=>c.incoming.some(r=>r.providerId===id)))return s.cases.some(c=>c.office.id===o.id&&c.incoming.some(r=>r.providerId===id));
      const matches=s.cases.filter(c=>c.office.email===o.email);
      if(matches.length>1||matches.some(c=>c.closed||c.office.id!==o.id||c.office.basis!==o.basis))return false;
      const c=matches[0]||createCase(s,config.offices,{officeId:o.id,title:'Owner correspondence'},config.domain);
      if(c.outgoing.at(-1)&&archived.record.createdAt<=c.outgoing.at(-1).at)return false;
      attachPersonalReply(s,config.offices,{caseId:c.id,confirm:true},archived.record);
      return true;
    });
  }
  return {archived:true,duplicateArchive:!archived.created,disposition:archived.record.route.disposition,reason:decision.reason,caseLinked};
}
export function attachPersonalReply(state,offices,input,record){
  requireThat(input.confirm===true,400,'Confirm the selected correspondence association');
  const c=findCase(state,input.caseId),o=currentOffice(c,offices);
  requireThat(!c.closed&&record.route.primary&&record.route.disposition==='admitted'&&record.route.officeId===o.id&&record.from===o.email&&record.authentication?.dmarc==='pass',409,'Only a matching authenticated, admitted primary-mailbox message may be associated with an active authorized case');
  requireThat(!state.cases.some(k=>k.incoming.some(r=>r.providerId===record.id)),409,'Message is already associated with a correspondence case');
  const latest=c.outgoing.at(-1);
  if(latest)requireThat(record.createdAt>latest.at,409,'Message predates the latest correspondence attempt');
  const r={id:randomUUID(),providerId:record.id,hookId:null,receivedAt:record.createdAt,providerCreatedAt:record.createdAt,
    from:record.from,subject:record.subject.slice(0,300),text:record.text.slice(0,MAX_REPLY_CHARS),
    textTruncated:record.bodyTruncated||record.text.length>MAX_REPLY_CHARS,htmlOnly:!record.text&&!!record.html,
    messageId:record.messageId,attachmentCount:record.attachmentCount,authentication:record.authentication,
    reviewed:false,archive:{day:record.day,name:record.name}};
  c.incoming.push(r);state.events.push({id:randomUUID(),at:now(),type:'reply.associated_from_primary_mailbox',caseId:c.id,replyId:r.id,providerId:r.providerId});
  return r;
}
