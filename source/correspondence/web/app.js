const $=id=>document.getElementById(id);
let token='', snapshot=null, selected='', saved=null, busy=false, knowledge=null, proposalId=null, issueSelected='';
const status=s=>{$('status').textContent=s;};
function options(el,items,label,value){
  el.replaceChildren(new Option('Select…',''),...items.map(x=>new Option(label(x),value(x))));
}
async function api(path,data){
  const r=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j;
}
function active(){return snapshot?.state.cases.find(c=>c.id===selected);}
function resetDraft(){saved=null;$('approved').checked=false;$('draft-status').textContent='Save the exact draft before approving.';}
function historyItem(summary,text,review){
  const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');
  s.textContent=summary;p.textContent=text;d.append(s,p);
  if(review){const b=document.createElement('button');b.textContent='Mark reviewed';b.onclick=()=>run(review);d.append(b);}
  $('history').append(d);
}
function renderCase(){
  const c=active();$('history').replaceChildren();$('case-info').textContent=c?c.office.role+' — '+c.office.email+' | '+(c.closed?'Closed':'Open')+' | Case ID: '+c.id+' | '+c.replyTo:'Choose a case.';
  options($('reply'),c?.incoming.filter(r=>r.reviewed)||[],r=>r.receivedAt+' '+r.subject,r=>r.id);
  options($('pending'),c?.outgoing.filter(r=>r.status==='pending')||[],r=>r.id,r=>r.id);
  if(!c)return;
  for(const m of c.outgoing){
    const events=snapshot.state.delivery.filter(e=>e.providerId===m.providerId);
    historyItem(m.status+' · '+m.at+' · '+m.subject,m.text+'\n\nReceipt: '+(m.providerId||'Uncertain; reconcile in dashboard')+'\n'+events.map(e=>e.type+' '+e.recordedAt).join('\n'));
  }
  for(const r of c.incoming)historyItem('Reply · '+r.receivedAt+' · '+r.subject,
    'Reply ID: '+r.id+'\nFrom: '+(r.from||'Unknown')+'\nAuthentication: '+r.authentication.dmarc+'\n'+r.text+(r.textTruncated?'\n[Preview truncated; consult original privately]':'')+(r.htmlOnly?'\n[HTML only; consult original privately]':''),
    !r.reviewed&&r.from===c.office.email&&r.authentication.dmarc==='pass'?async()=>{await api('review-reply',{caseId:c.id,replyId:r.id,confirm:true});await refresh();}:null);
  if(c.drafts.length){const d=c.drafts.at(-1);historyItem('Latest saved draft · '+d.createdAt,d.subject+'\n\n'+d.text);}
}
async function refresh(){
  snapshot=await api('state');$('workspace').hidden=false;
  options($('office'),snapshot.offices,o=>o.role+' — '+o.email,o=>o.id);
  options($('cases'),snapshot.state.cases,c=>c.title+' — '+c.office.role,c=>c.id);
  if(!snapshot.state.cases.some(c=>c.id===selected))selected='';
  $('cases').value=selected;renderCase();renderCoordination();$('send').disabled=!snapshot.live;$('generate').disabled=!snapshot.ai;$('knowledge-prepare').disabled=!snapshot.ai;
  status('Ledger opened. '+(snapshot.live?'Manual live delivery enabled.':'Live delivery disabled.'));
}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;}}
$('connect').onclick=()=>run(async()=>{token=$('token').value;$('token').value='';await refresh();});
$('logout').onclick=()=>{token='';snapshot=null;selected='';saved=null;location.reload();};
$('refresh').onclick=()=>run(refresh);
$('cases').onchange=()=>{if(busy){$('cases').value=selected;return;}selected=$('cases').value;resetDraft();proposalId=null;knowledge=null;$('knowledge-status').textContent='';$('knowledge-detail').textContent='';$('subject').value='';$('body').value='';$('brief').value='';$('redacted').checked=false;renderCase();renderCoordination();};
$('create').onclick=()=>run(async()=>{const c=await api('cases',{officeId:$('office').value,title:$('title').value});selected=c.id;resetDraft();proposalId=null;knowledge=null;$('knowledge-status').textContent='';$('knowledge-detail').textContent='';$('subject').value='';$('body').value='';await refresh();});
$('generate').onclick=()=>run(async()=>{proposalId=null;const d=await api('draft',{caseId:selected,brief:$('brief').value,redacted:$('redacted').checked});$('subject').value=d.subject;$('body').value=d.text;resetDraft();status('Draft generated. Review and edit before saving.');});
for(const id of ['subject','body'])$(id).oninput=resetDraft;
$('save').onclick=()=>run(async()=>{const d=await api('save',{caseId:selected,subject:$('subject').value,text:$('body').value,...(proposalId?{proposalId}:{})});saved={caseId:selected,id:d.id,hash:d.hash,subject:d.subject,text:d.text,replyId:d.knowledge?.replyId||null};$('subject').value=d.subject;$('body').value=d.text;$('approved').checked=false;$('draft-status').textContent='Saved exact draft '+d.id+'. Review before approval.';await refresh();if(d.knowledge?.replyId)$('reply').value=d.knowledge.replyId;});
$('send').onclick=()=>run(async()=>{
  if(!saved||saved.caseId!==selected||saved.subject!==$('subject').value||saved.text!==$('body').value||!$('approved').checked)throw Error('Save and approve the exact message first.');
  const replyId=$('reply').value||null;const request={caseId:selected,draftId:saved.id,hash:saved.hash,confirm:true,replyId};
  if(!confirm('Send this exact approved email to '+active().office.email+'?'))return;
  resetDraft();const result=await api('send',request);await refresh();status('Provider accepted email '+result.providerId+'. Delivery is tracked separately.');
});
$('close').onclick=()=>run(async()=>{if(confirm('Close this case and prevent future sends?')){await api('close',{caseId:selected,confirm:true});await refresh();}});
$('reconcile').onclick=()=>run(async()=>{await api('reconcile',{caseId:selected,messageId:$('pending').value,providerId:$('provider').value.trim()});await refresh();status('Provider receipt verified and recorded.');});

async function refreshKnowledge(){
  if(!selected)throw Error('Select a case first.');
  knowledge=await api('knowledge?caseId='+encodeURIComponent(selected));
  $('knowledge-status').textContent=knowledge.ready?'Current approved signals: '+knowledge.signals.length+' · '+(knowledge.proposal?.status||'not prepared'):knowledge.reason;
  const p=knowledge.proposal;
  $('knowledge-detail').textContent=knowledge.ready?
    'Source revision: '+knowledge.source.commit+'\n'+knowledge.signals.map(s=>s.id+' · '+s.kind+' · '+s.evidence).join('\n')+
    (p?.output?'\n\nMissing information:\n'+(p.output.missingInformation.join('\n')||'None reported')+
      '\n\nCoordination note:\n'+(p.output.coordination||'None'):''):'';
  $('knowledge-load').disabled=!p||p.status!=='ready';
}
$('knowledge-refresh').onclick=()=>run(refreshKnowledge);
$('knowledge-prepare').onclick=()=>run(async()=>{
  if(!selected)throw Error('Select a case first.');
  await api('knowledge/prepare',{caseId:selected});await refreshKnowledge();
});
$('knowledge-load').onclick=()=>run(async()=>{
  await refreshKnowledge();
  const p=knowledge?.proposal;
  if(!p||p.status!=='ready')throw Error('No current ready proposal.');
  proposalId=p.id;$('subject').value=p.output.subject;$('body').value=p.output.text;
  resetDraft();if(p.replyId)$('reply').value=p.replyId;
  status('Loaded the proposal and source references. Review or edit, save, and approve before sending.');
});

function board(){return snapshot?.state.coordination||{issues:[],links:[],nominations:[]};}
function activeIssue(){return board().issues.find(i=>i.id===issueSelected);}
function clearPreview(){$('group-output').textContent='';}
function fillIssue(){
  const i=activeIssue();$('issue-title').value='';$('issue-owner').value=i?.owner||'';
  $('issue-action').value=i?.nextAction||'';$('issue-status').value=i&&i.status!=='consolidated'?i.status:'open';
  $('issue-share').value=i?.shareSummary||'';$('issue-share-reviewed').checked=false;
  $('feedback-summary').value='';$('feedback-share').value='';$('feedback-reviewed').checked=false;
  clearPreview();
}
function renderCoordination(){
  const b=board();
  if(!b.issues.some(i=>i.id===issueSelected))issueSelected='';
  const i=activeIssue(),c=active();
  options($('issue-select'),b.issues,x=>x.status+' — '+x.title,x=>x.id);$('issue-select').value=issueSelected;
  options($('issue-other'),b.issues.filter(x=>x.id!==issueSelected),x=>x.status+' — '+x.title,x=>x.id);
  options($('issue-reply'),(c?.incoming||[]).filter(r=>r.reviewed&&i?.caseIds.includes(c.id)&&!i.feedback.some(f=>f.caseId===c.id&&f.replyId===r.id)),r=>r.receivedAt+' · '+r.subject,r=>r.id);
  options($('feedback-withdraw-select'),(i?.feedback||[]).filter(f=>f.shareSummary!==null),f=>f.at+' · '+f.id,f=>f.id);
  const nominees=b.nominations.filter(n=>n.issueId===issueSelected);
  options($('nom-select'),nominees.filter(n=>n.status==='proposed'),n=>n.role,n=>n.id);
  const linked=new Set(b.issues.flatMap(x=>x.caseIds));
  const unassigned=snapshot?.state.cases.filter(x=>!linked.has(x.id))||[];
  $('issue-unassigned').textContent=unassigned.length+' correspondence cases not yet linked to an issue.';
  clearPreview();
  if(!i){$('issue-detail').textContent='Select or create an issue.';return;}
  const cases=snapshot.state.cases.filter(x=>i.caseIds.includes(x.id));
  const lines=[i.title,'Issue ID: '+i.id,'Status: '+i.status,'Responsible role: '+i.owner,'Requested action: '+i.nextAction,'Updated: '+i.updatedAt,'','Linked correspondence:'];
  for(const k of cases){
    const pending=k.incoming.filter(r=>!i.feedback.some(f=>f.caseId===k.id&&f.replyId===r.id));
    lines.push(k.office.role+' — '+k.outgoing.length+' outbound attempts, '+k.incoming.length+' received replies, '+pending.length+' not yet summarized for this issue');
  }
  lines.push('','Related or consolidated issues:');
  for(const l of b.links.filter(x=>x.from===i.id||x.to===i.id))lines.push(l.relation+' · '+(b.issues.find(x=>x.id===(l.from===i.id?l.to:l.from))?.title||'Unknown issue'));
  lines.push('','Feedback (reported):');
  for(const f of i.feedback)lines.push(f.at+' · '+f.summary+(f.shareSummary?' [sharing preview approved]':' [private]'));
  lines.push('','Nominated routes (not recipient authorizations):');
  for(const n of nominees)lines.push(n.status+' · '+n.role+' · '+n.url);
  $('issue-detail').textContent=lines.join('\n');
}
function issueInput(){return {owner:$('issue-owner').value,nextAction:$('issue-action').value,shareSummary:$('issue-share').value,shareReviewed:$('issue-share-reviewed').checked};}
$('issue-select').onchange=()=>{if(busy){$('issue-select').value=issueSelected;return;}issueSelected=$('issue-select').value;fillIssue();renderCoordination();};
$('issue-create').onclick=()=>run(async()=>{const i=await api('coordination/create',{...issueInput(),title:$('issue-title').value});issueSelected=i.id;await refresh();fillIssue();});
$('issue-update').onclick=()=>run(async()=>{await api('coordination/update',{...issueInput(),issueId:issueSelected,status:$('issue-status').value});await refresh();fillIssue();});
$('issue-attach').onclick=()=>run(async()=>{await api('coordination/attach',{issueId:issueSelected,caseId:selected});await refresh();});
$('issue-link').onclick=()=>run(async()=>{await api('coordination/link',{issueId:issueSelected,otherIssueId:$('issue-other').value,relation:'related'});await refresh();});
$('issue-merge').onclick=()=>run(async()=>{
  const other=$('issue-other').value;
  if(!confirm('Consolidate the selected issue into the other issue? Both histories are retained; no data or recipients are transferred.'))return;
  await api('coordination/link',{issueId:issueSelected,otherIssueId:other,relation:'consolidated-into',confirm:true});await refresh();fillIssue();
});
$('feedback-save').onclick=()=>run(async()=>{
  const confirmed=$('feedback-reviewed').checked;
  await api('coordination/feedback',{issueId:issueSelected,caseId:selected,replyId:$('issue-reply').value,summary:$('feedback-summary').value,
    shareSummary:$('feedback-share').value,confirm:confirmed,shareReviewed:confirmed});
  $('feedback-summary').value='';$('feedback-share').value='';$('feedback-reviewed').checked=false;await refresh();
});
$('feedback-withdraw').onclick=()=>run(async()=>{
  if(!confirm('Remove this summary from future sharing previews? Previous exports cannot be recalled.'))return;
  await api('coordination/withdraw-feedback',{issueId:issueSelected,feedbackId:$('feedback-withdraw-select').value,confirm:true});await refresh();
});
$('nom-create').onclick=()=>run(async()=>{
  await api('coordination/nominate',{issueId:issueSelected,role:$('nom-role').value,url:$('nom-url').value,reason:$('nom-reason').value});
  $('nom-role').value='';$('nom-url').value='';$('nom-reason').value='';await refresh();
});
async function reviewRoute(status){
  if(!confirm('Record this review? This does not authorize email.'))return;
  await api('coordination/review-nomination',{nominationId:$('nom-select').value,note:$('nom-note').value,status,confirm:true});$('nom-note').value='';await refresh();
}
$('nom-verified').onclick=()=>run(()=>reviewRoute('route-verified'));
$('nom-declined').onclick=()=>run(()=>reviewRoute('declined'));
$('group-preview').onclick=()=>run(async()=>{const r=await api('coordination/preview?issueId='+encodeURIComponent(issueSelected));$('group-output').textContent=r.markdown;});
