// Deterministic transport fixture, not an LLM. Pi's genuine model adapter consumes this stream.
import http from 'node:http';
let requests=0;
http.createServer(async(req,res)=>{
 if(req.url==='/metrics'){res.end(JSON.stringify({requests,kind:'deterministic synthetic model'}));return}
 if(req.url!=='/v1/chat/completions'){res.writeHead(404).end();return}
 let raw='';for await(const c of req){raw+=c;if(raw.length>1048576){res.writeHead(413).end();return}}
 const b=JSON.parse(raw);requests++;
 if(b.tools?.length){res.writeHead(400).end('tools forbidden');return}
 const content=b.messages.filter(m=>m.role==='user').at(-1)?.content??'';
 const user=typeof content==='string'?content:content.filter(x=>x.type==='text').map(x=>x.text).join('');
 if(String(user).includes('FAIL_MODEL')){res.writeHead(503).end('synthetic fault');return}
 const text=`Synthetic reply ${b.messages.filter(m=>m.role==='user').length}: ${String(user).slice(0,80)}`;
 const delay=String(user).includes('SLOW_MODEL')?1000:20;
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 const chunk=(delta,finish=null)=>res.write('data: '+JSON.stringify({id:'synthetic',object:'chat.completion.chunk',created:1,model:b.model,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
 chunk({role:'assistant'});
 for(let i=0;i<text.length;i+=12){if(res.destroyed)return;await new Promise(r=>setTimeout(r,delay));chunk({content:text.slice(i,i+12)})}
 chunk({},'stop');res.write('data: '+JSON.stringify({id:'synthetic',object:'chat.completion.chunk',created:1,model:b.model,choices:[],usage:{prompt_tokens:16,completion_tokens:16,total_tokens:32}})+'\n\n');res.end('data: [DONE]\n\n');
}).listen(8082,'127.0.0.1',()=>console.log('synthetic model ready'));
