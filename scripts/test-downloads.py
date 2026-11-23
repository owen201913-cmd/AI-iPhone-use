"""Install each public ZIP in isolation and check its real MCP entry point."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
TOOLS = {"pinky": ["pinky"], "ish": ["iphone_receipt", "iphone_workspace"],
         "usb": ["iphone_screen", "iphone_usb"]}
SMOKE = """
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {getDefaultEnvironment,StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({name:'download-check',version:'1'});
try {
  const env = {...getDefaultEnvironment(), IPHONE_USE_HOME:process.env.IPHONE_USE_HOME};
  if (process.argv[2]) env.USBMUXD_SOCKET_ADDRESS = process.argv[2];
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve('server.mjs')],env}));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(), JSON.parse(process.argv[1]));
  if (process.argv[2]) {
    const result = await client.callTool({name:'iphone_screen',arguments:{}});
    const frame = JSON.parse(result.content[0].text);
    assert.equal(frame.status, 'unavailable');
    assert.equal(frame.reason, 'ConnectionFailedToUsbmuxdError');
    assert.equal(frame.inputMayHaveRun, false);
  }
} finally { await client.close(); }
"""


def check(folder, feature):
    with zipfile.ZipFile(PROJECT / "downloads" / f"iphone-use-{feature}.zip") as archive:
        archive.extractall(folder)
    cwd = folder / ("iphone-use-" + feature)
    env = dict(os.environ, IPHONE_USE_HOME=str(folder / "state"))
    assert sorted(p.stem for p in (cwd / "lib/backends").iterdir()) == [feature]
    assert sorted(p.stem for p in (cwd / "scripts/configure").iterdir()) == [feature]
    assert (cwd / "ios").exists() == (feature == "ish")
    assert (cwd / "lib/pinky-bridge.mjs").exists() == (feature == "pinky")
    assert (cwd / "scripts/iphone-usb-ui.py").exists() == (feature == "usb")
    assert (cwd / "MCP.md").read_bytes() == (PROJECT / "docs/MCP.md").read_text(encoding="utf-8").encode("utf-8")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.run([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=cwd, check=True)
    assert (cwd / "node_modules/ssh2").exists() == (feature == "ish")
    subprocess.run(["node", "scripts/setup.mjs", "enable"], cwd=cwd, env=env, check=True)
    state = folder / "state/packages" / feature
    assert json.loads((state / "access.json").read_text())["enabled"]
    smoke = ["node", "--input-type=module", "-e", SMOKE, json.dumps(TOOLS[feature])]
    if feature == "usb" and os.name == "nt":
        subprocess.run([sys.executable, "-m", "venv", state / "venv"], check=True)
        python = state / "venv/Scripts/python.exe"
        subprocess.run([python, "-I", "-m", "pip", "install", "--disable-pip-version-check",
                        "--quiet", "-r", "requirements.txt"], cwd=cwd, check=True)
        pairing = state / "iphone-usb-ui"
        pairing.mkdir()
        (pairing / "config.json").write_text(json.dumps({"enabled": True, "deviceHash": "e" * 64}))
        # A bound, non-listening loopback port makes device discovery fail predictably.
        # Reaching it proves the real ZIP worker read the package's pairing file.
        with socket.socket() as offline_mux:
            offline_mux.bind(("127.0.0.1", 0))
            address = f"127.0.0.1:{offline_mux.getsockname()[1]}"
            subprocess.run([*smoke, address], cwd=cwd, env=env, check=True)
    else:
        subprocess.run(smoke, cwd=cwd, env=env, check=True)
    subprocess.run(["node", "scripts/setup.mjs", "disable"], cwd=cwd, env=env, check=True)
    print(feature, "OK:", ", ".join(TOOLS[feature]), flush=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        for name in TOOLS:
            check(Path(tmp), name)
