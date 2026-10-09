import pathlib,os,json,subprocess
source=pathlib.Path(__file__).with_name('check111.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check111.py')),'exec'))
try:
 app=start('app');ready();subprocess.run(['node','scripts/browser111-readback.mjs'],cwd=ROOT,env=env,check=True)
finally:
 stop(app)
 for f in logs:f.close()
