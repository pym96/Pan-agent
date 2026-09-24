"""OS-owned locks; optional broker fence blocks a late startup before cleanup."""
import fcntl,sys,json,os
with open(sys.argv[1], 'a+') as lock:
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:sys.exit(2)
 if '--fence' in sys.argv:
  lock.seek(0);lock.truncate();json.dump({'state':'fenced'},lock);lock.flush();os.fsync(lock.fileno())
 print('locked',flush=True)
 sys.stdin.buffer.read()
