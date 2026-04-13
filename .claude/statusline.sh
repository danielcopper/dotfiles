#!/bin/bash
input=$(cat)

# Auto-detect: API key set = api, otherwise subscription
if [ -n "$ANTHROPIC_API_KEY" ]; then PLAN="api"; else PLAN="sub"; fi

# ── JSON fields ──────────────────────────────────────────────────────
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"' | sed 's/ ([^)]*context)//g')
DIR=$(echo "$input" | jq -r '.workspace.current_dir // "."')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
LINES_ADD=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
LINES_REM=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')
MAX_TOKENS=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
PCT_5H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // 0' | cut -d. -f1)
PCT_7D=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // 0' | cut -d. -f1)
RESET_5H=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // 0')
RESET_7D=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // 0')

# Format token capacity: 200000→"200k", 1000000→"1m"
if [ "$MAX_TOKENS" -ge 1000000 ]; then
    TOKEN_LABEL="$((MAX_TOKENS / 1000000))m"
else
    TOKEN_LABEL="$((MAX_TOKENS / 1000))k"
fi

# ── Catppuccin Mocha ─────────────────────────────────────────────────
# Foreground
FG_GREEN='\033[38;2;166;227;161m'
FG_RED='\033[38;2;243;139;168m'
FG_YELLOW='\033[38;2;249;226;175m'
FG_PEACH='\033[38;2;250;179;135m'
FG_MAUVE='\033[38;2;203;166;247m'
FG_SAPPHIRE='\033[38;2;116;199;236m'
FG_SUBTEXT0='\033[38;2;166;173;200m'
FG_OVERLAY0='\033[38;2;108;112;134m'
FG_CRUST='\033[38;2;17;17;27m'
FG_SUBTEXT1='\033[38;2;186;194;222m'
# Background
BG_GREEN='\033[48;2;166;227;161m'
BG_YELLOW='\033[48;2;249;226;175m'
BG_RED='\033[48;2;243;139;168m'
BG_BLUE='\033[48;2;137;180;250m'
BG_LAVENDER='\033[48;2;180;190;254m'
BG_PEACH='\033[48;2;250;179;135m'
BG_SURFACE0='\033[48;2;49;50;68m'

BOLD='\033[1m'; STRIKE='\033[9m'; RESET='\033[0m'

# ── Progress bar builder ─────────────────────────────────────────────
# Usage: build_bar WIDTH PERCENTAGE BG_LOW BG_MID BG_HIGH LABEL
build_bar() {
    local width=$1 pct=$2 bg_low=$3 bg_mid=$4 bg_high=$5 label=$6
    local bg_fill
    if [ "$pct" -ge 85 ]; then bg_fill="$bg_high"
    elif [ "$pct" -ge 65 ]; then bg_fill="$bg_mid"
    else bg_fill="$bg_low"; fi
    local label_len=${#label}
    local pad_total=$((width - label_len))
    [ "$pad_total" -lt 0 ] && pad_total=0
    local pad_left=$((pad_total / 2))
    local pad_right=$((pad_total - pad_left))
    local full_text=$(printf '%*s%s%*s' "$pad_left" "" "$label" "$pad_right" "")
    local fill_pos=$((pct * width / 100))
    local filled="${full_text:0:$fill_pos}"
    local empty="${full_text:$fill_pos}"
    echo "${bg_fill}\033[30m${filled}${RESET}${BG_SURFACE0}${FG_SUBTEXT1}${empty}${RESET}"
}

# ── Git cache ────────────────────────────────────────────────────────
CACHE_DIR="/tmp/statusline-cache"
mkdir -p "$CACHE_DIR"
CACHE_KEY=$(echo "$DIR" | md5sum | cut -d' ' -f1)
CACHE_FILE="$CACHE_DIR/$CACHE_KEY"
CACHE_MAX_AGE=5

cache_is_stale() {
    [ ! -f "$CACHE_FILE" ] || \
    [ $(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0))) -gt $CACHE_MAX_AGE ]
}

BRANCH="" ; HAS_UPSTREAM=0 ; AHEAD=0 ; BEHIND=0 ; STAGED=0 ; MODIFIED=0 ; UNTRACKED=0 ; REMOTE_URL="" ; IS_WORKTREE=0

if git -C "$DIR" rev-parse --git-dir > /dev/null 2>&1; then
    if cache_is_stale; then
        BRANCH=$(git -C "$DIR" branch --show-current 2>/dev/null)
        # Detect worktree: git-dir differs from git-common-dir
        GIT_DIR=$(git -C "$DIR" rev-parse --git-dir 2>/dev/null)
        GIT_COMMON=$(git -C "$DIR" rev-parse --git-common-dir 2>/dev/null)
        [ "$GIT_DIR" != "$GIT_COMMON" ] && IS_WORKTREE=1
        # Only use the actual tracked upstream — no fallbacks
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
        echo "$BRANCH|$HAS_UPSTREAM|$AHEAD|$BEHIND|$STAGED|$MODIFIED|$UNTRACKED|$REMOTE_URL|$IS_WORKTREE" > "$CACHE_FILE"
    else
        IFS='|' read -r BRANCH HAS_UPSTREAM AHEAD BEHIND STAGED MODIFIED UNTRACKED REMOTE_URL IS_WORKTREE < "$CACHE_FILE"
    fi
fi

# ── LINE 1: Project ──────────────────────────────────────────────────
LINE1="📁 ${DIR##*/}"

# Git info
if [ -n "$BRANCH" ]; then
    # Branch or worktree icon
    if [ "$IS_WORKTREE" = "1" ]; then
        GIT_ICON="${FG_MAUVE}${RESET}"
    else
        GIT_ICON=""
    fi
    if [ "$HAS_UPSTREAM" = "1" ]; then
        SYNC_INFO="${FG_GREEN}↑${AHEAD}${RESET} ${FG_RED}↓${BEHIND}${RESET}"
    else
        SYNC_INFO="${FG_SUBTEXT0}↑- ↓-${RESET}"
    fi
    LINE1="${LINE1} | ${GIT_ICON} ${FG_GREEN}${BRANCH}${RESET} ${SYNC_INFO}"

    # Working tree status
    WT_PARTS=""
    [ "$STAGED" -gt 0 ]    && WT_PARTS="${WT_PARTS}${FG_GREEN}+${STAGED}${RESET} "
    [ "$MODIFIED" -gt 0 ]  && WT_PARTS="${WT_PARTS}${FG_PEACH}~${MODIFIED}${RESET} "
    [ "$UNTRACKED" -gt 0 ] && WT_PARTS="${WT_PARTS}${FG_SUBTEXT0}?${UNTRACKED}${RESET} "
    [ -n "$WT_PARTS" ] && LINE1="${LINE1} | ${WT_PARTS% }"

    # Lines changed (session total)
    if [ "$LINES_ADD" -gt 0 ] || [ "$LINES_REM" -gt 0 ]; then
        LINE1="${LINE1} | ${FG_GREEN}+${LINES_ADD}${RESET} ${FG_RED}-${LINES_REM}${RESET}"
    fi

    # Repo link (OSC 8 hyperlinks don't work in tmux through Claude Code's renderer)
    if [ -n "$REMOTE_URL" ]; then
        REPO_NAME=$(basename "$REMOTE_URL")
        if [ -n "$TMUX" ]; then
            LINE1="${LINE1} | 🔗 ${FG_SAPPHIRE}${REPO_NAME}${RESET} ${FG_OVERLAY0}${REMOTE_URL}${RESET}"
        else
            LINE1="${LINE1} | 🔗 \033]8;;${REMOTE_URL}\a${FG_SAPPHIRE}${REPO_NAME}${RESET}\033]8;;\a"
        fi
    fi
fi

# ── LINE 2: Session ─────────────────────────────────────────────────
# Format reset countdowns
NOW=$(date +%s)
REMAIN_5H=$(( RESET_5H - NOW ))
REMAIN_7D=$(( RESET_7D - NOW ))
[ "$REMAIN_5H" -lt 0 ] && REMAIN_5H=0
[ "$REMAIN_7D" -lt 0 ] && REMAIN_7D=0

# 5h: always h+m
R5H_H=$((REMAIN_5H / 3600))
R5H_M=$(((REMAIN_5H % 3600) / 60))
RESET_5H_FMT="${R5H_H}h ${R5H_M}m"

# 7d: days if >=1d, otherwise h+m
R7D_D=$((REMAIN_7D / 86400))
if [ "$R7D_D" -ge 1 ]; then
    R7D_H=$(((REMAIN_7D % 86400) / 3600))
    RESET_7D_FMT="${R7D_D}d ${R7D_H}h"
else
    R7D_H=$((REMAIN_7D / 3600))
    R7D_M=$(((REMAIN_7D % 3600) / 60))
    RESET_7D_FMT="${R7D_H}h ${R7D_M}m"
fi

# Build progress bars
CTX_BAR=$(build_bar 20 "$PCT" "$BG_GREEN" "$BG_PEACH" "$BG_RED" "${MODEL} ${TOKEN_LABEL}")
HOUR_BAR=$(build_bar 18 "$PCT_5H" "$BG_BLUE" "$BG_PEACH" "$BG_RED" "5h ${PCT_5H}% | ${RESET_5H_FMT}")
WEEK_BAR=$(build_bar 18 "$PCT_7D" "$BG_LAVENDER" "$BG_PEACH" "$BG_RED" "7d ${PCT_7D}% | ${RESET_7D_FMT}")

# Cost — strikethrough+dim for subscription, yellow for API
COST_FMT=$(printf '$%.2f' "$COST")
if [ "$PLAN" = "sub" ]; then
    COST_PART="💰 ${FG_OVERLAY0}${STRIKE}${COST_FMT}${RESET}"
else
    COST_PART="💰 ${FG_YELLOW}${COST_FMT}${RESET}"
fi

# Duration
DURATION_SEC=$((DURATION_MS / 1000))
MINS=$((DURATION_SEC / 60)); SECS=$((DURATION_SEC % 60))

LINE2="${CTX_BAR} ${HOUR_BAR} ${WEEK_BAR} | ${COST_PART} | ⏱️ ${MINS}m ${SECS}s"

# ── Output ───────────────────────────────────────────────────────────
printf '%b\n' "$LINE1"
printf '%b\n' "$LINE2"
