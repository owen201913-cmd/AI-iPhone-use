"""Build the three public source packages or check that committed ZIPs match."""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
WEB = "https://github.com/owen201913-cmd/AI-iPhone-use/blob/main/"
COMMON = (
    "LICENSE", "NOTICE.md", "server.mjs", "install.ps1", "scripts/setup.mjs",
    "lib/paths.mjs", "lib/features.mjs", "lib/permissions.mjs", "lib/host-lifecycle.mjs",
    "lib/call-trace.mjs", "lib/transport-trace.mjs", "lib/redact.mjs", "lib/tool-performance.mjs",
    "lib/mcp-content-size.mjs",
)
MODULES = {
    "pinky": ("lib/pinky-bridge.mjs", "lib/pinky-result.mjs", "lib/pinky-launch-error.mjs",
              "lib/phone-navigation.mjs", "lib/mcp-phone.mjs"),
    "ish": ("lib/usb-device.mjs", "lib/ish-usb.mjs", "lib/ish-receipts.mjs", "lib/ish-availability.mjs",
            "lib/phone-workspace.mjs", "scripts/usb-device.py", "scripts/pair-ish-usb.mjs",
            "ios/workspace.patch", "ios/workspace-pair.sh", "ios/personalize.py", "ios/ISH-LICENSE.md", "ios/LICENSE.IOS"),
    "usb": ("lib/mcp-iphone-usb.mjs", "scripts/iphone-usb-ui.py", "scripts/usb-device.py",
            "lib/usb-device.mjs", "requirements.txt"),
}
LABELS = {"pinky": "Pinky", "ish": "iSH", "usb": "USB"}
DESCRIPTIONS = {
    "pinky": "Operate a paired iPhone through Pinky.",
    "ish": "Run commands and background jobs in a paired iSH workspace.",
    "usb": "See and control an iPhone over a paired USB connection.",
}


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def source(name):
    return (PROJECT / name).read_text(encoding="utf-8")


def package_files(feature):
    names = (*COMMON, *MODULES[feature], f"lib/backends/{feature}.mjs", f"scripts/configure/{feature}.mjs")
    files = {name: source(name) for name in names}
    manifest = json.loads(source("package.json"))
    manifest["iphoneUseFeature"] = feature
    manifest["scripts"].pop("test", None)
    lock = source("package-lock.json")
    if feature != "ish":
        del manifest["dependencies"]["ssh2"]
        with tempfile.TemporaryDirectory() as folder:
            stage = Path(folder)
            (stage / "package.json").write_text(json_text(manifest), encoding="utf-8")
            (stage / "package-lock.json").write_text(lock, encoding="utf-8")
            npm = "npm.cmd" if os.name == "nt" else "npm"
            subprocess.run([npm, "install", "--package-lock-only", "--offline", "--ignore-scripts",
                            "--no-audit", "--no-fund"], cwd=stage, check=True, stdout=subprocess.DEVNULL)
            lock = (stage / "package-lock.json").read_text(encoding="utf-8")
        if "node_modules/ssh2" in json.loads(lock)["packages"]:
            raise ValueError("Unexpected iSH dependency in " + feature)
    files["package.json"] = json_text(manifest)
    files["package-lock.json"] = json_text(json.loads(lock))

    descriptor = json.loads(source("plugin/.codex-plugin/plugin.json"))
    descriptor["name"] = "iphone-use-" + feature
    descriptor["description"] = descriptor["interface"]["shortDescription"] = DESCRIPTIONS[feature]
    descriptor["interface"]["displayName"] = "AI-iPhone-use · " + LABELS[feature]
    files["plugin/.codex-plugin/plugin.json"] = json_text(descriptor)
    guide = source(f"docs/{feature}.md")
    files["README.md"] = guide.replace("](../README.md", "](" + WEB + "README.md").replace("](guide.md", "](" + WEB + "docs/guide.md")
    files["MCP.md"] = source("docs/MCP.md")
    if feature != "ish":
        files["NOTICE.md"] = files["NOTICE.md"].replace("](ios/", "](" + WEB + "ios/")
    return files


def make_zip(feature):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, content in sorted(package_files(feature).items()):
            info = zipfile.ZipInfo(f"iphone-use-{feature}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content.encode("utf-8"))
    return buf.getvalue()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = PROJECT / "downloads"
    if not args.check:
        output.mkdir(exist_ok=True)
    for feature in MODULES:
        path = output / f"iphone-use-{feature}.zip"
        data = make_zip(feature)
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise SystemExit(f"Rebuild {path.name} with scripts/build-downloads.py")
        else:
            path.write_bytes(data)
        print(f"{path.name}: {len(data)} bytes")
