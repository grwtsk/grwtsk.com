import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import { VolumeStore, VolumeArchive } from '../volume-store.mjs';
import { createCase,parseOffices } from '../core.mjs';
import { admission,archiveMessage } from '../personal-mailbox.mjs';

const offices=parseOffices(JSON.stringify([{id:'office',email:'office@example.org',role:'Synthetic office',scope:'Synthetic',basis:'official_casework',source:'https://example.org/intake',verification:'Synthetic'}]));
async function temp(fn){const dir=await mkdtemp(join(tmpdir(),'correspondence-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('volume state persists across reopen; bad key and missing directory fail closed',()=>temp(async dir=>{
  const key=randomBytes(32),cfg={stateDir:dir,key};
  const s=new VolumeStore(cfg);await s.initialize();
  await s.mutate(x=>createCase(x,offices,{officeId:'office',title:'PRIVATE SYNTHETIC TITLE'},'reply.example.org'));
  const before=await s.read();s.close();
  const bytes=await readFile(join(dir,'correspondence.sqlite'));assert.ok(!bytes.includes(Buffer.from('PRIVATE SYNTHETIC TITLE')));
  const t=new VolumeStore(cfg);await t.initialize();assert.deepEqual(await t.read(),before);t.close();
  await assert.rejects(new VolumeStore({...cfg,key:randomBytes(32)}).initialize(),/authenticate/);
  await assert.rejects(new VolumeStore({...cfg,stateDir:join(dir,'missing')}).initialize(),/missing/);
}));
test('mutations serialize and roll back on error, across connections',()=>temp(async dir=>{
  const cfg={stateDir:dir,key:randomBytes(32)},a=new VolumeStore(cfg),b=new VolumeStore(cfg);
  await a.initialize();await b.initialize();
  try{
    await Promise.all([a.mutate(s=>s.events.push({id:'a'})),b.mutate(s=>s.events.push({id:'b'}))]);
    assert.deepEqual((await a.read()).state.events.map(e=>e.id),['a','b']);
    await assert.rejects(a.mutate(s=>{s.events.push({id:'bad'});throw Error('rollback');}),/rollback/);
    assert.equal((await b.read()).state.events.length,2);
  }finally{a.close();b.close();}
}));
test('encrypted archive deduplicates by provider ID, pages and survives restart',()=>temp(async dir=>{
  const cfg={stateDir:dir,key:randomBytes(32)},s=new VolumeStore(cfg);
  await s.initialize();const a=new VolumeArchive(s);let first;
  try{
    for(let i=0;i<12;i++){
      const id=randomUUID(),m={id,created_at:'2026-11-24T10:00:00.'+String(i).padStart(3,'0')+'Z',to:['owner@example.net'],from:offices[0].email,subject:'private test',text:'PRIVATE ARCHIVE BODY',authentication:{dmarc:'pass'}};
      const route=admission(m,{cases:[]},{primary:'owner@example.net',offices}).route;
      const rec=archiveMessage(m,id,route);
      if(i===0)first=rec;
      assert.equal((await a.put(rec)).created,true);
    }
    assert.equal((await a.put({...first,text:'Changed'})).created,false);
    const page=await a.list(first.day);assert.equal(page.items.length,10);
    const next=await a.list(first.day,page.next);assert.equal(next.items.length,2);
    assert.ok(!JSON.stringify(page).includes('PRIVATE ARCHIVE BODY'));
  }finally{s.close();}
  const t=new VolumeStore(cfg);await t.initialize();
  try{assert.equal((await new VolumeArchive(t).get(first.day,first.name)).text,'PRIVATE ARCHIVE BODY');}finally{t.close();}
  assert.ok(!(await readFile(join(dir,'correspondence.sqlite'))).includes(Buffer.from('PRIVATE ARCHIVE BODY')));
}));
test('bundled Markdown source includes content provenance without GitHub token',()=>temp(async dir=>{
  const signalFile=join(dir,'approved.md');await writeFile(signalFile,'## Communication signals v1\n');
  const s=new VolumeStore({stateDir:dir,key:randomBytes(32),signalFile,signalCommit:'a'.repeat(40)});
  const r=await s.readSignals();assert.equal(r.commit,'a'.repeat(40));assert.equal(r.entries.length,0);assert.match(r.blob,/^[0-9a-f]{40}$/);
  assert.equal(r.path,'source/correspondence/signals/approved.md');
}));

test('verified local checkpoint restores exact ledger and archive in a disposable directory',()=>temp(async dir=>{
 const key=randomBytes(32),s=new VolumeStore({stateDir:dir,key});await s.initialize();
 try{
  await s.mutate(x=>createCase(x,offices,{officeId:'office',title:'SYNTHETIC CHECKPOINT'},'reply.example.org'));
  const id=randomUUID(),mail={id,created_at:'2026-11-24T10:00:00Z',to:['owner@example.net'],from:offices[0].email,subject:'test',text:'SYNTHETIC PROTECTED BODY',authentication:{dmarc:'pass'}};
  const record=archiveMessage(mail,id,admission(mail,{cases:[]},{primary:'owner@example.net',offices}).route);
  await new VolumeArchive(s).put(record);const before=await s.read();
  assert.deepEqual(await s.checkpoint(),{verified:true});
  const bytes=await readFile(join(dir,'verified-checkpoints','latest.sqlite'));
  assert.ok(!bytes.includes(Buffer.from('SYNTHETIC PROTECTED BODY')));
  await temp(async restored=>{
   await writeFile(join(restored,'correspondence.sqlite'),bytes);
   const copy=new VolumeStore({stateDir:restored,key});await copy.initialize();
   try{assert.deepEqual(await copy.read(),before);assert.equal((await new VolumeArchive(copy).get(record.day,record.name)).text,record.text);}finally{copy.close();}
  });
 }finally{s.close();}
}));
