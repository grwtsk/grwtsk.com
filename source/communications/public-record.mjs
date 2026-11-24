import { randomUUID } from 'node:crypto';
import { requireThat, uuid, field, digest, now, findCase, currentOffice } from './core.mjs';

const BASE='source/data/formal-complaint-and-demand-for-independent-investigation/public-correspondence/';
const REVIEW_NOTICE='The public record is a reviewed summary or receipt, not a verbatim email or a determination of the allegations.';
const noContact=/[^\s<>]+@[^\s<>]+\.[^\s<>]+|(?:https?:\/\/|mailto:|www\.)|(?:\+?\d[\s().-]*){10,}|(?:sk-(?:proj-)?|ghp_|github_pat_|re_[A-Za-z0-9_]{12,})[A-Za-z0-9_-]+/iu;
function ledger(state){const l=state.publicRecords||{version:1,entries:[]};requireThat(l.version===1&&Array.isArray(l.entries),503,'Invalid public record ledger');return l;}
function day(at){requireThat(typeof at==='string'&&Number.isFinite(Date.parse(at)),409,'Record date unavailable');return new Date(at).toISOString().slice(0,10);}
export function sourceForCase(state,offices,input){
  const c=findCase(state,input.caseId);currentOffice(c,offices);
  requireThat(uuid(input.messageId)&&['outbound','inbound'].includes(input.direction),400,'Select a correspondence record');
  if(input.direction==='outbound'){
    const m=c.outgoing.find(x=>x.id===input.messageId);
    requireThat(m&&m.status==='accepted'&&uuid(m.providerId),409,'Only a provider-accepted send can be recorded as sent');
    return {key:'outbound:'+m.id,direction:'outbound',day:day(m.at),receipt:'provider accepted; delivery not established'};
  }
  const r=c.incoming.find(x=>x.id===input.messageId);
  requireThat(r&&r.reviewed===true&&r.from===c.office.email&&r.authentication?.dmarc==='pass'&&uuid(r.providerId),409,'Only reviewed authenticated replies may be prepared for public record');
  return {key:'inbound:'+r.providerId,direction:'inbound',day:day(r.receivedAt),receipt:'received; content not independently verified'};
}
export function sourceForArchive(record,offices){
  const o=offices.find(x=>x.id===record.route.officeId&&x.email===record.from);
  requireThat(o&&record.route.disposition==='admitted'&&record.authentication?.dmarc==='pass',409,'Only currently authorized, authenticated, admitted archive records may be prepared for public record');
  return {key:'inbound:'+record.id,direction:'inbound',day:day(record.createdAt),receipt:'received; content not independently verified'};
}
function outputMarkdown(entry){
  const lines=['# Correspondence record','','Record: '+entry.id,'Date (UTC): '+entry.day,'Direction: '+entry.direction,
    'Receipt status: '+entry.receipt,'Disclosure: '+(entry.mode==='receipt'?'receipt only; message content withheld':'reviewed public summary'),
    '',REVIEW_NOTICE,''];
  if(entry.mode==='summary')lines.push('## Reviewed public summary','',entry.summary,'');
  return lines.join('\n')+'\n';
}
export function preparePublicRecord(state,source,input){
  requireThat(input.confirm===true&&input.privacyReviewed===true&&input.disclosureAuthorized===true,400,'Review this exact public disclosure and confirm third-party information is protected and disclosure is authorized');
  requireThat(['receipt','summary'].includes(input.mode),400,'Select receipt-only or reviewed summary');
  const summary=input.mode==='summary'?field(input.summary,'public summary',2400):null;
  if(summary!==null){
    requireThat(!noContact.test(summary)&&!/[<>{}\[\]\x60]/u.test(summary),400,'Public summary must be plain text without contact details, links, identifiers, or active markup');
  }else requireThat(!input.summary,400,'Receipt-only records contain no message text');
  requireThat(typeof source.key==='string'&&/^(inbound|outbound):[0-9a-f-]{36}$/i.test(source.key),400,'Invalid source');
  const l=ledger(state);
  const existing=l.entries.find(x=>x.sourceKey===source.key);
  if(existing){
    requireThat(existing.mode===input.mode&&existing.summary===summary,409,'A public export already exists; handle corrections through reviewed Git history rather than overwriting it');
    return exportRecord(existing);
  }
  requireThat(l.entries.length<300,507,'Public-record review ledger capacity reached');
  const e={id:randomUUID(),sourceKey:source.key,direction:source.direction,day:source.day,receipt:source.receipt,mode:input.mode,summary,reviewedAt:now(),status:'prepared-not-published'};
  e.hash=digest(outputMarkdown(e));l.entries.push(e);state.publicRecords=l;
  return exportRecord(e);
}
function exportRecord(e){
  return {id:e.id,path:BASE+e.day+'-'+e.id+'.md',markdown:outputMarkdown(e),sha256:e.hash,status:e.status};
}
export function casePublicCoverage(state,caseId){
  const c=findCase(state,caseId),l=ledger(state),entries=[];
  for(const m of c.outgoing)entries.push({id:m.id,direction:'outbound',date:m.at,eligible:m.status==='accepted'&&uuid(m.providerId),prepared:l.entries.some(e=>e.sourceKey==='outbound:'+m.id),status:m.status});
  for(const r of c.incoming)entries.push({id:r.id,direction:'inbound',date:r.receivedAt,eligible:r.reviewed===true&&r.from===c.office.email&&r.authentication?.dmarc==='pass'&&uuid(r.providerId),prepared:l.entries.some(e=>e.sourceKey==='inbound:'+r.providerId),status:r.reviewed?'reviewed':'unreviewed'});
  return {entries,prepared:entries.filter(e=>e.prepared).length,total:entries.length,publication:'manual-review-required'};
}
