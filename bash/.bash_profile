#
# ~/.bash_profile
#

# A login shell that is not interactive (`bash -lc`, or herdr-core loading the
# login environment of a host it was started on over SSH) gets nothing from
# ~/.bashrc, which returns before its PATH lines. It still needs the user's own
# binaries (claude, hc) and mise's shims, the dir mise-shims.conf in
# environment.d adds for the systemd session. Each is added only when missing,
# so a PATH that already has it (environment.d, a parent shell) gets no
# duplicate. Where SDDM starts the session (the Deck's Desktop Mode, Arch with
# KDE), its wayland-session script runs as a login bash, so this file also sets
# the PATH of the graphical session and of the systemd user manager.
case ":$PATH:" in
  *":$HOME/.local/share/mise/shims:"*) ;;
  *) PATH="$HOME/.local/share/mise/shims:$PATH" ;;
esac
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac
export PATH

[[ -f ~/.bashrc ]] && . ~/.bashrc
