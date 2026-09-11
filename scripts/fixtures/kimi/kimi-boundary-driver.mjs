/** #53 Kimi transport boundary probe (unguarded by design): the env canary may reach ONLY the authorization header. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,verificationDir,reportFile]=process.argv.slice(2);
if(!product||!verificationDir||!reportFile)throw new Error('usage: kimi-boundary-driver.mjs PRODUCT VERIFICATION_DIR REPORT');
const canaries=JSON.parse(await readFile(join(resolve(verificationDir),'canaries.json'),'utf8')).values;
assert.equal(process.env.KIMI_API_KEY,canaries[0],'kimi canary must be present in the parent environment for this probe');
let realFetchTouched=false;globalThis.fetch=async()=>{realFetchTouched=true;throw new Error('real network forbidden');};
const {KimiFetchTransport,createPanKimiAdapter,KIMI_OFFICIAL_CONTRACT}=await import(pathToFileURL(join(product,'dist/index.js')));
let capturedAuth=null,capturedUrl=null;
const captureFetch=async(url,init)=>{capturedUrl=String(url);capturedAuth=init?.headers?.authorization??null;throw new Error('boundary_captured_before_network');};
const transport=new KimiFetchTransport({fetchImplementation:captureFetch});
const adapter=createPanKimiAdapter(undefined,{transport});
assert.equal(adapter.providerId,'kimi-code');assert.equal(adapter.modelId,'kimi-for-coding');
let boundaryError=null;
try{await transport.send({path:'/chat/completions',method:'POST',headers:{},body:'{}',signal:new AbortController().signal});}catch(e){boundaryError=String(e);}
assert.equal(boundaryError,'Error: boundary_captured_before_network');
assert.equal(capturedUrl,KIMI_OFFICIAL_CONTRACT.baseUrl+KIMI_OFFICIAL_CONTRACT.chatCompletionsPath,'frozen official endpoint only');
assert.equal(capturedAuth,'Bearer '+canaries[0],'canary reaches exactly the transport authorization boundary');
assert.equal(realFetchTouched,false);
// The Anthropic-compatible endpoint is out of scope: rejected before any fetch.
let endpointError=null;
try{await transport.send({path:'/messages',method:'POST',headers:{},body:'{}',signal:new AbortController().signal});}catch(e){endpointError=String(e);}
assert.match(String(endpointError),/kimi_endpoint_not_supported/);
assert.equal(capturedAuth,'Bearer '+canaries[0],'endpoint rejection must not issue another boundary read');
// Missing credential is an explicit configuration error, never a hidden alternate path.
const empty=new KimiFetchTransport({credentialSource:()=>undefined,fetchImplementation:captureFetch});
let missing=null;
try{await empty.send({path:'/chat/completions',method:'POST',headers:{},body:'{}',signal:new AbortController().signal});}catch(e){missing=String(e);}
assert.match(String(missing),/kimi_credential_unavailable/);
await writeFile(reportFile,JSON.stringify({boundary:'authorization-header-only',endpoint:capturedUrl,missing_credential_error:'kimi_credential_unavailable',endpoint_override_rejected:true,realFetchTouched,network:'none'},null,2)+'\n');
console.log('PASS kimi transport boundary probe: canary only in authorization header, frozen official endpoint, no network');
