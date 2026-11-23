"""Resolve a USB device on the local Apple Mobile Device service, without printing its serial."""
import hashlib
import plistlib
import socket
import struct
import sys


def read_exact(sock, size):
    result = bytearray()
    while len(result) < size:
        part = sock.recv(size - len(result))
        if not part:
            raise OSError("USB service disconnected")
        result.extend(part)
    return bytes(result)


def resolve_device(expected):
    payload = plistlib.dumps(dict(MessageType="ListDevices", ProgName="Iphone use",
                                  ClientVersionString="Iphone use/1"))
    with socket.create_connection(("127.0.0.1", 27015), timeout=3) as sock:
        sock.sendall(struct.pack("<4I", 16 + len(payload), 1, 8, 1) + payload)
        size, version, kind, tag = struct.unpack("<4I", read_exact(sock, 16))
        if (version, kind, tag) != (1, 8, 1) or not 16 < size <= 262144:
            raise ValueError("Invalid USB service reply")
        devices = plistlib.loads(read_exact(sock, size - 16))["DeviceList"]
    matches = []
    for item in devices:
        props = item["Properties"]
        if props.get("ConnectionType") != "USB" or not props.get("SerialNumber"):
            continue
        fingerprint = hashlib.sha256(props["SerialNumber"].encode()).hexdigest()
        if not expected or expected == fingerprint:
            matches.append((item["DeviceID"], fingerprint))
    if len(matches) != 1:
        raise ValueError("Connect exactly one matching USB iPhone")
    return matches[0]


if __name__ == "__main__":
    try:
        print(*resolve_device(sys.argv[1] if len(sys.argv) > 1 else ""))
    except (KeyError, OSError, ValueError) as error:
        sys.exit(str(error))
