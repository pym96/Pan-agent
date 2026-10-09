// Read-only admission check, launched by the authenticated API with server-owned configuration.
import {validateOperation} from './operation.mjs';
let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>8*1024*1024)throw Error('input_limit')}
try{const {checkpoint,job}=JSON.parse(raw);const r=await validateOperation(checkpoint,job);process.stdout.write(JSON.stringify({decision:r.decision}))}catch(e){process.stdout.write(JSON.stringify({decision:'unresolved',reason:/^operation_[a-z_]+$/.test(e.message)?e.message:'operation_validation_failed'}));process.exitCode=1}
