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

# Copy to SDDM theme (requires sudo)
SDDM_BG_DIR="/usr/share/sddm/themes/Sugar-Candy/Backgrounds"
if [ -d "$SDDM_BG_DIR" ]; then
    sudo cp "$WALLPAPER" "$SDDM_BG_DIR/current.jpg"
    echo "SDDM wallpaper updated"
fi

# Also copy to ~/.config/backgrounds for consistency
cp "$WALLPAPER" ~/.config/backgrounds/current.jpg 2>/dev/null

echo "Wallpaper set: $WALLPAPER"
