// Offline structural validation; no classifier, model, network or mail.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url));
const data=resolve(root,'../data');
const org=join(root,'organizations');
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
const resources=index(read(join(org,'community-support.json')).resources,'resource');
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
const catalogNames=["outreach-registry.json","authority-oversight.json","medical-board-oversight.json","disease-disability-and-civic-resources.json","news-media-resources.json","peninsula-community-and-neurology-resources.json","victim-support-and-stanford-investigations.json","worker-rights-and-related-incident-reports.json","community-support.json"];
const history=read(join(root,'historical-evidence.json'));
assert.equal(history.recipient_eligible,false);
const catalogs=new Map();
for(const name of catalogNames){
 const c=read(join(org,name));
 assert.equal(c.schema_version,name==='community-support.json'?1:2);
 catalogs.set(name,c);
 assert.ok(!Object.hasOwn(c,'article_url'),'Case URL in shared '+name);
 assert.ok(!Object.hasOwn(c,'workflow'),'Case workflow in shared '+name);
 for(const k of ['dispatches','confirmed_coalition_members'])assert.ok(!Object.hasOwn(c.counts||{},k),'Case count in shared '+name);
 for(const dep of Array.isArray(c.extends)?c.extends:c.extends?[c.extends]:[])assert.ok(catalogNames.includes(dep),'Unknown shared dependency '+dep);
 for(const rows of Object.values(c).filter(Array.isArray))for(const row of rows)if(row&&typeof row==='object')for(const k of ['contact_status','participation_status','dispatch_status'])assert.ok(!Object.hasOwn(row,k),'Case state in shared '+name);
 if(c.historical_evidence){
  assert.equal(resolve(org,c.historical_evidence.path),join(root,'historical-evidence.json'));
  for(const section of c.historical_evidence.sections){
   assert.ok(Array.isArray(history.sources[name]?.[section]),'Missing history '+name+':'+section);
   assert.ok(!Object.hasOwn(c,section),'Duplicate historical data '+name+':'+section);
  }
 }
}
for(const [name,sections] of Object.entries(history.sources)){
 const c=catalogs.get(name);
 assert.ok(c,'Unknown historical source '+name);
 for(const section of Object.keys(sections))assert.ok(c.historical_evidence.sections.includes(section),'Unreferenced historical section '+section);
}
function checkOutreach(folder){
 const m=read(join(folder,'outreach-context.json'));
 assert.equal(m.schema_version,1);
 assert.equal(resolve(folder,m.historical_evidence),join(root,'historical-evidence.json'));
 assert.equal(resolve(folder,m.community_professional_manifest),join(folder,'community-support-and-professional-evidence.json'));
 for(const [name,ref] of Object.entries(m.catalogs)){
  assert.ok(catalogs.has(name),'Unknown catalog '+name);
  assert.equal(resolve(folder,ref.path),join(org,name));
  if(ref.case_manifest)assert.equal(resolve(folder,ref.case_manifest),join(folder,'community-support-and-professional-evidence.json'));
  const c=catalogs.get(name);
  for(const section of ref.historical_sections||[])assert.ok(c.historical_evidence.sections.includes(section),'Unknown history section '+section);
  for(const [key,states] of Object.entries(ref.record_state||{})){
   const rows=c[key];
   assert.ok(Array.isArray(rows),'Unknown state collection '+key);
   for(const id of Object.keys(states))assert.ok(rows.some(r=>r.id===id),'Unknown case state ID '+id);
  }
 }
}

let manifests=0;
for(const dir of readdirSync(data,{withFileTypes:true}).filter(x=>x.isDirectory())){
 const folder=join(data,dir.name);
 const files=readdirSync(folder);
 for(const name of catalogNames)assert.ok(!files.includes(name),'Organization catalog duplicated in article '+name);
 if(files.includes('outreach-context.json'))checkOutreach(folder);
 for(const file of readdirSync(folder).filter(x=>x==='community-support-and-professional-evidence.json')){
  const m=read(join(folder,file));
  if(m.schema_version!==2)throw Error('Unsupported shared knowledge manifest: '+file);
  manifests++;
  for(const dep of m.extends)assert.ok(catalogNames.some(n=>resolve(folder,dep)===join(org,n)),'Unknown manifest dependency '+dep);
  for(const [key,name] of Object.entries({resources:'organizations/community-support.json',professional_evidence:'professional-evidence.json',themes:'writing-themes.json'})){
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
    const target=resolve(folder,f);
    assert.ok(!extra.length&&id&&['authority-oversight.json','medical-board-oversight.json'].some(n=>target===join(org,n)),'Invalid review route '+route);
    const records=read(target)[target===join(org,'authority-oversight.json')?'authority_records':'records'];
    assert.ok(records.some(r=>r.id===id),'Unknown formal review route '+route);
   }
  }
 }
}
assert.ok(manifests>0,'No shared knowledge manifests');
console.log('Validated '+catalogs.size+' organization catalogs, '+resources.size+' resources, '+profiles.size+' profiles, '+themes.size+' themes and '+manifests+' article manifest(s). No network or mail.');
