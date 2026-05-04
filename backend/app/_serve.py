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

import os
import socket

import uvicorn


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
