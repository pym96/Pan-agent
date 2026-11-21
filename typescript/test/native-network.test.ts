import assert from "node:assert/strict";
import {test} from "node:test";
import {execFile} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {promisify} from "node:util";
import {destination, privateOrigin, publicAddress, NativeNetwork, fetchClient} from "../src/sandbox/native/network.ts";
import {parseCliArgs} from "../src/cli.ts";

test("public classification rejects special-use and attached addresses in both families", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.4", "127.0.0.1", "169.254.0.1",
    "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.11", "224.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:7f00:1", "64:ff9b::7f00:1", "fe80::1", "ff02::1", "fd00::1",
    "2001:db8::1", "2001::1", "2002::1", "3fff::1", "not-an-address"])
    assert.equal(publicAddress(address), false, address);
});

test("each decision resolves again, rejects mixed address sets and pins the numeric result", async () => {
  const url = new URL("https://controlled.example/file");
  const results = [["185.199.108.153"], ["185.199.108.153", "::1"], ["127.0.0.1"]];
  const resolver = async () => results.shift()!;
  assert.equal((await destination(url, undefined, resolver)).ip, "185.199.108.153");
  await assert.rejects(destination(url, undefined, resolver), /denied/);
  await assert.rejects(destination(url, undefined, resolver), /denied/);
  assert.equal(results.length, 0);
});

test("one private grant binds scheme, canonical IP and port; aliases still deny", async () => {
  const grant = privateOrigin("http://[::1]:8123");
  const resolver = async () => ["::1"];
  assert.equal((await destination(new URL(grant+"/ok"),grant,resolver)).ip,"::1");
  for (const other of ["https://[::1]:8123", "http://[::1]:8124", "http://service.example:8123",
    "http://[::ffff:127.0.0.1]:8123", "file:///fixture", "http://user@[::1]:8123"])
    await assert.rejects(destination(new URL(other),grant,resolver));
  for (const invalid of ["http://127.0.0.1:42/path", "https://service.example", "http://169.254.0.1",
    "http://[::ffff:127.0.0.1]", "http://[::]", "ftp://127.0.0.1", "http://127.0.0.1:0"])
    assert.throws(() => privateOrigin(invalid));
  const args = ["--kernel","native","--native-sandbox","--native-grant",grant];
  assert.equal(parseCliArgs(args).nativeGrant,grant);
  assert.throws(()=>parseCliArgs([...args,"--native-offline"]));
  assert.throws(()=>parseCliArgs([...args,"--native-grant",grant]));
  assert.throws(()=>parseCliArgs(["--kernel","native","--native-offline"]));
});

test("pan-fetch help stays local; binary successes, policy denials and upstream errors use distinct channels",async t=>{
  const run=promisify(execFile);
  const help=await run(fetchClient,["--help"],{env:{}});
  assert.match(help.stdout,/pan-fetch URL/);
  const root=await mkdtemp("/tmp/pan-fetch-test-");
  const binary=Buffer.from([0,1,2,255,0,10]);
  let hits=0;
  const service=createServer((req,res)=>{hits++;if(req.url==="/ok")res.end(binary);else res.writeHead(404).end("private error body");});
  service.listen(0,"127.0.0.1");await once(service,"listening");
  t.after(()=>new Promise<void>(ok=>service.close(()=>ok())));
  const origin="http://127.0.0.1:"+(service.address() as {port:number}).port;
  const broker=await NativeNetwork.open(root,origin);
  t.after(async()=>{broker.close();await rm(root,{recursive:true,force:true});});
  const env={PAN_NETWORK_SOCKET:broker.socket};
  const success=await run(fetchClient,[origin+"/ok"],{env,encoding:"buffer"});
  assert.deepEqual(success.stdout,binary);assert.equal(success.stderr.length,0);
  for(const [url,diagnostic] of [[origin+"/missing",/upstream.*HTTP/],["http://127.0.0.1:2/denied",/policy denied/]] as const){
    await assert.rejects(run(fetchClient,[url],{env}),error=>{
      const failure=error as Error & {code:number;stdout:string;stderr:string};
      assert.notEqual(failure.code,0);assert.equal(failure.stdout,"");assert.match(failure.stderr,diagnostic);
      assert.doesNotMatch(failure.stderr,/private error body/);return true;
    });
  }
  assert.equal(hits,2);
});
