"""Live, filtered projection of /source inside the Bubblewrap supervisor namespace."""
import array
import ctypes
import errno
import fcntl
import json
import os
import signal
import stat
import subprocess
import sys
import time
from contextlib import contextmanager

# -I ignores Python environment and project paths. Only the packaged binding is loaded.
sys.path.insert(0, '/pan-helper')
from fuse import FUSE, FuseOSError, Operations

DENIED = {'.git', '.ssh', '.pan-agent', '.npmrc', '.env', 'id_rsa', 'id_ed25519'}
DIRECTORY = os.O_DIRECTORY | os.O_NOFOLLOW | os.O_RDONLY
NO_LINK = os.O_NOFOLLOW | os.O_NONBLOCK
STAT_KEYS = ('st_mode', 'st_ino', 'st_dev', 'st_nlink', 'st_size', 'st_atime',
             'st_mtime', 'st_ctime', 'st_uid', 'st_gid', 'st_blocks', 'st_blksize')


def protected(name):
    name = name.lower()
    return name in DENIED or name.startswith('.env.') or name.endswith(('.pem', '.key'))


def mount_id(fd):
    with open('/proc/self/fdinfo/%d' % fd, encoding='ascii') as info:
        return next(line for line in info if line.startswith('mnt_id:')).strip()


class Workspace(Operations):
    """Directory descriptors pin traversal. Unsupported links/special files never become handles."""

    def __init__(self, roots):
        self.root = os.open('/source', DIRECTORY)
        self.mount = mount_id(self.root)
        self.protected = {tuple(root.split('/')) for root in roots}

    def validate_protected_names(self):
        if not self.protected:
            return
        # Case-sensitive spelling of a non-existent suffix cannot be established by
        # readdir. Use ext4's real, per-directory lookup mode on this x86-64 backend.
        mount_number = self.mount.split()[1]
        with open('/proc/self/mountinfo', encoding='utf-8') as info:
            filesystem = next(line.split(' - ', 1)[1].split()[0] for line in info
                              if line.split()[0] == mount_number)
        if filesystem != 'ext4':
            raise RuntimeError('Linux configured protectedPaths require a case-sensitive ext4 project')
        for root in self.protected:
            parent = os.dup(self.root)
            try:
                for index, component in enumerate(root):
                    flags = array.array('l', [0])
                    fcntl.ioctl(parent, 0x80086601, flags, True)  # FS_IOC_GETFLAGS on x86-64
                    if flags[0] & 0x40000000:  # EXT4_CASEFOLD_FL
                        raise RuntimeError('Linux configured protectedPaths require literal case-sensitive ext4 directories')
                    if index + 1 == len(root):
                        break
                    try:
                        child = os.open(component, DIRECTORY, dir_fd=parent)
                    except FileNotFoundError:
                        break  # New directories inherit the verified parent's lookup mode.
                    os.close(parent)
                    parent = child
                    self.validate(parent)
            finally:
                os.close(parent)

    def parts(self, path):
        if not path.startswith('/'):
            raise FuseOSError(errno.EACCES)
        parts = tuple(path[1:].split('/')) if path != '/' else ()
        if any(p in ('', '.', '..') or protected(p) for p in parts):
            raise FuseOSError(errno.EACCES)
        if any(parts[:len(root)] == root for root in self.protected):
            raise FuseOSError(errno.EACCES)
        return parts

    def validate(self, fd):
        entry = os.fstat(fd)
        if mount_id(fd) != self.mount or not (
            stat.S_ISDIR(entry.st_mode) or stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1
        ):
            raise FuseOSError(errno.EACCES)
        return entry

    def inspect(self, parent, name, known_spelling=False):
        fd = os.open(name, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent)
        try:
            # Reject alternate spellings on case-folding filesystems.
            if name != '.' and not known_spelling and name not in os.listdir(parent):
                raise FuseOSError(errno.EACCES)
            return self.validate(fd)
        finally:
            os.close(fd)

    @contextmanager
    def entry(self, path, allow_missing=False):
        parts = self.parts(path)
        parent = os.dup(self.root)
        try:
            for name in parts[:-1]:
                self.inspect(parent, name)
                child = os.open(name, DIRECTORY, dir_fd=parent)
                os.close(parent)
                parent = child
                self.validate(parent)
            name = parts[-1] if parts else '.'
            try:
                info = self.inspect(parent, name)
            except FileNotFoundError:
                if not allow_missing:
                    raise
                info = None
            yield parent, name, info
        finally:
            os.close(parent)

    def getattr(self, path, fh=None):
        if fh is not None:
            info = self.validate(fh)
        else:
            with self.entry(path) as (_, _, info):
                pass
        return {key: getattr(info, key) for key in STAT_KEYS}

    def readdir(self, path, fh):
        with self.entry(path) as (parent, name, _):
            fd = os.open(name, DIRECTORY, dir_fd=parent)
            try:
                names = ['.', '..']
                for item in os.listdir(fd):
                    try:
                        item.encode('utf-8')
                        self.parts(path.rstrip('/') + '/' + item)
                        self.inspect(fd, item, known_spelling=True)
                    except (UnicodeError, OSError):
                        continue
                    names.append(item)
                return names
            finally:
                os.close(fd)

    def open(self, path, flags):
        with self.entry(path) as (parent, name, info):
            if not stat.S_ISREG(info.st_mode):
                raise FuseOSError(errno.EISDIR)
            fd = os.open(name, (flags & ~os.O_TRUNC) | NO_LINK, dir_fd=parent)
            try:
                actual = self.validate(fd)
                if (actual.st_dev, actual.st_ino) != (info.st_dev, info.st_ino):
                    raise FuseOSError(errno.ESTALE)
                if flags & os.O_TRUNC:
                    os.ftruncate(fd, 0)
                return fd
            except BaseException:
                os.close(fd)
                raise

    def create(self, path, mode):
        with self.entry(path, allow_missing=True) as (parent, name, _):
            return os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | NO_LINK,
                           mode & 0o777, dir_fd=parent)

    def read(self, path, size, offset, fh):
        self.validate(fh)
        return os.pread(fh, size, offset)

    def write(self, path, data, offset, fh):
        self.validate(fh)
        return os.pwrite(fh, data, offset)

    def release(self, path, fh):
        os.close(fh)
        return 0

    def fsync(self, path, datasync, fh):
        os.fsync(fh)
        return 0

    def truncate(self, path, length, fh=None):
        if fh is not None:
            self.validate(fh)
            os.ftruncate(fh, length)
        else:
            fd = self.open(path, os.O_WRONLY)
            try:
                os.ftruncate(fd, length)
            finally:
                os.close(fd)

    def mkdir(self, path, mode):
        with self.entry(path, allow_missing=True) as (parent, name, _):
            os.mkdir(name, mode & 0o777, dir_fd=parent)

    def unlink(self, path):
        with self.entry(path) as (parent, name, _):
            os.unlink(name, dir_fd=parent)

    def rmdir(self, path):
        with self.entry(path) as (parent, name, _):
            os.rmdir(name, dir_fd=parent)

    def rename(self, old, new):
        with self.entry(old) as (src, src_name, info):
            # A directory rename can relocate a configured/protected subtree.
            if not stat.S_ISREG(info.st_mode):
                raise FuseOSError(errno.EPERM)
            with self.entry(new, allow_missing=True) as (dst, dst_name, _):
                os.rename(src_name, dst_name, src_dir_fd=src, dst_dir_fd=dst)

    def chmod(self, path, mode):
        with self.entry(path) as (parent, name, info):
            if not stat.S_ISREG(info.st_mode):
                raise FuseOSError(errno.EPERM)
            fd = os.open(name, os.O_RDONLY | NO_LINK, dir_fd=parent)
            try:
                self.validate(fd)
                os.fchmod(fd, mode & 0o777)
            finally:
                os.close(fd)

    def utimens(self, path, times=None):
        with self.entry(path) as (parent, name, _):
            os.utime(name, times, dir_fd=parent, follow_symlinks=False)


def shell_filter(local_sockets):
    # libseccomp translates syscall names for the native ABI and rejects other ABIs.
    lib = ctypes.CDLL('libseccomp.so.2')
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    class Argument(ctypes.Structure):
        _fields_ = [('index', ctypes.c_uint), ('comparison', ctypes.c_uint),
                    ('mask', ctypes.c_uint64), ('value', ctypes.c_uint64)]
    lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int,
                                          ctypes.c_uint, ctypes.POINTER(Argument)]
    lib.seccomp_export_bpf.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    ctx = lib.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
    if not ctx:
        raise RuntimeError('libseccomp initialization failed')
    fd = os.memfd_create('pan-shell-policy')
    try:
        socket_denials = () if local_sockets else ('socket', 'connect')
        if local_sockets:
            # The child sees only a private mount tree and an isolated network namespace.
            for name in ('socket', 'socketpair'):
                nr = lib.seccomp_syscall_resolve_name(name.encode('ascii'))
                condition = Argument(0, 1, 1, 0)  # SCMP_CMP_NE, AF_UNIX
                if nr < 0 or lib.seccomp_rule_add_array(ctx, 0x00050000 | errno.EPERM, nr, 1,
                                                        ctypes.byref(condition)) != 0:
                    raise RuntimeError('libseccomp cannot restrict socket family')
        for name in socket_denials + ('io_uring_setup', 'unshare', 'setns', 'mount',
                     'umount2', 'ptrace', 'bpf', 'keyctl', 'add_key', 'request_key',
                     'open_by_handle_at', 'perf_event_open'):
            nr = lib.seccomp_syscall_resolve_name(name.encode('ascii'))
            if nr < 0 or lib.seccomp_rule_add(ctx, 0x00050000 | errno.EPERM, nr, 0) != 0:
                raise RuntimeError('libseccomp cannot enforce ' + name)
        # Ordinary forks and threads still work. Ask libc to use clone instead of
        # its opaque clone3 argument struct, then filter clone namespace flags.
        clone3 = lib.seccomp_syscall_resolve_name(b'clone3')
        clone = lib.seccomp_syscall_resolve_name(b'clone')
        if min(clone3, clone) < 0 or lib.seccomp_rule_add(ctx, 0x00050000 | errno.ENOSYS, clone3, 0):
            raise RuntimeError('libseccomp cannot restrict clone3')
        for flag in (0x80, 0x20000, 0x2000000, 0x4000000, 0x8000000,
                     0x10000000, 0x20000000, 0x40000000):
            condition = Argument(0, 7, flag, flag)  # SCMP_CMP_MASKED_EQ
            if lib.seccomp_rule_add_array(ctx, 0x00050000 | errno.EPERM, clone, 1,
                                          ctypes.byref(condition)) != 0:
                raise RuntimeError('libseccomp cannot restrict namespace creation')
        if lib.seccomp_export_bpf(ctx, fd) != 0:
            raise RuntimeError('libseccomp export failed')
        os.lseek(fd, 0, os.SEEK_SET)
        return fd
    except BaseException:
        os.close(fd)
        raise
    finally:
        lib.seccomp_release(ctx)


def main():
    with open('/pan-policy.json', encoding='utf-8') as source:
        policy = json.load(source)
    workspace = Workspace(policy['protected'])
    workspace.validate_protected_names()
    pid = os.fork()
    if pid == 0:
        FUSE(workspace, '/view', foreground=True, nothreads=True,
             direct_io=True, default_permissions=True, attr_timeout=0, entry_timeout=0,
             negative_timeout=0, fsname='pan-workspace')
        os._exit(0)
    try:
        for _ in range(200):
            if os.path.ismount('/view'):
                break
            if os.waitpid(pid, os.WNOHANG)[0]:
                raise RuntimeError('FUSE mount failed; check /dev/fuse, libfuse2 and fusermount')
            time.sleep(0.01)
        else:
            raise RuntimeError('FUSE mount timed out')
        fd = shell_filter(policy['localSockets'])
        try:
            argv = ['/usr/bin/bwrap', '--unshare-pid', '--die-with-parent', '--new-session',
                    '--cap-drop', 'ALL', '--seccomp', str(fd), '--clearenv']
            for key, value in policy['environment'].items():
                argv += ['--setenv', key, value]
            argv += policy['shellMounts'] + ['--chdir', '/work', '--', *sys.argv[1:]]
            return subprocess.run(argv, pass_fds=(fd,)).returncode
        finally:
            os.close(fd)
    finally:
        # /view exists only in this outer PID + mount namespace. Killing its PID 1
        # also removes the daemon, its descendants and the mount after cancellation.
        try:
            os.kill(pid, signal.SIGTERM)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass


if __name__ == '__main__':
    sys.exit(main())
