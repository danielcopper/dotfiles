#!/usr/bin/env bash
# Background sampler for the tmux status line.
#
# Wakes once per second and publishes status values into tmux user options, so
# the status line reads plain #{@...} lookups (no fork on redraw) instead of
# forking a shell script per element per redraw:
#   @mycpu              - instantaneous CPU%  (/proc/stat deltas, fork-free)
#   @myram              - RAM used%           (/proc/meminfo, fork-free)
#   @mybat / @mybat_icon - battery            (refreshed every 30s by reusing
#                                              tmux-battery's own scripts -- it
#                                              barely moves; 2 forks/30s, not
#                                              2 forks/redraw)
# It also drives tmux-continuum's periodic save (every 60s), replacing the
# per-redraw #(continuum_save.sh) fork that used to sit in status-right.
#
# Launched once from tmux.conf:  run-shell -b "~/.config/tmux/status-daemon.sh 1"
# Sample interval in seconds may be passed as $1.

interval="${1:-1}"

# PID file in a per-user, private runtime dir (XDG_RUNTIME_DIR is mode 700) --
# not world-writable /tmp. Fixed path so the kill-previous check finds the prior
# instance across launches.
runtime_dir="${XDG_RUNTIME_DIR:-$HOME/.cache}"
[ -d "$runtime_dir" ] || runtime_dir="$HOME/.cache"
mkdir -p "$runtime_dir" 2>/dev/null
pidfile="$runtime_dir/tmux-status-daemon.pid"

# Re-exec detached in our own session, so this is NOT a tracked tmux run-shell
# job: the launcher returns at once (no hang) and the kill-on-reload stays silent
# (otherwise tmux prints "... terminated by signal 15" on every reload).
if [ -z "${CPU_DAEMON_DETACHED:-}" ]; then
  CPU_DAEMON_DETACHED=1 setsid "$0" "$@" >/dev/null 2>&1 &
  exit 0
fi

# Replace any previous daemon (e.g. after `tmux source-file`) so loops never
# stack. Only signal a strictly-numeric PID, so a corrupted/tampered pidfile
# cannot broaden the kill.
if [ -f "$pidfile" ] && [ ! -L "$pidfile" ]; then
  prev=$(cat "$pidfile" 2>/dev/null)
  case "$prev" in
    '' | *[!0-9]*) ;;
    *) kill "$prev" 2>/dev/null ;;
  esac
fi
(umask 077 && printf '%s\n' "$$" >"$pidfile")
# Remove the pidfile on exit ONLY if it still holds our PID -- otherwise a
# successor that already took over would lose its own entry.
trap '[ "$(cat "$pidfile" 2>/dev/null)" = "$$" ] && rm -f "$pidfile"' EXIT

plugin_dir="$HOME/.config/tmux/plugins"
battery_icon_sh="$plugin_dir/tmux-battery/scripts/battery_icon.sh"
battery_pct_sh="$plugin_dir/tmux-battery/scripts/battery_percentage.sh"
continuum_sh="$plugin_dir/tmux-continuum/scripts/continuum_save.sh"

# Aggregate CPU jiffies from /proc/stat line 1 into `idle` and `total`.
# Fields: cpu user nice system idle iowait irq softirq steal guest guest_nice
read_cpu() {
  local _cpu user nice sys idl iowait irq softirq steal _rest
  read -r _cpu user nice sys idl iowait irq softirq steal _rest </proc/stat
  idle=$((idl + iowait))
  total=$((user + nice + sys + idl + iowait + irq + softirq + steal))
}

# RAM used% from /proc/meminfo: (MemTotal - MemAvailable) / MemTotal.
read_ram() {
  local key val _rest mt='' ma=''
  while read -r key val _rest; do
    case "$key" in
      MemTotal:) mt=$val ;;
      MemAvailable:) ma=$val ;;
    esac
    [ -n "$mt" ] && [ -n "$ma" ] && break
  done </proc/meminfo
  if [ -n "$mt" ] && [ "$mt" -gt 0 ] && [ -n "$ma" ]; then
    rampct=$(((100 * (mt - ma) + mt / 2) / mt))
  fi
}

# Capture the server PID so we can detect a *real* server exit cheaply via
# kill -0 (no scheduling-sensitive tmux round-trip).
server_pid=$(tmux display -p '#{pid}' 2>/dev/null)

read_cpu
previdle=$idle
prevtotal=$total
cpupct=0
rampct=0

i=0
while sleep "$interval"; do
  # Exit only when the server process is genuinely gone (no orphan lingers).
  [ -n "$server_pid" ] && ! kill -0 "$server_pid" 2>/dev/null && break
  i=$((i + 1))

  read_cpu
  dtotal=$((total - prevtotal))
  didle=$((idle - previdle))
  previdle=$idle
  prevtotal=$total
  if [ "$dtotal" -gt 0 ]; then
    cpupct=$(((100 * (dtotal - didle) + dtotal / 2) / dtotal))
  fi

  read_ram

  # Publish CPU + RAM in a single tmux invocation -> one fork/sec total.
  tmux set -gq @mycpu "${cpupct}%" \; set -gq @myram "${rampct}%" 2>/dev/null

  # Battery: refresh every 30s by reusing tmux-battery's scripts (keeps the exact
  # glyph/threshold logic). Fires at i=1 first so it is not blank for 30s.
  if [ $((i % 30)) -eq 1 ] && [ -x "$battery_icon_sh" ]; then
    bicon=$("$battery_icon_sh" 2>/dev/null)
    bpct=$("$battery_pct_sh" 2>/dev/null)
    tmux set -gq @mybat_icon "$bicon" \; set -gq @mybat "$bpct" 2>/dev/null
  fi

  # Continuum periodic save every 60s -- it self-limits to @continuum-save-interval,
  # so this just gives it a low-frequency heartbeat instead of a per-redraw fork.
  if [ $((i % 60)) -eq 0 ] && [ -x "$continuum_sh" ]; then
    "$continuum_sh" >/dev/null 2>&1
  fi
done
