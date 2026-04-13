# Claude Code Configuration

Custom configuration for Claude Code: hooks, TTS, agents, and commands.

## Quick Start

```bash
# New machine setup — installs Python deps + downloads TTS models
~/.claude/setup.sh
```

Works on **Arch** and **Ubuntu/Debian** (auto-detects package manager).

Requirements:

- Python 3.12+
- `curl` for model downloads

### WSL2 Audio Prerequisites

TTS uses PulseAudio via WSLg. This works out of the box on Windows 11 if:

- WSLg is enabled (`guiApplications` is not set to `false` in `~/.wslconfig`)
- WSL is up to date (`wsl --update`)

`setup.sh` auto-installs `libpulse` (Arch) or `pulseaudio-utils` (Ubuntu).
If audio doesn't work, try `wsl --shutdown` and restart.

On native Linux, any PulseAudio or ALSA setup works — `paplay` or `aplay`.

## TTS (Text-to-Speech)

Hooks announce task completions, notifications, and questions via TTS.

### Providers (configured in `hooks/config.toml`)

| Provider             | Quality   | Latency | Setup      | Languages                  |
| -------------------- | --------- | ------- | ---------- | -------------------------- |
| **Kokoro** (default) | Excellent | ~2s     | `setup.sh` | EN, JP, KR, CN, FR, ES, IT |
| **Piper**            | Good      | ~1s     | `setup.sh` | EN, DE, FR, ES, + 30 more  |
| **Windows**          | Robotic   | ~3s     | None (WSL) | EN                         |

### Audio Playback

Playback method is auto-detected:

1. **paplay** — native PulseAudio via WSLg (fastest, ~0ms overhead)
2. **PowerShell** — fallback for WSL without WSLg (~2s overhead)

### Configuration

Edit `hooks/config.toml`:

```toml
[tts]
provider = "kokoro"          # kokoro, piper, windows
voice = "am_michael"         # see config.toml for full voice list
kokoro_model = "kokoro-v1.0.int8"  # int8 (88MB) or fp16 (170MB)
```

### Models

Models live in `hooks/utils/tts/models/` (gitignored, downloaded by `setup.sh`):

| Model                    | Size   | Provider         |
| ------------------------ | ------ | ---------------- |
| `kokoro-v1.0.int8.onnx`  | 88 MB  | Kokoro (default) |
| `voices-v1.0.bin`        | 27 MB  | Kokoro voices    |
| `en_US-lessac-high.onnx` | 109 MB | Piper fallback   |

## Hooks

Configured in `settings.json`, toggled in `hooks/config.toml`.

| Hook                    | Event            | Purpose                                             |
| ----------------------- | ---------------- | --------------------------------------------------- |
| `pre_tool_use.py`       | PreToolUse       | Security guard — blocks dangerous ops (fail-closed) |
| `post_tool_use.py`      | PostToolUse      | Detect and announce errors                          |
| `stop.py`               | Stop             | TTS on task completion                              |
| `notification.py`       | Notification     | TTS when user input needed                          |
| `subagent_stop.py`      | SubagentStop     | TTS on subagent completion                          |
| `user_prompt_submit.py` | UserPromptSubmit | Prompt logging                                      |
| `session_start.py`      | SessionStart     | Load context on session init                        |
| `pre_compact.py`        | PreCompact       | Backup transcript before compaction                 |

### Debounce

TTS calls are debounced (2s) to prevent overlapping announcements when multiple hooks fire simultaneously. First hook wins.

## Agents

| Agent          | Role                    | Model  |
| -------------- | ----------------------- | ------ |
| **planner**    | Implementation planning | Opus   |
| **coder**      | TDD implementation      | Sonnet |
| **reviewer**   | Code review             | Sonnet |
| **architect**  | System architecture     | Opus   |
| **documenter** | Documentation           | Sonnet |

Use `/implement <task>` to start the multi-agent workflow.

## Directory Structure

```
~/.claude/
├── CLAUDE.md                     # Global instructions (always loaded)
├── README.md                     # This file
├── setup.sh                      # New machine setup script
├── requirements.txt              # Python dependencies
├── settings.json                 # Permissions, hooks, env vars
├── settings.local.json           # Machine-local overrides
├── agents/                       # Custom subagent definitions
├── commands/                     # Slash commands
└── hooks/
    ├── config.toml               # Hook toggles, TTS config, security
    ├── config.json               # Legacy config (fallback)
    ├── pre_tool_use.py           # Security guard (fail-closed)
    ├── post_tool_use.py          # Error detection
    ├── stop.py                   # Completion TTS
    ├── notification.py           # Input-needed TTS
    ├── subagent_stop.py          # Subagent TTS
    ├── user_prompt_submit.py     # Prompt logging
    ├── session_start.py          # Context loader
    ├── pre_compact.py            # Transcript backup
    └── utils/
        ├── common.py             # Shared: TTS messages, logging, announce()
        ├── config.py             # TOML/JSON config loader
        ├── notify/               # Desktop notifications
        └── tts/
            ├── speak.py          # Provider dispatcher + fallback chain
            ├── playback.py       # Audio playback (paplay / PowerShell)
            ├── kokoro_tts.py     # Kokoro ONNX provider
            ├── piper_tts.py      # Piper provider
            ├── windows_tts.py    # Windows Speech Synthesis (legacy)
            └── models/           # TTS models (gitignored, via setup.sh)
```
