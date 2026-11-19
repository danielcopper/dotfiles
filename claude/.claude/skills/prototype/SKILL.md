---
name: prototype
description: Build a throwaway prototype to answer a design question talk can't settle. Use when the user wants to feel out whether a state model or logic holds up, or to see what a page or terminal UI could look like before deciding.
---

# Prototype

A prototype is **throwaway code that answers one question**. The question decides the shape; the user's pick settles it.

## Pick a branch

Identify which question is being answered — from the user's prompt, the wayfinder question that called this skill, or the surrounding code — and ask the user when it stays unclear:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). One self-contained HTML page (free-play buttons plus tabbed guided walkthroughs) that pushes the state model through cases that are hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Several radically different variations of a web page or a terminal UI, switchable while it runs.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype.

## Rules for both

1. **Throwaway, in its own worktree.** Create it with `mise run worktree-new prototype <slug>`: branch `prototype/<slug>`, worktree at the convention path the `worktree` skill gives. Inside it, put the code next to the module or page it prototypes for, named so a casual reader sees it is a prototype; a throwaway route follows the project's routing convention.
2. **Trivial to run.** One command starts it: the project's task runner, `python <path>`, `bun <path>`, or the static server below for a logic page.
3. **No persistence by default.** State lives in memory. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.

## Show it

A page is shown the way the global `CLAUDE.md`, "Showing a page or image", says; `~/Memory/global/show-images-as-page.md` has the details behind it.

- The IP is the `src` of `ip -4 route get 1.1.1.1`, read at runtime. Pick a free port (`ss -ltn` lists the taken ones).
- A static page: `python3 -m http.server <port> --bind <ip> --directory <dir>`, run in the background. A dev server: its host option set to `<ip>`.
- The first time on a machine, `curl` the link from the machine itself, then ask the user whether it opens on their device. When it does not, say so: opening a firewall port is the user's call (on the server, through Ansible).
- Stop the server by its own task id or PID once the user has picked.

A terminal UI runs in the user's own terminal instead: hand over the command, as [UI.md](UI.md) says.

## The user picks

Give the link or the command, restate the question, add your recommendation with its reason, and ask which variant (or which parts of which) answers it. The verdict is the user's, in their words — often "the header from B with the sidebar from C" — and the question stays open until they give it. Requests for a new action, scenario or variant are part of the loop: build them and show again.

## Capture

1. **The decision** goes where the work's decisions live: the issue's `## Decisions`, as `~/.claude/skills/implement/repo-config.md`, "Questions and decisions in an issue", says; when the prototype resolves a wayfinder question, that question's answer in the map file, as `~/.claude/skills/wayfinder/SKILL.md` says. With neither, hand the verdict back to the conversation that asked for the prototype. The decision states the question, the pick and why, and points to the branch `prototype/<slug>`.
2. **The code** is committed on `prototype/<slug>` in its worktree; then remove the worktree (`git worktree remove <path>`). The branch stays local and is never merged: it is the runnable evidence behind the decision. The real code keeps none of the prototype; the implementation builds from the decision and lifts what it needs from the branch.
