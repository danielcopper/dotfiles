---
name: azure-devops-boards
description: Azure DevOps board work-item workflow. Use when working on tasks tracked on an Azure DevOps board (Task states To Do → In Progress → Done), e.g. moving work-item states with `az boards`.
---

For work-item tasks tracked on an Azure DevOps board (Task states: To Do → In Progress → Done):

- **Always use the `az boards` CLI — never the Azure DevOps MCP connector.** This is a convention, not enforced by a permission rule; reading or updating work items goes through `az` (e.g. `az boards work-item show --id <id>`). Don't attempt the MCP auth flow.
- **When you start implementing, move every task you are actively working on to In Progress** (e.g. `az boards work-item update --id <id> --state 'In Progress'`).
- **You may move tasks autonomously only into In Progress** — that transition is pre-authorized.
- **Moving a task to Done always requires asking me first.** Never close or mark a board item Done without my explicit confirmation.
