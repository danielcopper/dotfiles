#!/usr/bin/env python3
"""Parse database connection targets from command strings.

Tool-agnostic. No Claude Code dependencies.
Handles sqlcmd, psql, mysql CLI patterns and ADO.NET connection strings.
"""

import re

# ADO.NET connection string host keys (case-insensitive)
_CONN_STR_HOST_KEYS = re.compile(
    r"(?:Server|Data\s*Source|Address|Addr|Network\s*Address)\s*=\s*([^;]+)",
    re.IGNORECASE,
)

# CLI flag patterns
_SQLCMD_S = re.compile(r"\bsqlcmd\b.*?\s-S\s+(\S+)", re.IGNORECASE)
_PSQL_H = re.compile(r"\bpsql\b.*?\s-h\s+(\S+)", re.IGNORECASE)
_PSQL_P = re.compile(r"\bpsql\b.*?\s-p\s+(\d+)", re.IGNORECASE)
_MYSQL_H = re.compile(r"\bmysql\b.*?\s-h\s+(\S+)", re.IGNORECASE)
_MYSQL_P = re.compile(r"\bmysql\b.*?\s-P\s+(\d+)", re.IGNORECASE)

# Docker exec pattern: docker exec [-flags] <container> [path/]sqlcmd
_DOCKER_EXEC_SQLCMD = re.compile(
    r"^docker\s+exec\s+(?:-[a-zA-Z]+\s+)*(\S+)\s+(?:\S+/)?sqlcmd\b",
    re.IGNORECASE,
)


def _parse_sqlserver_host(raw):
    """Parse SQL Server host string into (host, port).

    Handles:
    - host,port (SQL Server comma notation)
    - host\\instance
    - tcp:host,port
    - np:\\.\\pipe\\... (named pipe = local)
    """
    raw = raw.strip()

    # Named pipe — always local
    if raw.lower().startswith("np:"):
        return ".", None

    # tcp: prefix
    if raw.lower().startswith("tcp:"):
        raw = raw[4:]

    # Port notation: host,port
    if "," in raw:
        parts = raw.rsplit(",", 1)
        host = parts[0].strip()
        try:
            port = int(parts[1].strip())
        except ValueError:
            port = None
        return host, port

    # Instance notation: host\instance
    if "\\" in raw:
        host = raw.split("\\", 1)[0].strip()
        return host, None

    return raw, None


def extract_db_targets(command):
    """Extract all database host references from a command string.

    Returns list of {"host": str, "port": int|None, "source": str}.
    Empty list means no DB targets found (or docker exec exemption).
    """
    targets = []

    # Docker exec exemption: docker exec <container> sqlcmd without -S
    docker_match = _DOCKER_EXEC_SQLCMD.search(command)
    if docker_match:
        # Check if there's an explicit -S flag after the docker exec part
        after_docker = command[docker_match.end():]
        s_match = re.search(r"\s-S\s+(\S+)", after_docker, re.IGNORECASE)
        if s_match:
            # Has explicit -S, extract and check the host
            host, port = _parse_sqlserver_host(s_match.group(1))
            targets.append({"host": host, "port": port, "source": "sqlcmd -S (via docker exec)"})
        # No -S flag = connecting to container-local instance, always OK
        return targets

    # sqlcmd -S host
    for m in _SQLCMD_S.finditer(command):
        host, port = _parse_sqlserver_host(m.group(1))
        targets.append({"host": host, "port": port, "source": "sqlcmd -S"})

    # psql -h host [-p port]
    for m in _PSQL_H.finditer(command):
        host = m.group(1).strip()
        port = None
        pm = _PSQL_P.search(command)
        if pm:
            try:
                port = int(pm.group(1))
            except ValueError:
                pass
        targets.append({"host": host, "port": port, "source": "psql -h"})

    # mysql -h host [-P port]
    for m in _MYSQL_H.finditer(command):
        host = m.group(1).strip()
        port = None
        pm = _MYSQL_P.search(command)
        if pm:
            try:
                port = int(pm.group(1))
            except ValueError:
                pass
        targets.append({"host": host, "port": port, "source": "mysql -h"})

    # ADO.NET connection strings in the command
    for m in _CONN_STR_HOST_KEYS.finditer(command):
        raw = m.group(1).strip()
        host, port = _parse_sqlserver_host(raw)
        targets.append({"host": host, "port": port, "source": "connection string"})

    return targets


def is_local_host(host, allowed_hosts):
    """Check if a host is in the allowed (local) list.

    String matching only — no DNS resolution.
    """
    host_lower = host.lower().strip()
    for allowed in allowed_hosts:
        if host_lower == allowed.lower():
            return True
    return False
