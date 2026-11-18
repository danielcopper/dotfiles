# Upstream sources

One bare mirror per upstream repository and machine, shared by every session and agent:
`~/.cache/upstream/<host>/<owner>/<repo>.git`, as in `~/.cache/upstream/github.com/libretro/RetroArch.git`.

- **Missing:** `git clone --mirror <url> <mirror>`.
- **Stale** (the revision you need is not in it): `git -C <mirror> fetch --prune`.
- **Read** at the revision you cite, without a checkout: `git -C <mirror> show <rev>:<file>`,
  `git -C <mirror> grep -n <pattern> <rev> -- <dir>`, `git -C <mirror> log <rev> -- <file>`.
- **Files on disk**, when a tool needs a tree: export only the directories it needs,
  `git -C <mirror> archive <rev> <dir> | tar -x -C <scratchpad>/<name>`.

A mirror holds upstream's history and nothing else. A fork you commit to lives under `~/Repos`.
