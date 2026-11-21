"""Exercise Ctrl-C and SIGINT through an offline-installed pan-agent launcher."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import termios
import time


def check_interrupts(cli, root, env, credential_log):
    root.mkdir()
    settings = {"schemaVersion": 1, "provider": "deepseek", "modelId": "deepseek-v4-flash",
                "thinkingLevel": "high", "credentialSource": "environment"}
    provider = root / "provider.mjs"
    provider.write_text(r"""
import {appendFileSync} from 'node:fs';
const log = text => appendFileSync(process.env.PAN_INTERRUPT_LOG, text + '\n');
globalThis.fetch = async (url, req) => {
    if (String(url) !== 'https://api.deepseek.com/chat/completions') throw Error('unexpected endpoint');
    log('request');
    const mode = process.env.PAN_INTERRUPT_CASE;
    if (mode.startsWith('model')) {
        return new Promise((_, reject) => {
            req.signal.addEventListener('abort', () => {
                log('aborted');
                setTimeout(() => reject(req.signal.reason), 100);
            }, {once: true});
        });
    }
    if (mode !== 'approval' && mode !== 'tool') throw Error('unexpected model call');
    const command = mode === 'approval' ? 'touch unapproved' : 'echo $$ > tool.pid; exec sleep 90';
    const tool = {index: 0, id: 'fixture-call', type: 'function',
        function: {name:'bash', arguments: JSON.stringify({command})}};
    const chunk = (delta, finish_reason) => 'data: ' + JSON.stringify({
        id:'fixture-model', object:'chat.completion.chunk', created:1, model:'deepseek-v4-flash',
        choices:[{index:0, delta, finish_reason}],
        usage:finish_reason ? {prompt_tokens:2, completion_tokens:3, total_tokens:5,
            prompt_cache_hit_tokens:0, prompt_cache_miss_tokens:2} : null}) + '\n\n';
    return new Response(chunk({role:'assistant',reasoning_content:'fixture',tool_calls:[tool]}, null) +
        chunk({}, 'tool_calls') + 'data: [DONE]\n\n', {headers:{'content-type':'text/event-stream'}});
};
""")
    results = []
    wizard_cases = {"first", "configure", "recover", "wizard-sigint", "wizard-eof", "secret"}
    cases = ["idle", "mouse", "small", "compact", "compact-picker", "picker", "view", "paste", "idle-sigint", "normal", "eof",
             "first", "configure", "recover", "wizard-sigint", "wizard-eof",
             "model", "model-sigint", "approval", "tool"]
    if os.uname().sysname == "Darwin":
        cases.append("secret")
    for mode in cases:
        case = root / mode
        home, work = case / "home", case / "work"
        settings_dir = home / ".pan-agent"
        settings_dir.mkdir(parents=True)
        work.mkdir()
        config = settings_dir / "settings.json"
        before_config = None
        if mode not in wizard_cases or mode == "recover":
            before_config = json.dumps(settings).encode()
            config.write_bytes(before_config)
        model_log = case / "model.log"
        child_env = {**env, "HOME": str(home), "NO_COLOR": "1", "PAN_INTERRUPT_CASE": mode,
                     "PAN_INTERRUPT_LOG": str(model_log),
                     "NODE_OPTIONS": env["NODE_OPTIONS"] + " --import=" + provider.as_uri()}
        if mode not in wizard_cases:
            child_env["DEEPSEEK_API_KEY"] = "offline-fixture"
        args = []
        if mode in {"configure", "wizard-sigint", "wizard-eof", "secret"}:
            args = ["configure"]
        if mode in {"compact", "compact-picker", "model", "model-sigint", "approval", "tool"}:
            args = ["--workspace", str(work), "--trusted-local"]
        master, slave = pty.openpty()
        before = termios.tcgetattr(slave)
        rows, cols = (10, 32) if mode == "small" else (32, 120)
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        proc = subprocess.Popen([str(cli), *args], stdin=slave,
            stdout=subprocess.PIPE if mode.startswith("compact") else slave, stderr=slave,
            cwd=work, env=child_env, start_new_session=True)
        fd = proc.stdout.fileno() if proc.stdout else master
        raw = bytearray()
        offset = 0

        def pump():
            if select.select([fd], [], [], .03)[0]:
                raw.extend(os.read(fd, 65536))

        def until(condition):
            deadline = time.monotonic() + 7
            while not condition():
                if time.monotonic() > deadline or proc.poll() is not None:
                    raise AssertionError(f"{mode}: observation timed out or early exit {proc.returncode}")
                pump()

        def see(value):
            nonlocal offset
            token = value.encode()
            until(lambda: token in raw[offset:])
            offset = raw.index(token, offset) + len(token)

        def send(value):
            os.write(master, value.encode())

        def external():
            proc.send_signal(signal.SIGINT)

        try:
            if mode in wizard_cases:
                see("Credential source:" if mode == "recover" else "Provider [")
                if mode == "secret":
                    send("\r"); see("Model ["); send("\r"); see("Thinking ["); send("\r")
                    see("Credential source:"); send("k\r"); see("input hidden;")
                    send("PAN-190-SYNTHETIC\r"); see("Save this key"); send("y")
                if mode == "wizard-sigint":
                    external()
                elif mode == "wizard-eof":
                    send("\x04")
                else:
                    send("\x03")
            else:
                see("Resize terminal" if mode == "small" else "You > " if mode.startswith("compact") else "Write a task.")
                if mode.startswith("model") or mode in {"approval", "tool"}:
                    send("Controlled cancellation\r")
                    until(lambda: model_log.exists())
                    if mode.startswith("model"):
                        if mode == "model-sigint":
                            external()
                        else:
                            send("\x03\x03\r")
                    else:
                        see("Approval required")
                        if mode == "approval":
                            send("\x1b[B\x03\r")
                            see("· idle ·")
                        else:
                            send("\x1b[B\r")
                            until(lambda: (work / "tool.pid").exists() and (work / "tool.pid").stat().st_size)
                            send("\x03")
                            see("· idle ·")
                        send("\x03")
                elif mode in {"compact-picker", "picker", "view"}:
                    send(":help\r" if mode == "view" else "@")
                    see("View only" if mode == "view" else "File " if mode == "picker" else "File picker")
                    send("\x03\r")
                elif mode == "mouse":
                    send("\x14")
                    see("Mouse navigation on")
                    send("\x03")
                elif mode == "idle-sigint":
                    external()
                elif mode in {"normal", "eof"}:
                    send(":exit\r" if mode == "normal" else "\x04")
                else:
                    if mode in {"paste", "compact"}:
                        send("\x1b[200~a\x03\r:x\x1b[201~")
                        if mode == "paste":
                            see("Not submitted · Enter Send")
                    send("unsubmitted\x03\r")
            expected = 2 if mode == "wizard-eof" else 0 if mode in {"normal", "eof"} else 130
            # Drain while waiting so PTY backpressure cannot impersonate a shutdown failure.
            deadline = time.monotonic() + 7
            while proc.poll() is None and time.monotonic() < deadline:
                pump()
            assert proc.wait(timeout=1) == expected, (mode, proc.returncode, expected)
            while select.select([fd], [], [], 0)[0]:
                tail = os.read(fd, 65536)
                if not tail:
                    break
                raw.extend(tail)
            assert termios.tcgetattr(slave) == before, (mode, "terminal flags differ")
            if not mode.startswith("compact"):
                modes = ["2004"] if mode in wizard_cases else ["1049", "2004"]
                for control in ("1000", "1002", "1006"):
                    if mode == "mouse":
                        modes.append(control)
                    else:
                        assert f"\x1b[?{control}h".encode() not in raw, (mode, control)
                for control in modes:
                    on, off = (f"\x1b[?{control}{c}".encode() for c in "hl")
                    assert 0 <= raw.rfind(on) < raw.rfind(off), (mode, control)
            assert not credential_log.exists()
            assert b"PAN-190-SYNTHETIC" not in raw
            assert (config.read_bytes() if config.exists() else None) == before_config
            calls = model_log.read_text().splitlines() if model_log.exists() else []
            archives = list((settings_dir / "archives/runs").glob("*/manifest.json"))
            if mode.startswith("model") or mode in {"approval", "tool"}:
                assert calls == (["request", "aborted"] if mode.startswith("model") else ["request"]), (mode, calls)
                assert len(archives) == 1 and json.loads(archives[0].read_bytes())["settled_state"] == "cancelled"
                events = [json.loads(line)["record"] for line in archives[0].with_name("events.jsonl").read_text().splitlines()]
                assert [e["task"] for e in events if e["type"] == "run.started"] == ["Controlled cancellation"]
                assert any(e["type"] == "run.terminal" and e["status"] == "cancelled" for e in events)
            else:
                assert calls == [] and archives == [], (mode, calls, archives)
            if mode == "tool":
                pid = int((work / "tool.pid").read_text())
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    pass
                else:
                    raise AssertionError(f"cancelled tool process {pid} still exists")
            else:
                assert list(work.iterdir()) == [], (mode, "unexpected workspace effect")
            results.append({"case": mode, "status": proc.returncode, "termiosRestored": True,
                            "provider": calls, "archives": len(archives)})
        finally:
            if proc.poll() is None:
                proc.kill(); proc.wait()
            if proc.stdout:
                proc.stdout.close()
            (case / "terminal.pty").write_bytes(raw)
            os.close(master); os.close(slave)
    (root / "result.json").write_text(json.dumps(results, indent=2) + "\n")
