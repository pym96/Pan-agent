// Test instrumentation only. No response injection or product behavior overrides.
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const deny = () => {
  appendFileSync(process.env.PAN_WALKTHROUGH_NETWORK_LOG, JSON.stringify({pid:process.pid,blocked:true})+'\n');
  throw Error('offline_walkthrough_network_forbidden');
};
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
