const $=id=>document.getElementById(id);
let token='', snapshot=null, selected='', saved=null, busy=false;
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
  const c=active();$('history').replaceChildren();$('case-info').textContent=c?c.office.role+' — '+c.office.email+' | '+(c.closed?'Closed':'Open')+' | '+c.replyTo:'Choose a case.';
  options($('reply'),c?.incoming.filter(r=>r.reviewed)||[],r=>r.receivedAt+' '+r.subject,r=>r.id);
  options($('pending'),c?.outgoing.filter(r=>r.status==='pending')||[],r=>r.id,r=>r.id);
  if(!c)return;
  for(const m of c.outgoing){
    const events=snapshot.state.delivery.filter(e=>e.providerId===m.providerId);
    historyItem(m.status+' · '+m.at+' · '+m.subject,m.text+'\n\nReceipt: '+(m.providerId||'Uncertain; reconcile in dashboard')+'\n'+events.map(e=>e.type+' '+e.recordedAt).join('\n'));
  }
  for(const r of c.incoming)historyItem('Reply · '+r.receivedAt+' · '+r.subject,
    'From: '+(r.from||'Unknown')+'\nAuthentication: '+r.authentication.dmarc+'\n'+r.text+(r.textTruncated?'\n[Preview truncated; consult original privately]':'')+(r.htmlOnly?'\n[HTML only; consult original privately]':''),
    !r.reviewed&&r.from===c.office.email&&r.authentication.dmarc==='pass'?async()=>{await api('review-reply',{caseId:c.id,replyId:r.id,confirm:true});await refresh();}:null);
  if(c.drafts.length){const d=c.drafts.at(-1);historyItem('Latest saved draft · '+d.createdAt,d.subject+'\n\n'+d.text);}
}
async function refresh(){
  snapshot=await api('state');$('workspace').hidden=false;
  options($('office'),snapshot.offices,o=>o.role+' — '+o.email,o=>o.id);
  options($('cases'),snapshot.state.cases,c=>c.title+' — '+c.office.role,c=>c.id);
  if(!snapshot.state.cases.some(c=>c.id===selected))selected='';
  $('cases').value=selected;renderCase();$('send').disabled=!snapshot.live;$('generate').disabled=!snapshot.ai;
  status('Ledger opened. '+(snapshot.live?'Manual live delivery enabled.':'Live delivery disabled.'));
}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;}}
$('connect').onclick=()=>run(async()=>{token=$('token').value;$('token').value='';await refresh();});
$('logout').onclick=()=>{token='';snapshot=null;selected='';saved=null;location.reload();};
$('refresh').onclick=()=>run(refresh);
$('cases').onchange=()=>{selected=$('cases').value;resetDraft();$('subject').value='';$('body').value='';$('brief').value='';$('redacted').checked=false;renderCase();};
$('create').onclick=()=>run(async()=>{const c=await api('cases',{officeId:$('office').value,title:$('title').value});selected=c.id;resetDraft();$('subject').value='';$('body').value='';await refresh();});
$('generate').onclick=()=>run(async()=>{const d=await api('draft',{caseId:selected,brief:$('brief').value,redacted:$('redacted').checked});$('subject').value=d.subject;$('body').value=d.text;resetDraft();status('Draft generated. Review and edit before saving.');});
for(const id of ['subject','body'])$(id).oninput=resetDraft;
$('save').onclick=()=>run(async()=>{const d=await api('save',{caseId:selected,subject:$('subject').value,text:$('body').value});saved={caseId:selected,id:d.id,hash:d.hash,subject:d.subject,text:d.text};$('subject').value=d.subject;$('body').value=d.text;$('approved').checked=false;$('draft-status').textContent='Saved exact draft '+d.id+'. Review before approval.';await refresh();});
$('send').onclick=()=>run(async()=>{
  if(!saved||saved.caseId!==selected||saved.subject!==$('subject').value||saved.text!==$('body').value||!$('approved').checked)throw Error('Save and approve the exact message first.');
  const replyId=$('reply').value||null;const request={caseId:selected,draftId:saved.id,hash:saved.hash,confirm:true,replyId};
  if(!confirm('Send this exact approved email to '+active().office.email+'?'))return;
  resetDraft();const result=await api('send',request);await refresh();status('Provider accepted email '+result.providerId+'. Delivery is tracked separately.');
});
$('close').onclick=()=>run(async()=>{if(confirm('Close this case and prevent future sends?')){await api('close',{caseId:selected,confirm:true});await refresh();}});
$('reconcile').onclick=()=>run(async()=>{await api('reconcile',{caseId:selected,messageId:$('pending').value,providerId:$('provider').value.trim()});await refresh();status('Provider receipt verified and recorded.');});
