# Claude Code Configuration

This directory contains custom configurations for Claude Code including skills, hooks, commands, and agents.

## Directory Structure

```
~/.claude/
├── README.md                          # This file
├── settings.json                      # Hook and permission configuration
├── skills/                            # Custom skills (model-invoked)
│   └── commit-message/
│       ├── SKILL.md                   # Conventional Commits guidelines
│       └── reference.md               # Commit message examples
└── hooks/                             # Event-triggered automation
    ├── notification.py                # User input alerts with TTS
    ├── stop.py                        # Task completion announcements
    ├── subagent_stop.py              # Subagent completion alerts
    ├── post_tool_use.py              # Error/warning detection
    ├── logs/                          # JSON logs for all events
    └── utils/
        └── tts/                       # Text-to-speech utilities
            ├── speak.py               # TTS manager with fallback
            ├── openai_tts.py         # Premium OpenAI voices
            └── windows_tts.py        # Windows TTS (WSL)
```

## Features

### 1. Commit Message Skill

**Location**: `~/.claude/skills/commit-message/`

**Purpose**: Automatically enforces Conventional Commits format when helping with git commits.

**Format**: `type(scope): subject`

**Supported types**:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Testing
- `build` - Build system
- `ci` - CI/CD
- `chore` - Other changes

**Features**:
- Flexible detail level (adapts to change complexity)
- Breaking change notices (`BREAKING CHANGE:` footer)
- Issue references (`Closes #123`, `Fixes #456`, `Refs #789`)
- Comprehensive examples in `reference.md`

**Activation**: Automatic when Claude helps with commits.

### 2. TTS Hook System

**Location**: `~/.claude/hooks/`

**Purpose**: Provides audible feedback for key events during Claude Code sessions.

#### TTS Priority System

1. **OpenAI TTS** (premium, requires `OPENAI_API_KEY`)
   - Natural-sounding voices
   - Uses "nova" voice with 1.1x speed
   - Requires OpenAI API key in environment

2. **Windows TTS** (fallback, no API needed)
   - Uses Windows Speech Synthesis via PowerShell
   - Works from WSL without additional setup
   - Rate: 2, Volume: 80

#### Hook Events

##### Notification Hook (`notification.py`)
**Trigger**: When Claude needs user input or sends notifications

**Announcements**:
- "Input needed. Claude is waiting for your response."
- "Question ready. Please provide your answer."
- "Permission needed. Please review the request."

**Logging**: `~/.claude/hooks/logs/notification.json`

##### Stop Hook (`stop.py`)
**Trigger**: When Claude finishes responding

**Announcements** (contextual based on tools used):
- "Code changes completed. Files have been modified." (Write/Edit)
- "Command execution completed." (Bash)
- "File analysis complete." (Read)
- "Search completed." (Grep/Glob)
- "Agent task completed." (Task)

**Logging**: `~/.claude/hooks/logs/stop.json`

##### SubagentStop Hook (`subagent_stop.py`)
**Trigger**: When a subagent completes its task

**Announcements**:
- "Code exploration complete"
- "Planning agent finished"
- "Code review complete"
- "Work planning complete"

**Logging**: `~/.claude/hooks/logs/subagent_stop.json`

##### PostToolUse Hook (`post_tool_use.py`)
**Trigger**: After any tool execution

**Purpose**: Detects and announces errors/warnings

**Detection**:
- Error fields in tool results
- stderr output with error keywords
- Non-zero exit codes
- Exception tracebacks

**Announcements**:
- "Warning: Bash error detected"
- "Warning: Command failed with errors"

**Logging**: `~/.claude/hooks/logs/post_tool_use.json` (last 100 entries)

## Configuration

### settings.json

All hooks are configured in `~/.claude/settings.json`:

```json
{
  "alwaysThinkingEnabled": true,
  "hooks": {
    "Notification": [/* ... */],
    "Stop": [/* ... */],
    "SubagentStop": [/* ... */],
    "PostToolUse": [/* ... */]
  }
}
```

Each hook:
- Matches all events (`matcher: "*"`)
- Runs with `--notify` flag for TTS
- Has 25-second timeout
- Executes via `python3`

## Setup Instructions

### Prerequisites

- **Claude Code** installed
- **Python 3** (already on most systems)
- **WSL** (if on Windows) - for Windows TTS access

### Optional: Premium TTS

To enable OpenAI TTS (premium voices):

```bash
# Install OpenAI Python library
pip install openai

# Set API key in your shell profile (~/.bashrc, ~/.zshrc, etc.)
export OPENAI_API_KEY="your-api-key-here"
```

### Verification

Test TTS system:

```bash
# Test Windows TTS
python3 ~/.claude/hooks/utils/tts/windows_tts.py "Test message"

# Test TTS manager (tries OpenAI → Windows)
python3 ~/.claude/hooks/utils/tts/speak.py "Testing TTS priority system"
```

Test individual hooks:

```bash
# Test notification hook
echo '{"hookSpecificInput": {"type": "user_input_needed", "message": "Test notification"}}' | \
  python3 ~/.claude/hooks/notification.py --notify

# Test stop hook
echo '{"hookSpecificInput": {}, "transcript": []}' | \
  python3 ~/.claude/hooks/stop.py --notify
```

## Usage

### Skills

Skills are automatically invoked by Claude when relevant:

- **Commit messages**: Claude will automatically use Conventional Commits format when helping with git commits

### Hooks

Hooks run automatically during Claude Code sessions:

- **Notification**: Announces when your input is needed
- **Stop**: Announces when Claude finishes a task
- **SubagentStop**: Announces when subagents complete
- **PostToolUse**: Announces errors/warnings

### Logs

All hook events are logged to JSON files in `~/.claude/hooks/logs/`:

```bash
# View recent notifications
cat ~/.claude/hooks/logs/notification.json | jq '.[-5:]'

# View stop events
cat ~/.claude/hooks/logs/stop.json | jq '.[-5:]'

# View subagent completions
cat ~/.claude/hooks/logs/subagent_stop.json | jq '.[-5:]'

# View tool use logs
cat ~/.claude/hooks/logs/post_tool_use.json | jq '.[-10:]'
```

## Customization

### Modifying TTS Messages

Edit the hook files to customize messages:

- **notification.py**: Lines 40-55 (message generation)
- **stop.py**: Lines 32-54 (contextual messages)
- **subagent_stop.py**: Lines 32-52 (subagent names)
- **post_tool_use.py**: Lines 32-60 (error detection)

### Adjusting TTS Voice Settings

**Windows TTS** (`windows_tts.py`):
```python
$synth.Rate = 2        # Speed (0-10, default: 2)
$synth.Volume = 80     # Volume (0-100, default: 80)
```

**OpenAI TTS** (`openai_tts.py`):
```python
model="tts-1"          # or "tts-1-hd" for higher quality
voice="nova"           # alloy, echo, fable, onyx, nova, shimmer
speed=1.1              # 0.25 to 4.0
```

### Disabling Specific Hooks

To disable a hook, remove it from `settings.json` or remove the `--notify` flag to keep logging but disable TTS.

### Adding Custom Hooks

Claude Code supports these hook events:

- `UserPromptSubmit` - Before Claude processes user input
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool execution (already configured)
- `Notification` - User input needed (already configured)
- `Stop` - Claude finishes responding (already configured)
- `SubagentStop` - Subagent completes (already configured)
- `SessionStart` - Session initialization
- `SessionEnd` - Session termination
- `PreCompact` - Before context compaction

## Troubleshooting

### No TTS Output

1. **Test Windows TTS directly**:
   ```bash
   powershell.exe -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('Test')"
   ```

2. **Check hook execution**:
   ```bash
   # Verify hooks are executable
   ls -l ~/.claude/hooks/*.py

   # Check logs for errors
   cat ~/.claude/hooks/logs/*.json | jq '.[] | select(.error)'
   ```

3. **Test hook directly**:
   ```bash
   echo '{}' | python3 ~/.claude/hooks/stop.py --notify
   ```

### Hooks Not Running

1. **Verify settings.json is valid**:
   ```bash
   cat ~/.claude/settings.json | jq '.'
   ```

2. **Check hook permissions**:
   ```bash
   chmod +x ~/.claude/hooks/*.py
   chmod +x ~/.claude/hooks/utils/tts/*.py
   ```

3. **Check Python availability**:
   ```bash
   which python3
   python3 --version
   ```

### OpenAI TTS Not Working

1. **Check API key**:
   ```bash
   echo $OPENAI_API_KEY
   ```

2. **Install OpenAI library**:
   ```bash
   pip install openai
   ```

3. **Test directly**:
   ```bash
   python3 ~/.claude/hooks/utils/tts/openai_tts.py "Test OpenAI"
   ```

## Future Enhancements

Potential additions to this configuration:

- **Custom slash commands** (`.claude/commands/`)
  - `/deploy` - Complex deployment workflows
  - `/test-full` - Run complete test suite with reporting
  - `/review-pr` - Automated PR review process

- **Sub-agents** (`.claude/agents/`)
  - Specialized agents for specific tasks
  - Custom system prompts
  - Controlled tool access

- **Additional hooks**
  - `SessionStart` - Load development context on startup
  - `PreToolUse` - Validate/block dangerous commands
  - `PreCompact` - Backup transcripts before compaction

- **Output styles** (`.claude/output-styles/`)
  - Custom response formatting
  - Project-specific templates

## Resources

- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/)
- [Hooks Guide](https://docs.claude.com/en/docs/claude-code/hooks-guide)
- [Skills Documentation](https://docs.claude.com/en/docs/claude-code/skills)
- [Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Conventional Commits](https://www.conventionalcommits.org/)

## License

This configuration is part of your personal dotfiles and can be freely modified and shared.

---

**Created**: 2025-10-31
**Last Updated**: 2025-10-31
**Claude Code Version**: Latest
