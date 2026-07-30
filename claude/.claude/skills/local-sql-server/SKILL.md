---
name: local-sql-server
description: Connect to the local SQL Server 2022 dev container and run queries with sqlcmd. Use for any local SQL Server / sqlcmd / T-SQL work on this machine.
---

Local SQL Server (dev container):

- Container: `sqlserver2022` · Host: `localhost:1433` · User: `sa`
- Password is exported as `SQLCMDPASSWORD` from untracked `~/.bashrc.secrets` (sourced by shared `.bashrc`) — no `-P` flag needed.
- Use `sqlcmd` directly: `sqlcmd -S localhost -U sa -C`
- Single quotes in `-Q` work normally: `-Q "SELECT * FROM t WHERE name = 'alice'"`
- Never log or echo the password — mask it in any output.
