"""Restricted deployment seam for pinned SWE-bench; never changes scoring.

Docker objects stay in controller closures. Exposed objects have an explicit method
surface, not forwarding __getattr__. This is an API boundary, not a Python sandbox.
"""
import io
import json
import pathlib
import tarfile
import threading
import types

class BoundaryError(RuntimeError):
    pass

def archive_members(data):
    if len(data) > 16 * 2**20:
        raise BoundaryError('archive too large')
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        total = 0
        for entry in archive:
            path = pathlib.PurePosixPath(entry.name)
            if path.is_absolute() or '..' in path.parts or not entry.isfile():
                raise BoundaryError('unsafe archive member')
            total += entry.size
            if total > 16 * 2**20:
                raise BoundaryError('expanded archive too large')

def restricted_client(raw, *, image_id, image_refs, run_id, receipt):
    """Return client facade, owned-only CLI dispatcher, controller cleanup.

    The caller must pass a client bound to the explicit local Docker endpoint.
    Upstream cleanup uses a subprocess; its dedicated PATH shim must dispatch back
    here instead of executing Docker. No socket or facade enters a task container.
    """
    import docker
    inventory = {}
    execs = {}
    lock = threading.RLock()
    labels = {'pan.workorder': '71', 'pan.run': run_id}
    raw.images.get(image_id)  # verified local image only; never pull/build

    def record(kind, **fields):
        receipt({'kind': kind, **fields})

    def owned(identity):
        if identity not in inventory:
            raise BoundaryError('unrecorded container')
        obj = raw.containers.get(identity)
        obj.reload()
        if obj.id != identity or any(obj.labels.get(k) != v for k, v in labels.items()):
            raise BoundaryError('container ownership mismatch')
        return obj

    def validate(obj):
        obj.reload()
        h = obj.attrs['HostConfig']
        c = obj.attrs['Config']
        expected = {'NanoCpus': 2_000_000_000, 'Memory': 4*2**30,
                    'PidsLimit': 512, 'NetworkMode': 'none', 'Privileged': False}
        for key, value in expected.items():
            if h.get(key) != value:
                raise BoundaryError('effective configuration mismatch: '+key)
        if h.get('CapAdd') or h.get('CapDrop') != ['ALL']:
            raise BoundaryError('effective capabilities mismatch')
        if set(h.get('SecurityOpt') or []) != {'no-new-privileges'}:
            raise BoundaryError('effective security options mismatch')
        if h.get('Binds') or obj.attrs.get('Mounts') or h.get('PortBindings'):
            raise BoundaryError('unexpected mounts or ports')
        if obj.attrs['Image'] != image_id:
            raise BoundaryError('image identity mismatch')
        if c.get('Labels', {}).get('pan.run') != run_id:
            raise BoundaryError('effective ownership mismatch')
        record('effective-config', container=obj.id, host_config=h,
               image=obj.attrs['Image'], environment=c.get('Env'), mounts=obj.attrs.get('Mounts'))

    def remove(identity):
        with lock:
            obj = owned(identity)
            obj.remove(force=True)
            inventory.pop(identity)
            record('remove', container=identity)

    class API:
        __slots__ = ()
        def exec_create(self, identity, cmd):
            obj = owned(identity)
            result = raw.api.exec_create(obj.id, cmd, privileged=False,
                                         environment={'PATH':'/opt/miniconda3/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'})
            execs[result['Id']] = identity
            return {'Id': result['Id']}
        def exec_start(self, identity, stream=False):
            if identity not in execs or stream is not True:
                raise BoundaryError('unknown exec or options')
            owned(execs[identity])
            return raw.api.exec_start(identity, stream=True)
        def exec_inspect(self, identity):
            if identity not in execs:
                raise BoundaryError('unknown exec')
            owned(execs[identity])
            result = raw.api.exec_inspect(identity)
            return {k:result[k] for k in ('Pid','Running','ExitCode')}

    api = API()
    class Container:
        __slots__ = ('__identity',)
        def __init__(self, identity): self.__identity = identity
        @property
        def id(self): return self.__identity
        @property
        def name(self): return owned(self.id).name
        @property
        def client(self): return types.SimpleNamespace(api=api)
        def start(self):
            obj = owned(self.id);validate(obj);obj.start();validate(obj)
        def remove(self, *, force=False):
            if force is not True: raise BoundaryError('unsupported removal')
            remove(self.id)
        def exec_run(self, cmd, **kwargs):
            if set(kwargs)-{'workdir','user','detach'}:
                raise BoundaryError('unsupported exec options')
            if kwargs.get('user', 'root') not in ('root', '0'):
                raise BoundaryError('unsupported user')
            if kwargs.get('workdir', '/testbed') != '/testbed':
                raise BoundaryError('unsupported workdir')
            if not isinstance(cmd,(str,list)):
                raise BoundaryError('unsupported command')
            return owned(self.id).exec_run(cmd, privileged=False, **kwargs)
        def put_archive(self, path, data):
            # Pinned official scorer stages only these root files. No extraction
            # of arbitrary task exports through this evaluator-only entry.
            if path not in ('/', '/tmp'): raise BoundaryError('unsupported archive destination')
            archive_members(data)
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                if any(x.name != ('patch.diff' if path == '/tmp' else 'eval.sh') for x in archive):
                    raise BoundaryError('unsupported evaluator file')
            return owned(self.id).put_archive(path, data)

    class Images:
        __slots__ = ()
        def get(self, ref):
            if ref not in image_refs and ref != image_id:
                raise BoundaryError('unexpected image')
            obj = raw.images.get(image_id)
            if obj.id != image_id: raise BoundaryError('image changed')
            return types.SimpleNamespace(id=image_id)
        def pull(self, *args, **kwargs):
            raise BoundaryError('implicit acquisition prohibited')

    class Containers:
        __slots__ = ()
        def get(self, name):
            obj = raw.containers.get(name)
            # Foreign collision is never returned as a removable raw object.
            owned(obj.id)
            return Container(obj.id)
        def create(self, **kwargs):
            with lock:
                allowed={'image','name','user','detach','command','cap_add'}
                if set(kwargs) != allowed:
                    raise BoundaryError('unexpected create options')
                if kwargs['image'] not in image_refs or kwargs['cap_add'] != ['SYS_ADMIN']:
                    raise BoundaryError('unexpected upstream image/capabilities')
                if kwargs['user'] != 'root' or kwargs['detach'] is not True or kwargs['command'] != 'tail -f /dev/null':
                    raise BoundaryError('unexpected upstream startup')
                prefix='sweb.eval.pydicom__pydicom-901.'+run_id
                name=kwargs['name']
                if name != prefix and not (name.startswith(prefix+'.') and name[len(prefix)+1:].isdigit()):
                    raise BoundaryError('unexpected name')
                effective={**kwargs,'image':image_id,'cap_add':[], 'cap_drop':['ALL'],
                           'nano_cpus':2_000_000_000,'mem_limit':4*2**30,'pids_limit':512,
                           'network_mode':'none','security_opt':['no-new-privileges'],
                           'labels':labels,'environment':{'PATH':'/opt/miniconda3/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'}}
                record('create-request', requested=kwargs, effective=effective)
                obj=raw.containers.create(**effective)
                inventory[obj.id]={'name':obj.name}
                try: validate(obj)
                except BaseException:
                    remove(obj.id)
                    raise
                return Container(obj.id)

    client=types.SimpleNamespace(images=Images(),containers=Containers())
    def cli_dispatch(argv):
        # Full exact argv surface of pinned cleanup_container, no pass-through.
        if len(argv)==3 and argv[:2]==['stop','--time=15']:
            owned(argv[2]).stop(timeout=15)
        elif len(argv)==2 and argv[0]=='kill':
            owned(argv[1]).kill()
        elif len(argv)==3 and argv[:2]==['rm','--force']:
            remove(argv[2])
        else: raise BoundaryError('unsupported CLI effect')
        record('cleanup-cli',argv=argv)
    def cleanup():
        for identity in list(inventory):remove(identity)
    return client,cli_dispatch,cleanup
