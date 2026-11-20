"""PTY client for installed Pan integration tests."""
import errno
import fcntl
import os
import pty
import select
import struct
import subprocess
import termios
import time


class Terminal:
    def __init__(self, cli, args, cwd, env):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 160, 0, 0))
        try:
            self.process = subprocess.Popen([cli, *args], cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave)
        finally:
            os.close(slave)
        self.buffer = bytearray()
        self.offset = 0

    def wait(self, text):
        token = text.encode()
        self.until(lambda: self.buffer.find(token, self.offset) >= 0, text)
        self.offset = self.buffer.index(token, self.offset) + len(token)

    def until(self, condition, description):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if condition():
                return
            if select.select([self.master], [], [], 0.2)[0]:
                try:
                    chunk = os.read(self.master, 65536)
                except OSError as exc:
                    if exc.errno != errno.EIO:
                        raise
                    break
                if not chunk:
                    break
                self.buffer.extend(chunk)
        raise AssertionError(f"missing {description!r}: {bytes(self.buffer[-3500:])!r}")

    def send(self, text):
        self.offset = len(self.buffer)
        os.write(self.master, text.encode())

    def close(self, log):
        try:
            if self.process.poll() is None:
                self.process.kill()
            self.process.wait(timeout=5)
        finally:
            log.write_bytes(self.buffer)
            os.close(self.master)

