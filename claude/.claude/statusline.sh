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
    (.workspace.project_dir // .workspace.current_dir // "."),
    ((.context_window.used_percentage // 0) | floor),
    (.context_window.context_window_size // 200000),
    ((.rate_limits.five_hour.used_percentage // 0) | floor),
    ((.rate_limits.seven_day.used_percentage // 0) | floor),
    (.rate_limits.five_hour.resets_at // 0),
    (.rate_limits.seven_day.resets_at // 0)
  ] | @tsv
')
IFS=$'\t' read -r MODEL DIR PROJECT_DIR PCT MAX_TOKENS PCT_5H PCT_7D RESET_5H RESET_7D <<< "$data"

if [ "$MAX_TOKENS" -ge 1000000 ]; then
    TOKEN_LABEL="$((MAX_TOKENS / 1000000))m"
else
    TOKEN_LABEL="$((MAX_TOKENS / 1000))k"
fi

##### Hybrid bg=256 + fg=truecolor (Catppuccin Mocha) #########################
# 256-bg sidesteps the v2.1.78+ truecolor wash bug; truecolor fg keeps the
# real Catppuccin tones. Combined into single escape per segment.
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
B_RED_B=$'\e[48;2;56;56;56;38;2;243;139;168;1m'

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
    [ "$pct" -lt 0 ] && pct=0
    [ "$pct" -gt 100 ] && pct=100
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
        # Partial cell: eighth-block glyph REPLACES the label character at
        # the boundary (industry pattern — indicatif, tqdm). Bar stays at
        # constant `width` cells; the inserting alternative grew the bar
        # by 1 cell on partial fill, causing visible label gaps. One char
        # disappears at a time, sliding across the label as pct changes.
        # Derives fg index from fill escape — assumes 256-color bg form
        # (\e[48;5;N;…). If any FILL_* switches to truecolor (\e[48;2;…)
        # this parse silently breaks.
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
STAGED=0 MODIFIED=0 UNTRACKED=0 IS_WORKTREE=0 GIT_STATE=""

# Consolidated git query: one `git status --porcelain=v2 --branch` covers
# branch, upstream, ahead/behind, and all file counts. Worktree detection
# still needs rev-parse (not exposed by porcelain); in-progress state lives
# in the per-worktree git dir. The status exit code doubles as "is this a
# git repo?" — replaces the prior standalone rev-parse existence check.
if cache_is_stale; then
    if STATUS=$(git -C "$DIR" status --porcelain=v2 --branch 2>/dev/null); then
        # Single-pass awk parse of porcelain v2. Pipe-delimited so branch
        # names with shell-metachars can't break the bash read below.
        IFS='|' read -r BRANCH UPSTREAM AHEAD BEHIND STAGED MODIFIED UNTRACKED < <(awk '
            /^# branch\.head /     { if ($3 != "(detached)") branch = $3 }
            /^# branch\.upstream / { upstream = $3 }
            /^# branch\.ab /       { ahead = substr($3, 2) + 0; behind = substr($4, 2) + 0 }
            /^[12u] / {
                # $2 is XY: X = index/staged status, Y = worktree status.
                # Dot means unmodified. Unmerged (u) counts as both, matching
                # the prior wc-based logic where unmerged files appeared in
                # both `diff --cached` and `diff`.
                if (substr($2, 1, 1) != ".") staged++
                if (substr($2, 2, 1) != ".") modified++
            }
            /^\? / { untracked++ }
            END {
                printf "%s|%s|%d|%d|%d|%d|%d\n",
                       branch, upstream, ahead+0, behind+0,
                       staged+0, modified+0, untracked+0
            }
        ' <<< "$STATUS")
        [ -n "$UPSTREAM" ] && HAS_UPSTREAM=1

        # Worktree + in-progress state aren't in porcelain output.
        # One rev-parse covers both git-dir and git-common-dir.
        mapfile -t REVS < <(git -C "$DIR" rev-parse --git-dir --git-common-dir 2>/dev/null)
        GIT_DIR=${REVS[0]} GIT_COMMON=${REVS[1]}
        [ "$GIT_DIR" != "$GIT_COMMON" ] && IS_WORKTREE=1

        # In-progress operation state (merge/rebase/cherry-pick/revert/bisect).
        # State files live in the per-worktree git dir, not the common dir.
        if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
            GIT_STATE="MERGING"
        elif [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
            if [ -f "$GIT_DIR/rebase-merge/msgnum" ] && [ -f "$GIT_DIR/rebase-merge/end" ]; then
                GIT_STATE="REBASE $(cat "$GIT_DIR/rebase-merge/msgnum")/$(cat "$GIT_DIR/rebase-merge/end")"
            elif [ -f "$GIT_DIR/rebase-apply/next" ] && [ -f "$GIT_DIR/rebase-apply/last" ]; then
                GIT_STATE="REBASE $(cat "$GIT_DIR/rebase-apply/next")/$(cat "$GIT_DIR/rebase-apply/last")"
            else
                GIT_STATE="REBASE"
            fi
        elif [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ]; then
            GIT_STATE="CHERRY-PICK"
        elif [ -f "$GIT_DIR/REVERT_HEAD" ]; then
            GIT_STATE="REVERT"
        elif [ -f "$GIT_DIR/BISECT_LOG" ]; then
            GIT_STATE="BISECT"
        fi
        printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
            "$BRANCH" "$HAS_UPSTREAM" "$AHEAD" "$BEHIND" "$STAGED" "$MODIFIED" "$UNTRACKED" "$IS_WORKTREE" "$GIT_STATE" \
            > "$CACHE_FILE"
    fi
elif [ -f "$CACHE_FILE" ]; then
    IFS='|' read -r BRANCH HAS_UPSTREAM AHEAD BEHIND STAGED MODIFIED UNTRACKED IS_WORKTREE GIT_STATE < "$CACHE_FILE"
fi

##### Compose LINE 1: project + git ###########################################
# Each colored block has 1-space internal padding on left and right (matches
# the dir block style). Blocks are separated by 1 uncolored space.
LINE1="$B_ROSE 󰉋 $B_FG_B${PROJECT_DIR##*/} $R"

if [ -n "$BRANCH" ]; then
    if [ "$IS_WORKTREE" = "1" ]; then BR_ICON=""; else BR_ICON=""; fi
    LINE1+=" $B_SAP $BR_ICON $B_GR_B$BRANCH $R"

    if [ -n "$GIT_STATE" ]; then
        LINE1+=" $B_RED_B $GIT_STATE $R"
    fi

    if [ "$HAS_UPSTREAM" = "1" ]; then
        if [ "$AHEAD" -gt 0 ] || [ "$BEHIND" -gt 0 ]; then
            # Colorize the non-zero side: green ahead (ready to push),
            # peach behind (pull needed). Zero side stays slate.
            LINE1+=" $B_ST0 "
            if [ "$AHEAD" -gt 0 ]; then LINE1+="$B_GR↑$AHEAD$B_ST0"
            else                        LINE1+="↑$AHEAD"; fi
            LINE1+=" "
            if [ "$BEHIND" -gt 0 ]; then LINE1+="$B_PEACH↓$BEHIND$B_ST0"
            else                         LINE1+="↓$BEHIND"; fi
            LINE1+=" $R"
        fi
    else
        LINE1+=" $B_OV0 ↑- ↓- $R"
    fi
fi

if [ "$STAGED" -gt 0 ] || [ "$MODIFIED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    LINE1+=" $B_FG "
    [ "$STAGED" -gt 0 ]    && LINE1+="$B_GR●$STAGED$B_FG "
    [ "$MODIFIED" -gt 0 ]  && LINE1+="$B_PEACH▲$MODIFIED$B_FG "
    [ "$UNTRACKED" -gt 0 ] && LINE1+="$B_OV0?$UNTRACKED$B_FG "
    LINE1+="$R"
fi

##### Compose LINE 2: three progress bars #####################################
# Width is tight — just the label plus 1 cell of padding on each side, like
# the dir/git blocks. Labels vary slightly with model/reset time, so we
# compute each width from its label length.
CTX_LABEL="$MODEL $TOKEN_LABEL"
H_LABEL="5h · $RESET_5H_FMT"
W_LABEL="7d · $RESET_7D_FMT"
CTX_BAR=$(build_bar $((${#CTX_LABEL} + 2)) "$PCT"    "$CTX_LABEL")
H_BAR=$(build_bar   $((${#H_LABEL}   + 2)) "$PCT_5H" "$H_LABEL"   "$FILL_5H_LOW")
W_BAR=$(build_bar   $((${#W_LABEL}   + 2)) "$PCT_7D" "$W_LABEL"   "$FILL_7D_LOW")

##### Output (single line) ###################################################
# Everything on one line: dir + git + three bars. Avoids the 2-line drop
# when the Claude Code pane is short.
printf '%s  %s  %s  %s\n' "$LINE1" "$CTX_BAR" "$H_BAR" "$W_BAR"
