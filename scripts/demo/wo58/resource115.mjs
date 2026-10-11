// #115-only read-only resource sample; no production campaign or runtime starts.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {sampleDurable} from '../../harbor/pilot/full-durable.mjs';
import {demo115RequiredRoots,DEMO_BASELINE} from '../../harbor/pilot/full-demo-config-58.mjs';
import {resourceCheck,DEMO115_DISK_POLICY} from '../../harbor/pilot/full-host.mjs';
const hostRoot=join(homedir(),'.local/state/pan-agent/wo58-video-20261009');
const roots=demo115RequiredRoots(homedir());
const sample=sampleDurable(hostRoot,roots);
let failure=null;
try{resourceCheck(hostRoot,{docker:DEMO_BASELINE},sample,DEMO115_DISK_POLICY);}catch(e){failure=e.message;}
console.log(JSON.stringify({scope:'115 Stage A and separately authorized demo',sample,roots,baselineDocker:DEMO_BASELINE,cumulative:sample.owned+Math.max(0,sample.docker-DEMO_BASELINE),policy:DEMO115_DISK_POLICY,passed:failure===null,failure},null,2));
if(failure)process.exitCode=1;
