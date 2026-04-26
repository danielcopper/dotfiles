#!/usr/bin/env bash
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
MODELS_DIR="$CLAUDE_DIR/hooks/utils/tts/models"

echo "=== Claude Code Setup ==="

# ── Step 1: Python dependencies ──────────────────────────────────────
# Install to the user site so this works on PEP 668 distros (Arch, Debian
# 12+, …) without --break-system-packages. python3 -m pip is more
# portable than the bare `pip` binary, which may not exist on all hosts.
echo ""
echo "[1/3] Installing Python dependencies..."
python3 -m pip install --user -q -r "$CLAUDE_DIR/requirements.txt"
echo "  Done."

# ── Step 2: System packages (audio) ─────────────────────────────────
echo ""
echo "[2/3] Checking audio setup..."

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

if is_wsl; then
    echo "  WSL detected."
    if [[ -e /mnt/wslg/PulseServer ]]; then
        echo "  WSLg PulseAudio available — native audio works."
    else
        echo "  WARNING: WSLg PulseAudio not found (/mnt/wslg/PulseServer)."
        echo "  TTS will fall back to PowerShell (slower)."
        echo "  Try: wsl --update && wsl --shutdown, then restart."
    fi
    # Ensure paplay is available
    if ! command -v paplay &>/dev/null; then
        echo "  Installing pulseaudio client..."
        if command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm libpulse 2>/dev/null || true
        elif command -v apt &>/dev/null; then
            sudo apt install -y pulseaudio-utils 2>/dev/null || true
        fi
    fi
    echo "  paplay: $(command -v paplay 2>/dev/null || echo 'not found')"
else
    echo "  Native Linux detected."
    if command -v paplay &>/dev/null; then
        echo "  paplay available."
    elif command -v aplay &>/dev/null; then
        echo "  aplay available."
    else
        echo "  WARNING: No audio player found. Install pulseaudio or alsa-utils."
    fi
fi

# ── Step 3: TTS models ──────────────────────────────────────────────
echo ""
echo "[3/3] Downloading TTS models..."
mkdir -p "$MODELS_DIR"

download_if_missing() {
    local file="$1" url="$2"
    if [[ -f "$MODELS_DIR/$file" ]]; then
        echo "  $file — already exists."
    else
        echo "  $file — downloading..."
        curl -L --progress-bar -o "$MODELS_DIR/$file" "$url"
    fi
}

# Kokoro - int8 (88 MB, fast, default)
download_if_missing "kokoro-v1.0.int8.onnx" \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"

# Kokoro - voices (27 MB)
download_if_missing "voices-v1.0.bin" \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

# Piper - en_US lessac high (109 MB, fallback)
download_if_missing "en_US-lessac-high.onnx" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx"
download_if_missing "en_US-lessac-high.onnx.json" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Models:"
ls -lh "$MODELS_DIR"
echo ""
echo "Config: $CLAUDE_DIR/hooks/config.toml"
echo "To change TTS voice/provider, edit config.toml"
