"""Filesystem and download boundaries shared by the Court import commands."""

import argparse
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = DIST / "data"
BASE = "https://www.supremecourt.gov"
JSON_SUFFIX = ".json"
CACHE_NAME = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}")
APPLICATION_ID = re.compile(r"\d{2}A[1-9]\d{0,5}", re.ASCII)


def application_id(value):
    """Accept canonical application IDs before constructing any filenames."""
    if not isinstance(value, str) or APPLICATION_ID.fullmatch(value) is None:
        raise ValueError(f"Invalid application docket ID: {value!r}")
    return value


def cache_name(value):
    if CACHE_NAME.fullmatch(value) is None:
        raise argparse.ArgumentTypeError(
            "Cache must be a name using letters, digits, - or _; paths are not accepted"
        )
    return value


def add_cache_argument(parser):
    parser.add_argument(
        "--cache",
        type=cache_name,
        default="orders-audit",
        help="Snapshot name under scripts/cache (default: orders-audit); use a new name for a fresh audit",
    )


def checked_directory(path):
    """Reject shared directories and links instead of silently changing permissions."""
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = path.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError(
            f"Cache directory must be owned by you, private (0700), and not a symlink: {path}"
        )


class PrivateCache:
    """Private, flat cache with no-follow reads and atomic, exclusive writes.

    The repository is trusted. All cache directories below it must belong to
    the importing user and exclude other users. File operations use a directory
    descriptor so cached symlinks cannot redirect reads or writes.
    """

    def __init__(self, name="orders-audit", *, root=ROOT):
        name = cache_name(name)
        scripts = root / "scripts"
        if scripts.is_symlink() or not scripts.is_dir():
            raise ValueError(f"Expected a real scripts directory: {scripts}")
        cache_root = scripts / "cache"
        checked_directory(cache_root)
        self.path = cache_root / name
        checked_directory(self.path)

    @contextmanager
    def directory(self):
        descriptor = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            info = os.fstat(descriptor)
            if info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError("Cache directory is no longer private")
            yield descriptor
        finally:
            os.close(descriptor)

    @staticmethod
    def key(value):
        if (
            not isinstance(value, str)
            or re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}", value) is None
        ):
            raise ValueError(f"Invalid cache filename: {value!r}")
        return value

    def read(self, key):
        key = self.key(key)
        with self.directory() as directory:
            try:
                descriptor = os.open(
                    key, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory
                )
            except FileNotFoundError:
                return None
            with os.fdopen(descriptor, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_uid != os.getuid()
                    or info.st_mode & 0o077
                    or info.st_nlink != 1
                ):
                    raise ValueError(f"Unsafe cache file: {key}")
                return stream.read()

    def write(self, key, content):
        key = self.key(key)
        with self.directory() as directory:
            temporary = ".pending-" + secrets.token_hex(16)
            descriptor = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory,
            )
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                # Replace the directory entry itself, never the target of a link.
                os.replace(temporary, key, src_dir_fd=directory, dst_dir_fd=directory)
            finally:
                try:
                    os.unlink(temporary, dir_fd=directory)
                except FileNotFoundError:
                    pass

    def write_json(self, key, value):
        self.write(key, (json.dumps(value, ensure_ascii=False) + "\n").encode())


def output_path(root, relative):
    """Keep generated filenames under the trusted output tree, without links."""
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Unsafe output path: {relative!r}")
    target = root
    for part in path.parts:
        target = target / part
        if target.is_symlink():
            raise ValueError(f"Output path contains a symlink: {target}")
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Output path escapes destination: {relative!r}")
    return target


def write_json(path, value, *, compact=False):
    options = {"separators": (",", ":")} if compact else {"indent": 2}
    path.write_text(json.dumps(value, ensure_ascii=False, **options) + "\n")


def read_data(name, *, data=DATA):
    return json.loads(output_path(data, name + JSON_SUFFIX).read_text())


def official_url(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "www.supremecourt.gov"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ValueError(f"Expected an official Court HTTPS URL: {url!r}")
    return url


def download(url, *, timeout=60):
    """Receive bytes on stdout; curl never opens a caller-supplied output path."""
    result = subprocess.run(
        [
            "curl",
            "--silent",
            "--show-error",
            "--retry",
            "2",
            "--max-time",
            str(timeout),
            "--proto",
            "=https",
            "--write-out",
            "\n%{http_code}",
            "--url",
            official_url(url),
        ],
        check=True,
        capture_output=True,
        timeout=timeout * 3 + 15,
    )
    body, _, status = result.stdout.rpartition(b"\n")
    return body, status.decode("ascii")


def fetch(cache, url):
    official_url(url)
    extension = ".pdf" if urlsplit(url).path.lower().endswith(".pdf") else ".html"
    key = hashlib.sha256(url.encode()).hexdigest() + extension
    content = cache.read(key)
    if content is None:
        content, status = download(url)
        if status != "200":
            raise ValueError(f"HTTP {status}: {url}")
        if extension == ".pdf" and not content.startswith(b"%PDF-"):
            raise ValueError(f"Response is not a PDF: {url}")
        cache.write(key, content)
    return content
