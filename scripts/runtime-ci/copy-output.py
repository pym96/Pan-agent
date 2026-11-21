"""Check text selection and explicit copy in the installed CLI using an isolated PTY."""
import base64
import json
import os
from pathlib import Path
import re
import sys

from installed_pty import Terminal

cli, root = map(lambda p: Path(p).resolve(), sys.argv[1:])
home, work, memory, temporary = (root / p for p in ("home", "work", "memory", "tmp"))
for folder in (home / ".pan-agent", work, temporary):
    folder.mkdir(parents=True)
(home / ".pan-agent/settings.json").write_text(json.dumps({
    "schemaVersion": 1, "provider": "deepseek", "modelId": "deepseek-v4-flash",
    "thinkingLevel": "high", "credentialSource": "environment"}))
log = root / "requests.jsonl"
env = {"HOME": str(home), "PATH": os.environ["PATH"], "TMPDIR": str(temporary),
       "TERM": "xterm-256color", "NO_COLOR": "1", "DEEPSEEK_API_KEY": "offline-fixture",
       "PAN_TEST_MODEL_LOG": str(log),
       "NODE_OPTIONS": "--import=" + Path(__file__).with_name("mcp-tui-model.mjs").as_uri()}
term = Terminal(cli, ["--trusted-local", "--workspace", str(work), "--memory-root", str(memory)], work, env)
mouse_on = re.compile(rb"\x1b\[\?100[026]h")
osc = re.compile(rb"\x1b\]52;c;([A-Za-z0-9+/=]+)\x07")
copies = []


def copy(return_marker):
    before = set(temporary.glob("pan-copy-*/output.txt"))
    term.send("\x19")
    term.wait("Clipboard requested.")
    created, = set(temporary.glob("pan-copy-*/output.txt")) - before
    assert created.stat().st_mode & 0o777 == 0o600
    raw = created.read_bytes()
    assert base64.b64decode(osc.findall(term.buffer)[-1], validate=True) == raw
    term.send("\x07")
    term.wait(return_marker)
    copies.append(created)
    return raw.decode()


try:
    term.wait("Write a task.")
    assert not mouse_on.search(term.buffer)
    term.send("Read marker (missing)\r")
    term.wait("Approval required")
    assert not osc.search(term.buffer) and not list(temporary.glob("pan-copy-*/output.txt"))
    assert "marker.txt" in copy("Arrows choose")
    assert len(log.read_text().splitlines()) == 1
    term.send("\r")  # deny the missing-file read
    term.wait("Completed · next draft Not submitted")
    archive = next((memory / "runs").glob("*/events.jsonl"))
    records = [json.loads(line)["record"] for line in archive.read_text().splitlines()]
    error, = [r["text"] for r in records if r["type"] == "tool.settled" and r["isError"]]
    run_id = archive.parent.name
    marker = "START\n" + "    print('你好 👋')\n" * 85 + "END"
    (work / "marker.txt").write_text(marker)
    term.send("Read marker (present)\r")
    term.wait("END")
    term.wait("Completed · next draft Not submitted")
    transcript = copy("Completed · next draft Not submitted")
    assert marker in transcript and error in transcript and "Fixture response." not in transcript
    term.send(":details\r")
    term.wait("Run details ")
    assert "Full tool result\n" + marker in copy("Enter/Ctrl-G Close")
    term.send("\x07")
    term.wait("Completed · next draft Not submitted")
    term.send(":replay " + run_id + "\r")
    term.wait("REPLAY · view only")
    replay = copy("Enter/Ctrl-G Close")
    assert error in replay and marker not in replay
    term.send("\x07")
    term.wait("Completed · next draft Not submitted")
    assert not mouse_on.search(term.buffer)
    term.send("\x03")
    term.wait("Pan closed")
    assert term.process.wait(timeout=5) == 130
    assert not mouse_on.search(term.buffer)
    assert term.buffer.count(b"\x1b[?1049h") == term.buffer.count(b"\x1b[?1049l")
    assert len(log.read_text().splitlines()) == 4
    assert len(osc.findall(term.buffer)) == len(copies) == 4
finally:
    term.close(root / "terminal.pty")

print("PASS installed terminal selection, explicit transcript/details/replay copy, private fallback, native selection and Ctrl-C")
