"""Contrôle en lecture seule de la release réellement exécutée par les workers."""
import argparse
import json
import os
import pathlib
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--site-root', required=True)
parser.add_argument('--expected-sha', required=True)
parser.add_argument('--minimum-workers', type=int, default=4)
args = parser.parse_args()
site = pathlib.Path(args.site_root).resolve()
current = (site / 'current').resolve()
sha = subprocess.check_output(['git', '-C', str(current), 'rev-parse', 'HEAD'], text=True).strip()
workers = []
for entry in pathlib.Path('/proc').iterdir():
    if not entry.name.isdigit():
        continue
    try:
        command = (entry / 'cmdline').read_bytes().decode(errors='replace').split('\0')
        if not any('queue:work' in part or 'horizon:work' in part for part in command):
            continue
        cwd = pathlib.Path(os.readlink(entry / 'cwd'))
        if site not in cwd.parents and cwd != site:
            continue
        workers.append({'pid': int(entry.name), 'release': cwd.name, 'current': cwd == current})
    except (OSError, PermissionError):
        continue
ok = sha == args.expected_sha and len(workers) >= args.minimum_workers and all(row['current'] for row in workers)
print(json.dumps({'ok': ok, 'sha': sha, 'release': current.name, 'workers': workers}))
sys.exit(0 if ok else 1)
