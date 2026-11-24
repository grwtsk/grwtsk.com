import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export class Fault extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const requireThat = (condition, status, message) => {
  if (!condition) throw new Fault(status, message);
};
export const now = () => new Date().toISOString();
export const MAX_STATE_BYTES = 480_000;
export const MAX_REPLY_CHARS = 12000;
export const uuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const digest = s => createHash('sha256').update(s).digest('hex');
export const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
export function field(value, name, max, { multiline = true } = {}) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value) &&
    (multiline || !/[\r\n]/u.test(value)), 400, 'Invalid ' + name);
  return value.trim();
}
export function email(value) {
  const s = field(value, 'email', 254, {multiline:false});
  requireThat(/^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u.test(s) &&
    !s.includes('..'),400,'Invalid single email address');
  return s.toLowerCase();
}
export function mailbox(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/<([^<>]+)>$/);
  try { return email(m ? m[1] : value); } catch { return null; }
}
export function parseOffices(value) {
  let rows; try { rows = JSON.parse(value || '[]'); } catch { throw new Fault(500,'Invalid authorized-office configuration'); }
  requireThat(Array.isArray(rows) && rows.length <= 25,500,'Configure at most 25 independently verified casework addresses');
  const seen = new Set(), addresses = new Set();
  return rows.map(r => {
    requireThat(r && typeof r === 'object' && /^[a-z0-9-]{1,64}$/.test(r.id || '') &&
      !seen.has(r.id) && ['official_casework','consented_correspondence'].includes(r.basis),500,'Invalid authorized-office entry');
    const address = email(r.email);
    requireThat(!addresses.has(address),500,'Duplicate authorized address');
    seen.add(r.id); addresses.add(address);
    const source = new URL(r.source);
    requireThat(source.protocol === 'https:' && !source.username && !source.password,500,'Source must be an official HTTPS reference');
    return {id:r.id, email:address, role:field(r.role,'office role',150,{multiline:false}),
      scope:field(r.scope,'jurisdiction or scope',400), basis:r.basis,
      source:source.href, verification:field(r.verification,'verification or consent note',500)};
  });
}
export function emptyState() { return {version:1, cases:[], events:[], delivery:[]}; }
export function assertState(state) {
  requireThat(state && state.version === 1 && Array.isArray(state.cases) &&
    Array.isArray(state.events) && Array.isArray(state.delivery),503,'Invalid correspondence state');
  requireThat(Buffer.byteLength(JSON.stringify(state)) <= MAX_STATE_BYTES,507,'Private ledger capacity reached; review storage before continuing');
  return state;
}
export function encryptState(state, key, aad) {
  assertState(state);
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
export function decryptState(raw,key,aad) {
  try {
    const e=JSON.parse(raw);
    if(e.v!==1) throw Error('version');
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(Buffer.from(e.tag,'base64'));
    const data=Buffer.concat([decipher.update(Buffer.from(e.data,'base64')),decipher.final()]);
    return assertState(JSON.parse(data.toString('utf8')));
  } catch(e) { if(e instanceof Fault) throw e; throw new Fault(503,'Cannot authenticate private correspondence ledger'); }
}
function audit(state, type, caseId, extra={}) {
  state.events.push({id:randomUUID(),at:now(),type,caseId,...extra});
}
export function findCase(state,id) {
  requireThat(uuid(id),400,'Invalid case ID');
  const c=state.cases.find(x=>x.id===id);
  requireThat(c,404,'Case not found'); return c;
}
export function currentOffice(c, offices) {
  const o=offices.find(x=>x.id===c.office.id);
  requireThat(o && o.email===c.office.email && o.basis===c.office.basis,409,'Office authorization changed; review before correspondence');
  return o;
}
export function createCase(state, offices, input, domain) {
  const o=offices.find(x=>x.id===input.officeId);
  requireThat(o,400,'Select an individually authorized official or consenting correspondence channel');
  requireThat(!state.cases.some(c=>c.office.email===o.email),409,'Use the existing case for this address');
  const id=randomUUID();
  const c={id,title:field(input.title,'case title',150,{multiline:false}),office:o,replyTo:'case-'+id+'@'+domain,
    createdAt:now(),closed:false,drafts:[],outgoing:[],incoming:[]};
  state.cases.push(c); audit(state,'case.created',id); return c;
}
export function validateDraft(input) {
  return {subject:field(input.subject,'subject',160,{multiline:false}),text:field(input.text,'plain text message',6000)};
}
export function saveDraft(state, offices, input, provenance=null) {
  const c=findCase(state,input.caseId); currentOffice(c,offices);
  requireThat(!c.closed,409,'Case is closed');
  const content=validateDraft(input);
  const material=[c.id,c.office.email,c.replyTo,content.subject,content.text];
  if(provenance)material.push(provenance);
  const hash=digest(JSON.stringify(material));
  // Repeated clicks and retries of the latest exact revision are idempotent.
  const previous=c.drafts.at(-1);
  if(previous?.hash===hash && previous.subject===content.subject && previous.text===content.text)return previous;
  const id=randomUUID();
  const draft={id,hash,...content,createdAt:now(),...(provenance?{knowledge:provenance}:{})};
  c.drafts.push(draft); audit(state,'draft.saved',c.id,{draftId:id,hash}); return draft;
}
export function suppressed(state,c) {
  return state.delivery.some(e=>e.to===c.office.email && ['email.bounced','email.complained','email.suppressed'].includes(e.type));
}
export function reserveSend(state, offices, input, from, at=now(), knowledgeFingerprint=null) {
  const c=findCase(state,input.caseId); currentOffice(c,offices);
  requireThat(!c.closed && !suppressed(state,c),409,'Case closed or recipient suppressed');
  requireThat(!c.outgoing.some(x=>x.status==='pending'),409,'Uncertain send must be reconciled before continuing');
  const d=c.drafts.at(-1);
  requireThat(d && d.id===input.draftId && same(d.hash,input.hash) && input.confirm===true,409,'Review and explicitly confirm the latest exact draft');
  if(d.knowledge)requireThat(knowledgeFingerprint===d.knowledge.fingerprint && (input.replyId||null)===d.knowledge.replyId,409,'The knowledge source or reply changed; prepare and review a new draft');
  requireThat(!c.outgoing.some(x=>x.draftId===d.id || x.hash===d.hash || (x.subject===d.subject&&x.text===d.text)),409,'This message was already attempted');
  const last=c.outgoing.at(-1);
  if(last) {
    requireThat(last.status==='accepted',409,'Previous send not reconciled');
    const response=c.incoming.find(x=>x.id===input.replyId && x.reviewed===true && x.from===c.office.email &&
      x.authentication?.dmarc==='pass' && x.receivedAt>last.at);
    requireThat(response && !c.outgoing.some(x=>x.replyId===response.id),409,'A new reviewed reply from the authorized office is required for another send');
  } else requireThat(!input.replyId,400,'Initial correspondence must not specify a reply');
  const all=state.cases.flatMap(x=>x.outgoing);
  requireThat(!all.some(x=>Date.parse(at)-Date.parse(x.at)<60_000),429,'Allow at least one minute between manual sends');
  requireThat(all.filter(x=>Date.parse(at)-Date.parse(x.at)<86_400_000).length<3,429,'Manual correspondence limit: three attempts in 24 hours');
  requireThat(Buffer.byteLength(JSON.stringify(state))<MAX_STATE_BYTES-20_000,507,'Insufficient ledger space for durable send receipts');
  const message={id:randomUUID(),draftId:d.id,hash:d.hash,at,status:'pending',from,to:c.office.email,replyTo:c.replyTo,
    subject:d.subject,text:d.text,replyId:input.replyId||null,...(d.knowledge?{knowledge:d.knowledge}:{})};
  c.outgoing.push(message);
  audit(state,'send.reserved',c.id,{messageId:message.id,draftId:d.id,hash:d.hash});
  return {caseId:c.id,message};
}
export function acceptSend(state,caseId,id,providerId) {
  requireThat(uuid(providerId),503,'Provider returned an unexpected ID; reconcile manually');
  const c=findCase(state,caseId), m=c.outgoing.find(x=>x.id===id);
  requireThat(m,409,'Missing send reservation');
  if(m.status==='accepted') { requireThat(m.providerId===providerId,409,'Conflicting receipt'); return m; }
  requireThat(m.status==='pending' && !state.cases.some(k=>k.outgoing.some(x=>x.providerId===providerId)),409,'Receipt conflict');
  m.status='accepted'; m.providerId=providerId; m.acceptedAt=now();
  audit(state,'send.provider_accepted',caseId,{messageId:id,providerId}); return m;
}
export function reviewReply(state,input) {
  const c=findCase(state,input.caseId), r=c.incoming.find(x=>x.id===input.replyId);
  requireThat(r && r.from===c.office.email && r.authentication?.dmarc==='pass',409,'Reply does not match the authorized sender and authentication policy');
  requireThat(input.confirm===true,400,'Explicit reply review required');
  if(!r.reviewed) { r.reviewed=true; audit(state,'reply.reviewed',c.id,{replyId:r.id}); }
  return r;
}
export function closeCase(state,input) {
  const c=findCase(state,input.caseId);
  requireThat(input.confirm===true,400,'Explicit closure required');
  if(!c.closed) { c.closed=true; audit(state,'case.closed',c.id); }
  return c;
}
export function verifyWebhook(raw,headers,secret,time=Date.now()) {
  const id=headers['svix-id'], ts=headers['svix-timestamp'], signature=headers['svix-signature'];
  requireThat(typeof id==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) &&
    typeof ts==='string' && /^\d{1,12}$/.test(ts) && typeof signature==='string' &&
    Math.abs(time/1000-Number(ts))<=300,400,'Invalid webhook metadata');
  const mac=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+ts+'.').update(raw).digest('base64');
  requireThat(signature.split(' ').some(x=>x.startsWith('v1,') && same(x.slice(3),mac)),400,'Invalid webhook signature');
  return id;
}
export function inbound(state,mail,providerId,hookId) {
  requireThat(uuid(providerId) && mail.id===providerId,400,'Mismatched inbound email ID');
  if(state.cases.some(c=>c.incoming.some(r=>r.providerId===providerId))) return {duplicate:true};
  const recipients=(Array.isArray(mail.received_for)&&mail.received_for.length?mail.received_for:mail.to)||[];
  const matches=state.cases.filter(c=>recipients.some(r=>mailbox(r)===c.replyTo));
  if(matches.length!==1) return {ignored:true};
  const c=matches[0], text=typeof mail.text==='string'?mail.text:'';
  const receivedAt=typeof mail.created_at==='string'&&Number.isFinite(Date.parse(mail.created_at))?new Date(mail.created_at).toISOString():now();
  const r={id:randomUUID(),providerId,hookId,receivedAt,providerCreatedAt:typeof mail.created_at==='string'?mail.created_at.slice(0,80):null,
    from:mailbox(mail.from),subject:typeof mail.subject==='string'?mail.subject.slice(0,300):'',
    text:text.slice(0,MAX_REPLY_CHARS),textTruncated:text.length>MAX_REPLY_CHARS,htmlOnly:!text&&!!mail.html,
    messageId:typeof mail.message_id==='string'?mail.message_id.slice(0,500):null,
    attachmentCount:Array.isArray(mail.attachments)?mail.attachments.length:null,
    authentication:{dmarc:mail.authentication?.dmarc==='pass'?'pass':'unverified'},reviewed:false};
  c.incoming.push(r); audit(state,'reply.received',c.id,{replyId:r.id,providerId}); return {recorded:true};
}
export const deliveryTypes=new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed']);
export function delivery(state,event,hookId,from) {
  if(state.delivery.some(e=>e.hookId===hookId)) return {duplicate:true};
  const data=event.data||{}, to=Array.isArray(data.to)&&data.to.length===1?mailbox(data.to[0]):null;
  if(!deliveryTypes.has(event.type)||!uuid(data.email_id)||mailbox(data.from)!==from||!state.cases.some(c=>c.office.email===to)) return {ignored:true};
  state.delivery.push({hookId,providerId:data.email_id,type:event.type,to,recordedAt:now(),providerCreatedAt:typeof event.created_at==='string'?event.created_at.slice(0,80):null});
  return {recorded:true};
}
