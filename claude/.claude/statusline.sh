#!/bin/bash
# Claude Code statusline.
#
# Colour strategy is a hybrid (256-bg + truecolor-fg) because Claude Code
# v2.1.78+ ships a global truecolor transformation that washes/inverts
# 24-bit RGB backgrounds — dark crust came out as warm peach, the opposite
# of what was set. See https://github.com/anthropics/claude-code/issues/35806
# (washed-out custom colours) and #6466 (separate consecutive escape
# sequences mishandled).
#
# Workarounds applied here:
#   - bg uses 256-colour palette (\e[48;5;Nm) — bypasses the truecolor
#     transform path.
#   - fg keeps truecolor (\e[38;2;R;G;Bm) so Catppuccin tones stay
#     accurate.
#   - bg+fg are always combined in a single escape (\e[48;…;38;…m), never
#     two consecutive ones — separate escapes are also broken in Claude.
# Drop the 256-bg trick once Anthropic ships a fix.

input=$(cat)

##### Parse JSON in a single jq call ##########################################
data=$(printf '%s' "$input" | jq -r '
  [
    ((.model.display_name // "?") | gsub(" \\([^)]*context\\)"; "")),
    (.workspace.current_dir // "."),
    ((.context_window.used_percentage // 0) | floor),
    (.context_window.context_window_size // 200000),
    ((.rate_limits.five_hour.used_percentage // 0) | floor),
    ((.rate_limits.seven_day.used_percentage // 0) | floor),
    (.rate_limits.five_hour.resets_at // 0),
    (.rate_limits.seven_day.resets_at // 0),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0)
  ] | @tsv
')
IFS=$'\t' read -r MODEL DIR PCT MAX_TOKENS PCT_5H PCT_7D RESET_5H RESET_7D LINES_ADD LINES_REM <<< "$data"

if [ "$MAX_TOKENS" -ge 1000000 ]; then
    TOKEN_LABEL="$((MAX_TOKENS / 1000000))m"
else
    TOKEN_LABEL="$((MAX_TOKENS / 1000))k"
fi

##### Hybrid bg=256 + fg=truecolor (Catppuccin Mocha) #########################
# 256-bg sidesteps the v2.1.78+ truecolor wash bug; truecolor fg keeps the
# real Catppuccin tones. Combined into single escape per segment.
# bg 237 ≈ neutral grey, bar fills warm-shifted (114 olive-green / 216 peach / 174 maroon-red).
B_ROSE=$'\e[48;2;56;56;56;38;2;245;224;220m'
B_FG=$'\e[48;2;56;56;56;38;2;205;214;244m'
B_FG_B=$'\e[48;2;56;56;56;38;2;205;214;244;1m'
B_SAP=$'\e[48;2;56;56;56;38;2;116;199;236m'
B_GR=$'\e[48;2;56;56;56;38;2;166;227;161m'
B_GR_B=$'\e[48;2;56;56;56;38;2;166;227;161;1m'
B_ST0=$'\e[48;2;56;56;56;38;2;166;173;200m'
B_OV0=$'\e[48;2;56;56;56;38;2;108;112;134m'
B_PEACH=$'\e[48;2;56;56;56;38;2;250;179;135m'
B_RED=$'\e[48;2;56;56;56;38;2;243;139;168m'

# Per-bar gradient palettes — all share the warning ramp (peach mid, red high)
# but each starts from a distinct base colour to keep the three bars visually
# distinguishable at typical low percentages.
FILL_GR=$'\e[48;5;114;38;2;17;17;27m'        # context low — olive green
FILL_PEACH=$'\e[48;5;216;38;2;17;17;27m'     # mid — soft peach (shared)
FILL_RED=$'\e[48;5;174;38;2;17;17;27m'       # high — muted red (shared)
FILL_5H_LOW=$'\e[48;5;222;38;2;17;17;27m'    # 5h low — warm yellow
FILL_7D_LOW=$'\e[48;5;147;38;2;17;17;27m'    # 7d low — lavender

R=$'\e[0m'

##### Progress bar — BG-fill on dark with centered label ######################
# Args: width pct label [low [mid [high]]]
# Defaults to the context palette (green/peach/red). Pass a different low
# (e.g. $FILL_5H_LOW) to give a bar its own base colour while keeping the
# warning ramp shared.
#
# Sub-cell resolution: each cell is split into 8 sub-units using Unicode
# eighth-block glyphs (▏▎▍▌▋▊▉) so a width-18 bar resolves ~0.7% per step
# instead of ~5.5% — separates 1% from 8% visually.
PARTIALS=('' '▏' '▎' '▍' '▌' '▋' '▊' '▉')
build_bar() {
    local width=$1 pct=$2 label=$3
    local low=${4:-$FILL_GR} mid=${5:-$FILL_PEACH} high=${6:-$FILL_RED}
    local fill
    if [ "$pct" -ge 85 ]; then fill="$high"
    elif [ "$pct" -ge 65 ]; then fill="$mid"
    else fill="$low"; fi
    local llen=${#label}
    local pad=$((width - llen)); [ "$pad" -lt 0 ] && pad=0
    local pl=$((pad / 2)) pr=$((pad - pad / 2))
    local full
    full=$(printf '%*s%s%*s' "$pl" '' "$label" "$pr" '')
    local sub=$((pct * width * 8 / 100))
    [ "$pct" -gt 0 ] && [ "$sub" -lt 1 ] && sub=1
    local fcells=$((sub / 8)) rem=$((sub % 8))
    if [ "$rem" -eq 0 ]; then
        printf '%s%s%s%s%s' "$fill" "${full:0:fcells}" "$B_FG" "${full:fcells}" "$R"
    else
        # Partial cell: eighth-block glyph in fill colour over empty bar bg.
        # Derive fg index from fill ANSI (\e[48;5;N;38;2;...m).
        local idx=${fill#*48;5;}; idx=${idx%%;*}
        local part=$'\e[48;2;56;56;56;38;5;'"$idx"'m'
        printf '%s%s%s%s%s%s%s' \
            "$fill" "${full:0:fcells}" \
            "$part" "${PARTIALS[rem]}" \
            "$B_FG" "${full:$((fcells+1))}" "$R"
    fi
}

##### Reset countdowns ########################################################
NOW=$(date +%s)
fmt_remain() {
    local remain=$(( $1 - NOW ))
    [ "$remain" -lt 0 ] && remain=0
    if [ "$remain" -ge 86400 ]; then
        printf '%dd %dh' "$((remain / 86400))" "$(((remain % 86400) / 3600))"
    else
        printf '%dh %dm' "$((remain / 3600))" "$(((remain % 3600) / 60))"
    fi
}
RESET_5H_FMT=$(fmt_remain "$RESET_5H")
RESET_7D_FMT=$(fmt_remain "$RESET_7D")

##### Git info — cached, single block per query ###############################
CACHE_DIR="/tmp/statusline-cache"
mkdir -p "$CACHE_DIR"
CACHE_FILE="$CACHE_DIR/$(echo "$DIR" | md5sum | cut -d' ' -f1)"
CACHE_MAX_AGE=10

cache_is_stale() {
    [ ! -f "$CACHE_FILE" ] || \
    [ $(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0))) -gt $CACHE_MAX_AGE ]
}

BRANCH="" HAS_UPSTREAM=0 AHEAD=0 BEHIND=0
STAGED=0 MODIFIED=0 UNTRACKED=0 REMOTE_URL="" IS_WORKTREE=0

if git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
    if cache_is_stale; then
        BRANCH=$(git -C "$DIR" branch --show-current 2>/dev/null)
        GIT_DIR=$(git -C "$DIR" rev-parse --git-dir 2>/dev/null)
        GIT_COMMON=$(git -C "$DIR" rev-parse --git-common-dir 2>/dev/null)
        [ "$GIT_DIR" != "$GIT_COMMON" ] && IS_WORKTREE=1
        UPSTREAM=$(git -C "$DIR" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)
        if [ -n "$UPSTREAM" ]; then
            HAS_UPSTREAM=1
            AHEAD=$(git -C "$DIR" rev-list --count "${UPSTREAM}..HEAD" 2>/dev/null || echo 0)
            BEHIND=$(git -C "$DIR" rev-list --count "HEAD..${UPSTREAM}" 2>/dev/null || echo 0)
        fi
        STAGED=$(git -C "$DIR" diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
        MODIFIED=$(git -C "$DIR" diff --numstat 2>/dev/null | wc -l | tr -d ' ')
        UNTRACKED=$(git -C "$DIR" ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
        REMOTE_URL=$(git -C "$DIR" remote get-url origin 2>/dev/null \
            | sed 's|git@github\.com:|https://github.com/|' \
            | sed 's|git@\([^:]*\):|https://\1/|' \
            | sed 's|\.git$||')
        printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
            "$BRANCH" "$HAS_UPSTREAM" "$AHEAD" "$BEHIND" "$STAGED" "$MODIFIED" "$UNTRACKED" "$REMOTE_URL" "$IS_WORKTREE" \
            > "$CACHE_FILE"
    else
        IFS='|' read -r BRANCH HAS_UPSTREAM AHEAD BEHIND STAGED MODIFIED UNTRACKED REMOTE_URL IS_WORKTREE < "$CACHE_FILE"
    fi
fi

##### Compose LINE 1: project + git ###########################################
LINE1="$B_ROSE 󰉋 $B_FG_B${DIR##*/} $R"

if [ -n "$BRANCH" ]; then
    if [ "$IS_WORKTREE" = "1" ]; then BR_ICON=" "; else BR_ICON=" "; fi
    LINE1+="  $B_SAP$BR_ICON$B_GR_B$BRANCH"
    if [ "$HAS_UPSTREAM" = "1" ]; then
        LINE1+="$B_ST0 ↑$AHEAD ↓$BEHIND $R"
    else
        LINE1+="$B_OV0 ↑- ↓- $R"
    fi
fi

if [ "$STAGED" -gt 0 ] || [ "$MODIFIED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    WT="$B_FG "
    [ "$STAGED" -gt 0 ]    && WT+="$B_GR$STAGED$B_FG "
    [ "$MODIFIED" -gt 0 ]  && WT+="$B_PEACH$MODIFIED$B_FG "
    [ "$UNTRACKED" -gt 0 ] && WT+="$B_OV0$UNTRACKED$B_FG "
    LINE1+="  $WT$R"
fi

if [ "$LINES_ADD" -gt 0 ] || [ "$LINES_REM" -gt 0 ]; then
    LINE1+="  $B_GR +$LINES_ADD $B_RED-$LINES_REM $R"
fi

if [ -n "$REMOTE_URL" ]; then
    REPO_PATH=${REMOTE_URL#https://github.com/}
    REPO_PATH=${REPO_PATH#https://*/}
    LINE1+="  $B_OV0 󰌷 $REPO_PATH $R"
fi

##### Compose LINE 2: three progress bars #####################################
CTX_BAR=$(build_bar 18 "$PCT" "$MODEL $TOKEN_LABEL ${PCT}%")
H_BAR=$(build_bar 18 "$PCT_5H" "5h ${PCT_5H}% · $RESET_5H_FMT" "$FILL_5H_LOW")
W_BAR=$(build_bar 18 "$PCT_7D" "7d ${PCT_7D}% · $RESET_7D_FMT" "$FILL_7D_LOW")

LINE2="$CTX_BAR  $H_BAR  $W_BAR"

##### Output ##################################################################
printf '%s\n' "$LINE1"
printf '\n'
printf '%s\n' "$LINE2"
