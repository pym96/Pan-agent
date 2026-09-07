/** Offline execution sentinels. Exit report includes caught attempts. No secret value is read or logged. */
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import cp from 'node:child_process';
const originalWrite = fs.writeFileSync;
const meters = { forbidden_resolution: 0, reference_filesystem: 0, real_transport_attempts: 0, real_credential_reads: 0, balance_queries: 0, paid_formal_runs: 0, cost_cny: 0, child_process_starts: 0 };
const loads = new Set();
const referenceAllowed = process.env.WO34_REFERENCE === '1';
const report = process.env.WO34_GUARD_REPORT;
function forbidden(value) { return !referenceAllowed && /@earendil-works\/pi-|[/\\]references[/\\]pi(?:[/\\]|$)/.test(String(value)); }
function refuse(key) { meters[key]++; throw new Error(`WO34 forbidden ${key}`); }
registerHooks({ resolve(specifier, context, next) {
 if (forbidden(specifier)) refuse('forbidden_resolution');
 const resolved = next(specifier, context);
 if (forbidden(resolved.url)) refuse('forbidden_resolution');
 loads.add(resolved.url); return resolved;
}});
for (const object of [fs, fsp]) for (const name of ['readFile','readFileSync','open','openSync','access','accessSync','stat','statSync','lstat','lstatSync','readdir','readdirSync','realpath','realpathSync','createReadStream']) {
 if (typeof object[name] !== 'function') continue;
 const original = object[name]; object[name] = function(path, ...args) { if (forbidden(path)) refuse('reference_filesystem'); return original.call(this, path, ...args); };
}
for (const [object, names] of [[net,['connect','createConnection']],[tls,['connect']],[http,['request','get']],[https,['request','get']]]) {
 for (const name of names) object[name] = () => refuse('real_transport_attempts');
}
globalThis.fetch = async () => refuse('real_transport_attempts');
const originalSpawn = cp.spawn;
cp.spawn = function(command, args, options) {
 if (/^(?:curl|wget|npm|npx|ssh)$/.test(String(command)) || (typeof args?.join === 'function' && /\b(?:curl|wget|npx|ssh)\b/.test(args.join(' ')))) refuse('real_transport_attempts');
 meters.child_process_starts++; return originalSpawn.call(this, command, args, options);
};
const environment = process.env;
const synthetic = new Set();
const credentialKey = (key) => typeof key === 'string' && /(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|NPM_TOKEN|PASSWORD|SECRET)/i.test(key);
process.env = new Proxy(environment, {
 get(target, key) { if (credentialKey(key) && !synthetic.has(key)) refuse('real_credential_reads'); return Reflect.get(target,key); },
 set(target,key,value) { if (credentialKey(key)) synthetic.add(key); return Reflect.set(target,key,value); },
 deleteProperty(target,key) { synthetic.delete(key); return Reflect.deleteProperty(target,key); },
});
syncBuiltinESMExports();
process.on('exit', () => {
 const forbiddenCount = meters.forbidden_resolution + meters.reference_filesystem + meters.real_transport_attempts + meters.real_credential_reads;
 if (forbiddenCount) process.exitCode = 1;
 const data = { pid:process.pid, reference_allowed:referenceAllowed, ...meters, loaded_modules:[...loads].sort() };
 if (report) originalWrite(`${report}.${process.pid}.json`, JSON.stringify(data,null,2)+'\n');
 console.log('WO34 offline meters', JSON.stringify(meters));
});
