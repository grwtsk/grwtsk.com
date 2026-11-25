// Offline structural validation; no classifier, model, network or mail.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url));
const data=resolve(root,'../data');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function index(rows,label){
 assert.ok(Array.isArray(rows),label+' must be an array');
 const m=new Map();
 for(const row of rows){
  assert.match(row.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!m.has(row.id),'Duplicate '+label+': '+row.id);
  m.set(row.id,row);
 }
 return m;
}
const themes=index(read(join(root,'writing-themes.json')).themes,'theme');
const resources=index(read(join(root,'community-support.json')).resources,'resource');
const profiles=index(read(join(root,'professional-evidence.json')).profiles,'profile');
const https=url=>assert.equal(new URL(url).protocol,'https:');
const checkThemes=r=>{assert.ok(r.theme_ids.length);for(const id of r.theme_ids)assert.ok(themes.has(id),'Unknown theme '+id);};
for(const r of resources.values()){
 checkThemes(r);assert.ok(r.purpose&&r.limitations&&r.verification&&r.verified_on);
 assert.ok(!Object.hasOwn(r,'participation_status'),'Case state in shared resource');
 assert.ok(r.source_urls.length);r.source_urls.forEach(https);https(r.channel.url);
 assert.equal(r.contact_policy.email_status,'not_established');
 assert.ok(!r.channel.email);assert.ok(r.contact_policy.purpose&&r.contact_policy.disclosure&&r.contact_policy.action);
 if(r.channel.type==='resource_directory')assert.equal(r.contact_policy.action,'lookup_only');
}
for(const p of profiles.values()){
 checkThemes(p);assert.equal(p.recipient_eligible,false);assert.equal(p.record_type,'professional_profile_evidence');
 assert.ok(p.institution&&p.display_name);assert.ok(p.facts.length);
 for(const f of index(p.facts,'fact').values()){assert.ok(f.fact);https(f.source);}
}
const verification=read(join(root,'professional-evidence.json')).professional_verification_sources;
for(const v of verification){assert.ok(v.purpose);https(v.url);}
let manifests=0;
for(const dir of readdirSync(data,{withFileTypes:true}).filter(x=>x.isDirectory())){
 const folder=join(data,dir.name);
 for(const file of readdirSync(folder).filter(x=>x==='community-support-and-professional-evidence.json')){
  const m=read(join(folder,file));
  if(m.schema_version!==2)throw Error('Unsupported shared knowledge manifest: '+file);
  manifests++;
  for(const [key,name] of Object.entries({resources:'community-support.json',professional_evidence:'professional-evidence.json',themes:'writing-themes.json'})){
   assert.equal(resolve(folder,m.library[key]),join(root,name),'Invalid library path '+key);
  }
  assert.equal(m.resource_refs.length,m.counts.resource_records);
  assert.equal(m.professional_evidence.length,m.counts.professional_evidence_records);
  assert.ok(m.scope_and_privacy.length);
  for(const ref of index(m.resource_refs,'resource ref').values()){
   assert.ok(resources.has(ref.id),'Unknown resource '+ref.id);
   assert.ok(ref.participation_status,'Missing case participation state');
  }
  for(const c of index(m.professional_evidence,'case evidence').values()){
   const p=profiles.get(c.profile_ref);assert.ok(p,'Unknown profile '+c.profile_ref);
   assert.ok(c.article_reference&&c.identity_status&&c.limits,'Missing case caveat');
   assert.ok(c.fact_refs.length&&new Set(c.fact_refs).size===c.fact_refs.length);
   const facts=index(p.facts,'profile fact');
   for(const id of c.fact_refs)assert.ok(facts.has(id),'Unknown fact '+id);
   assert.ok(c.formal_review_routes.length);
   for(const route of c.formal_review_routes){
    const [f,id,...extra]=route.split('#');
    assert.ok(!extra.length&&id&&['authority-oversight.json','medical-board-oversight.json'].includes(f),'Invalid review route '+route);
    const records=read(join(folder,f))[f==='authority-oversight.json'?'authority_records':'records'];
    assert.ok(records.some(r=>r.id===id),'Unknown formal review route '+route);
   }
  }
 }
}
assert.ok(manifests>0,'No shared knowledge manifests');
console.log('Validated '+resources.size+' resources, '+profiles.size+' profiles, '+themes.size+' themes and '+manifests+' article manifest(s). No network or mail.');
