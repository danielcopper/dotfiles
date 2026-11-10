---
name: to-prd
description: Turn the current conversation context into a PRD and publish it as an issue on the repo's board. Use when user wants to create a PRD from the current context.
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

The skill publishes the PRD as a GitHub issue and puts it on the repo's board, where it has one.

## Process

### 1. Read the board

Read the repo's profile, `~/Memory/<repo>/repo-profile.md`, as [`~/.claude/skills/implement/repo-config.md`](../implement/repo-config.md) gives its path and schema. Without a profile, stop and ask the user to run `/setup-repo`. Its `board` decides the board step in Publish, as `repo-config.md`, "Board", says for each kind and for a profile without one.

### 2. Explore and synthesize

Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

### 3. Sketch the test seams

Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

### 4. Write the PRD

Use the template below.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Decisions

The decisions the user confirmed in this conversation, numbered `- D1: …`, `- D2: …`. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions
- The test seams agreed in step 3, and why those seams; prior art for the tests (similar tests in the codebase)

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## To decide

Every decision you synthesized that the user did not confirm, one checkbox each (`- [ ] …`), phrased as an open question with your recommended answer. Leave the section out when there is none.

## Done when

The checkable outcomes, from the user's perspective, as a checklist. Each becomes a test of external behaviour, not implementation details, seen failing first at an agreed seam; one that only a manual check on hardware can show ends in "(device)".

- [ ] Outcome 1
- [ ] Outcome 2

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>

### 5. Publish

1. Detect the target repo from `git remote get-url origin` (parse `owner/name`).
2. Create the issue:
   ```
   gh issue create -R <owner>/<name> --title "<PRD title>" --body-file <tmpfile>
   ```
   Capture the returned issue URL.
3. Put the issue on the board in Ready, as `repo-config.md`, "Board", says — on a `github` board with the commands under "GitHub commands".
4. Report the issue URL to the user.
