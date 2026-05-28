#!/bin/bash
# Visual demo for the four bar-fill strategies discussed in the
# disappearing-character thread. Lets you compare current (option 0) with
# the three candidate fixes (options 2 / 4 / 6) at any pct or animated.
#
# Usage:
#   ./statusline-bar-demo.sh           — animate 0→100→0
#   ./statusline-bar-demo.sh 42        — single frame at pct=42
#   ./statusline-bar-demo.sh 42 "Sonnet 4.6 200k"
#
# Variants:
#   0  current  partial-glyph OVERWRITES label char at fill boundary
#   2  snap     sub-cell precision in padding; in label range snap to
#               nearest full cell (rem≥4 → up, else down)
#   4  extend   partial-glyph inserted as NEW cell at boundary; bar width
#               oscillates W ↔ W+1 and label shifts right by 1 while
#               partial is active
#   6  outside  label sits in its own chip BEFORE the bar; bar contains
#               only a right-aligned pct readout

LABEL=${2:-"Opus 4.7 200k"}
PCT_ARG=$1
WIDTH=$((${#LABEL} + 2))

B_FG=$'\e[48;2;56;56;56;38;2;205;214;244m'
FILL_LOW=$'\e[48;5;114;38;2;17;17;27m'
FILL_MID=$'\e[48;5;216;38;2;17;17;27m'
FILL_HIGH=$'\e[48;5;174;38;2;17;17;27m'
R=$'\e[0m'

PARTIALS=('' '▏' '▎' '▍' '▌' '▋' '▊' '▉')

pick_fill() {
    local pct=$1
    if   [ "$pct" -ge 85 ]; then printf '%s' "$FILL_HIGH"
    elif [ "$pct" -ge 65 ]; then printf '%s' "$FILL_MID"
    else printf '%s' "$FILL_LOW"; fi
}

palette_idx_from_fill() {
    local fill=$1
    local idx=${fill#*48;5;}
    printf '%s' "${idx%%;*}"
}

prep() {
    # Common setup: clamp pct, compute fill colour, label padding, sub-cell
    # position. Returns via global vars to keep variants readable.
    P_PCT=$1; P_LABEL=$2; P_WIDTH=$3
    [ "$P_PCT" -lt 0 ] && P_PCT=0
    [ "$P_PCT" -gt 100 ] && P_PCT=100
    P_FILL=$(pick_fill "$P_PCT")
    P_IDX=$(palette_idx_from_fill "$P_FILL")
    P_PART_STYLE=$'\e[48;2;56;56;56;38;5;'"$P_IDX"'m'
    P_LLEN=${#P_LABEL}
    P_PAD=$((P_WIDTH - P_LLEN))
    [ "$P_PAD" -lt 0 ] && P_PAD=0
    P_PL=$((P_PAD / 2))
    P_PR=$((P_PAD - P_PAD / 2))
    P_FULL=$(printf '%*s%s%*s' "$P_PL" '' "$P_LABEL" "$P_PR" '')
    P_SUB=$((P_PCT * P_WIDTH * 8 / 100))
    [ "$P_PCT" -gt 0 ] && [ "$P_SUB" -lt 1 ] && P_SUB=1
    P_FCELLS=$((P_SUB / 8))
    P_REM=$((P_SUB % 8))
}

# Variant 0 — current behavior (partial-glyph overwrites label char).
variant_current() {
    prep "$1" "$2" "$3"
    if [ "$P_REM" -eq 0 ]; then
        printf '%s%s%s%s%s' "$P_FILL" "${P_FULL:0:P_FCELLS}" "$B_FG" "${P_FULL:P_FCELLS}" "$R"
    else
        printf '%s%s%s%s%s%s%s' \
            "$P_FILL" "${P_FULL:0:P_FCELLS}" \
            "$P_PART_STYLE" "${PARTIALS[P_REM]}" \
            "$B_FG" "${P_FULL:$((P_FCELLS+1))}" "$R"
    fi
}

# Variant 2 — snap inside the label, sub-cell elsewhere.
variant_snap() {
    prep "$1" "$2" "$3"
    if [ "$P_REM" -gt 0 ] && [ "$P_FCELLS" -ge "$P_PL" ] && [ "$P_FCELLS" -lt "$((P_PL + P_LLEN))" ]; then
        # Boundary lands on a label char → snap to nearest full cell.
        # Switch to round-up by changing this to: P_FCELLS=$((P_FCELLS+1))
        if [ "$P_REM" -ge 4 ]; then P_FCELLS=$((P_FCELLS + 1)); fi
        P_REM=0
    fi
    if [ "$P_REM" -eq 0 ]; then
        printf '%s%s%s%s%s' "$P_FILL" "${P_FULL:0:P_FCELLS}" "$B_FG" "${P_FULL:P_FCELLS}" "$R"
    else
        printf '%s%s%s%s%s%s%s' \
            "$P_FILL" "${P_FULL:0:P_FCELLS}" \
            "$P_PART_STYLE" "${PARTIALS[P_REM]}" \
            "$B_FG" "${P_FULL:$((P_FCELLS+1))}" "$R"
    fi
}

# Variant 4 — insert partial glyph as a NEW cell at the boundary; label is
# preserved 1:1 but shifts right by 1 cell while partial is active, and
# bar width grows from W to W+1.
variant_extend() {
    prep "$1" "$2" "$3"
    if [ "$P_REM" -eq 0 ]; then
        printf '%s%s%s%s%s' "$P_FILL" "${P_FULL:0:P_FCELLS}" "$B_FG" "${P_FULL:P_FCELLS}" "$R"
    else
        printf '%s%s%s%s%s%s%s' \
            "$P_FILL" "${P_FULL:0:P_FCELLS}" \
            "$P_PART_STYLE" "${PARTIALS[P_REM]}" \
            "$B_FG" "${P_FULL:P_FCELLS}" "$R"
    fi
}

# Variant 6 — label outside (in its own chip), bar is pure graphics with
# no text inside, pct readout sits in a chip after the bar. Nothing can
# ever be overwritten. Cost: ~doubles the total cell footprint of the
# component vs the inside-label variants.
variant_outside() {
    prep "$1" "$2" "$3"
    # Fixed inner bar width — 10 cells gives enough resolution to read
    # 10% steps at a glance while keeping the total footprint bounded.
    local bar_w=10
    # Bar content is all spaces (no text → nothing to overwrite).
    local content; content=$(printf '%*s' "$bar_w" '')
    local sub=$((P_PCT * bar_w * 8 / 100))
    [ "$P_PCT" -gt 0 ] && [ "$sub" -lt 1 ] && sub=1
    local fc=$((sub / 8)) rem=$((sub % 8))
    local label_chip; label_chip=$(printf '%s %s %s' "$B_FG" "$P_LABEL" "$R")
    local pct_chip; pct_chip=$(printf '%s %3d%% %s' "$B_FG" "$P_PCT" "$R")
    local bar_render
    if [ "$rem" -eq 0 ]; then
        bar_render=$(printf '%s%s%s%s%s' "$P_FILL" "${content:0:fc}" "$B_FG" "${content:fc}" "$R")
    else
        bar_render=$(printf '%s%s%s%s%s%s%s' \
            "$P_FILL" "${content:0:fc}" \
            "$P_PART_STYLE" "${PARTIALS[rem]}" \
            "$B_FG" "${content:$((fc+1))}" "$R")
    fi
    printf '%s %s %s' "$label_chip" "$bar_render" "$pct_chip"
}

render_frame() {
    local pct=$1
    printf '  pct=%3d  (label=%q  width=%d)\n' "$pct" "$LABEL" "$WIDTH"
    printf '    0 current : %s\n' "$(variant_current "$pct" "$LABEL" "$WIDTH")"
    printf '    2 snap    : %s\n' "$(variant_snap    "$pct" "$LABEL" "$WIDTH")"
    printf '    4 extend  : %s\n' "$(variant_extend  "$pct" "$LABEL" "$WIDTH")"
    printf '    6 outside : %s\n' "$(variant_outside "$pct" "$LABEL" "$WIDTH")"
}

if [ -n "$PCT_ARG" ]; then
    render_frame "$PCT_ARG"
else
    # Animation. Hide cursor for tidy redraw; restore on exit.
    printf '\e[?25l'
    trap 'printf "\e[?25h\n"' EXIT INT TERM
    for pct in $(seq 0 1 100) $(seq 100 -1 0); do
        printf '\e[H\e[J'
        render_frame "$pct"
        sleep 0.06
    done
fi
