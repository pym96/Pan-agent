"""Independent 120s watchdog; sampled aggregate RSS <= 4GiB; owned descendants only.
A sampled RSS bound is not an instantaneous OS memory limit. Node workers also set heap limits.
"""
import os, signal, subprocess, sys, time
parent = os.getppid()
p = subprocess.Popen(sys.argv[1:], start_new_session=True)
known = {}

def snapshot():
    result = subprocess.run(['ps', '-axo', 'pid=,ppid=,pgid=,rss=,lstart='], capture_output=True, text=True, timeout=2)
    rows = {}
    for line in result.stdout.splitlines():
        parts = line.split(None, 4)
        if len(parts) == 5:
            pid, ppid, pgid, rss = map(int, parts[:4])
            rows[pid] = (ppid, pgid, rss, parts[4])
    owned = {p.pid}
    while True:
        more = {pid for pid, row in rows.items() if row[0] in owned}
        if more <= owned:
            break
        owned |= more
    for pid in owned:
        if pid in rows:
            known[pid] = rows[pid][3]
    return rows

def cleanup():
    rows = snapshot()
    for pid, birth in known.items():
        if pid in rows and rows[pid][3] == birth:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

started = time.monotonic()
code = 124
try:
    while p.poll() is None:
        rows = snapshot()
        rss = sum(row[2] for pid, row in rows.items() if known.get(pid) == row[3])
        if time.monotonic() - started >= 120 or os.getppid() != parent or rss > 4 * 1024 * 1024:
            cleanup()
            break
        time.sleep(.1)
    code = p.wait(timeout=5)
finally:
    # Parent/SUT normal termination does not authorize lingering owned descendants.
    cleanup()
sys.exit(code)
