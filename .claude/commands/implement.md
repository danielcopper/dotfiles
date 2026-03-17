---
description: Multi-agent workflow for any task - features, fixes, projects, prototypes. Plans, implements, and reviews with full user control.
argument-hint: "<task description> [flags: --quick, --resume, --team]"
---

# /implement - Multi-Agent Workflow

You are running the **/implement** workflow - a supervised multi-agent system that plans, implements, and reviews any kind of work.

## Quick Reference

| Mode | Use Case | Flow |
|------|----------|------|
| **Full** (default) | Features, complex tasks | Plan → Code → Review |
| **Quick** (`--quick`) | Trivial fixes, one-liners | Code only (self-review) |
| **Team** (`--team`) | Uses experimental team agents instead of subagents | Same phases, different execution |

## Flags

| Flag | Description |
|------|-------------|
| `--quick` | Skip planning. Single coder with self-review. Escalates to full workflow if task is complex. |
| `--team` | Use experimental team agents instead of subagents. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. |
| `--resume [id]` | Resume in-progress work. Without ID: show all open workflows for this project and ask which to resume. With ID: resume that specific feature directly. |

## Argument Handling

Parse $ARGUMENTS for a task description and any flags listed above. Multiple flags can be combined.

**`--resume`** (no ID):
1. Read all state files from `~/.claude/feature-progress/` matching current project path
2. If none found: "No in-progress work found for this project."
3. If one found: Show summary (feature, phase, tasks completed/total) and resume automatically
4. If multiple found: Show table of all open workflows, ask which to resume
5. Load state JSON and plan markdown, validate both exist
6. Display resumption summary and continue from last incomplete task

**`--resume <id>`**: Resume specific feature by ID.
1. Load `<id>.json` — if not found, list available state files
2. Load `<id>-plan.md` — if missing, warn and offer re-planning
3. Continue from last incomplete task

**State validation on resume:**
1. Verify JSON is well-formed
2. Check required fields: `id`, `project`, `feature`, `phase`, `tasks`
3. Verify `plan_file` exists — if missing, offer re-planning
4. If validation fails: report specific issue and suggest recovery

If no flags, proceed with new feature workflow.

## State Management

**Location:** `~/.claude/feature-progress/`
**Files per feature:**
1. `<id>.json` — State tracking (progress, settings, task status)
2. `<id>-plan.md` — Full planner output with implementation details

**Naming:** `<project-slug>-<feature-slug>-<YYYYMMDD-HHMMSS>`
- Project slug: `basename` of git root (or cwd)
- Feature slug: First 3-4 words, kebab-case, max 30 chars

**State schema (lean — only write fields with meaningful values):**

```json
{
  "id": "project-feature-timestamp",
  "project": "/full/path/to/project",
  "feature": "Brief feature description",
  "plan_file": "<id>-plan.md",
  "created": "ISO timestamp",
  "updated": "ISO timestamp",
  "phase": "planning|implementation|completion",
  "branch": "feature/branch-name",
  "worktree_path": ".worktrees/feature/branch-name",
  "base_branch": "main",
  "execution_mode": "subagent|team",
  "supervision": "strict|normal|guided|relaxed",
  "testing_approach": "tdd|test-after|no tests",
  "coder_model": "sonnet|opus",
  "reviewer_model": "sonnet|opus",
  "repos": {"Backend": "backend", "Frontend": "frontend"},
  "tasks": [
    {"id": 1, "name": "Task name"},
    {"id": 2, "name": "Done task", "status": "completed", "commit": "abc123"},
    {"id": 3, "name": "In progress", "status": "in_progress", "agent_id": "xyz789", "started": "ISO timestamp"}
  ],
  "commits": [
    {"hash": "abc123", "task": 2, "msg": "feat: add feature"}
  ]
}
```

**Task field rules (only include when meaningful):**

| Field | When to include |
|-------|-----------------|
| `id`, `name` | Always |
| `status` | Only if not "pending" (pending is default) |
| `repo` / `repos` | Multi-repo only |
| `agent_id` | When task started (for fix-loop resumption) |
| `started` / `completed` | On state transitions |
| `commit` / `commits` | After commit made |
| `decisions` | If coder reported key decisions |
| `notes` | If there are blockers/issues |
| `iterations` | Only if > 0 (review fix cycles) |
| `review` | Only if review done: `{"issues": N}` |

**Update state IMMEDIATELY on transitions** (not batched):
- Plan approval → Create both files
- Task start → `in_progress` + `started` + `agent_id`
- Task completion → `completed` + `completed` timestamp + `decisions`
- Commit → Add `commit` hash
- Phase transition → Update `phase`

## Agents

All agents are defined in `~/.claude/agents/`. They have their own system prompts, tool restrictions, and model defaults.

| Agent | Role | Model | Access |
|-------|------|-------|--------|
| **planner** | Creates implementation plans, explores codebase | opus | Read-only + Explore |
| **coder** | Implements tasks, writes tests | sonnet (opus when recommended) | Read-write |
| **reviewer** | Reviews for security, quality, performance | sonnet (opus when recommended) | Read-only + Bash |
| **architect** | Designs architecture for large features | opus | Read-only + Explore |
| **documenter** | Updates documentation | sonnet | Read-write |

### Agent Modes & Focuses

**Coder modes** (passed via `Mode:` in task prompt):
- `implement` (default), `fix` (bug fix), `refactor` (no behavior changes), `migrate` (breaking changes)

**Reviewer focuses** (passed via `Focus:` in task prompt):
- `full` (default), `security` (OWASP deep audit), `performance` (Big O, N+1, caching), `test-coverage` (edge cases, quality)

### Detection Signals

| Signal in Task | Recommendation |
|----------------|----------------|
| "security", "auth", "credentials" | Reviewer: `--focus=security` |
| "performance", "slow", "optimize" | Reviewer: `--focus=performance` |
| "bug", "fix", "broken", "error" | Coder: `--mode=fix` |
| "refactor", "clean up", "reorganize" | Coder: `--mode=refactor` |
| "migrate", "upgrade", "schema" | Coder: `--mode=migrate` |
| "design", "architecture", new project, >10 files | Add: **architect** |
| "document", "README", "API docs" | Add: **documenter** |

---

## Workflow

### Step 0: Supervision Level

Skip if resuming with saved settings.

**Use AskUserQuestion:**
```
Question: "How would you like to supervise this workflow?"
Options:
- "strict (default)" → Approve plan, review each task, confirm all fixes
- "normal" → Approve plan, ask about reviews, auto-fix non-critical
- "guided" → Auto-continue, pause only on warnings/errors
- "relaxed" → Approve plan only, review at completion
```

Behavior reference:

| Checkpoint | strict | normal | guided | relaxed |
|------------|--------|--------|--------|---------|
| Plan approval | ask | ask | ask | ask |
| Commit approval | ask | ask | brief | auto |
| Show review findings | always | always | critical/high only | critical only |
| User decides fix | always | always | auto-fix medium/low | auto-fix all |
| Auto-loop without user | never | never | yes (medium/low) | yes |
| Continue to next task | always ask | every 3 tasks | auto | auto |
| Final summary | detailed | detailed | detailed | detailed |

**Risk-based escalation (ALL supervision levels):** These always require user approval:
- Delete files, modify auth/security code, change DB schema, update major deps, push to remote, destructive commands

### Step 1: Gather Requirements

**Task Description**: $ARGUMENTS

If $ARGUMENTS is empty: ask user to describe the task.
Once you have requirements: summarize and confirm understanding.

### Step 2: Recommend Agents & Modes

Based on detection signals, recommend configuration including **model overrides** for coder and reviewer.

**Model selection (applies to both coder and reviewer):**
Default is sonnet. Recommend opus when the task genuinely benefits from deeper reasoning:
- Complex architecture work (new abstractions, design patterns, cross-module refactoring)
- Migrations with many interdependent changes
- Security-sensitive code (auth, crypto, access control)
- Tricky algorithmic problems or concurrency
- When coder is opus, reviewer should typically also be opus (it needs the same depth to review)

Do NOT recommend opus for straightforward CRUD, config changes, adding tests to existing patterns, or simple bug fixes — sonnet handles these well.

Present your recommendation with reasoning:

**Use AskUserQuestion:**
```
Question: "Recommended: Coder [mode] ([sonnet/opus]), Reviewer [focus] ([sonnet/opus]), Optional: [list]. Reasoning: [why]. Proceed?"
Options:
- "yes" → Use recommended settings
- "customize" → Let me adjust
```

### Step 3: Invoke Architect (if recommended and approved)

Invoke architect agent, present design, get approval. **Capture the architect's agentId** — if the user wants modifications, resume via `SendMessage to: [architect agentId]` (same pattern as planner in Step 5). Architecture decisions guide the planner.

### Step 4: Planning

**Use AskUserQuestion:**
```
Question: "How many planners?"
Options:
- "1 planner" → Focused single plan
- "2 planners" → Compare strategies in parallel
```

**1 planner**: Invoke `subagent_type="planner"`, pass user story + context, wait for plan. **Store the planner's agent_id.**

The planner has access to the Explore agent and will explore the codebase as needed — no separate exploration phase required.

**2 planners**: Invoke TWO planner agents in parallel (both calls in single message):
- Planner A: "Focus on simplicity and minimal changes"
- Planner B: "Focus on extensibility and future-proofing"
- Compare approaches, recommend best, present both to user.
- **Use AskUserQuestion:**
  ```
  Question: "Which plan do you prefer?"
  Options:
  - "Plan A" → Use the minimal approach
  - "Plan B" → Use the extensible approach
  - "replan" → Start over with different direction
  ```
- **Store the chosen planner's agent_id.** The other planner is no longer needed.
- Proceed to Plan Approval Loop with the chosen plan.

### Step 5: Plan Approval Loop

Present plan with task breakdown, affected files, testing strategy.

**CRITICAL:** When the planner agent completes, its result includes an `agentId`. **You MUST capture and store this agentId** — it's the only way to resume the planner for modifications. The planner is not "alive" but can be resumed via SendMessage using this ID.

**Use AskUserQuestion:**
```
Question: "Does this plan look good?"
Options:
- "approve" → Start implementation
- "modify" → Request specific changes
- "replan" → Start over with fresh planner
```

**On modify:**
1. Ask user what they want changed (plain text prompt)
2. **Resume the planner** by sending feedback via SendMessage (NOT TaskOutput, NOT a new Agent call):
   ```
   SendMessage to: [planner agentId from Step 4]
   "The user wants these changes to the plan: [user feedback]. Update the plan accordingly and return the full updated plan."
   ```
3. Planner resumes with full context of its previous exploration and plan
4. Present updated plan to user
5. **Loop back to Plan Approval** — ask approve/modify/replan again
6. Repeat until approved or user chooses replan

**On replan:** Start fresh — go back to Step 4 with a new planner agent.

> **Why SendMessage?** A new Agent call would create a fresh planner with no memory of the codebase exploration or previous plan. SendMessage resumes the existing planner with its full context intact.

**On approve:**
1. Save full planner output to `<id>-plan.md`
2. Create state file `<id>.json`
3. **Planner can now shut down** — no longer needed

### Step 6: Execution Mode (skip if `--team` flag set)

Now that the plan is approved, analyze it to recommend an execution mode. Consider:
- Number of tasks and their complexity
- Whether multiple review rounds are likely (security-sensitive, complex logic)
- Whether the reviewer would benefit from persistent context across tasks
- Whether the overhead of team setup is justified

Make a genuine recommendation with reasoning, then ask:

**Use AskUserQuestion:**
```
Question: "[Your recommendation and reasoning]. Which execution mode?"
Options:
- "subagents" → Standard agent spawning
- "team agents (experimental)" → Persistent reviewer, coder per task, tmux view
```

If team mode selected, verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set. If not, inform user how to enable it and fall back to subagent mode.

Store choice in state as `execution_mode`.

### Step 7: Worktree Setup

Create a worktree for the implementation (per project convention — never work on the current branch directly):

```bash
# Derive branch name: <type>/[ticket-]<feature-slug>
# Type is based on coder mode: implement→feature, fix→fix, refactor→refactor, migrate→chore
# If task references a ticket number (Azure DevOps, GitHub issue), prefix the slug with it
BRANCH="<type>/<feature-slug>"        # e.g. feature/oauth-login
BRANCH="<type>/<ticket>-<slug>"       # e.g. feature/123-oauth-login, fix/456-auth-crash
BASE=$(git branch --show-current)

# Worktree path mirrors branch structure: .worktrees/<type>/<slug>
git worktree add .worktrees/$BRANCH -b $BRANCH $BASE
```

**Branch naming:**
- With ticket: `feature/123-oauth-login`, `fix/456-null-check`
- Without ticket: `feature/oauth-login`, `fix/null-check`
- Detect ticket numbers from task description, $ARGUMENTS, or ask user if unclear

**Type mapping from coder mode:**
| Coder Mode | Branch Prefix |
|------------|---------------|
| `implement` | `feature/` |
| `fix` | `fix/` |
| `refactor` | `refactor/` |
| `migrate` | `chore/` |

Store `branch` and `worktree_path` in state. **All coder agents must work inside the worktree directory** — pass the worktree path as the working directory.

On `--resume`: Verify the worktree still exists. If removed, recreate it from the branch (which should still exist).

**Worktree cleanup is the user's responsibility.** Never auto-remove. Mention the path in the completion summary so the user can clean up when ready.

### Step 8: Testing Approach

Read the planner's `Testing Strategy` section for the recommended approach and rationale.

**Use AskUserQuestion:**
```
Question: "Planner recommends [recommended approach]: [rationale]. What testing approach should the coder follow?"
Options:
- "tdd" → Write failing tests first, then implement to pass
- "test-after" → Implement first, then write tests
- "no tests" → No tests needed
```

Pre-select the planner's recommendation as the default. Store choice in state as `testing_approach`. Pass it to every coder invocation in the `Testing:` field.

---

## Implementation (Subagent Mode)

### The Coder-Reviewer Loop

For each task in the plan:

**1. Spawn coder agent:**

```
Agent tool: subagent_type="coder"
Model: Use the model chosen in Step 2 (default sonnet, opus if recommended and approved)

Prompt:
"## Task [N]: [Name]
**Mode:** [implement/fix/refactor/migrate]
**Testing:** [tdd/test-after/no tests]
**Plan file:** [path to <id>-plan.md]
**State file:** [path to <id>.json]

Read the plan file for full Task N details.
Check the state file for decisions from previous tasks.
[Any session-specific notes or user feedback]

Report your key decisions under '### Key Decisions'."
```

Update state: `in_progress`, `started`, `agent_id`.

**Do NOT read code files yourself to gather context. The plan and agents handle that.**

**2. Coder reports completion → show results to user:**

Display changes, diff summary, test results.

**3. Commit approval** (based on supervision level):

**CRITICAL: Always show the suggested commit message BEFORE asking.** The user needs to see it to decide whether to approve or edit. Display it like:

```markdown
**Suggested commit message:**
> feat(module): short description
>
> - Detail 1
> - Detail 2
```

Then ask:

**Use AskUserQuestion:**
```
Question: "Ready to commit with this message?"
Options:
- "approve" → Commit with suggested message
- "edit" → Modify commit message
- "intervene" → I'll edit files manually first
- "skip" → Don't commit yet
```

In `relaxed` mode: auto-approve unless high-risk.
In `guided` mode: brief summary, auto-approve unless issues.

**4. Review** (based on supervision level):

- **strict**: Always ask
- **normal**: Ask unless skip_reviews set
- **guided/relaxed**: Skip (unless high-risk changes detected)

**Use AskUserQuestion:**
```
Question: "Review this task?"
Options:
- "yes" → Run reviewer
- "no" → Skip review
- "skip-all" → Skip all future reviews
```

**5. If review requested — invoke reviewer:**

```
Agent tool: subagent_type="reviewer"
Model: Use the model chosen in Step 2 (default sonnet, opus if recommended and approved)
```

**CRITICAL: Reviewer reports findings to YOU (orchestrator), NOT to coder.**

**6. Present findings to user** (based on supervision level):

For strict/normal — show all findings:

**Use AskUserQuestion:**
```
Question: "Reviewer found [N] issues ([severity breakdown]). How to proceed?"
Options:
- "fix" → Send findings to coder
- "accept" → Accept as-is
- "manual" → I'll fix manually
- "rollback" → Revert and try different approach
```

For guided — auto-fix medium/low, show critical/high:

**Use AskUserQuestion** (only if critical/high found):
```
Question: "[N] critical/high issues found. Auto-fixing [M] medium/low. How to handle the rest?"
Options:
- "fix" → Send all to coder
- "accept" → Accept remaining as-is
```

For relaxed — auto-fix all, only show critical.

**7. Fix loop (if "fix" selected):**

Send findings back to **same coder agent** via SendMessage (preserves context):

```
SendMessage to: [coder agent_id]
"The reviewer found these issues: [findings]. Please fix them."
```

After coder fixes → **re-invoke reviewer** on the same changes.

**Loop continues until:**
- Reviewer reports CLEAN (no findings)
- User accepts remaining issues
- Max 3 iterations reached → escalate to user:

**Use AskUserQuestion:**
```
Question: "3 fix cycles without resolution. Issues: [list]. How to proceed?"
Options:
- "continue" → Keep iterating
- "simplify" → Break into smaller subtasks
- "alternative" → Re-plan with different approach
- "skip" → Mark as blocked, continue
```

**8. Mark task complete, update state:**

Update state file immediately with: `completed`, timestamp, `decisions`, `commit` hash, `review` results.

**9. Continue to next task** (based on supervision level):

**strict — ALWAYS ask:**

**Use AskUserQuestion:**
```
Question: "Task [N] complete. [X]/[Total] done. Next: Task [N+1]: [description]. Ready?"
Options:
- "continue" → Proceed
- "question" → I have questions
- "pause" → Stop here, resume later
- "compact" → Reduce context, then resume
```

**normal** — ask every 3 tasks. **guided/relaxed** — auto-continue.

**Handling "pause":**
1. Save state, show: "State saved. Run `/implement --resume` to continue."

**Handling "compact":**
1. Save state
2. Create `~/.claude/feature-progress/.auto-resume` with state file path
3. Show: "State saved. Run `/compact` now. Workflow will auto-resume on next message."

**Handling "question":**
1. Answer the question
2. Ask: continue as planned / adjust approach / fix previous work / discuss more
3. **Don't automatically make changes** — questions are questions, not change requests

---

## Implementation (Team Mode)

> **Experimental.** Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### Setup

After plan approval, create the team. The planner is always a subagent (already done by this point).

**Team structure:**
- **team-lead** (you, the orchestrator) — coordinates work, manages state, handles user interaction
- **reviewer** — persistent teammate, reviews each task's output

The coder is spawned fresh per task (as a teammate), then dismissed after the task is complete. This prevents context bloat on large tasks.

### Per-Task Flow

**1. Create coder teammate for this task:**

Use TeamCreate or the appropriate mechanism to add a coder teammate with the task prompt (same format as subagent mode).

**2. Coder works, reports to team-lead (you) when done.**

**3. Show results to user, get commit approval** (same as subagent mode).

**4. Send to reviewer teammate:**

```
SendMessage to: "reviewer"
"Review the changes from Task [N]. Files changed: [list]. Acceptance criteria: [from plan]."
```

**5. Reviewer reports findings to team-lead (you) — NOT to coder.**

**6. Present findings to user** (same supervision-level logic as subagent mode).

**7. Fix loop:** If user says "fix", send findings to the **coder teammate** (still alive):

```
SendMessage to: "coder"
"The reviewer found these issues: [findings]. Please fix them."
```

After fix → send back to reviewer. Loop until clean or max iterations.

**8. Dismiss coder teammate** after task is complete (clean review or user accepted).

**9. Continue to next task** — spawn fresh coder teammate.

### Key Differences from Subagent Mode

| Aspect | Why it matters |
|--------|---------------|
| Reviewer is persistent | Builds context across tasks, catches cross-task issues |
| Coder is fresh per task | Prevents context bloat, clean slate per task |
| Fix loop stays in-team | Coder stays alive during loop, dismissed only after clean/accepted |
| tmux view | User can watch agents work in split panes |

### Team Teardown

After all tasks complete:
1. Dismiss all remaining teammates
2. Clean up team
3. Proceed to completion phase

---

## Quick Fix Mode (`--quick`)

1. **Assess complexity** — if complex, offer to escalate to full workflow
2. **Create worktree** (same convention as full workflow — `fix/<slug>` or `fix/<ticket>-<slug>`)
3. **Ask testing approach:**
   **Use AskUserQuestion:**
   ```
   Question: "Testing approach for this fix?"
   Options:
   - "tdd" → Write failing test first, then fix
   - "test-after" → Fix first, then add test
   - "no tests" → No tests needed
   ```
4. **Direct implementation**: Invoke coder with `model="sonnet"` inside the worktree:
   ```
   Task: [description]
   Mode: fix
   Testing: [chosen approach]
   Requirements: Keep changes minimal, run tests, self-review.
   ```
5. **Show changes, get commit approval** (even in relaxed mode — show commit message first)
6. **Done** — no separate review unless user requests

---

## Step 10: Completion

1. Update progress tracker — all tasks complete
2. Run final test suite yourself (inside worktree) — this is the one exception where you execute commands directly
3. Offer documenter if applicable (public API changed, new features, breaking changes)
4. Summarize:
   ```markdown
   ## Implementation Complete

   **Changes:** [file summaries]
   **Tests:** [counts]
   **All tasks:** [checklist]
   **Branch:** [branch name]
   **Worktree:** `.worktrees/$BRANCH` (remove when done: `git worktree remove .worktrees/$BRANCH`)
   **Next steps:** integration testing, manual testing, PR creation
   ```
5. Update state to `phase: "completion"`
6. Ask: "Create a pull request now?"

---

## User Interaction Rules

**CRITICAL: Use AskUserQuestion tool for ALL decision points** — never just output options as text.

**Use AskUserQuestion for:** supervision level, plan approval, commit approval, review requests, review findings, task continuation.

**Use plain text only when:** user needs to provide detailed free-form input or you're explaining before a follow-up question.

**Handling user interventions:**
When user asks a question or gives instructions mid-workflow:
1. Don't automatically make changes
2. Answer the question or acknowledge
3. Ask: continue as planned / adjust / fix previous / discuss more

**The principle:** Questions are questions. Only explicit "change X" or "fix this" should trigger edits.

---

## Error Recovery

**Planner failure:** Report error, offer retry / modified requirements / manual plan.
**Coder failure:** Check state, offer retry / skip / manual intervention. Don't mark complete.
**Reviewer failure:** Non-blocking — offer skip or retry with different focus.
**Blocked task:** Mark `blocked` with notes, ask user: skip / clarify / stop. If all remaining tasks depend on blocked task, pause workflow.

---

## Your Role

You are **orchestrating**, not implementing. Your job:
- Manage the process and invoke agents
- Present information clearly to the user
- Get user input at decision points (using AskUserQuestion!)
- Track progress and update state
- Handle errors and edge cases
- **Never read source code files** — let agents do that
- **Never copy plan content into agent prompts** — point agents to the plan file

What you CAN read: state files, plan files, agent outputs.
What you must NOT read: source code, test files, config files.

If you need exploration: use the Explore agent, not direct file reads.

---

**Now begin: Parse $ARGUMENTS flags, then start Step 0.**
