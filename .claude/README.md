# Claude Code Configuration

This directory contains custom configurations for Claude Code including skills, hooks, commands, and agents.

## Quick Start

1. **Install dependencies** (Arch Linux):
   ```bash
   sudo pacman -S python-openai  # Optional, for premium TTS
   ```

2. **Configure API key** (optional, for OpenAI TTS):
   ```bash
   # Add to ~/.bash_profile
   export OPENAI_API_KEY="sk-your-key-here"
   ```

3. **⚠️ Important**: Hooks do NOT work in your home directory
   - Navigate to any project: `cd ~/projects/my-project`
   - Then start Claude Code

4. **Verify** with `/hooks` command in Claude Code

**Windows TTS works by default** - no setup needed!

## Directory Structure

```
~/.claude/
├── README.md                          # This file
├── settings.json                      # Hook and permission configuration
├── agents/                            # Custom subagents (specialized AI assistants)
│   ├── feature-planner.md             # Planning agent for implementation plans
│   ├── feature-coder.md               # Coding agent for implementation
│   └── feature-reviewer.md            # Review agent for code quality
├── commands/                          # Custom slash commands (user-invoked)
│   └── feature-implementation.md      # Multi-agent workflow orchestration
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
        ├── tts/                       # Text-to-speech utilities
        │   ├── speak.py               # TTS manager with fallback
        │   ├── openai_tts.py         # Premium OpenAI voices
        │   └── windows_tts.py        # Windows TTS (WSL)
        └── llm/                       # LLM utilities
            └── openai_completion.py  # LLM-generated messages
```

## Features

### 1. Multi-Agent Feature Implementation System

**Location**: `~/.claude/agents/` and `~/.claude/commands/`

**Purpose**: Orchestrates complex feature development using specialized AI agents for planning, coding, and reviewing.

#### Usage

Start the workflow with:
```
/feature-implementation <user-story> [additional context]
```

Or without arguments to provide context interactively.

#### The Workflow

**Phase 1: Planning**
1. Provide user story and context
2. Choose 1 or 2 planners (parallel planners compare approaches)
3. Planning agent explores codebase and creates detailed implementation plan
4. Review and approve the plan (or request modifications)

**Phase 2: Implementation**
1. Tasks are implemented sequentially (one at a time to avoid merge conflicts)
2. Coding agent implements each task with tests
3. Optional: Review agent checks for security, test coverage, quality, and performance
4. If issues found: Coding agent fixes them, then re-review
5. Progress tracked with visible checklist

**Phase 3: Completion**
- All changes summarized
- Final test suite run
- Suggested next steps

#### The Agents

**feature-planner** (`~/.claude/agents/feature-planner.md`)
- **Role**: Analyzes requirements, explores codebase, creates implementation plans
- **Tools**: Read, Glob, Grep, Task (read-only)
- **Model**: Sonnet
- **Approach**: Hybrid - takes provided context, explores to fill gaps
- **Output**: Structured plan with sequential tasks, file changes, testing strategy

**feature-coder** (`~/.claude/agents/feature-coder.md`)
- **Role**: Implements features with tests and quality focus
- **Tools**: All tools (Read, Write, Edit, Bash, etc.)
- **Model**: Sonnet
- **Focus**: Clean code, comprehensive tests, security best practices
- **Output**: Implementation with tests and verification

**feature-reviewer** (`~/.claude/agents/feature-reviewer.md`)
- **Role**: Reviews implementations for quality and correctness
- **Tools**: Read, Glob, Grep, Bash (read-only, no edits)
- **Model**: Sonnet
- **Review Focus**:
  - ⚠️ Security vulnerabilities (OWASP Top 10)
  - 🧪 Test coverage (unit, integration, edge cases)
  - 📐 Code quality (patterns, maintainability)
  - ⚡ Performance (bottlenecks, optimization)
- **Output**: Detailed review with severity levels (CRITICAL/HIGH/MEDIUM/LOW)

#### Benefits

- **Structured approach**: Clear planning before implementation
- **Quality focus**: Dedicated review phase catches issues early
- **Separation of concerns**: Each agent is expert in their domain
- **Visibility**: Progress tracking and decision points
- **Flexibility**: Choose 1 or 2 planners, optional reviews
- **Safety**: Sequential implementation avoids merge conflicts

#### Example

```bash
# In Claude Code session:
/feature-implementation Add user authentication with JWT tokens and refresh tokens. Should integrate with existing user model and protect sensitive routes.

# Claude will:
# 1. Ask if you want 1 or 2 planners
# 2. Generate and present implementation plan
# 3. Get your approval
# 4. Implement each task sequentially
# 5. Offer review after each task
# 6. Track progress with checklist
# 7. Summarize all changes when complete
```

### 2. Commit Message Skill

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
   - **Also powers LLM-generated completion messages** (see below)

2. **Windows TTS** (fallback, no API needed)
   - Uses Windows Speech Synthesis via PowerShell
   - Works from WSL without additional setup
   - Rate: 2, Volume: 80

#### LLM-Generated Messages

**Stop** and **SubagentStop** hooks use OpenAI's API to generate **varied, friendly completion messages** instead of repetitive hardcoded text.

**How it works**:
- Uses `gpt-4o-mini` (fast and cost-effective)
- Generates short messages (under 10 words)
- Positive, future-focused tone
- Examples: "Ready for the next challenge!", "All set! What's next?", "Done and dusted! Let's keep going."
- Falls back to simple "Task complete!" if API unavailable

**Optional personalization**:
- Set `ENGINEER_NAME` environment variable in `~/.bash_profile`
- Messages will be personalized for you

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

**Announcements**: Uses LLM-generated messages (see above) for varied, friendly completions
- Examples: "All done!", "Ready for next task!", "Nailed it!"
- Falls back to "Task complete!" if LLM unavailable

**Logging**: `~/.claude/hooks/logs/stop.json`

##### SubagentStop Hook (`subagent_stop.py`)
**Trigger**: When a subagent completes its task

**Announcements**: Uses LLM-generated messages (see above) for varied completions
- **Smart filtering**: Only announces for meaningful tasks (filters out startup/background agents)
- Skips announcements for `general-purpose` agents and tasks without descriptions

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

- **Claude Code** installed (version 2.0.30 or higher)
- **Python 3** (already on most systems)
- **WSL** (if on Windows) - for Windows TTS access

### ⚠️ Known Limitations

**IMPORTANT**: Hooks do **NOT work** when Claude Code is running in your home directory (`~`). This is a Claude Code limitation.

**Workaround**: Use Claude Code in project directories other than your home directory. The hooks will work correctly in any subdirectory or separate project folder.

### Dependencies

#### For Windows TTS (Free, Default)
No additional dependencies needed - uses built-in Windows Speech Synthesis via PowerShell from WSL.

#### For OpenAI TTS (Premium, Optional)

**On Arch Linux** (recommended method):
```bash
# Install python-openai via pacman
sudo pacman -S python-openai
```

**On other systems**:
```bash
# Install via pip
pip install openai
# or
pip install --user openai
```

### Configuring OpenAI API Key

**IMPORTANT**: For Claude Code hooks to access the API key, it must be in `~/.bash_profile` (not `.bashrc` or `.bashrc.local`).

Hooks run in non-interactive shells which don't source `.bashrc`, so the key must be in a profile file that's loaded for all shells.

1. **Add your API key** to `~/.bash_profile`:
   ```bash
   # Edit ~/.bash_profile and add:
   export OPENAI_API_KEY="sk-your-api-key-here"
   ```

   **Get your key from**: https://platform.openai.com/api-keys

2. **Reload your shell**:
   ```bash
   # Logout and login, or source the file:
   source ~/.bash_profile
   ```

3. **Verify**:
   ```bash
   echo $OPENAI_API_KEY
   # Should output: sk-your-key...
   ```

**Note**: If your `.bash_profile` is in version control, you may want to:
- Keep it out of version control, OR
- Source a separate secrets file from `.bash_profile` that's gitignored

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

### Slash Commands

Custom slash commands provide specialized workflows:

- **/feature-implementation**: Multi-agent workflow for implementing features
  ```bash
  # With context
  /feature-implementation Add JWT authentication with refresh tokens

  # Without context (will prompt)
  /feature-implementation
  ```

### Subagents

Specialized agents can be invoked explicitly or automatically:

```bash
# Explicit invocation
"Use the feature-planner agent to create an implementation plan for adding OAuth2 support"

"Use the feature-reviewer agent to review the authentication changes"

# Automatic invocation
# Agents are automatically used when running /feature-implementation
```

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

### Hooks Not Running At All

**FIRST CHECK**: Are you running Claude Code in your home directory?

```bash
pwd
# If output is /home/yourusername, hooks will NOT work!
```

**Solution**: Navigate to any project directory:
```bash
cd ~/projects/my-project
# Now start Claude Code - hooks will work
```

**Verify hooks are registered**:
1. In Claude Code, type `/hooks`
2. Check if your hooks appear in the list
3. If they appear but don't execute, you're likely in your home directory

### No TTS Output

1. **Check if hooks are executing at all**:
   ```bash
   # Check if log files are being created/updated
   ls -lt ~/.claude/hooks/logs/
   # Files should have recent timestamps when hooks run
   ```

2. **Test Windows TTS directly**:
   ```bash
   powershell.exe -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('Test')"
   ```

3. **Test hook directly**:
   ```bash
   echo '{}' | python3 ~/.claude/hooks/stop.py --notify
   # You should hear TTS audio
   ```

4. **Check for errors**:
   ```bash
   # Check error log
   cat ~/.claude/hooks/logs/hook_errors.log
   ```

### Settings Issues

1. **Verify settings.json is valid JSON**:
   ```bash
   cat ~/.claude/settings.json | jq '.'
   # Should pretty-print the JSON without errors
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
   # Should show Python 3.x
   ```

4. **Restart Claude Code** after any settings changes:
   - Settings are loaded at startup only
   - Changes won't take effect until restart

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

- **Additional slash commands** (`.claude/commands/`)
  - `/deploy` - Complex deployment workflows
  - `/test-full` - Run complete test suite with reporting
  - `/review-pr` - Automated PR review process
  - `/refactor` - Guided refactoring with safety checks

- **Additional sub-agents** (`.claude/agents/`)
  - `test-writer` - Specialized test generation agent
  - `refactor-agent` - Safe refactoring with analysis
  - `documentation-agent` - Generate and maintain docs
  - `security-auditor` - Deep security analysis

- **Additional hooks**
  - `SessionStart` - Load development context on startup
  - `PreToolUse` - Validate/block dangerous commands
  - `PreCompact` - Backup transcripts before compaction
  - `UserPromptSubmit` - Pre-process or validate user requests

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
