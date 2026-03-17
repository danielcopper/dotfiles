# Claude Code Configuration

Custom configuration for Claude Code: agents, hooks, commands, and settings.

## Multi-Agent Implementation Workflow

Start with `/implement`:

```
/implement <task description> [flags: --quick, --resume, --team]
```

| Flag | Description |
|------|-------------|
| `--quick` | Skip planning. Single coder with self-review. |
| `--team` | Use experimental team agents instead of subagents. |
| `--resume [id]` | Resume in-progress work. Without ID: show open workflows and ask which to resume. |

### Workflow

```
Plan ──▶ Implement ──▶ Done
              │
         ┌────┴────┐
         ▼         │
       Coder ──▶ Reviewer
         ▲         │
         └─────────┘
          fix loop
        (until clean)
```

**Phase 1 — Plan**:
Planner agent explores the codebase and creates a detailed implementation plan with sequential tasks. User can choose 1 or 2 planners (parallel comparison). Planner stays alive for plan revisions until approved.

**Phase 2 — Implement** (per task):
1. **Coder** implements the task (testing approach chosen by user: TDD, test-after, or none)
2. User approves the commit (shown with suggested message)
3. **Reviewer** checks for security, quality, performance issues
4. Reviewer reports findings to **orchestrator** (not directly to coder) — user decides
5. If fix needed → findings go to **Coder** → **Reviewer** re-checks
6. Loop repeats until clean or user accepts remaining issues (max 3 cycles)
7. Task marked complete, next task starts

Each phase has user approval gates. Supervision level (strict/normal/guided/relaxed) controls how much the workflow pauses for approval. Execution mode (subagents or team agents) is chosen after plan approval.

### Agents

| Agent | Role | Model |
|-------|------|-------|
| **planner** | Analyzes requirements, creates implementation plans | Opus |
| **coder** | Implements tasks with tests (TDD), self-reviews | Sonnet |
| **reviewer** | Reviews for security, quality, performance | Sonnet |
| **architect** | Designs system architecture for large features | Opus |
| **documenter** | Updates documentation for code changes | Sonnet |

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
