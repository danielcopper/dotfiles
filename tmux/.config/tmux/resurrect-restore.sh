#!/usr/bin/env bash
# tmux-continuum's auto-restore entry point (@resurrect-restore-script-path).
#
# continuum starts the restore in the background when a server loads the
# config, and runs it one second later. A `tmux attach` with no server running
# starts a server only to find no session, and that server exits at the end of
# its config load. A restore already running by then outlives it, and
# resurrect's restore.sh, finding no server, starts a new one for the first
# session it restores. Loading the config in that second server starts a
# second restore, and both restores then build the same sessions in the same
# server.
#
# So the restore waits until the server that started it has a session (the one
# `tmux` or `tmux new-session` creates once the config is loaded) and gives up
# when that server exits first. A `tmux attach` with no server therefore never
# restores; the next `tmux` does. The wait gives up after 60 seconds as well,
# in case a server stays up without a session. The server's pid is the second
# field of $TMUX ("<socket path>,<pid>,<session>").

set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pid="$(cut -d, -f2 <<<"${TMUX:-}")"

[ -n "$pid" ] || exit 0
for _ in $(seq 300); do
  kill -0 "$pid" 2>/dev/null || exit 0
  if [ -n "$(tmux list-sessions -F x 2>/dev/null)" ]; then
    exec "$here/plugins/tmux-resurrect/scripts/restore.sh"
  fi
  sleep 0.2
done
