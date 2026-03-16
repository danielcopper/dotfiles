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

# Format token capacity: 200000→"200k", 1000000→"1m"
if [ "$MAX_TOKENS" -ge 1000000 ]; then
    TOKEN_LABEL="$((MAX_TOKENS / 1000000))m"
else
    TOKEN_LABEL="$((MAX_TOKENS / 1000))k"
fi

# ── Colors ───────────────────────────────────────────────────────────
CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'
MAGENTA='\033[35m'; DIM='\033[2m'; RESET='\033[0m'

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
    LIGHT_GREY='\033[37m'; ORANGE='\033[38;5;208m'
    # Branch or worktree icon
    if [ "$IS_WORKTREE" = "1" ]; then
        GIT_ICON="${MAGENTA}${RESET}"
    else
        GIT_ICON=""
    fi
    if [ "$HAS_UPSTREAM" = "1" ]; then
        SYNC_INFO="${GREEN}↑${AHEAD}${RESET} ${RED}↓${BEHIND}${RESET}"
    else
        SYNC_INFO="${LIGHT_GREY}↑- ↓-${RESET}"
    fi
    LINE1="${LINE1} | ${GIT_ICON} ${GREEN}${BRANCH}${RESET} ${SYNC_INFO}"

    # Working tree status
    WT_PARTS=""
    [ "$STAGED" -gt 0 ]    && WT_PARTS="${WT_PARTS}${GREEN}+${STAGED}${RESET} "
    [ "$MODIFIED" -gt 0 ]  && WT_PARTS="${WT_PARTS}${ORANGE}~${MODIFIED}${RESET} "
    [ "$UNTRACKED" -gt 0 ] && WT_PARTS="${WT_PARTS}${LIGHT_GREY}?${UNTRACKED}${RESET} "
    [ -n "$WT_PARTS" ] && LINE1="${LINE1} | ${WT_PARTS% }"

    # Lines changed (session total) — next to branch info
    if [ "$LINES_ADD" -gt 0 ] || [ "$LINES_REM" -gt 0 ]; then
        LINE1="${LINE1} | ${GREEN}+${LINES_ADD}${RESET} ${RED}-${LINES_REM}${RESET}"
    fi

    # Clickable repo link at the end
    if [ -n "$REMOTE_URL" ]; then
        REPO_NAME=$(basename "$REMOTE_URL")
        LINE1="${LINE1} | 🔗 \033]8;;${REMOTE_URL}\a${CYAN}${REPO_NAME}${RESET}\033]8;;\a"
    fi
fi

# ── LINE 2: Session ─────────────────────────────────────────────────
# Background colors for progress bar
BG_GREEN='\033[42m'; BG_YELLOW='\033[43m'; BG_RED='\033[41m'
BG_DARK='\033[48;5;236m'
FG_WHITE='\033[97m'; BOLD='\033[1m'

# Fill color based on context usage
if [ "$PCT" -ge 80 ]; then BG_FILL="$BG_RED"
elif [ "$PCT" -ge 50 ]; then BG_FILL="$BG_YELLOW"
else BG_FILL="$BG_GREEN"; fi

# Build label centered in bar: "Model TOKENs"
LABEL="${MODEL} ${TOKEN_LABEL}"
BAR_WIDTH=20
LABEL_LEN=${#LABEL}
PAD_TOTAL=$((BAR_WIDTH - LABEL_LEN))
PAD_LEFT=$((PAD_TOTAL / 2))
PAD_RIGHT=$((PAD_TOTAL - PAD_LEFT))
FULL_TEXT=$(printf '%*s%s%*s' "$PAD_LEFT" "" "$LABEL" "$PAD_RIGHT" "")

# Split at fill position — left portion gets fill bg, right gets dark bg
FILL_POS=$((PCT * BAR_WIDTH / 100))
FILLED_PART="${FULL_TEXT:0:$FILL_POS}"
EMPTY_PART="${FULL_TEXT:$FILL_POS}"
PROGRESS_BAR="${BG_FILL}${FG_WHITE}${BOLD}${FILLED_PART}${RESET}${BG_DARK}${FG_WHITE}${EMPTY_PART}${RESET}"

# Cost — strikethrough+dim for subscription, yellow for API
STRIKE='\033[9m'
COST_FMT=$(printf '$%.2f' "$COST")
if [ "$PLAN" = "sub" ]; then
    COST_PART="💰 ${DIM}${STRIKE}${COST_FMT}${RESET}"
else
    COST_PART="💰 ${YELLOW}${COST_FMT}${RESET}"
fi

# Duration
DURATION_SEC=$((DURATION_MS / 1000))
MINS=$((DURATION_SEC / 60)); SECS=$((DURATION_SEC % 60))

LINE2="${PROGRESS_BAR} | ${COST_PART} | ⏱️ ${MINS}m ${SECS}s"

# ── Output ───────────────────────────────────────────────────────────
printf '%b\n' "$LINE1"
printf '%b\n' "$LINE2"
