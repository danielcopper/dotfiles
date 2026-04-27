#!/bin/sh
# Map a foreground process name to a nerd-font glyph for the tmux
# window status. Called by tmux.conf via:
#   #(~/.config/tmux/process-icon.sh #{pane_current_command})
#
# Defaults to the generic terminal glyph when the command isn't mapped.

case "$1" in
    nvim|vim|vi                                            ) printf '' ;;
    bash|zsh|fish|sh|dash                                  ) printf '' ;;
    git                                                    ) printf '' ;;
    lazygit                                                ) printf '' ;;
    docker|docker-compose|lazydocker|kubectl|kuberlr|stern|k9s) printf '󰡨' ;;
    python|python3|ipython                                 ) printf '' ;;
    node|npm|npx|bun|yarn|pnpm                             ) printf '' ;;
    go                                                     ) printf '' ;;
    cargo|rustc|rust                                       ) printf '' ;;
    psql|sqlcmd|sqlite3|mysql|mariadb                      ) printf '' ;;
    gh                                                     ) printf '' ;;
    make                                                   ) printf '' ;;
    curl|wget|httpie                                       ) printf '' ;;
    htop|btop|btm                                          ) printf '󰏒' ;;
    ruby                                                   ) printf '' ;;
    lua                                                    ) printf '' ;;
    pwsh|powershell                                        ) printf '' ;;
    dotnet                                                 ) printf '󰌛' ;;
    ssh|sshd                                               ) printf '󰣀' ;;    claude|claude-code) printf '󰚩' ;;

    *)                                                        printf '' ;;
esac
