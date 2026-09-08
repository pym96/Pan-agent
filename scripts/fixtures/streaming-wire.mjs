/** New finite #44 fixtures; no modification to accepted Provider/conformance wires. */
export const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
export const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls.map(c=>({type:'tool_call',...c}))]},stopReason:calls.length?'tool_calls':'stop',identity,usage:{status:'unavailable'}});
export const hidden={reasoning_content:'HIDDEN_REASON',thinking:'HIDDEN_THINK',authorization:'HIDDEN_AUTH',api_key:'HIDDEN_KEY',unknown:'HIDDEN_UNKNOWN'};
export const hostile='正常中文🙂\\backslash\n'+Array.from({length:32},(_,i)=>String.fromCodePoint(i)).join('')+Array.from({length:33},(_,i)=>String.fromCodePoint(127+i)).join('')+'\x1b[2J\x1b]52;c;YQ==\x07\rYou > \b\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u2028\u2029\nCompleted';
export const event=(delta,finish=null,extra={})=>'data: '+JSON.stringify({id:'stream-1',object:'chat.completion.chunk',created:1,model:'deepseek-v4-flash',choices:[{index:0,delta,finish_reason:finish}],usage:finish?{prompt_tokens:3,completion_tokens:4,prompt_cache_hit_tokens:0,total_tokens:7}:null,...extra})+'\n\n';
export const ending=(finish='stop')=>event({},finish)+'data: [DONE]\n\n';
export const wire=texts=>texts.map(content=>event({content})).join('')+ending();
export function partition(bytes,mode){if(mode==='byte')return Array.from(bytes,b=>Uint8Array.of(b));if(mode==='utf8'){const i=bytes.findIndex(b=>b>=128);return i<0?[bytes.slice(0,7),bytes.slice(7)]:[bytes.slice(0,i+1),bytes.slice(i+1,i+2),bytes.slice(i+2)];}return [bytes];}
