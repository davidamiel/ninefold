"""Process reviewed recording jobs sequentially, reusing completed audio work."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

from generate import ROOT, load_job, local_path
from prepare import prepare


def reviewed_jobs(paths):
    for path in paths:
        path = local_path(path, ROOT/'recordings')
        if not path.exists():
            continue
        candidates = sorted(path.rglob('*.json')) if path.is_dir() else [path]
        for candidate in candidates:
            candidate = local_path(candidate, ROOT/'recordings')
            try:
                value = json.loads(candidate.read_text())
            except json.JSONDecodeError:
                continue  # Another reviewer may still be finishing this draft.
            if isinstance(value, dict) and value.get('reviewed') is True:
                job, identifier = load_job(candidate)
                yield candidate, job, identifier


def run_command(python, script, path, options, log):
    print('Running', script, path.name, ' '.join(options), flush=True)
    subprocess.run([str(python), str(ROOT/'recordings'/script), str(path), *options],
                   cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)


def process(path, generation_python, alignment_python, engine, alignment_device, log, parallel_align=False):
    commands = [(sys.executable, 'prepare.py', []),
                (generation_python, 'generate.py', ['--voice', 'female', '--resume', '--engine', engine]),
                (generation_python, 'generate.py', ['--voice', 'male', '--resume', '--engine', engine])]
    for python, script, options in commands:
        run_command(python, script, path, options, log)
    alignment = [[alignment_python, 'align.py', path, ['--voice', voice, '--device', alignment_device], log]
                 for voice in ('female', 'male')]
    if parallel_align:
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = [pool.submit(run_command, *command) for command in alignment]
            for result in pending:
                result.result()
    else:
        for command in alignment:
            run_command(*command)
    run_command(sys.executable, 'stage.py', path, [], log)


def pending_job(paths, attempted, inventory):
    for path, job, identifier in reviewed_jobs(paths):
        if attempted.get(identifier) == hashlib.sha256(path.read_bytes()).hexdigest():
            continue
        try:
            body, _ = prepare(job)
        except (ValueError, KeyError, IndexError):
            return path, identifier  # The normal stage log records this failure.
        if inventory.get(identifier, {}).get('version') != body['version']:
            return path, identifier
    return None


def save_status(path, status):
    temporary = local_path(path.with_suffix('.tmp'), path.parent)
    temporary.write_text(json.dumps(status, indent=2)+'\n')
    temporary.replace(path)


def run_batch(args, folder):
    status_path = local_path(folder/'batch-status.json', folder)
    status = json.loads(status_path.read_text()) if status_path.exists() else {}
    attempted = {}
    while True:
        if (folder/'batch.stop').exists():
            break
        retry = folder/'batch.retry'
        if retry.exists():
            attempted.clear()
            retry.unlink()
        inventory = json.loads((ROOT/'dist/data/prepared-documents.json').read_text())
        pending = pending_job(args.jobs, attempted, inventory)
        if not pending:
            if args.watch:
                time.sleep(3)
                continue
            break
        path, identifier = pending
        attempted[identifier] = hashlib.sha256(path.read_bytes()).hexdigest()
        log_path = local_path(folder/(identifier+'-batch.log'), folder)
        status[identifier] = {'state': 'running', 'updatedAt': datetime.now(timezone.utc).isoformat()}
        save_status(status_path, status)
        try:
            with log_path.open('w') as log:
                process(path, args.generation_python, args.alignment_python, args.engine, args.alignment_device, log, args.parallel_align)
            status[identifier]['state'] = 'complete'
        except subprocess.CalledProcessError as error:
            status[identifier].update(state='failed', error=str(error), log=str(log_path.relative_to(ROOT)))
        status[identifier]['updatedAt'] = datetime.now(timezone.utc).isoformat()
        save_status(status_path, status)
        print(identifier, status[identifier]['state'], flush=True)
    if any(status[identifier]['state'] == 'failed' for identifier in attempted):
        raise SystemExit('Some jobs need review; see work/recordings/batch-status.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jobs', nargs='+', type=Path)
    parser.add_argument('--generation-python', type=Path, default=Path(sys.executable))
    parser.add_argument('--alignment-python', type=Path, default=Path(sys.executable))
    parser.add_argument('--engine', choices=['onnx', 'mlx'], default='onnx')
    parser.add_argument('--alignment-device', choices=['cpu', 'mps'], default='cpu')
    parser.add_argument('--parallel-align', action='store_true', help='Align the two independent voices concurrently before staging')
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    folder = local_path(ROOT/'work/recordings', ROOT/'work')
    folder.mkdir(parents=True, exist_ok=True)
    lock_path = local_path(folder/'batch.lock', folder)
    with lock_path.open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('Another recording batch is running')
        run_batch(args, folder)


if __name__ == '__main__':
    main()
