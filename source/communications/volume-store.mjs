import { DatabaseSync } from 'node:sqlite';
import { lstat, readFile, mkdir, mkdtemp, rm, rename, open } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { requireThat, emptyState, assertState, encryptState, decryptState, uuid } from './core.mjs';
import { parseSignals } from './knowledge.mjs';

const LEDGER_AAD='grwtsk-correspondence:volume:v1:ledger';
const SIGNAL_FILE='source/communications/signals/approved.md';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const NAME=/^\d{9}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.enc\.json$/;
function validDay(day){return typeof day==='string'&&DAY.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
function validRef(day,name){return validDay(day)&&typeof name==='string'&&NAME.test(name);}
function archiveAAD(day,name){return 'grwtsk-correspondence:volume:v1:mailbox/inbound/'+day+'/'+name;}
function tx(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try {
    const value=fn();
    requireThat(!value||typeof value.then!=='function',503,'Storage transaction must be synchronous');
    db.exec('COMMIT');return value;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
}

export class VolumeStore {
  constructor({stateDir,key,signalFile=new URL('./signals/approved.md',import.meta.url),signalCommit=null}){
    requireThat(typeof stateDir==='string'&&isAbsolute(stateDir)&&Buffer.isBuffer(key)&&key.length===32,500,'Invalid volume storage configuration');
    this.dir=resolve(stateDir);this.key=key;this.signalFile=signalFile;this.signalCommit=signalCommit;this.db=null;
  }
  async initialize(){
    const stat=await lstat(this.dir).catch(()=>null);
    requireThat(stat?.isDirectory()&&!stat.isSymbolicLink(),503,'Persistent state directory is missing or unsafe');
    const file=join(this.dir,'correspondence.sqlite');
    const old=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    requireThat(!old||old.isFile()&&!old.isSymbolicLink(),503,'Unsafe database path');
    const db=new DatabaseSync(file);this.db=db;
    try{
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
      tx(db,()=>{
        db.exec('CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, ciphertext TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS inbound_archive (day TEXT NOT NULL, name TEXT NOT NULL, provider_id TEXT NOT NULL UNIQUE, ciphertext TEXT NOT NULL, PRIMARY KEY(day,name)) STRICT;');
        const row=db.prepare('SELECT revision,ciphertext FROM ledger WHERE id=1').get();
        if(row)decryptState(row.ciphertext,this.key,LEDGER_AAD);
        else db.prepare('INSERT INTO ledger (id,revision,ciphertext) VALUES (1,0,?)').run(encryptState(emptyState(),this.key,LEDGER_AAD));
      });
      await this.read();
    }catch(e){db.close();this.db=null;throw e;}
  }
  connection(){requireThat(this.db,503,'Volume storage is not initialized');return this.db;}
  row(){
    const r=this.connection().prepare('SELECT revision,ciphertext FROM ledger WHERE id=1').get();
    requireThat(r&&Number.isSafeInteger(r.revision),503,'Missing volume ledger');return r;
  }
  async read(){const r=this.row();return {sha:'volume:'+r.revision,state:decryptState(r.ciphertext,this.key,LEDGER_AAD)};}
  async mutate(fn){
    const db=this.connection();
    return tx(db,()=>{
      const r=this.row(),s=decryptState(r.ciphertext,this.key,LEDGER_AAD);
      const result=fn(s);
      requireThat(!result||typeof result.then!=='function',503,'Ledger mutation must be synchronous');
      assertState(s);
      const change=db.prepare('UPDATE ledger SET revision=revision+1,ciphertext=? WHERE id=1 AND revision=?').run(encryptState(s,this.key,LEDGER_AAD),r.revision);
      requireThat(change.changes===1,409,'Ledger revision changed');
      return result;
    });
  }
  async readSignals(){
    let raw;
    try{raw=await readFile(this.signalFile);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    requireThat(raw.length<=48_000,400,'Signal file exceeds 48 KB');
    const blob=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
    const commit=/^[0-9a-f]{40}$/i.test(this.signalCommit||'')?this.signalCommit:'local-content:'+blob;
    return {commit,blob,path:SIGNAL_FILE,entries:parseSignals(raw.toString('utf8'))};
  }
  // Verify a consistent SQLite snapshot before replacing the previous local
  // checkpoint. Never restore into an active database. No off-volume claim.
  async checkpoint(){
    const folder=join(this.dir,'verified-checkpoints');
    try{await mkdir(folder,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
    const st=await lstat(folder);requireThat(st.isDirectory()&&!st.isSymbolicLink(),503,'Unsafe checkpoint directory');
    const tmp=await mkdtemp(join(folder,'snapshot-')),path=join(tmp,'state.sqlite');
    try{
      this.connection().prepare('VACUUM INTO ?').run(path);
      const copy=new DatabaseSync(path,{readOnly:true});
      try{
        requireThat(copy.prepare('PRAGMA quick_check').get()?.quick_check==='ok',503,'Checkpoint integrity failed');
        const row=copy.prepare('SELECT revision,ciphertext FROM ledger WHERE id=1').get();
        requireThat(row&&Number.isSafeInteger(row.revision),503,'Checkpoint ledger missing');
        decryptState(row.ciphertext,this.key,LEDGER_AAD);
        const archive=new VolumeArchive(this);
        for(const r of copy.prepare('SELECT * FROM inbound_archive').iterate())archive.decode(r);
      }finally{copy.close();}
      const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}
      await rename(path,join(folder,'latest.sqlite'));
      const dir=await open(folder,'r');try{await dir.sync();}finally{await dir.close();}
      return {verified:true};
    }finally{await rm(tmp,{recursive:true,force:true});}
  }
  close(){if(this.db){this.db.close();this.db=null;}}
}

export class VolumeArchive {
  constructor(store){this.store=store;}
  decode(row){
    requireThat(row&&validRef(row.day,row.name)&&uuid(row.provider_id),503,'Invalid stored archive reference');
    const m=decryptState(row.ciphertext,this.store.key,archiveAAD(row.day,row.name)).mailArchive;
    requireThat(m&&m.version===1&&m.day===row.day&&m.name===row.name&&m.id===row.provider_id&&m.name.endsWith(m.id+'.enc.json'),503,'Invalid encrypted archive record');
    return m;
  }
  async byProviderId(id){requireThat(uuid(id),400,'Invalid provider ID');const row=this.store.connection().prepare('SELECT * FROM inbound_archive WHERE provider_id=?').get(id);return row?this.decode(row):null;}
  async get(day,name){
    requireThat(validRef(day,name),400,'Invalid mailbox archive reference');
    const row=this.store.connection().prepare('SELECT * FROM inbound_archive WHERE day=? AND name=?').get(day,name);
    requireThat(row,404,'Archived message not found');return this.decode(row);
  }
  async put(m){
    requireThat(m&&uuid(m.id)&&validRef(m.day,m.name)&&m.name.endsWith(m.id+'.enc.json'),400,'Invalid mailbox archive record');
    const db=this.store.connection();
    return tx(db,()=>{
      const prior=db.prepare('SELECT * FROM inbound_archive WHERE provider_id=?').get(m.id);
      if(prior){const record=this.decode(prior);requireThat(record.day===m.day&&record.name===m.name&&record.createdAt===m.createdAt,409,'Conflicting mailbox archive record');return {created:false,record};}
      const cipher=encryptState({...emptyState(),mailArchive:m},this.store.key,archiveAAD(m.day,m.name));
      db.prepare('INSERT INTO inbound_archive(day,name,provider_id,ciphertext) VALUES (?,?,?,?)').run(m.day,m.name,m.id,cipher);
      return {created:true,record:m};
    });
  }
  async list(day,cursor=null){
    requireThat(validDay(day)&&(cursor===null||validRef(day,cursor)),400,'Invalid mailbox date or cursor');
    const db=this.store.connection();
    const rows=cursor===null?db.prepare('SELECT * FROM inbound_archive WHERE day=? ORDER BY name DESC LIMIT 11').all(day):
      db.prepare('SELECT * FROM inbound_archive WHERE day=? AND name<? ORDER BY name DESC LIMIT 11').all(day,cursor);
    const items=rows.slice(0,10).map(row=>{const {id,name,createdAt,from,subject,authentication,bodyTruncated,attachmentCount,route}=this.decode(row);return {id,name,createdAt,from,subject,authentication,bodyTruncated,attachmentCount,route};});
    return {day,items,next:rows.length>10?items.at(-1).name:null,directoryLimit:false};
  }
}
