import { createServer } from 'node:http';
import { publicProjection, coordinationTick } from './github-first.mjs';
import { WRITING_REVIEW_ONLY, writingReviewTick, writingProjection } from './writing-review.mjs';
import { reportReviewTick, reportReviewProjection } from './report-review.mjs';
import { improvementTick, improvementProjection } from './review-improvement.mjs';
import { recoveryTick, recoveryProjection } from './read-only-recovery.mjs';
import { readFile } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { Fault, requireThat, parseOffices, email, same, field, findCase, createCase, saveDraft, reserveSend, acceptSend, reviewReply, closeCase, verifyWebhook, inbound, delivery, deliveryTypes } from './core.mjs';
import { GitHubStore, MailProvider, draftWithAI, draftFromSignals, reconcile, suggestWritingImprovements } from './adapters.mjs';
import { PersonalArchive, ingestPersonal, attachPersonalReply } from './personal-mailbox.mjs';
import { VolumeStore, VolumeArchive } from './volume-store.mjs';
import { sourceForCase, sourceForArchive, preparePublicRecord, casePublicCoverage } from './public-record.mjs';
import { recordQuality, qualitySummary, prepareQualityReview } from './quality.mjs';
import { planForCase, describePlan, currentProvenance, prepareProposal, prepareNext } from './knowledge.mjs';
import { createIssue, updateIssue, attachCase, linkIssues, recordFeedback, withdrawFeedbackSharing, nominateRoute, reviewNomination, issueView, groupPreview } from './coordination.mjs';

function envConfig(e) {
  const backend=e.STATE_BACKEND||'github';
  requireThat(['github','volume'].includes(backend),500,'STATE_BACKEND must be github or volume');
  const repo=e.STATE_REPO||'', branch=e.STATE_BRANCH||'main',stateDir=e.STATE_DIR||'';
  if(backend==='github'){
    requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && /^[A-Za-z0-9._/-]+$/.test(branch) &&
      repo.toLowerCase()!=='grwtsk/grwtsk.com' && e.GITHUB_STATE_TOKEN,500,'Configure separate private GitHub state repository and token');
  }else{
    requireThat(isAbsolute(stateDir)&&resolve(stateDir)===stateDir&&stateDir!=='/',500,'Configure an absolute persistent STATE_DIR');
    if(e.RAILWAY_PROJECT_ID||e.RAILWAY_SERVICE_ID){
      requireThat(e.RAILWAY_VOLUME_MOUNT_PATH==='/data'&&stateDir===join(e.RAILWAY_VOLUME_MOUNT_PATH,'correspondence'),500,'Mount Railway volume at /data and use /data/correspondence; no ephemeral fallback');
    }
  }
  const key=Buffer.from(e.STATE_KEY_BASE64||'','base64');
  requireThat(key.length===32 && /^[A-Za-z0-9+/]{43}=$/.test(e.STATE_KEY_BASE64||''),500,'Configure 32-byte base64 encryption key');
  const token=e.OPERATOR_TOKEN||'';
  requireThat(/^[A-Za-z0-9_-]{43,}$/.test(token),500,'Configure high-entropy operator token');
  const domain=(e.MAIL_RECEIVE_DOMAIN||'').toLowerCase();
  requireThat(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$/.test(domain) && !domain.includes('..'),500,'Configure dedicated inbound mail domain');
  const from=email(e.MAIL_FROM||'');
  const primary=email(e.MAIL_PRIMARY_ADDRESS||from),primaryAlias=e.MAIL_PRIMARY_ALIAS?email(e.MAIL_PRIMARY_ALIAS):null;
  requireThat(primary===from,500,'Primary mailbox must match the verified From address');
  requireThat(e.RESEND_API_KEY && /^whsec_[A-Za-z0-9+/=]+$/.test(e.RESEND_WEBHOOK_SECRET||'') &&
    Buffer.from(e.RESEND_WEBHOOK_SECRET.slice(6),'base64').length>=16,500,'Configure Resend API and webhook signing secret');
  const githubFirst=e.ENABLE_GITHUB_FIRST==='true',routineAcks=!WRITING_REVIEW_ONLY&&e.ENABLE_OWNER_ROUTINE_ACKS==='true',githubFirstActivation=e.GITHUB_FIRST_ACTIVATED_AT||'';
  requireThat(!githubFirst||(backend==='volume'&&Number.isFinite(Date.parse(githubFirstActivation))&&new Date(githubFirstActivation).toISOString()===githubFirstActivation),500,'Configure volume-backed GitHub coordination with a fixed UTC activation instant');
  requireThat(!routineAcks||githubFirst,500,'Routine acknowledgment requires GitHub coordination');
  return {githubFirst,routineAcks,githubFirstActivation,backend,stateDir,signalCommit:e.RAILWAY_GIT_COMMIT_SHA||null,repo,branch,key,token,githubToken:e.GITHUB_STATE_TOKEN,resendKey:e.RESEND_API_KEY,webhookSecret:e.RESEND_WEBHOOK_SECRET,
    domain,from,primary,primaryAlias,autoQuality:e.ENABLE_AUTO_QUALITY==='true',offices:parseOffices(e.AUTHORIZED_OFFICES_JSON),openaiKey:e.OPENAI_API_KEY||'',model:e.OPENAI_MODEL||'',
    live:!WRITING_REVIEW_ONLY&&e.ENABLE_LIVE_SEND==='true',autoDrafts:e.ENABLE_AUTO_DRAFTS==='true',port:Number(e.PORT||8080)};
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
export function handler(config,store,provider,archive=new PersonalArchive(store)) {
  return async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      if(req.method==='GET'&&path==='/healthz')return respond(res,200,{ok:true});
      if(req.method==='GET'&&path==='/report-review/status'){const {state}=await store.read();return respond(res,200,{...reportReviewProjection(state),improvement:improvementProjection(state),checkpoint:state.checkpoint?.day||null,recovery:recoveryProjection(state)});}
      if(req.method==='GET'&&path==='/writing-review/status')return respond(res,200,writingProjection((await store.read()).state));
      if(req.method==='GET'&&path==='/coordination/status'&&config.githubFirst)return respond(res,200,publicProjection((await store.read()).state,config));
      if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){
        const file=path==='/'?'index.html':path.slice(1);
        const type=file==='index.html'?'text/html; charset=utf-8':file==='app.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8';
        return respond(res,200,await readFile(new URL('./web/'+file,import.meta.url)),type);
      }
      if(req.method==='POST'&&path==='/webhooks/resend'){
        const raw=await rawBody(req),hook=verifyWebhook(raw,req.headers,config.webhookSecret),event=parse(raw);
        if(event.type==='email.received'){
          const id=event.data?.email_id,mail=await provider.receive(id);
          await ingestPersonal(store,archive,config,mail,id,hook,inbound);
        } else if(deliveryTypes.has(event.type))await store.mutate(s=>delivery(s,event,hook,config.from));
        return respond(res,200,{ok:true});
      }
      requireThat(path.startsWith('/api/'),404,'Not found');
      requireThat(same(req.headers.authorization||'','Bearer '+config.token),401,'Operator authentication required');
      if(req.method==='GET'&&path==='/api/state'){
        const {state}=await store.read();
        return respond(res,200,{state,offices:config.offices,primary:config.primary||null,backend:config.backend||'github',live:config.live,ai:!!(config.openaiKey&&config.model)});
      }
      if(req.method==='GET'&&path==='/api/mailbox/day'){
        return respond(res,200,await archive.list(url.searchParams.get('day'),url.searchParams.get('cursor')));
      }
      if(req.method==='GET'&&path==='/api/mailbox/message'){
        const r=await archive.get(url.searchParams.get('day'),url.searchParams.get('name'));
        // Never render or deliver the archived HTML in the browser.
        const {html,...safe}=r;return respond(res,200,{...safe,hasHtml:!!html});
      }
      if(req.method==='GET'&&path==='/api/public-record/coverage'){
        return respond(res,200,casePublicCoverage((await store.read()).state,url.searchParams.get('caseId')));
      }
      if(req.method==='GET'&&path==='/api/quality'){
        return respond(res,200,qualitySummary((await store.read()).state));
      }
      if(req.method==='GET'&&path==='/api/knowledge'){
        const {state}=await store.read();
        const caseId=url.searchParams.get('caseId');findCase(state,caseId);
        const snapshot=await store.readSignals();
        return respond(res,200,snapshot?describePlan(planForCase(state,config.offices,caseId,snapshot),state):
          {ready:false,reason:config.backend==='volume'?'Add reviewed redacted signals in source/correspondence/signals/approved.md and redeploy.':'Create signals/approved.md in the private state repository using the example.'});
      }
      if(req.method==='GET'&&['/api/coordination/issue','/api/coordination/preview'].includes(path)){
        const {state}=await store.read(),id=url.searchParams.get('issueId');
        return respond(res,200,path.endsWith('/preview')?groupPreview(state,id):issueView(state,id));
      }
      requireThat(req.method==='POST' && (req.headers['content-type']||'').split(';')[0]==='application/json',405,'POST JSON required');
      const input=parse(await rawBody(req));
      let result;
      if(path==='/api/public-record/case'){
        result=await store.mutate(s=>preparePublicRecord(s,sourceForCase(s,config.offices,input),input));
      } else if(path==='/api/public-record/archive'){
        const record=await archive.get(input.day,input.name);
        result=await store.mutate(s=>preparePublicRecord(s,sourceForArchive(record,config.offices),input));
      } else if(path==='/api/mailbox/recover'){
        requireThat(input.confirm===true,400,'Confirm recovery of one provider message');
        const mail=await provider.receive(input.providerId);
        result=await ingestPersonal(store,archive,config,mail,input.providerId,'manual-recovery',inbound);
      } else if(path==='/api/mailbox/attach'){
        const r=await archive.get(input.day,input.name);
        result=await store.mutate(s=>attachPersonalReply(s,config.offices,input,r));
      } else if(path==='/api/quality/feedback')result=await store.mutate(s=>recordQuality(s,input));
      else if(path==='/api/quality/prepare'){
        requireThat(config.openaiKey&&config.model,503,'AI drafting is not configured');
        result=await prepareQualityReview(store,config,suggestWritingImprovements);
      }
      else if(path==='/api/coordination/create')result=await store.mutate(s=>createIssue(s,input));
      else if(path==='/api/coordination/update')result=await store.mutate(s=>updateIssue(s,input));
      else if(path==='/api/coordination/attach')result=await store.mutate(s=>attachCase(s,input));
      else if(path==='/api/coordination/link')result=await store.mutate(s=>linkIssues(s,input));
      else if(path==='/api/coordination/feedback')result=await store.mutate(s=>recordFeedback(s,input));
      else if(path==='/api/coordination/withdraw-feedback')result=await store.mutate(s=>withdrawFeedbackSharing(s,input));
      else if(path==='/api/coordination/nominate')result=await store.mutate(s=>nominateRoute(s,input));
      else if(path==='/api/coordination/review-nomination')result=await store.mutate(s=>reviewNomination(s,input));
      else if(path==='/api/cases')result=await store.mutate(s=>createCase(s,config.offices,input,config.domain));
      else if(path==='/api/draft'){
        requireThat(input.redacted===true,400,'Confirm brief is redacted and approved for AI processing');
        const {state}=await store.read(),c=findCase(state,input.caseId);
        requireThat(!c.closed && config.offices.some(o=>o.id===c.office.id&&o.email===c.office.email),409,'Case is closed or office not authorized');
        result=await draftWithAI(config,c.office,field(input.brief,'redacted brief',4000));
      } else if(path==='/api/knowledge/prepare'){
        requireThat(config.openaiKey&&config.model,503,'AI drafting is not configured');
        const snapshot=await store.readSignals();requireThat(snapshot,409,'Create approved Markdown signals first');
        result=await prepareProposal(store,config,input.caseId,snapshot,draftFromSignals);
      } else if(path==='/api/save'){
        const snapshot=input.proposalId?await store.readSignals():null;
        result=await store.mutate(s=>{
          if(!input.proposalId)return saveDraft(s,config.offices,input);
          requireThat(snapshot,409,'Knowledge source unavailable');
          const provenance=currentProvenance(s,config.offices,input.caseId,input.proposalId,snapshot);
          return saveDraft(s,config.offices,input,provenance);
        });
      }
      else if(path==='/api/review-reply')result=await store.mutate(s=>reviewReply(s,input));
      else if(path==='/api/close')result=await store.mutate(s=>closeCase(s,input));
      else if(path==='/api/reconcile'){
        const x=await reconcile(store,provider,input);
        result=await store.mutate(s=>acceptSend(s,x.caseId,x.messageId,x.providerId));
      } else if(path==='/api/send'){
        requireThat(!['to','cc','bcc','recipients','replyTo','from'].some(key=>Object.hasOwn(input,key)),400,'Recipient fields cannot be overridden');
        requireThat(!WRITING_REVIEW_ONLY,409,'Outbound delivery locked during writing review');
        requireThat(config.live,409,'Live delivery disabled');
        const {state:before}=await store.read(),candidate=findCase(before,input.caseId).drafts.at(-1);
        const snapshot=candidate?.knowledge?await store.readSignals():null;
        const reserved=await store.mutate(s=>{
          const d=findCase(s,input.caseId).drafts.at(-1);
          let fingerprint=null;
          if(d?.knowledge){
            requireThat(snapshot,409,'Knowledge source unavailable');
            fingerprint=currentProvenance(s,config.offices,input.caseId,d.knowledge.proposalId,snapshot).fingerprint;
          }
          return reserveSend(s,config.offices,input,config.from,new Date().toISOString(),fingerprint);
        });
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
export async function start(){
  const config=envConfig(process.env);
  const store=config.backend==='volume'?new VolumeStore(config):new GitHubStore({...config,token:config.githubToken});
  await store.initialize();
  const archive=config.backend==='volume'?new VolumeArchive(store):new PersonalArchive(store);
  const provider=new MailProvider(config.resendKey,fetch,{allowSend:!WRITING_REVIEW_ONLY&&config.live});
  const server=createServer({requestTimeout:90000,headersTimeout:15000,maxHeaderSize:16000},handler(config,store,provider,archive));
  server.listen(config.port,'0.0.0.0',()=>console.log('Correspondence service ready'));
  if(config.githubFirst){
    let writingBusy=false;
    const review=async()=>{if(writingBusy)return;writingBusy=true;try{await writingReviewTick(store,config);await reportReviewTick(store,config);await improvementTick(store,config);}catch{console.error('Public writing review unavailable');}finally{writingBusy=false;}};
    if(config.backend==='volume'){
      let checkpointBusy=false;
      const checkpoint=async()=>{if(checkpointBusy)return;checkpointBusy=true;try{const day=new Date().toISOString().slice(0,10);if((await store.read()).state.checkpoint?.day!==day){await store.checkpoint();await store.mutate(s=>{s.checkpoint={day};});}}catch{console.error('Local encrypted checkpoint unavailable');}finally{checkpointBusy=false;}};
      const checkpointTimer=setInterval(checkpoint,3_600_000);server.on('close',()=>clearInterval(checkpointTimer));void checkpoint();
      let recovering=false;
      const recover=async()=>{if(recovering)return;recovering=true;try{await recoveryTick(store,archive,config,provider);}catch{console.error('Read-only recovery unavailable');}finally{recovering=false;}};
      const recoveryTimer=setInterval(recover,600_000);server.on('close',()=>clearInterval(recoveryTimer));void recover();
    }
    const reviewTimer=setInterval(review,300_000);server.on('close',()=>clearInterval(reviewTimer));void review();
    let busy=false;
    const tick=async()=>{if(busy)return;busy=true;try{await coordinationTick(store,config,provider);}catch{console.error('GitHub coordination tick unavailable; pending reservations are not retried');}finally{busy=false;}};
    const timer=setInterval(tick,300_000);server.on('close',()=>clearInterval(timer));void tick();
  }
  if((config.autoDrafts||config.autoQuality)&&config.openaiKey&&config.model){
    let busy=false;
    const tick=async()=>{
      if(busy)return;busy=true;
      try{
        if(config.autoDrafts)await prepareNext(store,config,draftFromSignals);
        if(config.autoQuality)await prepareQualityReview(store,config,suggestWritingImprovements);
      }
      catch(e){console.error('Internal draft preparation unavailable',e instanceof Fault?e.status:503);}
      finally{busy=false;}
    };
    const timer=setInterval(tick,300_000);
    server.on('close',()=>clearInterval(timer));
    void tick();
  }
}
if(process.argv[1] && new URL('file://'+process.argv[1]).href===import.meta.url)start().catch(()=>{console.error('Correspondence initialization failed; check private state, credentials and configuration');process.exitCode=1;});
