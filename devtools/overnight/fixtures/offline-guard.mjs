// Verification guard shared by the fixed offline child executables. No credentials are loaded.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
let networkAttempts=0;
const persist=()=>{if(process.argv[2])writeFileSync(join(process.argv[2],`network-guard-${process.pid}.json`),JSON.stringify({simulation:'SIMULATED',pid:process.pid,networkAttempts})+'\n');};
persist();
const blocked=()=>{networkAttempts++;persist();throw new Error('offline_network_forbidden');};
net.connect=blocked;net.createConnection=blocked;net.Socket.prototype.connect=blocked;
tls.connect=blocked;http.request=blocked;http.get=blocked;https.request=blocked;https.get=blocked;globalThis.fetch=blocked;
syncBuiltinESMExports();
process.on('exit',persist);
