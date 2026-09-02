"""Minimal terminal fixture for the trusted-local Human PTY contract."""

from __future__ import annotations

import os
import sys
import termios
import tty


descriptor = sys.stdin.fileno()
original = termios.tcgetattr(descriptor)
try:
    tty.setraw(descriptor)
    os.write(sys.stdout.fileno(), b"SNAKE_READY\r\n")
    key = os.read(descriptor, 1)
    if key.lower() == b"q":
        os.write(sys.stdout.fileno(), b"SNAKE_QUIT\r\n")
        raise SystemExit(0)
    os.write(sys.stdout.fileno(), b"SNAKE_UNEXPECTED_KEY\r\n")
    raise SystemExit(2)
finally:
    termios.tcsetattr(descriptor, termios.TCSADRAIN, original)
