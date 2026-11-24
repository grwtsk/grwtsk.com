import {buildLifecycle,renderLifecycle} from './lifecycle.mjs';
const API='https://api.github.com/repos/grwtsk/grwtsk.com';
const INDEX=8;
// The only writable destination is the pre-existing public index issue.
export async function sync({token=process.env.GITHUB_TOKEN,fetcher=fetch,today=new Date().toISOString().slice(0,10)}={}){
 if(!token)throw Error('Missing Actions token');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'GRWTSK-lifecycle-index'};
 async function call(path,method='GET',body){
   const r=await fetcher(API+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(15000),...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw Error('GitHub lifecycle request failed: '+r.status);
   return {data:await r.json(),more:!!r.headers.get('link')?.includes('rel="next"')};
 }
 const issues=[];
 for(let page=1;page<=5;page++){
   const {data,more}=await call('/issues?state=all&creator=grwtsk&per_page=100&page='+page);
   if(!Array.isArray(data)||data.length>100)throw Error('Invalid issue listing');
   issues.push(...data);
   if(!more)break;
   if(page===5)throw Error('Issue list incomplete; refusing to replace index');
 }
 const projection=buildLifecycle(issues,today),body=renderLifecycle(projection);
 const current=(await call('/issues/'+INDEX)).data;
 if(current.number!==INDEX||current.pull_request||current.user?.id!==176085483)throw Error('Unexpected index identity');
 if(current.body!==body)await call('/issues/'+INDEX,'PATCH',{body});
 return projection.metrics;
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)sync().then(m=>console.log(JSON.stringify(m))).catch(e=>{console.error(e.message);process.exitCode=1;});
