import {sampleDurable} from '../../../scripts/harbor/pilot/full-durable.mjs';
import {resourceCheck} from '../../../scripts/harbor/pilot/full-host.mjs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {appendFileSync} from 'node:fs';
export function resourceGate(root){
 const home=homedir(),roots=[join(home,'.local/state/pan-agent'),'/opt/homebrew/Cellar/python@3.12/3.12.9',join(home,'Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules'),'/Volumes/WD_BLACK/pan-agent/wo58-video-20261009',join(home,'Library/Caches/go-build'),join(home,'go/pkg/mod'),'/opt/homebrew/opt/postgresql@14'];
 const s=sampleDurable(root,roots);appendFileSync(join(root,'resources.jsonl'),JSON.stringify({utc:new Date().toISOString(),...s,baselineDocker:48503971840,increment:s.owned+Math.max(0,s.docker-48503971840)})+'\n');resourceCheck(root,{docker:48503971840},s);return s;
}
