import { Fault, requireThat, emptyState, assertState, encryptState, decryptState, uuid, mailbox, validateDraft } from './core.mjs';

async function request(url,{token,method='GET',body,headers={},fetcher=fetch}={}) {
  const response=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(25000),
    headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(!response.ok) throw new Fault(response.status,'Upstream request failed ('+response.status+')');
  return response.json();
}
export class GitHubStore {
  constructor(config,fetcher=fetch) {
    this.repo=config.repo; this.branch=config.branch; this.token=config.token; this.key=config.key; this.fetcher=fetcher;
    this.path='state/ledger.enc.json';
    this.base='https://api.github.com/repos/'+this.repo;
    this.aad=this.repo+'@'+this.branch+':'+this.path;
  }
  call(path,opts={}) { return request(this.base+path,{token:this.token,fetcher:this.fetcher,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},...opts}); }
  async ensurePrivate() {
    const r=await this.call('');
    requireThat(r.private===true && r.visibility==='private' && r.full_name.toLowerCase()===this.repo.toLowerCase() &&
      this.repo.toLowerCase()!=='grwtsk/grwtsk.com',503,'A separate private GitHub repository is mandatory');
  }
  async read() {
    await this.ensurePrivate();
    const f=await this.call('/contents/'+this.path+'?ref='+encodeURIComponent(this.branch));
    requireThat(f.type==='file' && f.encoding==='base64' && typeof f.sha==='string',503,'Unexpected GitHub ledger response');
    return {sha:f.sha,state:decryptState(Buffer.from(f.content,'base64').toString('utf8'),this.key,this.aad)};
  }
  async write(state,sha) {
    await this.ensurePrivate(); assertState(state);
    const content=Buffer.from(encryptState(state,this.key,this.aad)).toString('base64');
    return this.call('/contents/'+this.path,{method:'PUT',body:{message:'Update encrypted correspondence ledger',branch:this.branch,content,...(sha?{sha}:{})}});
  }
  async initialize() {
    await this.ensurePrivate();
    try { await this.read(); return; } catch(e) { if(e.status!==404) throw e; }
    try { await this.write(emptyState(),null); } catch(e) { if(![409,422].includes(e.status)) throw e; }
    await this.read();
  }
  async mutate(fn) {
    for(let attempt=0;attempt<4;attempt++){
      const {state,sha}=await this.read();
      const result=fn(state); // pure synchronous mutation: never perform external side effects here
      try { await this.write(state,sha); return result; }
      catch(e){ if(![409,422].includes(e.status)||attempt===3) throw e; }
    }
  }
}
export class MailProvider {
  constructor(key,fetcher=fetch){this.key=key;this.fetcher=fetcher;}
  call(path,opts={}){return request('https://api.resend.com'+path,{token:this.key,fetcher:this.fetcher,...opts});}
  async send(m,reference){
    const header=typeof reference==='string' && /^<[^<>\r\n]{1,490}>$/.test(reference)?reference:null;
    const result=await this.call('/emails',{method:'POST',headers:{'Idempotency-Key':'casework/'+m.id},body:{
      from:m.from,to:[m.to],reply_to:m.replyTo,subject:m.subject,text:m.text,
      tags:[{name:'correspondence_id',value:m.id}],...(header?{headers:{'In-Reply-To':header,References:header}}:{})
    }});
    requireThat(uuid(result.id),503,'Unrecognized provider receipt; reconcile without resending');
    return result.id;
  }
  receive(id){requireThat(uuid(id),400,'Invalid email ID');return this.call('/emails/receiving/'+id);}
  sent(id){requireThat(uuid(id),400,'Invalid email ID');return this.call('/emails/'+id);}
}
export async function reconcile(store,provider,input) {
  const {state}=await store.read();
  const c=state.cases.find(x=>x.id===input.caseId),m=c?.outgoing.find(x=>x.id===input.messageId);
  requireThat(m && m.status==='pending',409,'Select a pending send');
  const evidence=await provider.sent(input.providerId);
  requireThat(evidence.id===input.providerId && Array.isArray(evidence.to) && evidence.to.length===1 &&
    mailbox(evidence.to[0])===m.to && mailbox(evidence.from)===m.from &&
    evidence.subject===m.subject && evidence.text===m.text &&
    Array.isArray(evidence.reply_to) && evidence.reply_to.some(x=>mailbox(x)===m.replyTo) &&
    Array.isArray(evidence.tags) && evidence.tags.some(x=>x.name==='correspondence_id' && x.value===m.id),
    409,'Provider evidence does not match the reserved message');
  return {caseId:c.id,messageId:m.id,providerId:evidence.id};
}
export async function draftWithAI(config,office,brief,fetcher=fetch){
  requireThat(config.openaiKey && config.model,503,'AI drafting is not configured');
  const r=await request('https://api.openai.com/v1/responses',{token:config.openaiKey,fetcher,method:'POST',body:{
    model:config.model,store:false,max_output_tokens:1800,
    instructions:'Draft one concise plain-text casework email to the role supplied. Be factual, respectful and accessible; use a short subject, short paragraphs, one specific request, and no unsolicited distribution. Separate firsthand observations and documented facts from unverified allegations. Never invent evidence, motives, diagnoses, legal conclusions or affiliations. Do not name or blame private individuals, reveal sensitive medical data, make threats, pressure unrelated parties, or add recipients. Do not include information beyond the operator-approved redacted brief. If the brief is insufficient, ask for the missing information in the draft rather than inventing it. Return only the requested fields. This is a draft for human review; you cannot send mail.',
    input:JSON.stringify({recipientRole:office.role,jurisdictionOrScope:office.scope,redactedBrief:brief}),
    text:{format:{type:'json_schema',name:'casework_draft',strict:true,schema:{type:'object',properties:{subject:{type:'string'},text:{type:'string'}},required:['subject','text'],additionalProperties:false}}}
  }});
  requireThat(r.status==='completed',502,'Draft generation did not complete');
  const items=(r.output||[]).flatMap(x=>x.content||[]);
  requireThat(!items.some(x=>x.type==='refusal'),422,'The model declined the draft; revise the brief');
  const output=items.filter(x=>x.type==='output_text').map(x=>x.text).join('');
  try{return validateDraft(JSON.parse(output));}catch{throw new Fault(502,'Draft generation returned invalid content');}
}
