---
name: azure-devops-boards
description: Azure DevOps board work-item workflow. Use when working on tasks tracked on an Azure DevOps board (Task states To Do → In Progress → Done), e.g. moving work-item states with `az boards`.
---

For work-item tasks tracked on an Azure DevOps board (Task states: To Do → In Progress → Done):

- **When you start implementing, move every task you are actively working on to In Progress** (e.g. `az boards work-item update --id <id> --state 'In Progress'`).
- **You may move tasks autonomously only into In Progress** — that transition is pre-authorized.
- **Moving a task to Done always requires asking me first.** Never close or mark a board item Done without my explicit confirmation.
