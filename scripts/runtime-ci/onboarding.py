#!/usr/bin/env python3
"""Real global-install/PTY consumer checks; no provider requests or source imports."""
import argparse, fcntl, hashlib, json, os, pty, select, signal, struct, subprocess, sys, tarfile, termios, time, unittest, urllib.request
from pathlib import Path

SYNTHETIC = 'PAN-190-SYNTHETIC'

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
        # Public mode downloads and installs the actual URL. Network denial begins
        # only after installation; it describes product execution, not fetching.
        package=PACKAGE
        if RELEASE_URL:
            package=cls.root/'release.tgz'
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(RELEASE_URL,timeout=30) as response:
                data=response.read(2*1024*1024+1)
            if len(data)>2*1024*1024: raise RuntimeError('release archive exceeds onboarding download bound')
            package.write_bytes(data)
            if hashlib.sha256(data).hexdigest()!=EXPECTED_SHA256: raise RuntimeError('public release SHA256 mismatch')
        command=['npm','install','--global','--prefix',str(cls.prefix),'--ignore-scripts','--no-audit','--no-fund']
        command += [RELEASE_URL] if RELEASE_URL else ['--offline',str(package)]
        begin=time.monotonic()
        r=subprocess.run(command,cwd=cls.project,env=cls.env,capture_output=True,text=True,timeout=45 if RELEASE_URL else 30)
        (cls.root/'install.json').write_text(json.dumps({'command':command,'returncode':r.returncode,'seconds':time.monotonic()-begin,'url':RELEASE_URL,'package_sha256':hashlib.sha256(package.read_bytes()).hexdigest()},indent=2)+'\n')
        (cls.root/'install.stdout').write_text(r.stdout);(cls.root/'install.stderr').write_text(r.stderr)
        if r.returncode: raise RuntimeError(r.stderr)
        installed=cls.prefix/'lib/node_modules/pan-agent'
        identities={}
        with tarfile.open(package,'r:gz') as archive:
            for member in archive.getmembers():
                if member.isdir(): continue
                relative=Path(member.name).relative_to('package')
                if not member.isfile() or '..' in relative.parts: raise RuntimeError('unsafe package member')
                target=installed/relative
                expected=hashlib.sha256(archive.extractfile(member).read()).hexdigest()
                if target.is_symlink() or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=expected:
                    raise RuntimeError('installed byte mismatch: '+str(relative))
                identities[str(relative)]=expected
        if {str(p.relative_to(installed)) for p in installed.rglob('*') if p.is_file()}!=set(identities):
            raise RuntimeError('installed file set differs from archive')
        if cls.cli.resolve()!=(installed/'bin/pan-agent.mjs').resolve(): raise RuntimeError('CLI is not installed package bin')
        (cls.root/'installed-files.json').write_text(json.dumps(identities,indent=2)+'\n')
        cls.guard=cls.root/'network-guard.mjs'
        cls.guard.write_text("import {appendFileSync} from 'node:fs'; globalThis.fetch = (...args) => {appendFileSync(process.env.PAN_NETWORK_LOG, 'unexpected fetch\\n'); throw new Error('Provider request forbidden in onboarding test');};\n")
        # NODE_OPTIONS is tokenized by Node, not the shell. A file URL keeps
        # whitespace, quotes, # and % inside the module specifier as path data.
        cls.env.update(NODE_OPTIONS='--import='+cls.guard.as_uri(),PAN_NETWORK_LOG=str(cls.root/'network.log'))
        probe_log=cls.root/'guard-probe.log'
        probe=subprocess.run(['node','--input-type=module','-e',
            "try { await fetch('data:text/plain,guard-probe'); process.exit(2); } catch (error) { if (error.message !== 'Provider request forbidden in onboarding test') process.exit(3); }"],
            env={**cls.env,'PAN_NETWORK_LOG':str(probe_log)},capture_output=True,text=True,timeout=8)
        (cls.root/'guard-probe.stdout').write_text(probe.stdout);(cls.root/'guard-probe.stderr').write_text(probe.stderr)
        (cls.root/'guard-probe.json').write_text(json.dumps({'returncode':probe.returncode,'node_options':cls.env['NODE_OPTIONS'],'uri':'data:text/plain,guard-probe'},indent=2)+'\n')
        if probe.returncode or not probe_log.exists() or probe_log.read_text()!='unexpected fetch\n':
            raise RuntimeError('onboarding fetch guard was not loaded; see guard-probe artifacts')
    def command(self,name,args,cwd=None):
        r=subprocess.run([str(self.cli),*args],cwd=cwd or self.project,env=self.env,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=8)
        (self.root/(name+'.stdout')).write_text(r.stdout);(self.root/(name+'.stderr')).write_text(r.stderr)
        return r
    def terminal(self,name,args=(),cwd=None,answers=(),task=None, env=None, expected_code=0, task_done="Missing DEEPSEEK_API_KEY", check_silent=False):
        # These checks compare complete configured paths in the rendered output.
        # Allow two cells per character plus labels/borders so an external output
        # root cannot split the path across cursor-controlled redraw rows.
        paths=[str(cwd or self.project),str(self.home/'.pan-agent/archives'),*map(str,args)]
        columns=max(160,2*max(map(len,paths))+32)
        master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,columns,0,0))
        proc=subprocess.Popen([str(self.cli),*args],cwd=cwd or self.project,env=env or self.env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True);os.close(slave)
        raw=b'';prompt_offset=0;remaining=list(answers);sent=False;task_sent=False;deadline=time.monotonic()+8
        try:
            while proc.poll() is None and time.monotonic()<deadline:
                if select.select([master],[],[],.05)[0]:
                    try: raw+=os.read(master,65536)
                    except OSError: break
                text=raw.decode(errors='replace')
                if remaining and remaining[0][0] in text[prompt_offset:]:
                    prompt_offset=len(text)
                    _,answer=remaining.pop(0)
                    if check_silent and '\n' not in answer and '\r' not in answer:
                        os.write(master,answer.encode())
                        self.assertFalse(select.select([master],[],[],.08)[0],
                                         'TTY produced output before Enter')
                        os.write(master,b'\n')
                    else:
                        os.write(master,(answer+'\n').encode())
                elif not remaining and 'Write a task.' in text and not sent:
                    if task is not None and not task_sent:
                        os.write(master,(task+'\r').encode());task_sent=True
                    elif task is None or (task_done in text and text.rfind('· idle ·') > text.rfind('· running ·')):
                        os.write(master,b':exit\r');sent=True
            proc.wait(timeout=1)
            # Capture remaining PTY bytes even if the child exited between polls.
            while select.select([master],[],[],0)[0]:
                try: tail=os.read(master,65536)
                except OSError: break
                if not tail: break
                raw+=tail
            text=raw.decode(errors='replace')
            self.assertEqual(proc.returncode,expected_code,text.replace(SYNTHETIC,"[redacted]"))
            if expected_code == 0: self.assertTrue(sent,text.replace(SYNTHETIC,"[redacted]"))
            self.assertFalse(bool(remaining),"not all scripted prompts were consumed")
            return text
        finally:
            if proc.poll() is None: os.killpg(proc.pid,signal.SIGKILL);proc.wait()
            os.close(master);(self.root/(name+'.pty')).write_bytes(raw.replace(SYNTHETIC.encode(),b'[redacted]'))
    def test_01_help_and_nontty(self):
        r=self.command('help',['--help']);self.assertEqual(r.returncode,0);self.assertIn('current directory',r.stdout)
        if PACKAGE:
            self.assertIn('pan-agent configure   (first-run',r.stdout)
            self.assertNotIn('npm run agent',r.stdout)
        r=self.command('nontty',[]);self.assertEqual(r.returncode,2);self.assertIn('requires a terminal',r.stdout)
        self.assertFalse((self.home/'.pan-agent').exists())
        r=self.command('configure-closed',['configure']);self.assertEqual(r.returncode,2);self.assertIn('input closed',r.stdout)
    def test_02_first_run_and_reuse(self):
        text=self.terminal('first',answers=[('Provider [','deepseek'),('Model [',''),('Thinking [',''),('Credential source:','e')])
        self.assertIn(str(self.project),text)
        if PACKAGE: self.assertIn('Native GET',text)
        self.assertIn(str(self.home/'.pan-agent/archives'),text)
        settings=self.home/'.pan-agent/settings.json';before=settings.read_bytes()
        self.assertEqual(set(json.loads(before)),{'schemaVersion','provider','modelId','thinkingLevel','credentialSource'})
        self.assertEqual(settings.stat().st_mode & 0o777,0o600)
        text=self.terminal('repeat', answers=[('Credential source:', 'e')] if PACKAGE else ());self.assertNotIn('Pan first-run configuration',text)
        self.assertEqual(settings.read_bytes(),before)
        self.assertTrue((self.home/'.pan-agent/archives/runs').is_dir())
        self.assertEqual(list(self.project.iterdir()),[])
    def test_03_explicit_override(self):
        work=self.root/'explicit-work';work.mkdir();archive=self.root/'explicit-archive'
        text=self.terminal('explicit',['--workspace',str(work),'--memory-root',str(archive)])
        self.assertIn(str(work),text);self.assertIn(str(archive),text)
        self.assertTrue((archive/'runs').is_dir())
    def test_04_special_paths(self):
        # Exceed the former 160-column premise even with a short output root.
        work=self.root/('path-segment-'*14+'中文 space %# literal%20');work.mkdir()
        archive=self.root/('path-segment-'*14+'archive 中文 %#')
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
        text=self.terminal('missing-key',args=[] if RELEASE_URL else ['--trusted-local'],task='Say hello')
        self.assertIn('Missing DEEPSEEK_API_KEY',text)
        self.assertEqual(list(self.project.iterdir()),[])
    def test_07_no_provider_requests(self):
        self.assertFalse((self.root/'network.log').exists())
        self.assertEqual(len(list((self.home/'.pan-agent/archives/runs').iterdir())),1)

    def test_08_home_workspace_and_recovery(self):
        if not PACKAGE: self.skipTest('candidate-only startup behavior')
        alias=self.root/'home-alias';alias.symlink_to(self.home,target_is_directory=True)
        env={**self.env,'HOME':str(alias)}
        workspace=self.home/'pan-workspace'
        outside=self.root/'outside';outside.mkdir()
        workspace.symlink_to(outside,target_is_directory=True)
        try:
            text=self.terminal('home-symlink',cwd=alias,env=env,expected_code=2)
            self.assertIn('ordinary workspace',text)
            self.assertEqual(list(outside.iterdir()),[])
        finally:
            workspace.unlink()
        for launch in range(2):
            text=self.terminal('home-'+str(launch),cwd=alias,env=env,answers=[('Credential source:', 'e')])
            self.assertIn('Home launch workspace: '+str(workspace),text)
            self.assertIn('missing in this terminal',text)
            self.assertTrue(workspace.is_dir())
        settings=self.home/'.pan-agent/settings.json';before=settings.read_bytes()
        text=self.terminal('home-cancel',cwd=self.home,answers=[('Credential source:', 'q')],expected_code=2)
        self.assertIn('configuration_cancelled',text)
        self.assertEqual(settings.read_bytes(),before)
        text=self.terminal('working-env',env={**self.env,'DEEPSEEK_API_KEY':SYNTHETIC})
        self.assertNotIn('Credential source:',text)
        self.assertFalse(SYNTHETIC in text,'synthetic credential appeared in PTY')
        r=self.command('overlap-via-alias',['--workspace',str(self.home),'--memory-root',str(alias/'absent'/'archive')])
        self.assertEqual(r.returncode,2);self.assertIn('disjoint',r.stdout)
        self.assertFalse((self.home/'absent').exists())

    def credential_env(self,name):
        # Intercept the exact OS boundary before the installed bin imports child_process.
        # Only item names/operations are logged. Synthetic contents never go to /usr/bin/security.
        guard=self.root/(name+'-double.mjs')
        guard.write_text("""import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync,existsSync,readFileSync} from 'node:fs';
const original = cp.spawnSync, token = 'PAN-190-SYNTHETIC';
const log = process.env.PAN_ITEM_LOG;
cp.spawnSync = (cmd, args, opts) => {
    if (cmd !== 'security') return original(cmd,args,opts);
    if (args.includes(token)) throw Error('unexpected secret in argv');
    const account = 'deepseek-api-key', service = 'com.pym96.pan-agent';
    if (args.join(' ') === '-i' && opts.input.trim() === `add-generic-password -s ${service} -a ${account} -w ${token} -U`) {
        appendFileSync(log,'save '+account+'\\n'); return {status:0,stdout:'',stderr:''};
    }
    if (args.join(' ') === `find-generic-password -s ${service} -a ${account} -w` && existsSync(log) && readFileSync(log,'utf8').includes('save '+account)) {
        appendFileSync(log,'read '+account+'\\n'); return {status:0,stdout:token,stderr:''};
    }
    throw Error('unexpected credential operation');
};
syncBuiltinESMExports();
if (process.env.PAN_OFFLINE_PROVIDER === '1') globalThis.fetch = async (url, req) => {
    if (new URL(url).hostname !== 'api.deepseek.com' || req.headers.authorization !== 'Bearer '+token) throw Error('unexpected provider request');
    appendFileSync(log,'offline-provider\\n');
    return new Response('synthetic rejection',{status:401});
};
""")
        log=self.root/name
        env={**self.env, 'NODE_OPTIONS':self.env['NODE_OPTIONS']+' --import='+guard.as_uri(),'PAN_ITEM_LOG':str(log)}
        return env,log

    def test_09_durable_account(self):
        if not PACKAGE: self.skipTest('candidate-only onboarding behavior')
        if sys.platform != 'darwin':
            text=self.terminal('linux-sources',answers=[('Credential source:', 'e')])
            self.assertNotIn('(k)eychain',text)
            return
        env,log=self.credential_env('item-operations')
        home=self.root/'fresh-mac';home.mkdir();env['HOME']=str(home)
        text=self.terminal('mac-first',cwd=home,env=env,answers=[
            ('Provider [',''),('Model [',''),('Thinking [',''),('(q)uit [k]:',''),
            ('input hidden;',SYNTHETIC),('Save this key','y')])
        self.assertFalse(SYNTHETIC in text,'synthetic credential appeared in PTY')
        self.assertEqual(log.read_text().splitlines(),['save deepseek-api-key'])
        settings=home/'.pan-agent/settings.json';before=settings.read_bytes()
        self.assertEqual(json.loads(before)['credentialSource'],'keychain')
        for launch in range(2):
            project=self.root/('account-project-'+str(launch));project.mkdir()
            text=self.terminal('mac-reuse-'+str(launch),cwd=project,env=env)
            self.assertNotIn('Credential source:',text);self.assertIn('CREDENTIAL keychain',text)
            self.assertIn(str(project),text)
            tested=self.terminal('mac-offline-provider-'+str(launch),args=['--trusted-local'],cwd=project,
                env={**env,'PAN_OFFLINE_PROVIDER':'1'},task='Say hello',task_done='· running ·')
            self.assertFalse(SYNTHETIC in tested,'synthetic credential appeared in PTY')
            self.assertEqual(list(project.iterdir()),[])
        self.assertEqual(log.read_text().splitlines(),['save deepseek-api-key']+['read deepseek-api-key','offline-provider']*2)
        self.assertEqual(settings.read_bytes(),before)
        # Recover in-place from an existing env selection, retaining optional preferences.
        record={**json.loads(before),'credentialSource':'environment','maxAttachmentBytes':512}
        settings.write_text(json.dumps(record))
        text=self.terminal('mac-recover',cwd=project,env=env,answers=[
            ('(q)uit [k]:',''),('input hidden;',SYNTHETIC),('Save this key','y')])
        self.assertNotIn('Provider [',text);self.assertFalse(SYNTHETIC in text,'synthetic credential appeared in PTY')
        self.assertEqual(json.loads(settings.read_bytes()),{**record,'credentialSource':'keychain'})
        self.assertEqual(log.read_text().splitlines()[-1],'save deepseek-api-key')
        for file in home.rglob('*'):
            if file.is_file(): self.assertFalse(SYNTHETIC.encode() in file.read_bytes(),str(file))
        self.assertFalse((self.root/'network.log').exists())

    def test_10_wizard_input_privacy(self):
        if not PACKAGE: self.skipTest('candidate-only hidden setup answers')
        home=self.root/'private-setup';home.mkdir()
        env,log=self.credential_env('privacy-item-operations')
        env['HOME']=str(home)
        tokens={field:'fixture-192-'+field for field in ('provider','model','thinking','source','confirm','secret')}
        source='(q)uit ['+('k' if sys.platform=='darwin' else 'e')+']: '
        fields=[('Provider [','deepseek',tokens['provider']),('Model [','',tokens['model']),
                ('Thinking [','',tokens['thinking'])]
        answers=[]
        for prompt,valid,misplaced in fields:
            answers.extend([(prompt,misplaced),(prompt,valid)])
        answers.extend([(source,tokens['source']),
                        (source,'\x1b[200~k\n'+tokens['secret']+'\ny\x1b[201~'),
                        (source,'k\n'+tokens['secret']+'\ny')])
        if sys.platform=='darwin':
            answers.extend([(source,'k'),('input hidden;',tokens['secret']),
                            ('? [y/N]: ',tokens['confirm'])])
        answers.append((source,'e'))
        text=self.terminal('private-setup',cwd=home,env=env,answers=answers,check_silent=True)
        for diagnostic in ('Unknown provider.', 'Unknown model.', 'Unknown thinking level.',
                           'Choose one of the displayed credential sources'):
            self.assertIn(diagnostic,text)
        self.assertEqual(text.count('Enter one answer at a time.'),2)
        self.assertFalse(log.exists(),'wrong-field paste caused a credential operation')
        settings=json.loads((home/'.pan-agent/settings.json').read_bytes())
        self.assertEqual(settings['credentialSource'],'environment')
        for token in tokens.values():
            self.assertFalse(token in text, 'synthetic input appeared in terminal output')
            for file in home.rglob('*'):
                if file.is_file(): self.assertFalse(token.encode() in file.read_bytes(),str(file))

    def test_11_interrupts(self):
        if not PACKAGE: self.skipTest('candidate-only interrupt behavior')
        from interrupts import check_interrupts
        env, credential_log = self.credential_env('interrupt-credential-operations')
        check_interrupts(self.cli, self.root/'interrupts', env, credential_log)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--package',type=Path)
    source.add_argument('--release-url',help='Public HTTPS npm tarball URL; installs from this URL into a fresh prefix')
    parser.add_argument('--sha256',help='Required expected public release archive SHA256')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.release_url and (not args.release_url.startswith('https://') or not args.sha256 or len(args.sha256)!=64):
        parser.error('--release-url requires HTTPS and --sha256')
    PACKAGE=args.package.resolve() if args.package else None
    RELEASE_URL=args.release_url;EXPECTED_SHA256=args.sha256;OUTPUT=args.output.resolve()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(InstalledOnboarding))
    (OUTPUT/'result.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)},indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
