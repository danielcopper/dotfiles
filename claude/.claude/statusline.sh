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
# Use SOH (\x01) as the field separator, not tab. bash `read` treats tab as
# whitespace and *collapses* consecutive tabs into a single separator — which
# silently shifts every subsequent variable when an upstream field (like
# `workspace.git_worktree`, optional and often empty) is the empty string.
# SOH is non-whitespace, so empty fields are preserved.
data=$(printf '%s' "$input" | jq -r '
  [
    ((.model.display_name // "?") | gsub(" \\([^)]*context\\)"; "")),
    (.workspace.current_dir // "."),
    (.workspace.project_dir // .workspace.current_dir // "."),
    (.workspace.git_worktree // ""),
    ((.context_window.used_percentage // 0) | floor),
    (.context_window.context_window_size // 200000),
    ((.rate_limits.five_hour.used_percentage // 0) | floor),
    ((.rate_limits.seven_day.used_percentage // 0) | floor),
    (.rate_limits.five_hour.resets_at // 0),
    (.rate_limits.seven_day.resets_at // 0)
  ] | join("\u0001")
')
IFS=$'\1' read -r MODEL DIR PROJECT_DIR JSON_WORKTREE PCT MAX_TOKENS PCT_5H PCT_7D RESET_5H RESET_7D <<< "$data"

##### Terminal width detection (no JSON field exposes this) ###################
# Anthropic's statusline JSON omits terminal dimensions, so derive from shell.
# In the statusline-render context, stdin is the JSON pipe and the subprocess
# has no controlling tty — `tput cols` and `stty size` (with or without
# `</dev/tty`) fail or return terminfo defaults (typically 80) and ignore
# real resize events.
#
# When inside tmux (the primary setup here), querying `pane_width` directly
# from the tmux server gives the **live** pane width every render — reactive
# to splits, resizes, and zooms without any extra plumbing.
#
# Order: tmux pane_width (live, reactive) → $COLUMNS env (rarely set in
# render context but cheap to check) → conservative default. `/dev/tty`
# probes were tried; they fail in piped subprocesses on this setup.
COLS=""
if [ -n "${TMUX_PANE:-}" ]; then
    COLS=$(tmux display-message -p -t "$TMUX_PANE" '#{pane_width}' 2>/dev/null)
fi
if [ -z "$COLS" ] || ! [ "$COLS" -gt 0 ] 2>/dev/null; then
    COLS=${COLUMNS:-}
fi
if [ -z "$COLS" ] || ! [ "$COLS" -gt 0 ] 2>/dev/null; then
    COLS=140
fi

# Truncation caps used by the content-aware shrink loop further below. The
# loop measures the rendered line's visible width and shrinks variants from
# most-info to least until it fits — no width thresholds to tune.
MAX_BRANCH_CHARS=24      # cap when branch is truncated
MAX_LEAF_CHARS=20        # cap when leaf segment is truncated

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

        # Worktree detection by path pattern of the absolute git-dir.
        # String-comparing --git-dir against --git-common-dir is unreliable:
        # when cwd traverses a symlink into the repo, one side comes back
        # absolute (after git's internal physical-path resolution) and the
        # other relative, producing a false-positive worktree even in a
        # plain main checkout. `*/.git/worktrees/*` is the canonical layout
        # of every git-managed worktree dir, so it's a stable marker.
        # Absolute form also makes the in-progress state file checks below
        # work regardless of where cwd lands.
        GIT_DIR=$(git -C "$DIR" rev-parse --absolute-git-dir 2>/dev/null)
        # Prefer Anthropic's official workspace.git_worktree signal when
        # present; fall back to the path-pattern check for older Claude
        # Code versions or any case where the JSON field is absent.
        if [ -n "$JSON_WORKTREE" ]; then
            IS_WORKTREE=1
        elif [[ "$GIT_DIR" == */.git/worktrees/* ]]; then
            IS_WORKTREE=1
        fi

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

##### Build progress bars #####################################################
# Width is label + 2 cells of padding. Labels vary with model and reset time.
# Built up here (before the dir/branch blocks) because the content-aware
# shrink loop below needs to measure the full rendered line including bars.
CTX_LABEL="$MODEL $TOKEN_LABEL"
H_LABEL="5h · $RESET_5H_FMT"
W_LABEL="7d · $RESET_7D_FMT"
CTX_BAR=$(build_bar $((${#CTX_LABEL} + 2)) "$PCT"    "$CTX_LABEL")
H_BAR=$(build_bar   $((${#H_LABEL}   + 2)) "$PCT_5H" "$H_LABEL"   "$FILL_5H_LOW")
W_BAR=$(build_bar   $((${#W_LABEL}   + 2)) "$PCT_7D" "$W_LABEL"   "$FILL_7D_LOW")

##### Compose LINE 1: dir + git ###############################################
# Content-aware shrinking: build every variable element at full width, measure
# the line's visible width, and shrink the dir-block (parent → …/leaf →
# truncated leaf) and the branch (full → truncated) in tiers until the line
# actually fits in $COLS. Bars and per-counter blocks are never truncated.

PROJ_BN="${PROJECT_DIR##*/}"
LEAF="${DIR##*/}"
REL=""
[[ "$DIR" == "$PROJECT_DIR"/* ]] && REL="${DIR#"$PROJECT_DIR"/}"

# Static (non-truncatable) blocks: in-progress state, ahead/behind, dirty.
# Computed once; appended after the dir+branch in every variant.
STATIC_BLK=""
if [ -n "$BRANCH" ]; then
    [ -n "$GIT_STATE" ] && STATIC_BLK+=" $B_RED_B $GIT_STATE $R"
    if [ "$HAS_UPSTREAM" = "1" ]; then
        if [ "$AHEAD" -gt 0 ] || [ "$BEHIND" -gt 0 ]; then
            STATIC_BLK+=" $B_ST0 "
            if [ "$AHEAD" -gt 0 ]; then STATIC_BLK+="$B_GR↑$AHEAD$B_ST0"
            else                        STATIC_BLK+="↑$AHEAD"; fi
            STATIC_BLK+=" "
            if [ "$BEHIND" -gt 0 ]; then STATIC_BLK+="$B_PEACH↓$BEHIND$B_ST0"
            else                         STATIC_BLK+="↓$BEHIND"; fi
            STATIC_BLK+=" $R"
        fi
    else
        STATIC_BLK+=" $B_OV0 ↑- ↓- $R"
    fi
fi
if [ "$STAGED" -gt 0 ] || [ "$MODIFIED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    STATIC_BLK+=" $B_FG "
    [ "$STAGED" -gt 0 ]    && STATIC_BLK+="$B_GR●$STAGED$B_FG "
    [ "$MODIFIED" -gt 0 ]  && STATIC_BLK+="$B_PEACH▲$MODIFIED$B_FG "
    [ "$UNTRACKED" -gt 0 ] && STATIC_BLK+="$B_OV0?$UNTRACKED$B_FG "
    STATIC_BLK+="$R"
fi

# Pick the branch icon once. Worktree gets the fork-style glyph; main
# checkout gets the regular branch glyph.
if [ "$IS_WORKTREE" = "1" ]; then BR_ICON_GLYPH=""; else BR_ICON_GLYPH=""; fi

# Build the dir block for a given variant: wide | narrow | vnarrow.
# When PROJECT_DIR == DIR there is no parent/leaf — all variants return
# the same single-basename block.
build_dir_block() {
    local v="$1"
    if [ "$PROJECT_DIR" = "$DIR" ]; then
        printf '%s 󰉋 %s%s %s' "$B_ROSE" "$B_FG_B" "$PROJ_BN" "$R"
        return
    fi
    local has_parent=0
    [ -n "$REL" ] && [[ "$REL" == */* ]] && has_parent=1
    case "$v" in
        wide)
            if [ "$has_parent" = 1 ]; then
                local p="${REL%/*}"; p="${p##*/}"
                printf '%s 󰉋 %s%s%s · %s%s/%s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_OV0" "$p" "$B_FG_B" "$LEAF" "$R"
            else
                printf '%s 󰉋 %s%s%s · %s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_FG_B" "$LEAF" "$R"
            fi
            ;;
        narrow)
            if [ "$has_parent" = 1 ]; then
                printf '%s 󰉋 %s%s%s · %s…/%s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_OV0" "$B_FG_B" "$LEAF" "$R"
            else
                # one-level diverged — no parent to drop, same as wide
                printf '%s 󰉋 %s%s%s · %s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_FG_B" "$LEAF" "$R"
            fi
            ;;
        vnarrow)
            local tl="$LEAF"
            [ "${#tl}" -gt "$MAX_LEAF_CHARS" ] && tl="${tl:0:$((MAX_LEAF_CHARS-1))}…"
            if [ "$has_parent" = 1 ]; then
                printf '%s 󰉋 %s%s%s · %s…/%s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_OV0" "$B_FG_B" "$tl" "$R"
            else
                printf '%s 󰉋 %s%s%s · %s%s %s' \
                    "$B_ROSE" "$B_OV0" "$PROJ_BN" "$B_FG" "$B_FG_B" "$tl" "$R"
            fi
            ;;
    esac
}

# Build the branch block (full | trunc). Empty when no branch info available.
build_branch_block() {
    [ -z "$BRANCH" ] && return
    local v="$1"
    local br="$BRANCH"
    if [ "$v" = "trunc" ] && [ "${#br}" -gt "$MAX_BRANCH_CHARS" ]; then
        br="${br:0:$((MAX_BRANCH_CHARS-1))}…"
    fi
    printf ' %s %s %s%s %s' "$B_SAP" "$BR_ICON_GLYPH" "$B_GR_B" "$br" "$R"
}

# Visible width of an ANSI-laden string (strip escape codes, count chars).
visible_width() {
    local s
    s=$(printf '%s' "$1" | sed $'s/\x1b\\[[0-9;]*m//g')
    printf '%d' "${#s}"
}

##### Greedy shrink + output ##################################################
# Try variants from most-info to least, pick the first that fits in $COLS.
# If even vnarrow + trunc exceeds the pane (tiny split), fall through to the
# smallest combo — the terminal wraps regardless and at least the info is
# minimally compressed.
FULL_LINE=""
for combo in "wide full" "narrow full" "narrow trunc" "vnarrow trunc"; do
    read -r pv bv <<< "$combo"
    dir_blk=$(build_dir_block "$pv")
    br_blk=$(build_branch_block "$bv")
    LINE1="$dir_blk$br_blk$STATIC_BLK"
    FULL_LINE=$(printf '%s  %s  %s  %s' "$LINE1" "$CTX_BAR" "$H_BAR" "$W_BAR")
    [ "$(visible_width "$FULL_LINE")" -le "$COLS" ] && break
done

printf '%s\n' "$FULL_LINE"
