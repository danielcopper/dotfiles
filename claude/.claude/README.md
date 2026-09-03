# Claude Code Configuration

Custom configuration for Claude Code: the issue/epic workflow system (skills + agents + guard hooks), TTS hooks, and settings.

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
| `block_dangerous_bash.py` | PreToolUse (Bash) | Judges `rm` by resolved target: below cwd or /tmp passes, elsewhere asks, roots/$HOME/disk-wipes are denied |
| `post_tool_use.py`      | PostToolUse      | Detect and announce errors                          |
| `stop.py`               | Stop             | TTS on task completion                              |
| `notification.py`       | Notification     | TTS when user input needed                          |
| `subagent_stop.py`      | SubagentStop     | TTS on subagent completion                          |
| `user_prompt_submit.py` | UserPromptSubmit | Prompt logging                                      |
| `session_start.py`      | SessionStart     | Load context on session init                        |
| `pre_compact.py`        | PreCompact       | Backup transcript before compaction                 |
| `block_ai_attribution.py` | PreToolUse (Bash) | Block commits carrying AI attribution markers     |
| `block_commit_on_main.py` | PreToolUse (Bash) | Protected-branch commits (main/develop/release/*) become a permission prompt |
| `block_plugin_code_reviewer.py` | PreToolUse (Agent) | Deny pr-review-toolkit's generic code-reviewer — routes to the custom `reviewer` agent |

### Debounce

TTS calls are debounced (2s) to prevent overlapping announcements when multiple hooks fire simultaneously. First hook wins.

## Workflow system

GitHub-issue work runs through user-invoked skills backed by two custom agents, a per-repo config file, and guard hooks. Everything global lives in this package (stowed); everything repo-specific lives in the repo.

### Skills (`skills/`)

| Skill                    | Invocation                     | Does                                                                                                                                              |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **implement**            | `/implement <issue#> [--go]`   | One issue end-to-end: read → align (questions one at a time; `--go` skips when nothing is unclear) → worktree + board → implementer → reviewer loop → gate evidence → PR draft → watch CI to green → merge per policy → user gate if due |
| **epic**                 | `/epic <epic#>`                | Assembly line over an epic's native sub-issues: align once on all issues, then the implement pipeline per issue, merging between issues (fresh worktree from updated main) |
| **plan-epic**            | `/plan-epic [topic\|issue#]`   | Planning only, never code: discuss → slice (tracer bullets, or expand→contract for wide refactors) → drafts for approval → epic + native sub-issues in Ready |
| **writing-great-skills** | reference                      | Vendored from [mattpocock/skills](https://github.com/mattpocock/skills) — the vocabulary for authoring/reviewing skills                            |
| **toolbox**              | `/toolbox`                     | Router: names every skill and when to reach for it — the entry point when unsure which skill fits                                                  |
| **next**                 | `/next [hint]`                 | Board picker: reads Ready + In Progress, open PRs, and recent commits, then commits to one recommendation for what to work on next                 |
| **deps-triage**          | `/deps-triage [merge]`         | Classify open dependency/chore PRs (SAFE / LOOK / STUCK) with reasoning; merges the safe bucket on OK                                              |
| **find-session**         | `/find-session <term>`         | Find past sessions by issue number or topic across all project dirs (incl. worktrees), with resume commands                                        |

### Agents (`agents/`)

| Agent           | Model | Role                                                                                                                                     |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **implementer** | Opus  | Builds exactly the brief, asks before guessing, escalates via `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`, commits in its worktree, never pushes |
| **reviewer**    | Opus  | Fresh-context, read-only. Spec compliance first, then quality; confidence-scored findings (reports ≥ 80 only), hard `Approved / Needs fixes` verdict     |

Standing rules encoded in the skills/agents (not in CLAUDE.md): the gate battery runs **once per code state** (green reports are trusted, nothing is ritually re-run); public text (PRs, issues) is drafted for approval; review findings are presented, the user rules on Minors; the issue **and** its parent epic go to In Progress on the board; a Fable-model reviewer only on explicit confirmation. Tool names (linter, type checker) never live in the global agents — they come from the repo config via the dispatch.

### Per-repo config (`<repo>/.claude/agents/workflow.md`)

Machine-readable facts the pipeline needs, schema in `skills/implement/workflow-config.md`: `gate` (the battery — prefer mise tasks mirroring CI), `review_checks` (changed-files linter/typecheck for the reviewer), `board` (GraphQL IDs), `worktree_task`, `merge_policy` + `merge_exceptions`, `green_definition`, `public_text_drafts`, `user_gate` (what only the user can verify — e.g. an on-device pass). `/implement` bootstraps the file when missing.

### Guard hooks

| Hook                      | Scope                                             | Blocks                                                            |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `block_ai_attribution.py` | global (`settings.json`)                          | `git commit` whose message carries AI attribution markers         |
| `block_commit_on_main.py` | global (`settings.json`)                          | `git commit` targeting a protected branch (main/master, develop, release/*) — turns into a permission prompt for explicit approval |
| `block_plugin_code_reviewer.py` | global (`settings.json`)                    | Spawning pr-review-toolkit's generic code-reviewer — denied with a redirect to the custom `reviewer` agent |

## Directory Structure

```
~/.claude/
├── CLAUDE.md                     # Global instructions (always loaded)
├── README.md                     # This file
├── setup.sh                      # New machine setup script
├── requirements.txt              # Python dependencies
├── settings.json                 # Permissions, hooks, env vars
├── settings.local.json           # Machine-local overrides
├── agents/                       # Custom subagents (implementer, reviewer)
├── skills/                       # User-invoked skills (implement, epic, plan-epic, …)
├── memory/                       # Global personal memory (see CLAUDE.md)
└── hooks/
    ├── config.toml               # Hook toggles, TTS config, security
    ├── config.json               # Legacy config (fallback)
    ├── block_ai_attribution.py   # Commit guard: no AI attribution
    ├── block_commit_on_main.py   # Commit guard: worktree branches only
    ├── block_plugin_code_reviewer.py  # Agent guard: route review to custom reviewer
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
