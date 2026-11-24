import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Fault, requireThat, parseOffices, email, same, field, findCase, createCase, saveDraft, reserveSend, acceptSend, reviewReply, closeCase, verifyWebhook, inbound, delivery, deliveryTypes } from './core.mjs';
import { GitHubStore, MailProvider, draftWithAI, reconcile } from './adapters.mjs';

function envConfig(e) {
  const repo=e.STATE_REPO||'', branch=e.STATE_BRANCH||'main';
  requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && /^[A-Za-z0-9._/-]+$/.test(branch) &&
    repo.toLowerCase()!=='grwtsk/grwtsk.com' && e.GITHUB_STATE_TOKEN,500,'Configure separate private GitHub state repository and token');
  const key=Buffer.from(e.STATE_KEY_BASE64||'','base64');
  requireThat(key.length===32 && /^[A-Za-z0-9+/]{43}=$/.test(e.STATE_KEY_BASE64||''),500,'Configure 32-byte base64 encryption key');
  const token=e.OPERATOR_TOKEN||'';
  requireThat(/^[A-Za-z0-9_-]{43,}$/.test(token),500,'Configure high-entropy operator token');
  const domain=(e.MAIL_RECEIVE_DOMAIN||'').toLowerCase();
  requireThat(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$/.test(domain) && !domain.includes('..'),500,'Configure dedicated inbound mail domain');
  const from=email(e.MAIL_FROM||'');
  requireThat(e.RESEND_API_KEY && /^whsec_[A-Za-z0-9+/=]+$/.test(e.RESEND_WEBHOOK_SECRET||'') &&
    Buffer.from(e.RESEND_WEBHOOK_SECRET.slice(6),'base64').length>=16,500,'Configure Resend API and webhook signing secret');
  return {repo,branch,key,token,githubToken:e.GITHUB_STATE_TOKEN,resendKey:e.RESEND_API_KEY,webhookSecret:e.RESEND_WEBHOOK_SECRET,
    domain,from,offices:parseOffices(e.AUTHORIZED_OFFICES_JSON),openaiKey:e.OPENAI_API_KEY||'',model:e.OPENAI_MODEL||'',
    live:e.ENABLE_LIVE_SEND==='true',port:Number(e.PORT||8080)};
}
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
function respond(res,status,body,type='application/json; charset=utf-8') {
  res.writeHead(status,{...security,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
async function rawBody(req,limit=64_000) {
  const chunks=[];let n=0;
  for await(const chunk of req){n+=chunk.length;if(n>limit)throw new Fault(413,'Request too large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function parse(raw){try{const x=JSON.parse(raw.toString('utf8'));requireThat(x && typeof x==='object' && !Array.isArray(x),400,'Expected JSON object');return x;}catch(e){if(e instanceof Fault)throw e;throw new Fault(400,'Invalid JSON');}}
export function handler(config,store,provider) {
  return async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/healthz')return respond(res,200,{ok:true});
      if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){
        const file=path==='/'?'index.html':path.slice(1);
        const type=file==='index.html'?'text/html; charset=utf-8':file==='app.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8';
        return respond(res,200,await readFile(new URL('./web/'+file,import.meta.url)),type);
      }
      if(req.method==='POST'&&path==='/webhooks/resend'){
        const raw=await rawBody(req),hook=verifyWebhook(raw,req.headers,config.webhookSecret),event=parse(raw);
        if(event.type==='email.received'){
          const id=event.data?.email_id,mail=await provider.receive(id);
          await store.mutate(s=>inbound(s,mail,id,hook));
        } else if(deliveryTypes.has(event.type))await store.mutate(s=>delivery(s,event,hook,config.from));
        return respond(res,200,{ok:true});
      }
      requireThat(path.startsWith('/api/'),404,'Not found');
      requireThat(same(req.headers.authorization||'','Bearer '+config.token),401,'Operator authentication required');
      if(req.method==='GET'&&path==='/api/state'){
        const {state}=await store.read();
        return respond(res,200,{state,offices:config.offices,live:config.live,ai:!!(config.openaiKey&&config.model)});
      }
      requireThat(req.method==='POST' && (req.headers['content-type']||'').split(';')[0]==='application/json',405,'POST JSON required');
      const input=parse(await rawBody(req));
      let result;
      if(path==='/api/cases')result=await store.mutate(s=>createCase(s,config.offices,input,config.domain));
      else if(path==='/api/draft'){
        requireThat(input.redacted===true,400,'Confirm brief is redacted and approved for AI processing');
        const {state}=await store.read(),c=findCase(state,input.caseId);
        requireThat(!c.closed && config.offices.some(o=>o.id===c.office.id&&o.email===c.office.email),409,'Case is closed or office not authorized');
        result=await draftWithAI(config,c.office,field(input.brief,'redacted brief',4000));
      } else if(path==='/api/save')result=await store.mutate(s=>saveDraft(s,config.offices,input));
      else if(path==='/api/review-reply')result=await store.mutate(s=>reviewReply(s,input));
      else if(path==='/api/close')result=await store.mutate(s=>closeCase(s,input));
      else if(path==='/api/reconcile'){
        const x=await reconcile(store,provider,input);
        result=await store.mutate(s=>acceptSend(s,x.caseId,x.messageId,x.providerId));
      } else if(path==='/api/send'){
        requireThat(config.live,409,'Live delivery disabled');
        const reserved=await store.mutate(s=>reserveSend(s,config.offices,input,config.from));
        // Reservation must commit before making the one provider request.
        // Never automatically retry this external side effect, even after a timeout.
        let providerId;
        try {
          const {state}=await store.read();
          const c=findCase(state,reserved.caseId);
          const reference=c.incoming.find(r=>r.id===reserved.message.replyId)?.messageId;
          providerId=await provider.send(reserved.message,reference);
          result=await store.mutate(s=>acceptSend(s,reserved.caseId,reserved.message.id,providerId));
        } catch {
          throw new Fault(503,'Send outcome requires reconciliation in provider dashboard; do not resend. Reservation: '+reserved.message.id);
        }
      } else throw new Fault(404,'Not found');
      return respond(res,200,result);
    } catch(e) {
      const status=e instanceof Fault?e.status:503;
      // Never log bodies, recipient addresses, provider error payloads or secrets.
      const msg=e instanceof Fault?e.message:'Operation unavailable; inspect configuration or private ledger';
      if(status>=500)console.error('correspondence operation failed',status);
      return respond(res,status,{error:msg});
    }
  };
}
async function start(){
  const config=envConfig(process.env);
  const store=new GitHubStore({...config,token:config.githubToken});
  await store.initialize();
  const provider=new MailProvider(config.resendKey);
  const server=createServer({requestTimeout:90000,headersTimeout:15000,maxHeaderSize:16000},handler(config,store,provider));
  server.listen(config.port,'0.0.0.0',()=>console.log('Correspondence service ready'));
}
if(process.argv[1] && new URL('file://'+process.argv[1]).href===import.meta.url)start().catch(()=>{console.error('Correspondence initialization failed; check private state, credentials and configuration');process.exitCode=1;});
