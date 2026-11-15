'use strict';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function notifySnapshot({url,token,revision,generatedAt,fetchImpl=fetch,wait:pause=wait}){
 if(!url||!token)return {skipped:true};
 let endpoint;try{endpoint=new URL(url);}catch{throw Error('invalid high school notification URL');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||
   endpoint.pathname!=='/internal/high-school/snapshot-ready'||!/^[a-f0-9]{40}$/.test(revision||'')||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(generatedAt||'')||!Number.isFinite(Date.parse(generatedAt)))throw Error('invalid high school notification');
 // Snapshot loading can use two 12s reads before bounded database imports.
 // Keep the receipt deadline longer than that server-side work.
 let retryDelay=null,failure=null;
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await pause(retryDelay??(attempt===1?5000:20000));
  try{
   const response=await fetchImpl(endpoint.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision,generatedAt})});
   if([200,202].includes(response.status)){
    const body=await response.json();
    if(body.ok===true&&(response.status===200||body.accepted===true))return {ok:true,pending:!!body.pending,attempts:attempt+1};
   }
   failure={kind:'http',status:response.status};
   if([400,401,403,404,409,422].includes(response.status))return {ok:false,reason:'rejected',attempts:attempt+1};
   const retry=Number(response.headers?.get('retry-after'));
   if(retry>60)return {ok:false,pending:true,reason:'deferred',attempts:attempt+1};
   retryDelay=retry>0?retry*1000:null;
  }catch(error){failure={kind:error?.name==='TimeoutError'?'timeout':'transport'};} // Never log credentials or bodies.
 }
 return {ok:false,reason:'notification_unavailable',attempts:3,failure};
}
async function main(){
 const fs=require('node:fs/promises');const snapshot=JSON.parse(await fs.readFile('data/high-school-2026-27.json','utf8'));
 const result=await notifySnapshot({url:process.env.HIGH_SCHOOL_CALLBACK_URL,token:process.env.HIGH_SCHOOL_CALLBACK_TOKEN,
  revision:process.env.HIGH_SCHOOL_SNAPSHOT_REVISION,generatedAt:snapshot.generatedAt});
 console.log(JSON.stringify(result));if(result.ok===false)process.exitCode=1;
}
module.exports={notifySnapshot};
if(require.main===module)main().catch(()=>{console.error('high school notification configuration invalid');process.exitCode=1;});
