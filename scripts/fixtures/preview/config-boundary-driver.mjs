/** #52 transport boundary probe (unguarded by design): the env canary may reach ONLY the authorization header. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,verificationDir,reportFile]=process.argv.slice(2);
if(!product||!verificationDir||!reportFile)throw new Error('usage: config-boundary-driver.mjs PRODUCT VERIFICATION_DIR REPORT');
const canaries=JSON.parse(await readFile(join(resolve(verificationDir),'canaries.json'),'utf8')).values;
assert.equal(process.env.DEEPSEEK_API_KEY,canaries[0],'canary must be present in the parent environment for this probe');
// Defense in depth: the real network is trapped even though the capture fetch replaces it.
let realFetchTouched=false;globalThis.fetch=async()=>{realFetchTouched=true;throw new Error('real network forbidden');};
const {DeepSeekFetchTransport,createPanDeepSeekAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
let capturedAuth=null,capturedUrl=null;
const captureFetch=async(url,init)=>{capturedUrl=String(url);capturedAuth=init?.headers?.authorization??null;throw new Error('boundary_captured_before_network');};
const transport=new DeepSeekFetchTransport({fetchImplementation:captureFetch});
const adapter=createPanDeepSeekAdapter(undefined,{transport});
assert.equal(adapter.providerId,'deepseek');assert.equal(adapter.modelId,'deepseek-v4-flash');
let boundaryError=null;
try{await transport.send({path:'/chat/completions',method:'POST',headers:{},body:'{}',signal:new AbortController().signal});}catch(e){boundaryError=String(e);}
assert.equal(boundaryError,'Error: boundary_captured_before_network');
assert.equal(capturedUrl,'https://api.deepseek.com/chat/completions','official endpoint only');
assert.equal(capturedAuth,'Bearer '+canaries[0],'canary reaches exactly the transport authorization boundary');
assert.equal(realFetchTouched,false);
// Missing credential is an explicit configuration error, never a hidden alternate path.
const empty=new DeepSeekFetchTransport({credentialSource:()=>undefined,fetchImplementation:captureFetch});
let missing=null;
try{await empty.send({path:'/x',method:'POST',headers:{},body:'{}',signal:new AbortController().signal});}catch(e){missing=String(e);}
assert.match(String(missing),/deepseek_credential_unavailable/);
await writeFile(reportFile,JSON.stringify({boundary:'authorization-header-only',endpoint:capturedUrl,missing_credential_error:'deepseek_credential_unavailable',realFetchTouched,network:'none'},null,2)+'\n');
console.log('PASS transport boundary probe: canary only in authorization header, official endpoint, no network');
