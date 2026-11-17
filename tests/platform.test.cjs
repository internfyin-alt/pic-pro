const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('src/lib/platform-server.ts','utf8');
function platform({user={id:'u1',email:'studio@example.com'},authError=null,profile={id:'u1',role:'photographer',suspended:false},event={id:'e1',owner_id:'u1'},rpc=true}={}){
 const db={auth:{getUser:async()=>({data:{user},error:authError})},from:table=>({select:()=>({eq:()=>({single:async()=>({data:profile,error:null}),maybeSingle:async()=>({data:event,error:null})})})}),rpc:async()=>({data:rpc,error:null})};
 const mod={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>name==='@/lib/supabase'?{adminDb:()=>db}:require(name),Buffer,console,process,Response});return mod.exports;
}
const req=(token='valid')=>new Request('http://localhost/api/platform/me',{headers:token?{Authorization:'Bearer '+token}:{}});
test('PIN hashes use different salts, accept only the correct PIN, and handle leading zeroes',()=>{const api=platform();const a=api.pinHash('001234'),b=api.pinHash('001234');assert.notEqual(a,b);assert.equal(api.checkPin('001234',a),true);assert.equal(api.checkPin('1234',a),false);assert.equal(api.checkPin('999999',a),false)});
test('missing or invalid access tokens cannot authenticate',async()=>{await assert.rejects(platform().actor(req('')),e=>e.status===401);await assert.rejects(platform({user:null,authError:{message:'invalid'}}).actor(req()),e=>e.status===401)});
test('suspended owners cannot reach platform APIs',async()=>{await assert.rejects(platform({profile:{id:'u1',role:'photographer',suspended:true}}).actor(req()),e=>e.status===403)});
test('photographers cannot access another owner’s event',async()=>{await assert.rejects(platform({event:{id:'e1',owner_id:'u2'}}).owned(req(),'e1'),e=>e.status===404)});
test('owner and super administrator may manage an event',async()=>{assert.equal((await platform().owned(req(),'e1')).event.id,'e1');assert.equal((await platform({profile:{id:'admin',role:'super_admin',suspended:false}}).owned(req(),'e1')).event.id,'e1')});
test('durable rate limit rejects exhausted requests',async()=>{await assert.rejects(platform({rpc:false}).limit('test',5,60),e=>e.status===429);await platform({rpc:true}).limit('test',5,60)});
test('body limits reject oversized fixed-length and streaming requests',async()=>{const api=platform();await assert.rejects(api.readBody(new Request('http://localhost',{method:'POST',body:'123456'}),5),e=>e.status===413);const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('1234'));controller.enqueue(new TextEncoder().encode('5678'));controller.close()}});await assert.rejects(api.readBody(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'}),5),e=>e.status===413)});
test('invalid JSON is a client error, not a provider failure',async()=>{await assert.rejects(platform().readJson(new Request('http://localhost',{method:'POST',body:'{broken'})),e=>e.status===400)});
test('responses disable caching and errors do not disclose provider details',async()=>{const api=platform();assert.equal(api.json({ok:true}).headers.get('cache-control'),'no-store');const original=console.error;console.error=()=>{};try{const response=api.failure(new Error('SECRET_PROVIDER_DETAILS'));assert.equal(response.status,503);assert.equal((await response.text()).includes('SECRET_PROVIDER_DETAILS'),false)}finally{console.error=original}});
