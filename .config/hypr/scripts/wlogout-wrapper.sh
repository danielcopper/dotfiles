#!/bin/bash

# Get focused monitor resolution
read -r width height < <(hyprctl monitors -j | jq -r '.[] | select(.focused) | "\(.width) \(.height)"')

# Calculate margins proportionally
# Based on keybind ratios: 650/1920 ≈ 34% horizontal, ~25% vertical for reasonable button size
margin_h=$(( width * 28 / 100 ))
margin_v=$(( height * 38 / 100 ))

wlogout \
    -l ~/.config/wlogout/layout \
    -C ~/.config/wlogout/style.css \
    -b 5 \
    -c 20 \
    -r 0 \
    -L "$margin_h" \
    -R "$margin_h" \
    -T "$margin_v" \
    -B "$margin_v"
