# Claude Code Configuration

Custom configuration for Claude Code: agents, hooks, commands, and settings.

## Directory Structure

```
~/.claude/
├── CLAUDE.md                  # Global instructions (loaded every session)
├── settings.json              # Hooks, permissions, env vars
├── settings.local.json        # Machine-local overrides (gitignored)
├── agents/                    # Custom subagents
│   ├── architect.md           # System architecture design (Opus)
│   ├── planner.md             # Implementation planning (Opus)
│   ├── coder.md               # TDD implementation (Sonnet)
│   ├── reviewer.md            # Code review (Sonnet)
│   └── documenter.md          # Documentation updates (Sonnet)
├── commands/                  # Slash commands
│   └── implement.md           # Multi-agent workflow orchestration
└── hooks/                     # Event-triggered automation
    ├── config.json            # Hook feature toggles + security config
    ├── notification.py        # User input alerts with TTS
    ├── stop.py                # Task completion announcements
    ├── subagent_stop.py       # Subagent completion alerts
    ├── post_tool_use.py       # Error/warning detection
    ├── pre_tool_use.py        # Safety checks before tool execution
    ├── user_prompt_submit.py  # Pre-process user input
    ├── session_start.py       # Session initialization + context loading
    ├── pre_compact.py         # Transcript backup before compaction
    ├── toggle.py              # Enable/disable hooks at runtime
    └── utils/
        ├── common.py          # Shared hook utilities
        ├── config.py          # Config loading from config.json
        ├── notify/            # Desktop notifications (toast, sound, debounce)
        ├── tts/               # Text-to-speech
        │   ├── speak.py       # TTS manager (OpenAI → Windows fallback)
        │   ├── openai_tts.py  # OpenAI TTS (requires OPENAI_API_KEY)
        │   └── windows_tts.py # Windows Speech Synthesis via PowerShell (WSL)
        └── llm/
            └── openai_completion.py  # LLM-generated messages
```

## Multi-Agent Implementation Workflow

Start with `/implement`:

```
/implement <task> [--quick] [--no-explore] [--team] [--resume [id]]
```

Phases: **Plan** (planner agent) → **Implement** (coder agent, TDD) → **Review** (reviewer agent) → **Done**

Each phase has user approval gates. Tasks are implemented sequentially to avoid conflicts.

## Hooks

All hooks are configured in `settings.json` and can be toggled via `hooks/config.json`.

| Hook | Event | Purpose |
|------|-------|---------|
| `notification.py` | Notification | TTS alert when user input needed |
| `stop.py` | Stop | TTS announcement on task completion |
| `subagent_stop.py` | SubagentStop | TTS alert on subagent completion |
| `post_tool_use.py` | PostToolUse | Detect and announce errors/warnings |
| `pre_tool_use.py` | PreToolUse | Safety checks (dangerous commands, protected paths) |
| `user_prompt_submit.py` | UserPromptSubmit | Pre-process user prompts |
| `session_start.py` | SessionStart | Load context on session init |
| `pre_compact.py` | PreCompact | Backup transcript before compaction |
| `toggle.py` | — | Runtime hook enable/disable utility |

### TTS Priority

1. **OpenAI TTS** — natural voices, requires `OPENAI_API_KEY` in `~/.bash_profile`
2. **Windows TTS** — fallback via PowerShell (no setup needed on WSL)

## Setup

- **Python 3** required
- **OpenAI TTS** (optional): `pip install openai` + set `OPENAI_API_KEY` in `~/.bash_profile`
- Hooks are registered in `settings.json` and run automatically
