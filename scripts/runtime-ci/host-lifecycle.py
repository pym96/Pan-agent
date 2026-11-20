"""Actual installed TUI launches with disposable workspace, home, archives and a local model fixture."""
import argparse
import json
import os
from pathlib import Path
import signal

from installed_pty import Terminal

parser = argparse.ArgumentParser()
parser.add_argument("cli", type=Path)
parser.add_argument("out", type=Path)
args = parser.parse_args()
fixture = Path(__file__).resolve().parent
cli, root = args.cli.resolve(), args.out.resolve()
root.mkdir()
work, home, memory = root / "work", root / "home", root / "memory"
work.mkdir()
(home / ".pan-agent").mkdir(parents=True)
config = home / ".pan-agent/settings.json"
config.write_text(json.dumps({"schemaVersion": 1, "provider": "deepseek", "modelId": "deepseek-v4-flash",
                              "thinkingLevel": "high", "credentialSource": "environment",
                              "permissions": {"deny": ["bash(touch forbidden)"]}}))
initial = config.read_bytes()
(root / "outside.txt").write_text("host-visible")
(work / "wait.cjs").write_text("""
const {spawn} = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"]);
process.on("SIGTERM", () => {});
child.on("exit", () => process.exit(0));
fs.writeFileSync("owned-pids.json", JSON.stringify([process.pid, child.pid]));
""")
commands = {
    "Check actual backend": "if test -r ../outside.txt; then echo host >> observed; else echo native >> observed; fi",
    "Test deny": "touch forbidden",
    "Pending approval": "touch late",
    "Active process": "exec node wait.cjs",
}
env = {"PATH": os.environ["PATH"], "HOME": str(home), "TERM": "xterm-256color", "NO_COLOR": "1",
       "DEEPSEEK_API_KEY": "offline-fixture", "PAN_TEST_MODEL_LOG": str(root / "requests.jsonl"),
       "PAN_TEST_HOST_COMMANDS": json.dumps(commands), "NODE_OPTIONS": "--import=" + (fixture / "mcp-tui-model.mjs").as_uri()}


def launch(host):
    term = Terminal(cli, ["--workspace", str(work), "--memory-root", str(memory), *(["--trusted-local"] if host else [])], work, env)
    term.wait("HOST (trusted-local)" if host else "Native GET")
    term.wait("Write a task")
    return term


def task(term, name, approve):
    term.send(name + "\r")
    term.wait("· running ·")
    if approve:
        term.wait("Approval required")
        term.send("\x1b[B\r")
    term.wait("Observed result:")
    term.wait("· idle ·")


def archives():
    result = {}
    for manifest in (memory / "runs").glob("*/manifest.json"):
        events = [json.loads(row)["record"] for row in manifest.with_name("events.jsonl").read_text().splitlines()]
        result[manifest.parent.name] = events
    return result


def assert_boundary(events, expected):
    boundary, = [e for e in events if e["type"] == "execution.boundary"]
    assert boundary["executionMode"] == expected, boundary
    first = next(i for i, e in enumerate(events) if e["type"] == "model.turn_started")
    assert events.index(boundary) < first
    return boundary


term = launch(True)
try:
    for _ in range(2):
        task(term, "Check actual backend", True)
    task(term, "Test deny", False)
    term.send("\x04")
    term.wait("Pan closed")
    assert term.process.wait(5) == 0
finally:
    term.close(root / "two-tasks.pty")
saved = archives()
assert len(saved) == 3
identities = {assert_boundary(events, "trusted-local")["sessionId"] for events in saved.values()}
assert len(identities) == 1
for events in saved.values():
    settled, = [e for e in events if e["type"] == "tool.settled"]
    if settled["details"].get("code") == "permission_denied":
        assert settled["details"]["authorization"]["decision"] == "deny"
    else:
        assert settled["details"]["authorization"]["decision"] == "allow-once"
assert (work / "observed").read_text() == "host\nhost\n" and not (work / "forbidden").exists()

for active in [False, True]:
    previous = set(archives())
    term = launch(True)
    try:
        term.send(("Active process" if active else "Pending approval") + "\r")
        term.wait("Approval required")
        if active:
            term.send("\x1b[B\r")
            term.until(lambda: (work / "owned-pids.json").is_file() and (work / "owned-pids.json").stat().st_size, "running shell pid")
        term.send("\x04\x1b[B\rCheck actual backend\r")
        term.wait("Pan closed")
        assert term.process.wait(5) == 0
    finally:
        term.close(root / ("active.pty" if active else "pending.pty"))
    all_runs = archives()
    run, = set(all_runs) - previous
    assert json.loads((memory / "runs" / run / "manifest.json").read_text())["settled_state"] == "cancelled"
    assert not (work / "late").exists()
    if active:
        settled, = [e for e in all_runs[run] if e["type"] == "tool.settled"]
        assert settled["details"]["groupSettlement"] == "stopped", settled
        for pid in json.loads((work / "owned-pids.json").read_text()):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                continue
            raise AssertionError(f"owned process {pid} remains after exit")


def restart(label):
    previous = set(archives())
    term = launch(False)
    try:
        term.send(":replay " + next(iter(saved)) + "\r")
        term.wait("REPLAY · view only")
        term.send("\x07")
        term.wait("· composer · idle ·")
        task(term, "Check actual backend", True)
        term.send("\x04")
        term.wait("Pan closed")
        assert term.process.wait(5) == 0
    finally:
        term.close(root / (label + ".pty"))
    all_runs = archives()
    run, = set(all_runs) - previous
    boundary = assert_boundary(all_runs[run], "native-macos-public" if os.uname().sysname == "Darwin" else "native-linux-public")
    assert boundary["backend"] in {"seatbelt", "bubblewrap-fuse"}


restart("clean-restart")
previous = set(archives())
term = launch(True)
try:
    term.process.send_signal(signal.SIGKILL)
    assert term.process.wait(5) == -signal.SIGKILL
finally:
    term.close(root / "abrupt.pty")
assert set(archives()) == previous
restart("abrupt-restart")
assert (work / "observed").read_text() == "host\nhost\nnative\nnative\n"
assert config.read_bytes() == initial
(root / "result.json").write_text(json.dumps({"status": "PASS", "runs": len(archives()), "hostSession": list(identities)[0]}) + "\n")
