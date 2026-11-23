"""Prepare a local copy of the unsigned build for the authorized USB workspace."""
import argparse
import base64
import io
import os
import plistlib
import re
import tarfile
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path


def regular_file(archive, name, data, mode):
    member = tarfile.TarInfo(name)
    member.mode = mode
    member.size = len(data)
    archive.addfile(member, io.BytesIO(data))


@contextmanager
def staged_archive(destination):
    if destination.exists():
        raise FileExistsError(destination)
    with tempfile.TemporaryDirectory(dir=destination.parent) as tmp:
        staged = Path(tmp) / "build.ipa"
        with zipfile.ZipFile(staged, "x") as archive:
            yield archive
        if os.name == "nt":
            os.rename(staged, destination)  # Windows rejects an existing target.
        else:
            os.link(staged, destination)


def personalize(source, destination, public_key, signed_bundle_id=None):
    fields = public_key.read_text().strip().split()
    if len(fields) < 2 or fields[0] != "ssh-ed25519":
        raise ValueError("Expected an Ed25519 public key")
    blob = base64.b64decode(fields[1], validate=True)
    if len(blob) != 51 or blob[:19] != b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20":
        raise ValueError("Invalid public key")
    key = (fields[0] + " " + fields[1] + "\n").encode()
    source_script = Path(__file__).with_name("workspace-pair.sh").read_bytes().replace(b"\r\n", b"\n")
    profile = b'if [ "$(id -u)" = 0 ] && [ -t 1 ]; then /usr/local/sbin/workspace-pair; fi\n'
    prefix = "Payload/iSH.app/"
    with zipfile.ZipFile(source) as original, staged_archive(destination) as result:
        names = original.namelist()
        required = [prefix + name for name in ("Info.plist", "root.tar.gz", "iSH")]
        if any(names.count(name) != 1 for name in required):
            raise ValueError("Expected one iSH executable, Info.plist and root.tar.gz in the build")
        info = plistlib.loads(original.read(prefix + "Info.plist"))
        if info["CFBundleIdentifier"] != "org.iphoneuse.workspace":
            raise ValueError("Unexpected application identifier")
        base = info["CFBundleIdentifier"]
        if signed_bundle_id and not re.fullmatch(re.escape(base) + r"(?:\.[A-Za-z0-9]+)?", signed_bundle_id):
            raise ValueError("The signing identifier does not belong to this build")
        for entry in original.infolist():
            data = original.read(entry)
            if signed_bundle_id and entry.filename == prefix + "Info.plist":
                info["BGTaskSchedulerPermittedIdentifiers"] = [
                    signed_bundle_id + ".workspace.*", signed_bundle_id + ".workspace.batch"
                ]
                data = plistlib.dumps(info, fmt=plistlib.FMT_BINARY, sort_keys=False)
            if entry.filename == prefix + "root.tar.gz":
                output = io.BytesIO()
                with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as root, tarfile.open(fileobj=output, mode="w:gz") as new:
                    additions = {"etc/workspace-authorized.pub", "usr/local/sbin/workspace-pair", "etc/profile.d/workspace-usb.sh"}
                    for item in root:
                        if item.name.removeprefix("./") in additions:
                            raise ValueError("Unexpected existing onboarding file")
                        new.addfile(item, root.extractfile(item) if item.isfile() else None)
                    regular_file(new, "etc/workspace-authorized.pub", key, 0o644)
                    regular_file(new, "usr/local/sbin/workspace-pair", source_script, 0o755)
                    regular_file(new, "etc/profile.d/workspace-usb.sh", profile, 0o644)
                data = output.getvalue()
            result.writestr(entry, data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("source", "destination", "public_key"):
        parser.add_argument(arg, type=Path)
    parser.add_argument("--signed-bundle-id")
    args = parser.parse_args()
    personalize(args.source, args.destination, args.public_key, args.signed_bundle_id)
