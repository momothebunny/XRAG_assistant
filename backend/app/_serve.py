"""Production launcher for the FastAPI app.

Creates a single dual-stack TCP socket (IPv4 + IPv6) and hands it to
Uvicorn. This is required on Fly.io because:

* Fly's internal app-to-app network (``*.internal`` hostnames) is
  IPv6-only ULA, so the listener must accept IPv6.
* Fly's edge proxy reaches the machine via an IPv4 NAT bridge
  (``172.19.x.x``), so the listener must ALSO accept IPv4.

Binding ``--host ::`` alone is not enough on this Python/Linux build —
``IPV6_V6ONLY`` ends up set, and IPv4 connections are rejected. We
explicitly clear that flag here.
"""

from __future__ import annotations

import logging
import os
import shutil
import socket
from pathlib import Path

import uvicorn


_logger = logging.getLogger("app._serve")


def _seed_data_dir() -> None:
    """Copy bundled seed data into XRAG_DATA_DIR on first launch.

    The Docker image bakes the repo's ``backend/data`` snapshot into
    ``XRAG_SEED_DATA_DIR`` (default ``/app/seed_data``). On startup we
    walk that tree and copy each file into ``XRAG_DATA_DIR`` (default
    ``/data``) ONLY IF the destination does not already exist. That way:

      * Fresh deploys get the blueprint canvas flows, registry seeds,
        bootstrap knowledge document, etc. — the SPA isn't broken on
        first load.
      * User-modified files (saved flows, registered users, uploaded
        documents) are NEVER overwritten on subsequent restarts.
      * Persistent-storage mounts behave the same way: the first time
        the volume is mounted (empty) the seeds populate it; later
        starts find the files already present and skip them.
    """
    seed_dir_str = os.environ.get("XRAG_SEED_DATA_DIR")
    if not seed_dir_str:
        return
    seed_dir = Path(seed_dir_str)
    if not seed_dir.is_dir():
        return
    data_dir = Path(os.environ.get("XRAG_DATA_DIR") or "/data")
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # noqa: BLE001
        _logger.warning("Could not create data dir %s: %s", data_dir, exc)
        return

    copied = 0
    for src in seed_dir.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(seed_dir)
        dst = data_dir / rel
        if dst.exists():
            continue
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
        except OSError as exc:  # noqa: BLE001
            _logger.warning("Failed to seed %s -> %s: %s", src, dst, exc)
    if copied:
        _logger.info("Seeded %d file(s) from %s into %s", copied, seed_dir, data_dir)


def _make_dual_stack_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    # Accept both IPv4 (mapped) and IPv6 connections on the same socket.
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    sock.bind(("::", port))
    sock.listen(128)
    sock.set_inheritable(True)
    return sock


def main() -> None:
    logging.basicConfig(level=os.environ.get("UVICORN_LOG_LEVEL", "info").upper())
    _seed_data_dir()
    port = int(os.environ.get("PORT", "8001"))
    sock = _make_dual_stack_socket(port)
    config = uvicorn.Config(
        "app.main:app",
        fd=sock.fileno(),
        log_level=os.environ.get("UVICORN_LOG_LEVEL", "info"),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
    uvicorn.Server(config).run()


if __name__ == "__main__":
    main()
