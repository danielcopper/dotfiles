#!/bin/bash
# Wallpaper setter - syncs Desktop (swww) and SDDM

WALLPAPER="$1"

if [ -z "$WALLPAPER" ]; then
    echo "Usage: $0 <path-to-wallpaper>"
    exit 1
fi

if [ ! -f "$WALLPAPER" ]; then
    echo "File not found: $WALLPAPER"
    exit 1
fi

# Generate colors with matugen and set wallpaper with swww
matugen image "$WALLPAPER"
swww img "$WALLPAPER" --transition-type grow --transition-pos center

# Copy to SDDM (symlink points here, ACLs allow sddm to read)
cp "$WALLPAPER" ~/.config/sddm/current.jpg

echo "Wallpaper set: $WALLPAPER"
