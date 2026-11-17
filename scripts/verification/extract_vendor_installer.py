#!/usr/bin/env python3
"""Extract the pinned official XG5000 installer without running it.

Python 3.11+; standard library only. Output must be a new directory outside Git.
Adapted from https://github.com/gpt-cmdr/ras-commander/blob/main/containers/hecras-unsteady/extract_installer.py
The ISSetupStream v4 archive decoding follows ISx by YX Hao/lifenjoiner:
https://github.com/Coldblackice/InstallShield-installer-extractor-ISx/tree/098e866fa5341db4424d3831d40943c01b88aefe

MIT License
Copyright (c) 2017 lifenjoiner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import argparse
import hashlib
import json
import mmap
from pathlib import Path, PureWindowsPath
import shutil
import struct
import tempfile
import zlib


# Pinned official XG5000 installer: installer SHA-256 ->
# (MSI member name, MSI SHA-256 or None when only the installer is pinned).
VERIFIED_INSTALLERS = {
    "c13e3f0cf6179fe1127e9ec2aeb7fc3d9781fc808a34f44510d724f406757746": (
        "XG5000.msi", "f3ac3f3aeb2fb4bc6339d6a36e13df1611699c93d22be12d99c043b507721cb7"),
}
CHUNK = 1024 * 1024
MAX_MEMBER_BYTES = 2 * 1024 * 1024 * 1024


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _members(data):
    """Read bounded PE and ISSetupStream metadata; return flat archive members."""
    _require(data[:2] == b"MZ", "Installer is not a PE file")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    _require(pe + 24 <= len(data) and data[pe:pe + 4] == b"PE\0\0", "Invalid PE header")
    count = struct.unpack_from("<H", data, pe + 6)[0]
    optional_size = struct.unpack_from("<H", data, pe + 20)[0]
    sections = pe + 24 + optional_size
    _require(0 < count <= 96 and sections + count * 40 <= len(data), "Invalid PE sections")
    payload = max(sum(struct.unpack_from("<II", data, sections + i * 40 + 16))
                  for i in range(count))
    _require(payload + 46 <= len(data), "Missing installer payload")
    signature, count, kind = struct.unpack_from("<14sHI", data, payload)
    _require(signature == b"ISSetupStream\0" and 0 < count <= 64 and kind == 4,
             "Expected an ISSetupStream v4 archive")
    offset = payload + 46
    members = []
    names = set()
    for _ in range(count):
        _require(offset + 48 <= len(data), "Truncated archive member header")
        name_bytes, flags, _, length, _, compressed = struct.unpack_from("<II2sI8sH", data, offset)
        offset += 48  # v4 adds 24 reserved bytes to the 24-byte attributes
        _require(0 < name_bytes < 520 and name_bytes % 2 == 0 and flags == 6 and compressed == 1,
                 "Unsupported member encoding")
        _require(offset + name_bytes + length <= len(data), "Truncated archive member")
        name = data[offset:offset + name_bytes].decode("utf-16-le").rstrip("\0")
        offset += name_bytes
        path = PureWindowsPath(name)
        _require(name and path.name == name and not path.is_absolute()
                 and not any(c in name for c in ':<>"|?*\0') and name not in {".", ".."}
                 and name.casefold() not in names, "Unsafe or duplicate archive member name")
        names.add(name.casefold())
        members.append((name, offset, length))
        offset += length
    return members


def _extract_member(data, name, offset, length, target):
    seed = name.encode("utf-8")
    key = bytes(value ^ (0x13, 0x35, 0x86, 0x07)[i % 4] for i, value in enumerate(seed))
    block_key = bytes(key[i % len(key)] for i in range(1024))
    chunk_key = block_key * (CHUNK // 1024)
    translation = bytes((~((value << 4) | (value >> 4))) & 255 for value in range(256))
    decoder = zlib.decompressobj()
    digest = hashlib.sha256()
    size = crc = 0
    with target.open("xb") as stream:
        for position in range(0, length, CHUNK):
            block = data[offset + position:offset + min(position + CHUNK, length)].translate(translation)
            decoded = (int.from_bytes(block, "little")
                       ^ int.from_bytes(chunk_key[:len(block)], "little")).to_bytes(len(block), "little")
            plain = decoder.decompress(decoded, MAX_MEMBER_BYTES - size + 1)
            _require(size + len(plain) <= MAX_MEMBER_BYTES, "Extracted member exceeds size limit")
            stream.write(plain)
            digest.update(plain)
            crc = zlib.crc32(plain, crc)
            size += len(plain)
        tail = decoder.flush()
        _require(size + len(tail) <= MAX_MEMBER_BYTES, "Extracted member exceeds size limit")
        stream.write(tail)
        digest.update(tail)
        crc = zlib.crc32(tail, crc)
        size += len(tail)
    _require(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,
             "Incomplete or invalid compressed archive member")
    return {"name": name, "payload_offset": offset, "compressed_bytes": length,
            "size_bytes": size, "sha256": digest.hexdigest(), "crc32": f"{crc:08x}"}


def extract_installer(installer, output):
    installer = Path(installer).resolve(strict=True)
    output = Path(output).absolute()
    _require(not output.exists(), "Output must be a new directory")
    checkout = Path(__file__).resolve().parents[2]
    _require(not output.resolve().is_relative_to(checkout), "Keep vendor files outside the source checkout")
    with installer.open("rb") as stream:
        installer_sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
    _require(installer_sha256 in VERIFIED_INSTALLERS,
             "Installer checksum does not match the pinned official XG5000 release")
    msi_name, msi_sha256 = VERIFIED_INSTALLERS[installer_sha256]
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="." + output.name + "-", dir=output.parent))
    try:
        with installer.open("rb") as stream, mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as data:
            records = [_extract_member(data, name, offset, length, temporary / name)
                       for name, offset, length in _members(data) if name.lower().endswith(".msi")]
        msi = next((record for record in records if record["name"] == msi_name), None)
        _require(msi is not None, f"Installer does not contain {msi_name}")
        _require(msi_sha256 is None or msi["sha256"] == msi_sha256, "Extracted MSI checksum mismatch")
        receipt = {"installer_sha256": installer_sha256, "format": "ISSetupStream v4",
                   "operation": "archive extraction only", "members": records}
        (temporary / "extraction.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        temporary.rename(output)
    except BaseException:
        _require(temporary.resolve().parent == output.parent.resolve(), "Unexpected temporary directory")
        shutil.rmtree(temporary)
        raise
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--installer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    print(extract_installer(**vars(parser.parse_args())))


if __name__ == "__main__":
    main()
