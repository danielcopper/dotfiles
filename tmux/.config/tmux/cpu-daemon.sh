#!/usr/bin/env bash
# Background CPU sampler for the tmux status line.
#
# Computes instantaneous CPU utilisation from /proc/stat deltas and writes it
# into the tmux user option @mycpu (e.g. "12%"). The status line then reads
# #{@mycpu} — a plain option lookup, no fork — instead of forking tmux-cpu's
# cpu_percentage.sh + cpu_fg_color.sh + cpu_bg_color.sh (~250ms total) on every
# redraw. tmux's own status-interval (set to match this in tmux.conf) repaints
# the bar and picks up the new value; we don't call refresh-client ourselves
# (it does not reliably push a redraw to an attached client from out here).
#
# Launched once from tmux.conf:  run-shell -b "~/.config/tmux/cpu-daemon.sh 1"
# Sample interval in seconds may be passed as $1 (match status-interval).

interval="${1:-1}"
# PID file in a per-user, private runtime dir (XDG_RUNTIME_DIR is mode 700) —
# not world-writable /tmp — to avoid symlink / predictable-name games. Fixed
# path so the kill-previous check below finds the prior instance across launches.
runtime_dir="${XDG_RUNTIME_DIR:-$HOME/.cache}"
[ -d "$runtime_dir" ] || runtime_dir="$HOME/.cache"
mkdir -p "$runtime_dir" 2>/dev/null
pidfile="$runtime_dir/tmux-cpu-daemon.pid"

# Re-exec detached in our own session, so this is NOT a tracked tmux run-shell
# job: the launcher returns at once (no hang) and the kill-on-reload below stays
# silent — otherwise tmux prints "... terminated by signal 15" on every reload.
if [ -z "${CPU_DAEMON_DETACHED:-}" ]; then
  CPU_DAEMON_DETACHED=1 setsid "$0" "$@" >/dev/null 2>&1 &
  exit 0
fi

# Replace any previous daemon (e.g. after `tmux source-file`) so loops never
# stack. Only signal a strictly-numeric PID, so a corrupted/tampered pidfile
# cannot turn this into e.g. `kill -1` (signal every process we own).
if [ -f "$pidfile" ] && [ ! -L "$pidfile" ]; then
  prev=$(cat "$pidfile" 2>/dev/null)
  case "$prev" in
    '' | *[!0-9]*) ;;
    *) kill "$prev" 2>/dev/null ;;
  esac
fi
(umask 077 && printf '%s\n' "$$" >"$pidfile")
# Remove the pidfile on exit ONLY if it still holds our PID — otherwise a
# successor that already took over (and rewrote it) would lose its own entry,
# which would let the next reload stack a second daemon.
trap '[ "$(cat "$pidfile" 2>/dev/null)" = "$$" ] && rm -f "$pidfile"' EXIT

# Read aggregate CPU jiffies from /proc/stat line 1 into `idle` and `total`.
# Fields: cpu user nice system idle iowait irq softirq steal guest guest_nice
read_cpu() {
  local _cpu user nice sys idl iowait irq softirq steal _rest
  read -r _cpu user nice sys idl iowait irq softirq steal _rest </proc/stat
  idle=$((idl + iowait))
  total=$((user + nice + sys + idl + iowait + irq + softirq + steal))
}

# Capture the tmux server PID so we can detect a *real* server exit cheaply via
# kill -0 (no scheduling-sensitive tmux round-trip). A bare `tmux set || break`
# was fatal: under heavy CPU load the set can transiently fail, which killed the
# daemon for good and froze the figure — the exact "doesn't show the state" bug.
server_pid=$(tmux display -p '#{pid}' 2>/dev/null)

read_cpu
previdle=$idle
prevtotal=$total

while sleep "$interval"; do
  # Exit only when the server process is genuinely gone (so no orphan lingers).
  [ -n "$server_pid" ] && ! kill -0 "$server_pid" 2>/dev/null && break
  read_cpu
  dtotal=$((total - prevtotal))
  didle=$((idle - previdle))
  previdle=$idle
  prevtotal=$total
  [ "$dtotal" -le 0 ] && continue
  # Busy fraction, rounded to nearest integer percent.
  pct=$(((100 * (dtotal - didle) + dtotal / 2) / dtotal))
  tmux set -gq @mycpu "${pct}%" 2>/dev/null # best-effort; ignore transient failures
done
