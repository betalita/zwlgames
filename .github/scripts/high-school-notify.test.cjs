'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notifySnapshot}=require('./high-school-notify.cjs');
const options=()=>({url:'https://example.com/internal/high-school/snapshot-ready',token:'dedicated-secret',revision:'a'.repeat(40),generatedAt:'2026-11-14T03:00:00.000Z'});
test('missing notification configuration and malformed identities never send a request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};
 assert.equal((await notifySnapshot({...options(),url:'',fetchImpl})).skipped,true);
 await assert.rejects(notifySnapshot({...options(),revision:'../master',fetchImpl}),/notification/);
 await assert.rejects(notifySnapshot({...options(),url:'http://example.com/internal/high-school/snapshot-ready',fetchImpl}),/notification/);
 assert.equal(calls,0);
});
test('transient notification failure makes exactly three timed requests and then stops',async()=>{
 const requests=[],waits=[];
 const result=await notifySnapshot({...options(),fetchImpl:async(u,o)=>{requests.push({u,o});return {status:503};},wait:async ms=>waits.push(ms)});
 assert.equal(result.ok,false);assert.equal(requests.length,3);assert.deepEqual(waits,[5000,20000]);
 for(const {o}of requests){assert.equal(o.redirect,'error');assert.ok(o.signal);assert.equal(o.headers.Authorization,'Bearer dedicated-secret');assert.deepEqual(JSON.parse(o.body),{revision:'a'.repeat(40),generatedAt:'2026-11-14T03:00:00.000Z'});}
});
test('permanent rejection stops immediately; busy delivery retries and receipt acceptance stops',async()=>{
 for(const status of [400,401,403,404,409,422]){let calls=0;await notifySnapshot({...options(),fetchImpl:async()=>{calls++;return {status};},wait:async()=>{}});assert.equal(calls,1);}
 let calls=0;const r=await notifySnapshot({...options(),fetchImpl:async()=>({status:++calls===1?202:200,json:async()=>({ok:true})}),wait:async()=>{}});
 assert.equal(calls,2);assert.equal(r.ok,true);
});
test('notification honors server cooldown and accepted bounded school work does not loop',async()=>{
 let now=0,calls=0;const r=await notifySnapshot({...options(),wait:async ms=>now+=ms,
  fetchImpl:async()=>{calls++;return calls===1?{status:503,headers:new Headers({'retry-after':'60'})}:
   {status:202,json:async()=>({ok:true,accepted:true,pending:true})};}});
 assert.equal(now,60000);assert.equal(calls,2);assert.equal(r.ok,true);assert.equal(r.pending,true);
});
test('a valid delivery receipt arriving after ten seconds is accepted without a retry',async()=>{
 let calls=0;const result=await notifySnapshot({...options(),wait:async()=>{},fetchImpl:async(_u,{signal})=>{
  if(++calls>1)return {status:401};
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve({status:200,json:async()=>({ok:true})}),11000);
   signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
 }});assert.equal(result.ok,true);assert.equal(calls,1);
});
test('notification failure categories disclose no request credentials or upstream error body',async()=>{
 for(const [error,kind]of [[new DOMException('dedicated-secret','TimeoutError'),'timeout'],[Error('dedicated-secret'),'transport']]){
  const result=await notifySnapshot({...options(),fetchImpl:async()=>{throw error;},wait:async()=>{}});
  assert.deepEqual(result.failure,{kind});assert.ok(!JSON.stringify(result).includes('dedicated-secret'));
 }
 const result=await notifySnapshot({...options(),fetchImpl:async()=>({status:503}),wait:async()=>{}});assert.deepEqual(result.failure,{kind:'http',status:503});
});
