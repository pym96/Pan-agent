import io,tarfile,types,unittest
from evaluator_facade import restricted_client,BoundaryError,archive_members

class FakeContainer:
    def __init__(self,owner,identity,name,kwargs):
        self.id=identity;self.name=name;self.labels=kwargs['labels'];self.owner=owner;self.started=False
        self.attrs={'Image':kwargs['image'],'Mounts':[], 'Config':{'Labels':self.labels,'Env':[]},'HostConfig':{'NanoCpus':kwargs['nano_cpus'],'Memory':kwargs['mem_limit'],'PidsLimit':kwargs['pids_limit'],'NetworkMode':kwargs['network_mode'],'Privileged':False,'CapAdd':kwargs['cap_add'],'CapDrop':kwargs['cap_drop'],'SecurityOpt':kwargs['security_opt']}}
    def reload(self):pass
    def remove(self,force=False):self.owner.effects.append(('remove',self.id));del self.owner.objects[self.id]
    def start(self):self.started=True;self.owner.effects.append(('start',self.id))
    def stop(self,timeout):self.owner.effects.append(('stop',self.id))
    def kill(self):self.owner.effects.append(('kill',self.id))
class FakeDocker:
    def __init__(self):
        self.objects={};self.effects=[];self.images=types.SimpleNamespace(get=lambda ref:types.SimpleNamespace(id='sha256:fixed'));self.containers=self
    def get(self,key):
        import docker
        if key in self.objects:return self.objects[key]
        for c in self.objects.values():
            if c.name==key:return c
        raise docker.errors.NotFound('absent')
    def create(self,**kwargs):
        import docker
        if any(c.name==kwargs['name'] for c in self.objects.values()):raise docker.errors.APIError('409 conflict')
        identity='id'+str(len(self.effects));c=FakeContainer(self,identity,kwargs['name'],kwargs);self.objects[identity]=c;self.effects.append(('create',identity));return c
class FacadeTests(unittest.TestCase):
    def setUp(self):
        self.raw=FakeDocker();self.receipts=[]
        self.f,self.cli,self.cleanup=restricted_client(self.raw,image_id='sha256:fixed',image_refs={'fixed-ref'},run_id='wo71-test',receipt=self.receipts.append)
        self.request={'image':'fixed-ref','name':'sweb.eval.pydicom__pydicom-901.wo71-test','user':'root','detach':True,'command':'tail -f /dev/null','cap_add':['SYS_ADMIN']}
    def test_create_and_retry_suffix_are_restricted(self):
        for suffix in ('','.123'):
            c=self.f.containers.create(**{**self.request,'name':self.request['name']+suffix});c.start()
            h=self.raw.objects[c.id].attrs['HostConfig'];self.assertEqual(h['CapAdd'],[]);self.assertEqual(h['NetworkMode'],'none');self.assertEqual(h['Memory'],4*2**30)
        self.cleanup();self.assertFalse(self.raw.objects)
    def test_foreign_collision_no_deletion(self):
        c=self.f.containers.create(**self.request);self.raw.objects[c.id].labels={'pan.run':'foreign'};before=list(self.raw.effects)
        with self.assertRaises(BoundaryError):self.f.containers.get(self.request['name'])
        with self.assertRaises(BoundaryError):self.cli(['rm','--force',c.id])
        self.assertEqual(before,self.raw.effects)
    def test_unknown_effects_refuse_before_create(self):
        for option in ('privileged','volumes','security_opt','network_mode','environment'):
            with self.assertRaises(BoundaryError):self.f.containers.create(**self.request,**{option:True})
        with self.assertRaises(AttributeError):self.f.api
        with self.assertRaises(BoundaryError):self.f.images.pull('other')
        self.assertFalse(self.raw.effects)
    def test_unsafe_effective_container_never_starts(self):
        c=self.f.containers.create(**self.request);self.raw.objects[c.id].attrs['HostConfig']['Privileged']=True
        with self.assertRaises(BoundaryError):c.start()
        self.assertFalse(self.raw.objects[c.id].started)
        with self.assertRaises(AttributeError):c.attrs
        with self.assertRaises(AttributeError):c.client.containers
        with self.assertRaises(AttributeError):c.client.api._client
        self.cleanup()
    def test_cli_only_owned_exact_commands(self):
        c=self.f.containers.create(**self.request)
        with self.assertRaises(BoundaryError):self.cli(['rm','--force','foreign'])
        with self.assertRaises(BoundaryError):self.cli(['system','prune'])
        self.cli(['stop','--time=15',c.id]);self.cli(['rm','--force',c.id]);self.assertFalse(self.raw.objects)
    def test_archives_reject_escape_and_links(self):
        for name,kind in (('../escape',tarfile.REGTYPE),('/escape',tarfile.REGTYPE),('link',tarfile.SYMTYPE)):
            buf=io.BytesIO()
            with tarfile.open(fileobj=buf,mode='w') as tar:
                member=tarfile.TarInfo(name);member.type=kind;member.linkname='/outside';tar.addfile(member)
            with self.assertRaises(BoundaryError):archive_members(buf.getvalue())
if __name__=='__main__':unittest.main()
