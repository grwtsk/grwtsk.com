import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { emptyState } from '../core.mjs';
import { handler } from '../server.mjs';

test('issue routes require operator authentication, preserve private state, and cannot send or change recipients',async()=>{
  const state=emptyState();
  const token='synthetic-test-token';
  const config={token,offices:[],live:true};
  let calls=0;
  const store={read:async()=>({state}),mutate:async fn=>fn(state)};
  const provider=new Proxy({}, {get(){calls++;throw Error('Unexpected provider call');}});
  const server=createServer(handler(config,store,provider));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  async function req(path,data,authenticated=true){
    return fetch(base+path,{method:data===undefined?'GET':'POST',headers:{
      ...(authenticated?{Authorization:'Bearer '+token}:{}),
      ...(data===undefined?{}:{'Content-Type':'application/json'})
    },...(data===undefined?{}:{body:JSON.stringify(data)})});
  }
  try {
    for(const method of ['GET','HEAD']){
      const home=await fetch(base+'/',{method,redirect:'manual'});
      assert.equal(home.status,303);
      assert.equal(home.headers.get('location'),'https://github.com/grwtsk/grwtsk.com/issues/8');
      assert.equal(await home.text(),'');
    }
    for(const path of ['/app.js','/style.css','/web/index.html'])assert.equal((await fetch(base+path)).status,404);
    assert.deepEqual(await (await fetch(base+'/healthz')).json(),{ok:true});
    const issue={title:'Synthetic issue',owner:'Synthetic office',nextAction:'Clarify process',shareSummary:'A process question.',shareReviewed:true};
    assert.equal((await req('/api/coordination/create',issue,false)).status,401);
    assert.equal(state.coordination,undefined);
    const r=await req('/api/coordination/create',issue);assert.equal(r.status,200);const i=await r.json();
    const n=await req('/api/coordination/nominate',{issueId:i.id,role:'Synthetic office',url:'https://example.org/intake',reason:'Applicable scope'});
    assert.equal(n.status,200);const nominee=await n.json();
    const review=await req('/api/coordination/review-nomination',{nominationId:nominee.id,status:'route-verified',note:'Synthetic review',confirm:true});
    assert.equal(review.status,200);
    assert.equal((await req('/api/coordination/preview?issueId='+i.id,undefined,false)).status,401);
    const preview=await req('/api/coordination/preview?issueId='+i.id);
    assert.equal(preview.status,200);assert.equal((await preview.json()).publication,'not_published');
    const send=await req('/api/send',{cc:['example@example.org'],confirm:true});
    assert.equal(send.status,400);
    const locked=await req('/api/send',{caseId:'synthetic-case',confirm:true});
    assert.equal(locked.status,409);assert.match((await locked.json()).error,/locked during writing review/);
    assert.equal(config.offices.length,0);assert.equal(state.cases.length,0);
    assert.equal(calls,0);
  } finally {server.close();await once(server,'close');}
});
