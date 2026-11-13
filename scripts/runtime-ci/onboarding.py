#!/usr/bin/env python3
"""Real global-install/PTY consumer checks; no provider requests or source imports."""
import argparse, fcntl, json, os, pty, select, signal, struct, subprocess, termios, time, unittest
from pathlib import Path

class InstalledOnboarding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root=OUTPUT
        cls.root.mkdir(parents=True,exist_ok=False)
        cls.home=cls.root/'home';cls.home.mkdir()
        cls.project=cls.root/'project';cls.project.mkdir()
        cls.prefix=cls.root/'prefix'
        # No inherited provider keys, NODE_OPTIONS or npm configuration.
        cls.env={'PATH':os.environ['PATH'],'HOME':str(cls.home),'TERM':'xterm-256color','LANG':'en_US.UTF-8','npm_config_cache':str(cls.root/'cache')}
        cls.cli=cls.prefix/'bin/pan-agent'
        r=subprocess.run(['npm','install','--global','--prefix',str(cls.prefix),'--ignore-scripts','--offline','--no-audit','--no-fund',str(PACKAGE)],cwd=cls.project,env=cls.env,capture_output=True,text=True,timeout=30)
        (cls.root/'install.stdout').write_text(r.stdout);(cls.root/'install.stderr').write_text(r.stderr)
        if r.returncode: raise RuntimeError(r.stderr)
        cls.guard=cls.root/'network-guard.mjs'
        cls.guard.write_text("import {appendFileSync} from 'node:fs'; globalThis.fetch = (...args) => {appendFileSync(process.env.PAN_NETWORK_LOG, 'unexpected fetch\\n'); throw new Error('Provider request forbidden in onboarding test');};\n")
        cls.env.update(NODE_OPTIONS='--import='+str(cls.guard),PAN_NETWORK_LOG=str(cls.root/'network.log'))
    def command(self,name,args,cwd=None):
        r=subprocess.run([str(self.cli),*args],cwd=cwd or self.project,env=self.env,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=8)
        (self.root/(name+'.stdout')).write_text(r.stdout);(self.root/(name+'.stderr')).write_text(r.stderr)
        return r
    def terminal(self,name,args=(),cwd=None,answers=(),task=None):
        master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,160,0,0))
        proc=subprocess.Popen([str(self.cli),*args],cwd=cwd or self.project,env=self.env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True);os.close(slave)
        raw=b'';remaining=list(answers);sent=False;task_sent=False;deadline=time.monotonic()+8
        try:
            while proc.poll() is None and time.monotonic()<deadline:
                if select.select([master],[],[],.05)[0]:
                    try: raw+=os.read(master,65536)
                    except OSError: break
                text=raw.decode(errors='replace')
                if remaining and remaining[0][0] in text:
                    _,answer=remaining.pop(0);os.write(master,(answer+'\n').encode())
                elif not remaining and 'Write a task.' in text and not sent:
                    if task is not None and not task_sent:
                        os.write(master,(task+'\r').encode());task_sent=True
                    elif task is None or ('Missing DEEPSEEK_API_KEY' in text and text.rfind('· idle ·') > text.rfind('· running ·')):
                        os.write(master,b':exit\r');sent=True
            proc.wait(timeout=1)
            self.assertEqual(proc.returncode,0,text)
            self.assertTrue(sent,text)
            self.assertFalse(remaining,text)
            return text
        finally:
            if proc.poll() is None: os.killpg(proc.pid,signal.SIGKILL);proc.wait()
            os.close(master);(self.root/(name+'.pty')).write_bytes(raw)
    def test_01_help_and_nontty(self):
        r=self.command('help',['--help']);self.assertEqual(r.returncode,0);self.assertIn('current directory',r.stdout)
        r=self.command('nontty',[]);self.assertEqual(r.returncode,2);self.assertIn('requires a terminal',r.stdout)
        self.assertFalse((self.home/'.pan-agent').exists())
        r=self.command('configure-closed',['configure']);self.assertEqual(r.returncode,2);self.assertIn('input closed',r.stdout)
    def test_02_first_run_and_reuse(self):
        text=self.terminal('first',answers=[('Provider [','deepseek'),('Model [',''),('Thinking [',''),('Credential source:','e')])
        self.assertIn(str(self.project),text)
        self.assertIn(str(self.home/'.pan-agent/archives'),text)
        settings=self.home/'.pan-agent/settings.json';before=settings.read_bytes()
        self.assertEqual(set(json.loads(before)),{'schemaVersion','provider','modelId','thinkingLevel','credentialSource'})
        self.assertEqual(settings.stat().st_mode & 0o777,0o600)
        text=self.terminal('repeat');self.assertNotIn('Pan first-run configuration',text)
        self.assertEqual(settings.read_bytes(),before)
        self.assertTrue((self.home/'.pan-agent/archives/runs').is_dir())
        self.assertEqual(list(self.project.iterdir()),[])
    def test_03_explicit_override(self):
        work=self.root/'explicit-work';work.mkdir();archive=self.root/'explicit-archive'
        text=self.terminal('explicit',['--workspace',str(work),'--memory-root',str(archive)])
        self.assertIn(str(work),text);self.assertIn(str(archive),text)
        self.assertTrue((archive/'runs').is_dir())
    def test_04_special_paths(self):
        work=self.root/'中文 space %# literal%20';work.mkdir();archive=self.root/'archive 中文 %#'
        text=self.terminal('special',['--memory-root',str(archive)],cwd=work)
        self.assertIn(str(work),text);self.assertIn(str(archive),text)
    def test_05_invalid_paths(self):
        for name,work,archive,expected in [('missing',self.root/'absent',self.root/'other','existing directory'),('overlap',self.project,self.project/'archive','disjoint'),('default-overlap',self.home,self.home/'.pan-agent/archives','disjoint')]:
            r=self.command(name,['--workspace',str(work),'--memory-root',str(archive)])
            self.assertEqual(r.returncode,2);self.assertIn(expected,r.stdout)
        invalid=self.root/'file';invalid.write_text('not a directory')
        r=self.command('file-archive',['--workspace',str(self.project),'--memory-root',str(invalid)])
        self.assertEqual(r.returncode,2);self.assertIn('Validation failed',r.stdout)
        denied=self.root/'read-only';denied.mkdir();denied.chmod(0o500)
        try:
            r=self.command('denied-archive',['--workspace',str(self.project),'--memory-root',str(denied/'archive')])
            self.assertEqual(r.returncode,2);self.assertIn('Validation failed',r.stdout)
        finally: denied.chmod(0o700)
        existing=self.root/'existing-read-only';(existing/'runs').mkdir(parents=True);(existing/'runs').chmod(0o500)
        try:
            r=self.command('existing-denied',['--workspace',str(self.project),'--memory-root',str(existing)])
            self.assertEqual(r.returncode,2);self.assertIn('Validation failed',r.stdout)
        finally: (existing/'runs').chmod(0o700)
    def test_06_missing_credentials(self):
        text=self.terminal('missing-key',task='Say hello')
        self.assertIn('Missing DEEPSEEK_API_KEY',text)
        self.assertEqual(list(self.project.iterdir()),[])
    def test_07_no_provider_requests(self):
        self.assertFalse((self.root/'network.log').exists())
        self.assertEqual(len(list((self.home/'.pan-agent/archives/runs').iterdir())),1)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--package',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();PACKAGE=args.package.resolve();OUTPUT=args.output.resolve()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(InstalledOnboarding))
    (OUTPUT/'result.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)},indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
