import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHmac,randomUUID } from 'node:crypto';
import { emptyState, parseOffices, encryptState,decryptState,createCase,saveDraft,reserveSend,acceptSend,inbound,reviewReply,delivery,verifyWebhook,closeCase } from '../core.mjs';
import { GitHubStore,MailProvider,draftWithAI,reconcile } from '../adapters.mjs';

const offices=parseOffices(JSON.stringify([{id:'test-office',email:'intake@example.org',role:'Test casework office',scope:'Synthetic example',basis:'official_casework',source:'https://example.org/intake',verification:'Synthetic fixture only'}]));
const sender='casework@example.net', domain='replies.example.net';
function fixture(){
  const s=emptyState(),c=createCase(s,offices,{officeId:'test-office',title:'Test case'},domain);
  const d=saveDraft(s,offices,{caseId:c.id,subject:'Request',text:'Please review the test.'});
  return {s,c,d,approval:{caseId:c.id,draftId:d.id,hash:d.hash,confirm:true}};
}
test('encrypted ledger authenticates ciphertext and repository binding',()=>{
  const key=randomBytes(32),s=emptyState(),raw=encryptState(s,key,'repo@main');
  assert.deepEqual(decryptState(raw,key,'repo@main'),s);
  assert.throws(()=>decryptState(raw,key,'other@main'),/authenticate/);
  const bad=JSON.parse(raw);bad.tag=randomBytes(16).toString('base64');
  assert.throws(()=>decryptState(JSON.stringify(bad),key,'repo@main'),/authenticate/);
  assert.throws(()=>decryptState(raw,randomBytes(32),'repo@main'),/authenticate/);
});
test('single authorized case; no bulk or arbitrary recipient',()=>{
  const {s}=fixture();assert.throws(()=>createCase(s,offices,{officeId:'other',title:'Test'},domain),/authorized/);
  assert.throws(()=>createCase(s,offices,{officeId:'test-office',title:'Duplicate'},domain),/existing case/);
  assert.throws(()=>parseOffices('[{"id":"x","email":"a@example.org,b@example.org","basis":"official_casework","source":"https://example.org"}]'),/email/);
});
test('stale or altered approval cannot reserve; pending send blocks repeat',()=>{
  const {s,c,d,approval}=fixture();
  assert.throws(()=>reserveSend(s,offices,{...approval,hash:'invalid'},sender),/confirm/);
  const newer=saveDraft(s,offices,{caseId:c.id,subject:'Updated',text:'Revised text.'});
  assert.throws(()=>reserveSend(s,offices,approval,sender),/confirm/);
  const updated={...approval,draftId:newer.id,hash:newer.hash};
  const r=reserveSend(s,offices,updated,sender);
  assert.equal(r.message.to,offices[0].email);assert.equal(r.message.status,'pending');
  assert.throws(()=>reserveSend(s,offices,updated,sender),/reconciled/);
  const pid=randomUUID();acceptSend(s,c.id,r.message.id,pid);acceptSend(s,c.id,r.message.id,pid);
  assert.equal(c.outgoing[0].providerId,pid);assert.throws(()=>reserveSend(s,offices,updated,sender),/attempted/);
});
test('authenticated inbound is deduplicated, must be reviewed for a reply',()=>{
  const {s,c,approval}=fixture();const r=reserveSend(s,offices,approval,sender,'2026-01-01T00:00:00.000Z');
  acceptSend(s,c.id,r.message.id,randomUUID());
  const id=randomUUID(), mail={id,to:[c.replyTo],from:offices[0].email,text:'Reply',authentication:{dmarc:'pass'}};
  assert.deepEqual(inbound(s,mail,id,'msg1'),{recorded:true});assert.deepEqual(inbound(s,mail,id,'msg2'),{duplicate:true});
  const d=saveDraft(s,offices,{caseId:c.id,subject:'Follow-up',text:'Thank you.'});
  const p={caseId:c.id,draftId:d.id,hash:d.hash,confirm:true,replyId:c.incoming[0].id};
  assert.throws(()=>reserveSend(s,offices,p,sender),/reviewed reply/);
  reviewReply(s,{caseId:c.id,replyId:c.incoming[0].id,confirm:true});
  assert.equal(reserveSend(s,offices,p,sender).message.replyId,c.incoming[0].id);
});
test('bounce suppresses future correspondence; close irreversible in application',()=>{
  const {s,c,approval}=fixture(),id=randomUUID();
  delivery(s,{type:'email.bounced',data:{from:sender,to:[c.office.email],email_id:id}},'hook',sender);
  assert.throws(()=>reserveSend(s,offices,approval,sender),/suppressed/);
  closeCase(s,{caseId:c.id,confirm:true});assert.equal(c.closed,true);
});
test('webhook verification covers raw bytes and replay window',()=>{
  const key=randomBytes(32),secret='whsec_'+key.toString('base64'),raw=Buffer.from('{"type":"email.received"}'),t=Date.now(),ts=String(Math.floor(t/1000)),id='msg_test';
  const sig=createHmac('sha256',key).update(id+'.'+ts+'.').update(raw).digest('base64');
  const headers={'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+sig};
  assert.equal(verifyWebhook(raw,headers,secret,t),id);
  assert.throws(()=>verifyWebhook(Buffer.concat([raw,Buffer.from(' ')]),headers,secret,t),/signature/);
  assert.throws(()=>verifyWebhook(raw,headers,secret,t+301000),/metadata/);
});
test('GitHub store refuses a public repository before writes',async()=>{
  let requests=0;const store=new GitHubStore({repo:'test/public',branch:'main',token:'test',key:randomBytes(32)},async()=>{requests++;return Response.json({private:false,visibility:'public',full_name:'test/public'});});
  await assert.rejects(store.initialize(),/private/);assert.equal(requests,1);
});
test('GitHub CAS uses current blob SHA and encrypted contents',async()=>{
  let blob=null,sha=null,puts=0;const config={repo:'test/private',branch:'main',token:'test',key:randomBytes(32)};
  const fake=async(url,opts)=>{
    if(url.endsWith('/repos/test/private'))return Response.json({private:true,visibility:'private',full_name:'test/private'});
    if(opts.method==='GET')return blob?Response.json({type:'file',encoding:'base64',sha,content:blob}):new Response('',{status:404});
    const body=JSON.parse(opts.body);
    assert.equal(body.sha??null,sha);
    if(puts++===1)return new Response('',{status:409});
    blob=body.content;sha='blob-'+puts;return Response.json({content:{sha}});
  };
  const store=new GitHubStore(config,fake);await store.initialize();
  await store.mutate(s=>createCase(s,offices,{officeId:'test-office',title:'Sensitive synthetic title'},domain));
  assert.ok(!Buffer.from(blob,'base64').toString().includes('Sensitive synthetic title'));
  assert.equal((await store.read()).state.cases.length,1);assert.equal(puts,3);
});
test('provider sends exactly one address and one idempotency key',async()=>{
  let captured;const p=new MailProvider('test',async(url,opts)=>{captured={url,opts};return Response.json({id:randomUUID()});});
  const {s,approval}=fixture(),m=reserveSend(s,offices,approval,sender).message;await p.send(m);
  const body=JSON.parse(captured.opts.body);assert.deepEqual(body.to,[offices[0].email]);
  assert.equal(body.reply_to,m.replyTo);assert.equal(captured.opts.headers['Idempotency-Key'],'casework/'+m.id);
  assert.equal(body.cc,undefined);assert.equal(body.bcc,undefined);
});
test('AI receives only redacted brief and role; no tools, no recipient address',async()=>{
  const r=await draftWithAI({openaiKey:'test',model:'test'},offices[0],'Synthetic policy question.',async(url,opts)=>{
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.ok(!body.input.includes(offices[0].email));assert.equal(body.tools,undefined);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({subject:'Question',text:'Please clarify.'})}]}]});
  });assert.deepEqual(r,{subject:'Question',text:'Please clarify.'});
});
test('reconciliation requires provider identity and exact reserved content',async()=>{
  const {s,c,approval}=fixture();const m=reserveSend(s,offices,approval,sender).message,pid=randomUUID();
  const store={read:async()=>({state:s})},input={caseId:c.id,messageId:m.id,providerId:pid};
  const evidence={id:pid,to:[m.to],from:m.from,subject:m.subject,text:m.text,reply_to:[m.replyTo],tags:[{name:'correspondence_id',value:m.id}]};
  await assert.rejects(reconcile(store,{sent:async()=>({...evidence,text:'wrong'})},input),/does not match/);
  assert.equal((await reconcile(store,{sent:async()=>evidence},input)).providerId,pid);
});
