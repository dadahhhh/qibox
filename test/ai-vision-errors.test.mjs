import test from 'node:test';
import assert from 'node:assert/strict';
import { AIProvider } from '../server/ai-provider.mjs';

const config={baseUrl:'http://127.0.0.1:8317/v1',model:'gemini-3.8-flash-high',protocol:'openai',timeout:10};
const image={messageId:'picture-1',mime:'image/png',data:'aW1hZ2U='};
const input={mode:'vision-probe',images:[image],messages:[{id:'picture-1',type:'image',direction:'other',text:'[图片]'}]};
const success=()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});

for(const status of [400,415,422])test(`HTTP ${status} malformed image requests are not retried as text or called unsupported`,async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Invalid image data: failed to decode PNG'}},{status});}});
  await assert.rejects(provider.complete(config,'Return JSON.',input,undefined,{retry:false}),error=>error.code==='ai_model_image_request');
  assert.equal(calls,1);
});

test('context overflow with images keeps the real cause and makes no text fallback',async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Input exceeds context length limit'}},{status:400});}});
  await assert.rejects(provider.complete(config,'Return JSON.',input),/上下文容量不足/);
  assert.equal(calls,1);
});

test('the existing budget retry retains image bytes and does not add a retry',async()=>{
  const requests=[];
  const provider=new AIProvider({fetcher:async(_,args)=>{
    requests.push(JSON.parse(args.body));
    return requests.length===1?Response.json({error:{message:'Unsupported parameter: max_tokens'}},{status:400}):success();
  }});
  assert.deepEqual(await provider.complete(config,'Return JSON.',input),{ok:true});
  assert.equal(requests.length,2);
  assert.equal(requests[1].max_tokens,undefined);
  for(const request of requests)assert.ok(request.messages.at(-1).content.some(x=>x.type==='image_url'&&x.image_url.url.endsWith(image.data)));
});

test('required-image requests do not gain an additional budget retry',async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Unsupported parameter: max_tokens'}},{status:400});}});
  await assert.rejects(provider.complete(config,'Return JSON.',input,undefined,{requireImages:true}),error=>error.code==='ai_model_image_request');
  assert.equal(calls,1);
});

for(const value of [{...input,onlyImages:true},{...input,mode:'reply',conversation:{pendingIncomingIds:['picture-1']}}])test('image-only input cannot gain a budget retry through the mixed-text path',async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Unsupported parameter: max_tokens'}},{status:400});}});
  await assert.rejects(provider.complete(config,'Return JSON.',value),error=>error.code==='ai_model_image_request');
  assert.equal(calls,1);
});

for(const protocol of ['openai','anthropic'])test(`${protocol}: explicit vision rejection retains the existing one-call image-only skip`,async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Image input is not supported by this model'}},{status:400});}});
  assert.deepEqual(await provider.complete({...config,protocol},'Return JSON.',{...input,onlyImages:true}),{action:'skip',mediaSkipped:true});
  assert.equal(calls,1);
});

for(const cumulative of [false,true])test('image budget rejection cannot remove report output ceilings',async()=>{
  let calls=0;
  const provider=new AIProvider({fetcher:async()=>{calls++;return Response.json({error:{message:'Unsupported parameter: max_tokens'}},{status:400});}});
  await assert.rejects(provider.complete(config,'Return JSON.',input,undefined,{format:'report',budget:64,...(cumulative?{maxOutputAcrossAttempts:128}:{})}),error=>error.code==='ai_model_image_request');
  assert.equal(calls,1);
});
