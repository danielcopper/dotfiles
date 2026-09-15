---
name: azure-devops-boards
description: Azure DevOps board work-item workflow. Use when working on tasks tracked on an Azure DevOps board (Task states To Do → In Progress → Done), e.g. moving work-item states with `az boards`.
---

For work-item tasks tracked on an Azure DevOps board (Task states: To Do → In Progress → Done):

- **Always use the `az boards` CLI — never the Azure DevOps MCP connector, and never the REST API by hand.** This is a convention, not enforced by a permission rule; reading or updating work items goes through `az` (e.g. `az boards work-item show --id <id>`). Don't attempt the MCP auth flow, and don't fall back to `curl` against `_apis/wit/` — that puts the PAT in the command line, hand-builds the JSON patch and needs a second command to read the reply back, all of which one `az` call already does. The CLI is configured, so no credential or scope flags belong on the command.
- **When you start implementing, move every task you are actively working on to In Progress** (e.g. `az boards work-item update --id <id> --state 'In Progress'`).
- **You may move tasks autonomously only into In Progress** — that transition is pre-authorized.
- **Moving a task to Done always requires asking me first.** Never close or mark a board item Done without my explicit confirmation.
