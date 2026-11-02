"""Seed the specific claim-is-success defect; restore source byte-for-byte even on failure."""
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[2]
source=root/'typescript/src/execution/controller.ts'
original=source.read_bytes()
needle=b"if(plan.mode==='goal'){\n     await this.record"
mutated=original.replace(needle,b"if(plan.mode==='goal'){\n     this.requestStop('succeeded');break;\n     await this.record",1)
assert mutated!=original
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
try:
    source.write_bytes(mutated)
    result=subprocess.run([sys.executable,str(root/'tests/execution150/watchdog.py'),'node','--experimental-strip-types','--test','--test-concurrency=1',str(root/'typescript/test/execution150.test.ts')],capture_output=True,text=True)
    (out/'red.log').write_text(result.stdout+result.stderr)
    assert result.returncode!=0, 'seeded false completion was not detected'
finally:
    source.write_bytes(original)
result=subprocess.run([sys.executable,str(root/'tests/execution150/watchdog.py'),'node','--experimental-strip-types','--test','--test-concurrency=1',str(root/'typescript/test/execution150.test.ts')],capture_output=True,text=True)
(out/'green.log').write_text(result.stdout+result.stderr)
assert result.returncode==0
(out/'receipt.json').write_text(json.dumps({'original_sha256':hashlib.sha256(original).hexdigest(),'seeded_sha256':hashlib.sha256(mutated).hexdigest(),'restored_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'red_nonzero':True,'green_exit':result.returncode},indent=2))
