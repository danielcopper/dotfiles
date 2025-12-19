#!/bin/bash

HISTORY_FILE="/tmp/cpu-sparkline-history"
HISTORY_SIZE=12

# Get CPU usage by comparing two /proc/stat readings
get_cpu_usage() {
    read -r cpu user1 nice1 sys1 idle1 rest < /proc/stat
    sleep 0.2
    read -r cpu user2 nice2 sys2 idle2 rest < /proc/stat

    total1=$((user1 + nice1 + sys1 + idle1))
    total2=$((user2 + nice2 + sys2 + idle2))

    total_diff=$((total2 - total1))
    idle_diff=$((idle2 - idle1))

    if [[ $total_diff -gt 0 ]]; then
        usage=$(( (total_diff - idle_diff) * 100 / total_diff ))
    else
        usage=0
    fi

    echo $usage
}

# Read history or initialize
if [[ -f "$HISTORY_FILE" ]]; then
    history=$(cat "$HISTORY_FILE")
else
    history=""
fi

# Get current usage and append
current=$(get_cpu_usage)
history="$history $current"

# Trim to last N values
history=$(echo $history | tr ' ' '\n' | tail -n $HISTORY_SIZE | tr '\n' ' ')

# Save history
echo "$history" > "$HISTORY_FILE"

# Convert to sparkline
blocks=("▁" "▂" "▃" "▄" "▅" "▆" "▇" "█")
sparkline=""

for val in $history; do
    # Map 0-100 to 0-7
    idx=$((val * 7 / 100))
    [[ $idx -gt 7 ]] && idx=7
    [[ $idx -lt 0 ]] && idx=0
    sparkline="${sparkline}${blocks[$idx]}"
done

echo "󰍛 <span letter_spacing='-5000'>${sparkline}</span> ${current}%"
