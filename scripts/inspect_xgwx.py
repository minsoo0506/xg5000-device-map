"""Inspect XGWX structure locally without modifying the project.

Usage: python3 scripts/inspect_xgwx.py project.xgwx
This reports container metadata; it does not infer ladder relationships.
"""
import argparse
import bz2
import base64
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zlib

LIMIT = 64 * 1024 * 1024


def inspect(path):
    if path.stat().st_size > LIMIT:
        raise ValueError('Project exceeds the 64 MiB input limit')
    raw = path.read_bytes()
    if raw[:2] != b'XG':
        raise ValueError('Not an XG project container')
    offset = raw.find(b'\x1f\x8b\x08', 2, 4096)
    if offset < 0:
        raise ValueError('No supported gzip project payload found')
    decoder = zlib.decompressobj(31)
    xml = decoder.decompress(raw[offset:], LIMIT + 1)
    if len(xml) > LIMIT or not decoder.eof:
        raise ValueError('Truncated project or decompressed size limit exceeded')
    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise ValueError('XML entity declarations are not supported')
    root = ET.fromstring(xml)
    if root.tag != 'Project':
        raise ValueError('Expected Project XML root')
    result = {'name': (root.text or '').strip(), 'fileVersion': root.get('FileVer'),
              'gzipOffset': offset, 'configurations': [], 'relationshipAnalysis': 'not implemented'}
    for config in root.iter('Configuration'):
        item = {'name': (config.text or '').strip(), 'typeCode': config.get('Type'), 'programs': []}
        for program in config.iter('Program'):
            data = program.find('.//ProgramData')
            entry = {'name': (program.text or '').strip(), 'task': program.get('Task'),
                     'encrypted': bool(program.get('Encrytption'))}
            if data is not None and not entry['encrypted']:
                payload = base64.b64decode(''.join((data.text or '').split()), validate=True)
                if data.get('Compressed') == '1':
                    dec = bz2.BZ2Decompressor()
                    payload = dec.decompress(payload, max_length=LIMIT + 1)
                    if len(payload) > LIMIT or not dec.eof:
                        raise ValueError('Program exceeds limit or is truncated')
                entry.update(version=data.get('Version'), projectType=data.get('ProjectType'),
                             decodedBytes=len(payload))
            item['programs'].append(entry)
        result['configurations'].append(item)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect(args.project), ensure_ascii=False, indent=2))
    except (ValueError, OSError, ET.ParseError, zlib.error) as error:
        parser.exit(1, f'Cannot inspect project: {error}\n')
