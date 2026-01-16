---
description: Multi-agent workflow for any task - features, fixes, projects, prototypes. Plans, implements, and reviews with full user control.
argument-hint: "<task> [--quick] [--no-explore] [--resume [id]] [--list-progress] [additional context]"
---

# /implement - Multi-Agent Workflow

You are running the **/implement** workflow - a supervised multi-agent system that plans, implements, and reviews any kind of work: features, bug fixes, projects, prototypes, or complex tasks.

## Quick Reference

| Mode | Use Case | Flow |
|------|----------|------|
| **Full** (default) | Features, complex tasks | Explore → Plan → Code → Review |
| **Quick** (`--quick`) | Trivial fixes, one-liners | Code only (self-review) |
| **No-explore** (`--no-explore`) | Well-understood codebase | Plan → Code → Review |

## Argument Handling

Parse $ARGUMENTS for special flags:

**`--quick`**: Quick fix mode for trivial changes
- Skips exploration and planning phases
- Single coder invocation with self-review
- No separate reviewer agent
- Best for: typos, one-line fixes, obvious bugs
- If coder determines task is complex, escalate to full workflow

**`--no-explore`**: Skip codebase exploration
- Goes directly to planning without exploration phase
- Use when you already understand the codebase well
- Planner can still spawn Explore agents if needed

**`--list-progress`**: List all in-progress work
1. Read all files in `~/.claude/feature-progress/`
2. Group by project path
3. Display table: Project | ID | Feature | Phase | Tasks (completed/total) | Last Updated
4. Highlight current project's entries (if any)
5. Exit after displaying

**`--list-progress --all`**: Show all projects
**`--list-progress`** (no flag): Show only current project by default

**`--resume`** (no ID): Resume most recent feature for current project
1. Find state files matching current project path
2. If none found: Display "No in-progress work found for this project. Use --list-progress --all to see other projects."
3. If multiple found: Show list with timestamps and ask user which to resume
4. Load state JSON and corresponding plan markdown
5. **Validate files exist** - if state or plan file missing, report error and suggest starting fresh
6. Display resumption summary:
   ```
   Resuming: [feature name]
   Progress: [X]/[Y] tasks complete
   Last activity: [timestamp]
   Next task: [task name]
   ```
7. Continue from last incomplete task

**`--resume <id>`**: Resume specific feature by ID
1. Attempt to load state file `<id>.json`
2. If not found: Display "State file not found: <id>. Use --list-progress to see available work."
3. Load plan file `<id>-plan.md` for full implementation details
4. If plan file missing: Warn user and ask if they want to continue without full context
5. Continue from last incomplete task

**Error handling for resume:**
- Missing state file: Clear error message, suggest --list-progress
- Missing plan file: Warn but allow continuation (degraded mode)
- Corrupted JSON: Report error, suggest starting fresh or manual recovery
- Project mismatch: Warn if resuming work from different directory

**State validation on resume:**
1. Verify JSON is well-formed (parse without error)
2. Check required fields exist: `id`, `project`, `feature`, `phase`, `tasks`
3. **Verify `plan_file` exists and is readable** - if missing, trigger degraded mode warning
4. Validate task IDs are sequential and statuses are valid values
5. If validation fails: report specific issue and suggest recovery options

**Degraded mode (missing plan file) - HIGH RISK:**
- Coder receives only task name from state (no detailed context)
- **Lost context includes:**
  - Existing code snippets and patterns to follow
  - Implementation approach and rationale
  - File line references and specific change locations
  - Test specifications and gotchas
  - Architecture decisions and key implementation notes
- Quality will be significantly impacted
- **Strongly recommend re-planning** unless task is trivial
- Ask user: "Plan file missing. Re-plan this feature (recommended) or continue with limited context?"

If no flags, proceed with new feature workflow.

## State Management

**State file location:** `~/.claude/feature-progress/`
**Naming:** `<project-slug>-<feature-slug>-<YYYYMMDD-HHMMSS>.json`

**Two files are saved:**
1. `<id>.json` - State tracking (progress, settings, task status)
2. `<id>-plan.md` - Full planner output with all implementation details

The plan file is critical for resumption - it contains:
- Full file paths for each task (with line references where applicable)
- Task dependencies (which tasks must complete first)
- Existing code context (snippets coder needs to understand)
- Implementation approach and key decisions per task
- Acceptance criteria and test specifications
- Gotchas and pitfalls to watch for
- Implementation patterns with code examples
- Architecture decisions and rationale

Generate slugs:
- Project slug: `basename` of git root (or cwd if not a git repo)
- Feature slug: First 3-4 words of feature description, kebab-case, max 30 chars

**State schema (lean principle: only write fields with meaningful values):**

```json
{
  "id": "project-feature-timestamp",
  "project": "/full/path/to/project",
  "feature": "Brief feature description",
  "plan_file": "<id>-plan.md",
  "created": "ISO timestamp",
  "updated": "ISO timestamp",
  "phase": "exploration|planning|implementation|completion",
  "branch": "feature/branch-name",
  "supervision": "strict|normal|guided|relaxed",
  "repos": {"Backend": "backend", "Frontend": "frontend"},
  "tasks": [
    {"id": 1, "name": "Task name"},
    {"id": 2, "name": "Completed task", "status": "completed", "repo": "Backend", "commit": "abc123"},
    {"id": 3, "name": "In progress task", "status": "in_progress", "repo": "Frontend", "agent_id": "xyz789", "started": "ISO timestamp"},
    {"id": 4, "name": "Multi-repo task", "status": "completed", "repos": ["Backend", "Frontend"], "commits": ["abc123", "def456"]}
  ],
  "commits": [
    {"hash": "abc123", "task": 2, "msg": "feat: add feature"},
    {"repo": "Frontend", "hash": "def456", "task": 4, "msg": "feat: add UI"}
  ]
}
```

**Single-repo vs Multi-repo:**

| Field | Single-repo | Multi-repo |
|-------|-------------|------------|
| `repos` | Omit entirely | `{"Alias": "relative/path", ...}` |
| `tasks[].repo` | Omit entirely | Which repo this task targets |
| `tasks[].repos` | Omit entirely | Array if task spans multiple repos |
| `commits[].repo` | Omit entirely | Which repo the commit is in |

**Single-repo example:**
```json
{
  "id": "myapp-auth-20260116",
  "project": "/home/user/myapp",
  "feature": "Add OAuth login",
  "plan_file": "myapp-auth-20260116-plan.md",
  "created": "2026-01-16T10:00:00Z",
  "updated": "2026-01-16T14:00:00Z",
  "phase": "implementation",
  "branch": "feature/oauth",
  "supervision": "strict",
  "tasks": [
    {"id": 1, "name": "Add OAuth config", "status": "completed", "commit": "abc123"},
    {"id": 2, "name": "Create auth service", "status": "in_progress", "agent_id": "a1b2c3", "started": "2026-01-16T14:00:00Z"},
    {"id": 3, "name": "Add login endpoint"}
  ],
  "commits": [
    {"hash": "abc123", "task": 1, "msg": "feat(auth): add OAuth config"}
  ]
}
```

**Multi-repo example:**
```json
{
  "id": "vc-fi-fixings-20260115",
  "project": "/home/daniel/Repos/VC",
  "feature": "FI Upcoming Fixings email job",
  "plan_file": "vc-fi-fixings-20260115-plan.md",
  "repos": {"Scheduler": "Scheduler", "VC_Web": "VC_Web"},
  "created": "2026-01-15T10:00:00Z",
  "updated": "2026-01-16T16:00:00Z",
  "phase": "implementation",
  "branch": "feature/306655-fi-fixings",
  "supervision": "strict",
  "tasks": [
    {"id": 1, "name": "Add enum values", "repos": ["Scheduler", "VC_Web"], "status": "completed", "commits": ["6466b38", "2de52e4"]},
    {"id": 7, "name": "Create job processor", "repo": "Scheduler", "status": "completed", "commit": "3a9a3ba", "agent_id": "a9596a5", "decisions": ["Used existing pattern", "Added null checks"]},
    {"id": 9, "name": "Create query handler", "repo": "VC_Web", "status": "in_progress", "agent_id": "a4d3ad0", "started": "2026-01-16T16:00:00Z"},
    {"id": 10, "name": "Create fetcher service", "repo": "VC_Web"}
  ],
  "commits": [
    {"repo": "Scheduler", "hash": "6466b38", "task": 1, "msg": "feat: add FiUpcomingFixings enum"},
    {"repo": "VC_Web", "hash": "2de52e4", "task": 1, "msg": "feat: add FiUpcomingFixings enum"},
    {"repo": "Scheduler", "hash": "3a9a3ba", "task": 7, "msg": "feat: add job processor"}
  ]
}
```

**Task field rules (only include when meaningful):**

| Field | When to include |
|-------|-----------------|
| `id`, `name` | Always |
| `status` | Only if not "pending" (pending is default) |
| `repo` | Multi-repo only, single repo target |
| `repos` | Multi-repo only, task spans multiple repos |
| `agent_id` | When task started (for resumption) |
| `started` | When task started |
| `completed` | When task completed |
| `commit` | After commit made (single commit) |
| `commits` | After commits made (multiple, for multi-repo tasks) |
| `decisions` | If coder reported key decisions |
| `notes` | If there are blockers/issues to note |
| `iterations` | Only if > 0 (retries happened) |
| `review` | Only if review was done: `{"issues": N}` |

**Update state (CRITICAL - do immediately, not batched):**
- Plan approval → Create `<id>.json` and `<id>-plan.md`
- Task start → Add `status: "in_progress"`, `started`, `agent_id`
- Task completion → Change to `status: "completed"`, add `completed`, `decisions`
- Commit made → Add `commit` (or append to `commits` for multi-repo)
- Phase transition → Update `phase`

**Why this matters:** If the conversation dies mid-workflow, the state file is the ONLY way to know what was done. Always update state BEFORE moving to the next step.
9. On task blocked → Mark status `blocked`, add notes

## Available Agents and Modes

### Core Agents (always available)

| Agent | Purpose | Access |
|-------|---------|--------|
| **planner** | Analyzes requirements, creates implementation plans | Read-only |
| **coder** | Implements tasks, writes tests | Read-write |
| **reviewer** | Reviews for security, quality, performance | Read-only |

### Agent Modes

**Coder modes** (specify in prompt):
- `--mode=implement` (default): Standard implementation
- `--mode=fix`: Bug fixing with TDD approach (write failing test first)
- `--mode=refactor`: Code restructuring without behavior changes
- `--mode=migrate`: Schema/dependency migrations, breaking changes

**Reviewer focus** (specify in prompt):
- `--focus=full` (default): Complete review - security, test coverage, code quality, performance
- `--focus=security`: Deep security audit - OWASP Top 10, authentication/authorization, input validation, dependency vulnerabilities, sensitive data handling
- `--focus=performance`: Performance analysis - algorithm complexity (Big O), database queries (N+1), memory usage, caching opportunities, blocking operations
- `--focus=test-coverage`: Test quality - run coverage tools, verify edge cases, check error path testing, assess test quality not just quantity

**How modes/focuses are passed to agents:**
Modes and focuses are communicated in the task prompt header (e.g., `**Mode:** fix`). The agent reads its own Operating Modes / Focus Modes section to understand the expected behavior. See the coder context template in Step 4 for the exact format.

### Optional Agents

| Agent | When to Use | Trigger Signals |
|-------|-------------|-----------------|
| **architect** | Large features, greenfield, multi-service | "design", "architecture", new project, >10 files |
| **documenter** | API docs, README updates, changelogs | "document", "README", public API changes |

**Activation flow:**
- **Detection point:** Step 1.7 (after exploration, before planning)
- **Who decides:** Orchestrator recommends based on signals, user approves/declines
- **Architect:** Invoked at Step 1.8 if approved (before planner, outputs guide the plan)
- **Documenter:** Can be offered at Phase 3 (completion) even if not initially planned

### Built-in System Agents

| Agent | Purpose | When Used |
|-------|---------|-----------|
| **Explore** | Deep codebase analysis | Before planning (default), on-demand |

> **Note:** "Explore" is a built-in Claude Code subagent type (not a custom agent file). Invoke it with `subagent_type="Explore"` in the Task tool. It has read-only access optimized for codebase exploration.

### Model Selection

| Agent | Model | Condition |
|-------|-------|-----------|
| **Explore** | `sonnet` | Always |
| **planner** | `opus` | Always (plan quality is critical) |
| **coder** | `sonnet` | Default |
| **coder** | `opus` | When `--mode=migrate` |
| **reviewer** | `sonnet` | Default |
| **reviewer** | `opus` | When `--focus=security` |
| **architect** | `opus` | Always (high-stakes decisions) |
| **documenter** | `sonnet` | Always |

> **Rationale:** Opus is reserved for high-stakes tasks (planning, architecture, migrations, security reviews) where deeper reasoning justifies the cost. Sonnet handles exploration, standard coding, and documentation well.

## Workflow Overview

This workflow consists of four phases.

> **Note on numbering:** Phases (0-3) represent major workflow stages. Steps within each phase
> use decimal numbering (1.5, 1.7, 1.8) to maintain compatibility with existing references while
> allowing insertions. Steps execute in order regardless of numbering.

### Phase 0: Exploration (default, skip with `--no-explore`)
1. Analyze task to determine exploration needs
2. Use built-in Explore agent to understand codebase
3. Gather context: patterns, conventions, related files
4. Build understanding before planning

### Phase 1: Planning
1. Gather user story and context (from $ARGUMENTS or ask user)
2. Recommend agents/modes based on task signals
3. Ask user: "Run 1 planner or 2 planners in parallel?"
4. Invoke planner agent(s)
5. If 2 planners: compare approaches, recommend best one
6. Present plan with **testable acceptance criteria**
7. Allow user to request modifications or re-planning

### Phase 2: Implementation
1. Break plan into sequential tasks
2. For each task:
   - Invoke coder agent with task details and mode
   - **TDD approach**: Write failing tests first, then implement
   - Wait for completion
   - Ask user: "Review this implementation? (yes/no/continue)"
   - If yes: invoke reviewer agent with appropriate focus
   - If reviewer finds issues: present to user, offer to fix
   - If fix needed: invoke coder again with feedback
   - Mark task complete when approved
3. Track progress with visible checklist

### Phase 3: Completion
1. Summarize all changes made
2. Run final test suite
3. Offer documenter agent if applicable
4. Suggest next steps (integration testing, deployment, etc.)

### Documenter Invocation (Phase 3)

**Offer documenter when:**
- Public API changed
- New features added
- Breaking changes made
- README needs updating
- User requested documentation

If documenter was recommended or user requests:
```
Task tool with subagent_type="documenter", model="sonnet"
Prompt: "Update documentation for the following changes:

Changes made:
[summary of implementation]

Files modified:
[list of files]

Focus on:
- [API docs / README / Changelog / Migration guide]"
```

## Quick Fix Mode (`--quick`)

If `--quick` flag is present, use this streamlined workflow:

1. **Assess complexity**:
   - If task seems complex (multiple files, architectural changes, unclear scope):
     > "This task seems more complex than a quick fix. Switch to full workflow? (yes/no)"
   - If yes: **Escalate to full workflow:**
     1. Initialize state file with phase="planning"
     2. Set coder_mode="fix" (default for escalated quick fixes)
     3. Ask for supervision level preference
     4. Proceed to Step 1.5 (Exploration)

2. **Direct implementation**:
   - Skip exploration and planning
   - Invoke coder with `subagent_type="coder", model="sonnet"` and task description:
     ```
     Task: [user's description]
     Mode: Quick fix - self-review, no separate planning
     Requirements:
     - Keep changes minimal and focused
     - Write a test for the fix first (if bug fix)
     - Run relevant tests to verify
     - Self-review for obvious issues
     - If you find the task is complex, say so
     ```

3. **Show changes and commit**:
   - Display diff and suggested commit
   - Ask for approval (even in relaxed mode - quick fixes should be verified)

4. **Done** - No separate review phase unless user requests

---

## User Interaction Guidelines

**Use AskUserQuestion tool** for decision points with simple choices:
- Supervision level selection
- Plan approval (approve/modify/replan)
- Commit approval (approve/edit/skip)
- Review requests (yes/no/skip-all)
- Review results (fix/accept/manual)
- Task continuation (continue/pause/skip)

**Use plain text prompts** when:
- User needs to provide detailed input (e.g., "describe what changes you want")
- Explaining something before asking a follow-up
- The response requires free-form text

This gives users clickable options for common decisions while allowing flexibility for complex input.

---

## Your Instructions

Follow this workflow step-by-step:

### Step 0: Configure Supervision Level

Ask the user (skip if resuming with saved settings):

**Use AskUserQuestion:**
```
Question: "How would you like to supervise this workflow?"
Options:
- "strict (default)" → Approve plan, review each task, confirm all fixes
- "normal" → Approve plan, ask about reviews, auto-fix non-critical
- "guided" → Auto-continue, pause only on warnings/errors
- "relaxed" → Approve plan only, review at completion
```

Store the choice in state. Behavior reference:

| Checkpoint | strict (default) | normal | guided | relaxed |
|------------|------------------|--------|--------|---------|
| Plan approval | ask | ask | ask | ask |
| Commit approval | ask | ask | brief | auto |
| Task review prompt | always | ask | on-warning | skip |
| Auto-fix non-critical | no | yes | yes | yes |
| Auto-fix critical | no | no | ask | ask |
| Per-task summary | detailed | brief | minimal | skip |
| **Continue to next task** | **always ask** | every 3 tasks | auto | auto |
| Final summary | detailed | detailed | detailed | detailed |

**CRITICAL for strict mode:** User is in control. Never proceed to the next task without explicit confirmation.

### Guided Mode Behavior

**Guided mode** auto-continues unless it hits a warning condition:

**Pause and ask user when:**
- Test failures persist after 3 fix attempts
- Any acceptance criterion is NOT MET
- Reviewer finds CRITICAL or HIGH severity issues
- High-risk action detected (see Risk-Based Escalation)
- Coder reports BLOCKED status
- Unexpected error or agent failure

**Auto-continue when:**
- All tests pass
- All acceptance criteria met
- Reviewer finds only MEDIUM/LOW issues (auto-fix if possible)
- No high-risk actions needed

**Brief summary format for guided mode:**
```
Task 3/5 complete: Add user validation
Tests: 12 pass | Files: +45/-12 lines | Issues: 0
[auto-continuing to Task 4...]
```

### Risk-Based Escalation

**Regardless of supervision level**, these HIGH-RISK actions ALWAYS require user approval:

| Action | Why |
|--------|-----|
| Delete files | Irreversible |
| Modify authentication/authorization code | Security critical |
| Change database schema | Data integrity |
| Update dependencies (major versions) | Breaking changes |
| Modify security configs | Security critical |
| Push to remote | External impact |
| Run destructive commands | Irreversible |

Even in `relaxed` mode, pause and ask before these actions.

### Step 1: Gather Requirements

**Task Description**: $ARGUMENTS

If $ARGUMENTS is empty or insufficient:
- Ask the user to describe what they want to accomplish
- Wait for their response before proceeding

Once you have the requirements:
- Summarize the task in your own words
- Confirm understanding with the user

### Step 1.5: Exploration Phase (unless `--no-explore`)

**Skip this step if:** `--no-explore` flag is set OR `--quick` mode

**Determine exploration needs** based on signals:

| Signal | Exploration Level |
|--------|-------------------|
| Task mentions unfamiliar files/patterns | Thorough |
| Task touches multiple modules | Thorough |
| New codebase (first session) | Thorough |
| Task complexity is medium+ | Moderate |
| Simple, localized change | Quick or skip |
| User provided detailed context | Quick or skip |

**Invoke exploration:**

```markdown
Use Task tool with subagent_type="Explore", model="sonnet"
Prompt: "Explore the codebase to understand:
- [specific areas relevant to task]
- Existing patterns and conventions
- Related files and dependencies
- Testing patterns used

Task context: [user's task description]"
```

**After exploration, present summary:**
> "I've explored the codebase. Key findings:
> - [Pattern 1]
> - [Related files]
> - [Conventions to follow]
>
> Ready to proceed to planning?"

### Step 1.7: Recommend Agents and Modes

Based on task signals, recommend configuration:

**Detection signals:**

| Signal in Task | Recommendation |
|----------------|----------------|
| "security", "auth", "credentials", "OWASP" | Reviewer: `--focus=security` |
| "performance", "slow", "optimize", "cache" | Reviewer: `--focus=performance` |
| "bug", "fix", "broken", "error" | Coder: `--mode=fix` |
| "refactor", "clean up", "reorganize" | Coder: `--mode=refactor` |
| "migrate", "upgrade", "schema", "breaking" | Coder: `--mode=migrate` |
| "design", "architecture", new project, >10 files | Add: **architect** agent |
| "document", "README", "API docs", public changes | Add: **documenter** agent |

**Present recommendations and ask:**

First show the recommendations:
> "Based on your task, I recommend:
> - Coder mode: [mode] (because [reason])
> - Reviewer focus: [focus] (because [reason])
> - Optional agents: [list or 'none needed']"

**Use AskUserQuestion:**
```
Question: "Proceed with these settings?"
Options:
- "yes" → Use recommended settings
- "customize" → Let me adjust the settings
```

Store choices in state for this workflow run.

### Step 1.8: Invoke Architect (if recommended)

**Skip if:** Architect was not recommended or user declined

**Resume check:** If `state.architecture.agent_id` exists and `state.architecture.completed` is false:
> "Architecture design was interrupted. Resume architect agent? (yes/restart/skip)"
- **yes**: Resume using `Task tool with resume=[architecture.agent_id]`
- **restart**: Clear agent_id, invoke fresh
- **skip**: Mark `architecture.skipped = true`, continue to planning

If architect agent was recommended and approved:

1. Invoke architect agent:
   ```
   Task tool with subagent_type="architect", model="opus"
   Prompt: "Design the architecture for: [task description]

   Context from exploration:
   [exploration findings]

   Constraints:
   - [any user-specified constraints]

   Focus on: component design, interfaces, data flow, technology choices"
   ```

2. **Store agent_id** from response in `state.architecture.agent_id`
3. Present architecture design to user
4. **Use AskUserQuestion:**
   ```
   Question: "Proceed with this architecture?"
   Options:
   - "approve" → Use this architecture
   - "modify" → Request changes
   - "skip" → Skip architect, continue to planning
   ```
5. If approved: Update state `architecture.completed = true`, store summary and decisions
6. Architecture decisions guide the planner

### Step 2: Planning Phase

**Use AskUserQuestion:**
```
Question: "How many planners would you like to run?"
Options:
- "1 planner" → Focused approach, single plan
- "2 planners" → Compare different strategies in parallel
```

Based on their choice:

**If 1 planner**:
1. Use the Task tool to invoke the planner agent: `subagent_type="planner", model="opus"`
2. Pass the user story and all available context
3. Wait for the plan

**If 2 planners**:
1. Use the Task tool to invoke TWO planner agents in parallel (send both Task calls in a single message): `subagent_type="planner", model="opus"` for both
2. For first planner: Add "Focus on simplicity and minimal changes" to the prompt
3. For second planner: Add "Focus on extensibility and future-proofing" to the prompt
4. Wait for both plans
5. Compare the approaches:
   - Analyze trade-offs (simplicity vs. extensibility)
   - Consider project context
   - Recommend which plan is better suited and why
6. Present both plans and your recommendation to the user
7. Ask which approach they prefer (or if they want to re-plan)

### Step 3: Plan Approval

Present the plan(s) to the user with:
- Clear task breakdown
- Files that will be affected
- Testing strategy
- Estimated complexity

**Use AskUserQuestion:**
```
Question: "Does this plan look good?"
Options:
- "approve" → Start implementation
- "modify" → Request specific changes
- "replan" → Start over with new approach
```

- **approve**:
  1. Save the **full planner output** to `<id>-plan.md` (complete implementation details)
  2. Create **state file** `<id>.json` with task list, settings, and reference to plan file
  3. Proceed to implementation
- **modify**: Ask what changes they want, adjust the plan
- **replan**: Go back to Step 2 with new instructions

### Step 4: Implementation Loop

Create a progress tracker and display it:

```markdown
## Implementation Progress

**Task**: [description]
**Supervision**: [strict/normal/relaxed]
**State ID**: [state-file-id]

**Plan**:
- [ ] Task 1: [Description]
- [ ] Task 2: [Description]
- [ ] Task 3: [Description]

**Current Status**: Starting Task 1
```

For each task in the plan:

1. **Update progress tracker AND state file**:
   - Mark current task as "in_progress" in display
   - **Update state file immediately:**
     ```json
     {"id": N, "status": "in_progress", "started": "ISO timestamp"}
     ```
   - This ensures resumability even if interrupted mid-task

2. **Invoke coder agent**:
   - Use the Task tool with subagent_type="coder"
   - **Model selection:** Use `model="opus"` for `--mode=migrate`, otherwise `model="sonnet"`
   - **IMPORTANT: Do NOT explore code files yourself to gather context. The plan already has it.**
   - Provide a concise prompt that:
     - States the task number and name
     - Points to the plan file: "Read `<id>-plan.md` for full Task N details"
     - Points to the state file for previous decisions: "See `<id>.json` for previous task decisions"
     - Includes any user feedback or adjustments from this session
   - The coder agent is responsible for:
     - Reading the plan file for full context (snippets, patterns, approach)
     - Exploring additional patterns if needed
     - Making implementation decisions
   - **TDD REQUIREMENT: Write failing tests FIRST based on test specifications**
   - **Then implement to make tests pass**
   - **REQUIREMENT: Run all relevant tests before reporting completion**
   - **If tests fail, iterate until passing (max 3 attempts) or report BLOCKED**
   - **Capture decisions**: Parse coder's "Key Decisions" output and store in state
   - **Store the agent_id** from the response for potential resumption
   - Wait for implementation to complete

   **Coder prompt template (keep it concise!):**
   ```markdown
   ## Task [N]: [Task name]

   **Mode:** [implement/fix/refactor/migrate]
   **Plan file:** [path to <id>-plan.md]
   **State file:** [path to <id>.json]

   Read the plan file for full task details including:
   - Implementation approach and code patterns
   - Files to modify/create
   - Test specifications
   - Acceptance criteria
   - Gotchas and pitfalls

   Check the state file for decisions from previous tasks.

   [Any session-specific notes: user feedback, adjustments, blockers from previous attempt]

   Report your key decisions under "### Key Decisions" for state tracking.
   ```

   **IMPORTANT:** The coder reads the plan file directly. Do NOT copy plan content into the prompt.

   **Example Task tool invocation:**
   ```
   Task tool:
     subagent_type: "coder"
     model: "sonnet"  # or "opus" for migrate mode
     prompt: "## Task 2: Add user validation\n\n**Mode:** implement\n**Plan file:** ~/.claude/feature-progress/auth-feature-plan.md\n**State file:** ~/.claude/feature-progress/auth-feature.json\n\nRead the plan file for full Task 2 details.\n\nReport your key decisions under '### Key Decisions'."
   ```

3. **Verify backpressure compliance**:
   - Check that coder reported test results
   - If test results missing, ask coder to run tests before proceeding
   - If tests failed and coder didn't fix, this is a blocker

4. **Show changes and request commit approval**:

   Display the diff and suggested commit message:
   ```markdown
   ## Changes Ready for Commit

   **Suggested commit message:**
   ```
   [commit message from coder]
   ```

   **Files changed:**
   ```
   [output of: git diff --staged --stat]
   ```

   **Full diff:** (collapsed or summarized for large changes)
   ```diff
   [output of: git diff --staged]
   ```
   ```

   **Use AskUserQuestion** (behavior varies by supervision level):
   ```
   Question: "Ready to commit these changes?"
   Options:
   - "approve" → Commit with suggested message
   - "edit" → Modify commit message first
   - "intervene" → I'll edit files manually first
   - "skip" → Don't commit yet, continue to review
   ```

   > **Note:** In `relaxed` mode, auto-approve commits unless high-risk (see Risk-Based Escalation).
   > In `guided` mode, show brief summary and auto-approve unless issues detected.

   - **approve**: Commit with the suggested message
   - **edit**: Let user modify the commit message (use plain text prompt for input), then commit
   - **intervene**: User wants to manually edit files first - pause and wait
   - **skip**: Don't commit yet, continue to review (changes stay staged)

   For **intervene**:
   1. Tell user: "Make your changes. Say 'continue' when ready."
   2. Wait for user to respond
   3. Re-run `git diff --staged` to show updated changes
   4. Return to commit approval prompt

5. **Present task summary** (based on supervision level):

   **For strict/normal - Display verification checklist:**
   ```markdown
   ## Task [N] Verification

   **Status:** [COMPLETED | NEEDS ATTENTION | BLOCKED]

   **Acceptance Criteria:**
   - [x] Criterion 1 - Verified: [how it was verified]
   - [x] Criterion 2 - Verified: [how it was verified]
   - [ ] Criterion 3 - NOT MET: [reason]

   **Quality Gates:**
   - [x] Tests pass ([N] passed, [N] failed)
   - [x] No new linter errors
   - [x] No security warnings

   **Changes:**
   | File | Lines | Type |
   |------|-------|------|
   | src/feature.ts | +45/-12 | Modified |
   | src/feature.test.ts | +78 | Created |

   **Key Decisions:**
   - [Decision 1 and rationale]
   - [Decision 2 and rationale]

   **Potential Concerns** (from coder self-critique):
   - [Concern 1]
   - [Concern 2]
   ```

   If any acceptance criterion NOT MET:
   - In **strict** mode: Ask user how to proceed
   - In **normal/relaxed** mode: Auto-invoke coder to fix (up to iteration limit)

6. **Ask for review** (based on supervision level):

   - **strict**: Always ask
   - **normal**: Ask unless skip_reviews is set
   - **relaxed**: Skip to step 9

   **Use AskUserQuestion:**
   ```
   Question: "Task [N] is complete. Would you like to review it?"
   Options:
   - "yes" → Run reviewer agent
   - "no" → Skip review, continue
   - "skip-all" → Skip all future reviews too
   ```

   - **yes**: Go to step 7
   - **no**: Go to step 9
   - **skip-all**: Set skip_reviews=true in state, go to step 9

7. **Invoke reviewer agent** (if review requested):
   - Use the Task tool with subagent_type="reviewer"
   - **Model selection:** Use `model="opus"` for `--focus=security`, otherwise `model="sonnet"`
   - Provide:
     - The task that was implemented
     - The files that were changed
     - The original acceptance criteria
   - Wait for review results

8. **Handle review results**:

   Present review summary with issue counts by severity.

   **If issues found:**

   Track iterations for this task. If iteration count >= 3:

   Show message: "Task has required 3 fix cycles without resolution. Issues persisting: [list]"

   **Use AskUserQuestion:**
   ```
   Question: "How would you like to proceed?"
   Options:
   - "continue" → Keep iterating (not recommended)
   - "simplify" → Break into smaller subtasks
   - "alternative" → Try different approach (re-plan)
   - "skip" → Mark as blocked, continue
   ```

   **Blocked Task Handling:**
   - Mark task as `blocked` when: tests fail after 3 fix attempts, external dependency missing, unclear requirement cannot be resolved
   - Update state: `{"status": "blocked", "notes": "Reason for block"}`
   - **Use AskUserQuestion:**
     ```
     Question: "Task is blocked. How to proceed?"
     Options:
     - "skip" → Continue to next task
     - "clarify" → I'll provide more info to retry
     - "stop" → Stop workflow here
     ```
   - Blocked tasks remain in state and can be addressed on resume
   - If all remaining tasks depend on a blocked task, pause workflow and ask user

   Otherwise (issues found but iteration count < 3):

   **Use AskUserQuestion:**
   ```
   Question: "The review found [N] issues. How would you like to proceed?"
   Options:
   - "fix" → Have coder fix the issues
   - "accept" → Accept as-is, continue
   - "manual" → I'll fix manually
   - "rollback" → Revert and try different approach
   ```

   - **fix**:
     1. Increment iteration counter in state: `tasks[N].iterations += 1`
     2. **Resume the coder agent** using stored agent_id:
        ```
        Task tool with resume=[agent_id]
        Prompt: "The reviewer found these issues: [issues]. Please fix them."
        ```
        > **Note:** The `resume` parameter continues an existing agent conversation,
        > maintaining its full context and memory of what it implemented. This avoids
        > re-explaining the entire task and preserves implementation decisions.
     3. After coder fixes, update state: `tasks[N].review.issues_fixed += [count of fixed issues]`
     4. Go back to step 7 (re-invoke reviewer to verify fixes)

   - **rollback**:
     1. Check if task has commit hash in state
     2. **If committed:**
        - Ask user: "Revert commit (creates new commit) or reset (removes commit)?"
        - Revert: `git revert [commit-hash] --no-edit`
        - Reset: `git reset HEAD~1` (only if not pushed)
     3. **If not committed:**
        - Modified files: `git checkout HEAD -- [files]`
        - New files created: `git clean -f [files]` (confirm with user first)
     4. Update state: mark task as "pending" with note "Rolled back: [reason]"
     5. Clear agent_id (avoid resuming failed context)
     6. Ask user for alternative approach guidance
     7. Either re-invoke planner or coder with new direction

   - **manual**: Mark for user to fix, go to step 9
   - **accept**: Go to step 9
   - **details**: Show full review, then ask again

9. **Mark task complete and save state**:

   **Get file lists** (before updating state):
   - Modified files: `git diff --name-only HEAD` (or from coder's "Changes Made" output)
   - Created files: `git ls-files --others --exclude-standard` that are now staged
   - Or parse from coder's output sections "#### 1. [File path]" entries

   **Extract coder's decisions** from their "### Key Decisions" output section.

   **Update state file immediately** (don't wait, don't batch):
   ```json
   {
     "id": N,
     "status": "completed",
     "files": {
       "to_modify": ["from/plan/modify.ts"],
       "to_create": ["from/plan/create.ts"],
       "modified": ["actual/modified.ts"],
       "created": ["new/file.ts"]
     },
     "agent_id": "agent-id-for-resuming",
     "iterations": 0,
     "completed": "ISO timestamp",
     "commit_hash": "abc123 or null",
     "decisions": ["Decision 1 from coder output", "Decision 2"],
     "review": {
       "completed": true,
       "skipped": false,
       "issues_found": 2,
       "issues_fixed": 2,
       "focus": "full"
     }
   }
   ```
   - Also update top-level `"updated"` timestamp
   - If commit was made:
     - Set `tasks[N].commit_hash` to the hash
     - Add commit object to `commits[]`: `{"hash": "abc123", "task_id": N, "message": "..."}`
   - Update progress tracker display
   - **Verify state file was written** before proceeding

10. **Ask before continuing to next task** (based on supervision level):

    **For strict mode - ALWAYS ask:**

    Show: "Task [N] complete. [X]/[Total] tasks done. Next up: Task [N+1]: [description]"

    **Use AskUserQuestion:**
    ```
    Question: "Ready to continue?"
    Options:
    - "continue" → Proceed to next task
    - "question" → I have questions first
    - "pause" → Stop here, resume later
    - "compact" → Reduce context, then resume
    ```

    If user selects "question" or provides free-form input, handle with plain text (they may need to type detailed questions/instructions).

    **If user selects "pause":**
    1. Confirm state file is saved and up to date
    2. Show the resume command:
       > "State saved. Run `/implement --resume` when you're ready to continue."
    3. Stop and wait (don't continue until they resume)

    **If user selects "compact":**
    1. Confirm state file is saved and up to date
    2. Create auto-resume marker file:
       ```bash
       echo "$STATE_FILE_PATH" > ~/.claude/feature-progress/.auto-resume
       ```
       (where `$STATE_FILE_PATH` is the path to the current state JSON file)
    3. Show message:
       > "State saved. Run `/compact` (or `/clear`) now. The workflow will auto-resume on your next message."
    4. Stop and wait

    > **How auto-resume works:** The `UserPromptSubmit` hook detects the `.auto-resume` marker file and injects instructions for Claude to run `/implement --resume`. This happens automatically on your next message after compact/clear.

    **For normal mode** - Ask at tasks 3, 6, 9, etc. (every 3rd completion) and at phase boundaries.
    Between checkpoints, auto-continue with brief status updates.
    **For relaxed mode** - Don't ask, continue automatically (still show progress)

    **IMPORTANT:** In strict mode, NEVER automatically start the next task. Always wait for explicit user confirmation.

    **Enforcement:**
    - Wait for explicit user command before invoking next coder agent
    - Do NOT interpret "okay", "sounds good", or silence as approval to continue
    - Require explicit action word: "continue", "next", "proceed", "go"
    - If unclear, ask: "Ready to proceed to the next task?"

    ---

    **Handling user interventions (questions/instructions):**

    When user selects **question** or **instructions**, or asks something conversationally:

    1. **DO NOT automatically make changes** - even in "allow edits" mode
    2. **Answer the question** or **acknowledge the instruction**
    3. **Then explicitly ask:**
       > "Based on this, would you like me to:
       > - **continue**: Proceed as planned (no changes)
       > - **adjust**: Modify the approach for upcoming tasks (explain how)
       > - **fix**: Go back and change what was just implemented
       > - **discuss**: Let's talk more before deciding"

    **Example - Question that is NOT a change request:**
    ```
    User: "Why did you use a List instead of an IEnumerable?"

    WRONG: "Good point, let me change it to IEnumerable..." [starts editing]

    RIGHT: "I used List because [reason]. The trade-off is [explanation].
            Would you like me to change it, or continue as is?"
    ```

    **The principle:** Questions are questions. Only explicit requests like "change it to X" or "fix this" should trigger edits. When in doubt, ask.

11. **Repeat** for next task until all tasks are complete

### Step 5: Completion

Once all tasks are implemented:

1. **Update final progress tracker** showing all tasks complete

2. **Run final verification**:
   ```bash
   # Run test suite
   [appropriate test command for the project]
   ```

3. **Summarize changes**:
   ```markdown
   ## Implementation Complete! ✓

   **Changes made**:
   - [File 1]: [Summary]
   - [File 2]: [Summary]
   - [File 3]: [Summary]

   **Tests added**: [count] unit tests, [count] integration tests

   **All tasks completed**:
   - [✓] Task 1
   - [✓] Task 2
   - [✓] Task 3

   **Next steps**:
   - [ ] Run integration tests
   - [ ] Manual testing
   - [ ] Update documentation
   - [ ] Create pull request
   ```

4. **Update state to completed**:
   - Set phase to "completion"
   - Record final timestamp
   - Optionally archive the state file (move to `~/.claude/feature-progress/completed/`)

5. **Ask the user**: "Would you like to create a pull request now?"

## Important Guidelines

- **Use Task tool for agents**: Always invoke subagents using the Task tool with the correct subagent_type
- **Use skills when applicable**: When YOU (the orchestrator) commit, use the `/commit` skill. For PR creation, follow standard guidelines. Subagents have commit guidelines embedded.
- **Parallel when possible**: When running 2 planners, make BOTH Task calls in a single message
- **Sequential implementation**: Only run ONE coder agent at a time to avoid merge conflicts
- **State management**: Keep the progress tracker visible and updated
- **User approval points**: Always wait for user input at approval points
- **Handle errors gracefully**: If an agent fails, report clearly and ask user how to proceed
- **Stay focused**: Keep the workflow moving, don't get distracted
- **Be thorough**: Don't skip steps, even if tempting
- **Command explanation**: All agents follow rules in `~/.claude/shared/command-context.md` to provide context before executing commands

## Agent Failure Recovery

**Planner failure:**
- Report error to user with details
- Offer to: retry with same prompt / retry with modified requirements / user provides manual plan
- If retrying, clear any partial state

**Coder failure (mid-task):**
- Check if state was updated (task marked `in_progress`)
- Offer to: retry task / skip task / manual intervention
- Do NOT mark task complete if coder failed
- Preserve agent_id if available for potential resume

**Reviewer failure:**
- Non-blocking - offer to skip review and continue
- Or retry review with different focus
- If skipping, note in state that review was skipped

## Response Style

- Use clear section headers (### Planning Phase, etc.)
- Show progress visually with checkboxes and clear status indicators
- Quote user prompts clearly (use > quote blocks)
- Keep the progress tracker updated in each message
- Summarize agent outputs before asking for user input
- Be concise but informative

## Common Scenarios

### Scenario: User provides minimal context
→ Ask clarifying questions before planning

### Scenario: Planner needs more exploration
→ The planner agent can use Task tool to spawn Explore agents

### Scenario: Coder agent gets stuck
→ Ask user if they want to: retry, skip task, or modify approach

### Scenario: Reviewer finds critical security issue
→ Recommend fixing immediately before continuing

### Scenario: User wants to modify plan mid-implementation
→ Pause, adjust plan, update progress tracker, continue

## Remember

You are **orchestrating** the workflow, not doing the work yourself. Your job is to:
- Manage the process
- Invoke the right agents at the right time
- Present information clearly
- Get user input at decision points
- Track progress
- Handle edge cases

Let the specialized agents do their jobs - they're experts in their domains.

### CRITICAL: No Direct Code Exploration

**You (the orchestrator) must NEVER read code files directly to gather context.** This wastes your context window and duplicates work that agents should do.

**What you CAN read:**
- State files (`<id>.json`) - to track progress
- Plan files (`<id>-plan.md`) - to get task details
- Agent outputs - to understand results

**What you must NOT read:**
- Source code files (*.cs, *.ts, *.py, etc.)
- Test files
- Configuration files
- Any file to "understand patterns" or "gather context"

**When starting a task:**
1. Read the task description from the plan file
2. Pass that description to the coder agent
3. Tell the coder: "Read the plan at [path] for full context on Task N"
4. The coder is responsible for exploring patterns and gathering context

**If you genuinely need exploration before dispatching an agent:**
- Use the **Explore agent** (`subagent_type="Explore"`)
- Ask it a specific question: "What pattern does X follow?" or "Where is Y implemented?"
- Use the Explore agent's summary to inform your agent dispatch
- This keeps exploration out of your context

**Why this matters:**
- Your context is precious - it spans the entire workflow
- Agents have fresh context for each task
- The plan already contains the context the planner gathered
- Re-exploring wastes tokens and risks inconsistency

---

**Now begin Step 1: Gather Requirements**
