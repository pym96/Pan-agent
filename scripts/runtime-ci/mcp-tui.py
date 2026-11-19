"""Exercise the installed launcher, full-screen TUI, provider adapter, archive and separate stdio peer."""
import argparse
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import termios
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("cli", type=Path)
parser.add_argument("out", type=Path)
parser.add_argument("--native-sample", action="store_true", help="run samples with the default native backend")
options = parser.parse_args()
cli, out = options.cli.absolute(), options.out.resolve()
out.mkdir()
fixtures = Path(__file__).resolve().parent
node = shutil.which("node")
assert node


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


class Terminal:
    def __init__(self, args, cwd, env):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 160, 0, 0))
        try:
            self.process = subprocess.Popen([cli, *args], cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave)
        finally:
            os.close(slave)
        self.buffer = bytearray()
        self.offset = 0

    def wait(self, text):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            found = self.buffer.find(text.encode(), self.offset)
            if found >= 0:
                self.offset = found + len(text.encode())
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
        raise AssertionError(f"missing {text!r}: {bytes(self.buffer[-3500:])!r}")

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


def scenario(mode):
    base = out / mode
    work, home, memory = base / "project", base / "home", base / "archives"
    work.mkdir(parents=True)
    policy = home / ".pan-agent"
    policy.mkdir(mode=0o700, parents=True)
    model_log, peer_log = base / "model.jsonl", base / "peer.jsonl"
    env = {"PATH": os.environ["PATH"], "HOME": str(home), "TERM": "xterm-256color", "NO_COLOR": "1",
           "DEEPSEEK_API_KEY": "offline-fixture", "PAN_TEST_MODEL_LOG": str(model_log),
           "NODE_OPTIONS": "--import=" + (fixtures / "mcp-tui-model.mjs").as_uri()}
    settings = {"schemaVersion": 1, "provider": "deepseek", "modelId": "deepseek-v4-flash",
                "thinkingLevel": "high", "credentialSource": "environment"}
    if mode == "policy-deny":
        settings["permissions"] = {"deny": ["mcp_report"]}
    (policy / "settings.json").write_text(json.dumps(settings))
    token = uuid.uuid4().hex
    marker = "Workspace marker " + token
    (work / "marker.txt").write_text(marker)
    report = {"run": "example-" + token[:8], "score": None, "reason": "Missing rubric " + token}
    data = base / "report.json"
    data.write_text(json.dumps(report))
    tool = "read" if mode == "collision" else "summary"
    server = "reports"
    peer_mode = mode if mode in {"stall", "exit", "unavailable", "tool-error", "duplicate", "unsupported", "contradiction"} else "report"
    config = {"servers": [{"name": server, "command": node, "args": [str(fixtures / "mcp-report-peer.mjs"), peer_mode, str(peer_log), str(data)], "tools": [tool]}]}
    if mode == "packaged":
        config = json.loads(subprocess.check_output([cli, "mcp", "example-config"], cwd=work, env=env))
        server, tool = "example", "run_summary"
    directory = work / ".pan-agent" if mode == "project" else policy
    directory.mkdir(exist_ok=True)
    config_file = directory / "mcp-reports.json"
    config_file.write_text(json.dumps(config))
    args = ["--workspace", str(work), "--memory-root", str(memory)]
    if not options.native_sample:
        args.append("--trusted-local")
    if mode != "disabled":
        args += ["--mcp-report", server, tool]
    visible = mode not in {"collision", "unsupported", "duplicate", "disabled", "project", "contradiction"}
    term = Terminal(args, work, env)
    try:
        term.wait("Write a task.")
        if mode != "disabled":
            term.wait("Local MCP report:" if visible else "Local MCP report disabled:")
        if visible:
            prompt = "Why is this synthetic run unscored?" if mode != "arguments" else "Try invalid arguments"
            term.send(prompt + "\r")
            if mode not in {"policy-deny", "arguments"}:
                term.wait("Approval required")
                assert not [r for r in rows(peer_log) if '"method":"tools/call"' in r.get("fromClient", "")]
                if mode == "changed":
                    config["servers"][0]["args"][1] = "tool-error"
                    config_file.write_text(json.dumps(config))
                term.send("\r" if mode == "deny" else "\x1b[B\r")
            term.wait("Observed result:")
            expected = {"report": report["reason"], "packaged": "its scoring rubric was not supplied",
                        "exit": "mcp_call_uncertain", "stall": "mcp_call_uncertain", "unavailable": "mcp_unavailable",
                        "tool-error": "mcp_tool_error", "deny": "approval_denied", "policy-deny": "permission_denied",
                        "arguments": "mcp_report expects {}", "changed": "mcp_unavailable"}[mode]
            term.wait(expected)
            term.wait("Completed · next draft Not submitted")
        else:
            term.send("Enable and use the local report before answering\r")
            term.wait("Observed result: Tool mcp_report not found")
            term.wait("Completed · next draft Not submitted")
        term.send("Read marker.txt\r")
        term.wait(marker)
        term.wait("Completed · next draft Not submitted")
        term.send(":exit\r")
        term.wait("Pan closed")
        assert term.process.wait(timeout=5) == 0
    finally:
        term.close(base / "terminal.pty")
    requests = rows(model_log)
    assert len(requests) == 4, len(requests)
    for request in requests:
        names = [t["function"]["name"] for t in request["tools"]]
        assert names.count("read") == 1 and names.count("mcp_report") == int(visible), names
        if visible:
            advertised = next(t["function"] for t in request["tools"] if t["function"]["name"] == "mcp_report")
            assert server + "/" + tool in advertised["description"]
    archive = [row for p in (memory / "runs").glob("*/events.jsonl") for row in rows(p)]
    tools = [row["record"] for row in archive if row["record"]["type"] == "tool.settled"]
    builtin, = [r for r in tools if r["toolName"] == "read"]
    assert builtin["isError"] is False and builtin["text"] == marker, builtin
    events = rows(peer_log)
    launches = [row for row in events if "pid" in row]
    calls = [json.loads(row["fromClient"]) for row in events if "fromClient" in row]
    calls = [msg for msg in calls if msg["method"] == "tools/call"]
    for launch in launches:
        try:
            os.kill(launch["pid"], 0)
        except ProcessLookupError:
            continue
        raise AssertionError(f"owned peer {launch['pid']} still live")
    assert len(launches) == (0 if mode in {"disabled", "collision", "project", "packaged"}
                              else 2 if mode in {"report", "exit", "stall", "unavailable", "tool-error"} else 1), launches
    assert len(calls) == int(mode in {"report", "exit", "stall", "tool-error"}), calls
    if visible:
        settled, = [r for r in tools if r["toolName"] == "mcp_report"]
        assert settled["isError"] == (mode not in {"report", "packaged"}), settled
        assert expected in settled["text"], settled
        if calls:
            intent = requests[1]["messages"][-2]["tool_calls"][0]
            assert intent["id"] == settled["toolCallId"] and json.loads(intent["function"]["arguments"]) == {}
            details = settled["details"]
            audit = details["authorization"]
            assert audit["decision"] == "allow-once" and audit["runId"] == settled["runId"] and audit["callId"] == intent["id"]
            call, = calls
            assert (details["server"], details["tool"], details["requestId"]) == (server, tool, call["id"])
            assert call["params"]["name"] == tool and call["params"]["arguments"] == {}
            assert call["params"]["_meta"]["io.github.pym96/pan-call"] == audit["requestId"]
    return {"mode": mode, "modelRequests": len(requests), "observedPeerLaunches": len(launches), "observedPeerCalls": len(calls)}


modes = ("report", "packaged") if options.native_sample else ("report", "packaged", "deny", "policy-deny", "arguments", "disabled", "project",
                                       "collision", "unsupported", "duplicate", "contradiction", "changed",
                                       "exit", "stall", "unavailable", "tool-error")
results = [scenario(mode) for mode in modes]
(out / "summary.json").write_text(json.dumps({"status": "PASS", "defaultNative": options.native_sample, "scenarios": results}, indent=2) + "\n")
