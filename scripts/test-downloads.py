"""Install each public ZIP in isolation and check its real MCP entry point."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
TOOLS = {"pinky": ["pinky"], "ish": ["iphone_receipt", "iphone_workspace"],
         "usb": ["iphone_screen", "iphone_usb"]}
SMOKE = """
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({name:'download-check',version:'1'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve('server.mjs')],env:{IPHONE_USE_HOME:process.env.IPHONE_USE_HOME}}));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(), JSON.parse(process.argv[1]));
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
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.run([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=cwd, check=True)
    assert (cwd / "node_modules/ssh2").exists() == (feature == "ish")
    subprocess.run(["node", "--input-type=module", "-e", SMOKE, json.dumps(TOOLS[feature])],
                   cwd=cwd, env=env, check=True)
    subprocess.run(["node", "scripts/setup.mjs", "enable"], cwd=cwd, env=env, check=True)
    assert json.loads((folder / "state/packages" / feature / "access.json").read_text())["enabled"]
    subprocess.run(["node", "scripts/setup.mjs", "disable"], cwd=cwd, env=env, check=True)
    print(feature, "OK:", ", ".join(TOOLS[feature]), flush=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        for name in TOOLS:
            check(Path(tmp), name)
