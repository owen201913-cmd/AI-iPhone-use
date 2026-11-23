import base64
import io
import plistlib
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ios"))
from personalize import personalize


class PersonalizationTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / "test.ipa"
        self.target = self.root / "paired.ipa"
        self.key = self.root / "test.pub"
        key = bytes.fromhex("0000000b") + b"ssh-ed25519" + bytes.fromhex("00000020") + bytes(range(32))
        self.key.write_text("ssh-ed25519 " + base64.b64encode(key).decode())

    def build(self, include_root=True, valid_root=True):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz"):
            pass
        with zipfile.ZipFile(self.source, "w") as archive:
            archive.writestr("Payload/iSH.app/iSH", b"test executable")
            archive.writestr("Payload/iSH.app/Info.plist", plistlib.dumps({"CFBundleIdentifier": "org.iphoneuse.workspace"}))
            if include_root:
                archive.writestr("Payload/iSH.app/root.tar.gz", data.getvalue() if valid_root else b"broken")

    def test_incomplete_build_never_publishes_an_output(self):
        self.build(include_root=False)
        with self.assertRaises(ValueError):
            personalize(self.source, self.target, self.key)
        self.assertFalse(self.target.exists())

    def test_failed_build_can_be_retried_without_overwriting_a_completed_build(self):
        self.build(valid_root=False)
        with self.assertRaises(tarfile.ReadError):
            personalize(self.source, self.target, self.key)
        self.assertFalse(self.target.exists())
        self.build()
        bundle = "org.iphoneuse.workspace.ABC123"
        personalize(self.source, self.target, self.key, bundle)
        before = self.target.read_bytes()
        with zipfile.ZipFile(self.target) as archive:
            plist = plistlib.loads(archive.read("Payload/iSH.app/Info.plist"))
            self.assertIn(bundle + ".workspace.batch", plist["BGTaskSchedulerPermittedIdentifiers"])
            with tarfile.open(fileobj=io.BytesIO(archive.read("Payload/iSH.app/root.tar.gz"))) as root:
                self.assertEqual(root.extractfile("etc/workspace-authorized.pub").read().decode().strip(), self.key.read_text())
                self.assertEqual(root.getmember("usr/local/sbin/workspace-pair").mode, 0o755)
        with self.assertRaises(FileExistsError):
            personalize(self.source, self.target, self.key)
        self.assertEqual(self.target.read_bytes(), before)
