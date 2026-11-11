# ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. In a foreign repo they live in the directory [SKILL.md](./SKILL.md), "Where they are written", names, and carry an `M-` prefix so their numbers never collide with the repo's: `M-0001-slug.md`, `M-0002-slug.md`, always cited with the prefix ("M-0003").

Create the directory lazily — only when the first ADR is needed.

## Format and lifecycle

The default when writing or changing an ADR; a repo's own ADR convention or tooling wins.

- **Front matter carries the lifecycle.** Three required keys: `status` (`proposed` / `accepted` / `rejected` / `deprecated` / `superseded`), `decided` and `updated` (ISO dates — when it was decided, when the record last changed). Plus the relation keys that apply, each a list: `supersedes`, `superseded-by`, `amends`, `amended-by`, whose values are ADR numbers written as four digits (`[0020]`), an `M-` ADR's with its prefix (`[M-0003]`). Nothing else goes there, so a mistyped key is an error, not a silently missing relation.
- **Then the H1 and the decision with its reasons, naming the alternative it was chosen over.** Status lives only in the front matter. An ADR can be a single paragraph; add Considered Options / Consequences only when they add real value. Later changes go into amendment sections (below).
- **The ADR links the issue it came from**, in its text.
- **Relations are declared from both ends** — if 0029 `amends: [0020]`, then 0020 carries `amended-by: [0029]`. A relation between an `M-` ADR and one of the repo's own is declared only on the `M-` side, and nothing in this block writes into a foreign repo's `docs/adr/`: its ADRs get no relation key, front matter or amendment.
- **A decided ADR is amended, never quietly rewritten.** Append `## Amendment — <what changed>` and bump `updated`; the decision text above stays as it was decided. Amending never changes `status` — only a replacement does, and then `superseded` and `superseded-by` appear together. If the change is itself a decision worth its own record, write a new ADR and declare the relation on both sides.
- **Older ADRs without front matter are not a repo convention** — only a written one is. They stay as they are, unretrofitted unless asked — or until a new ADR supersedes or amends one: then the older one gets its front matter in the same change, so the relation stands on both ends. New ADRs follow this block; in a repo that calls the shared `decisions` check, the check enforces its front matter and relations, and a new ADR without front matter fails.

## Numbering

Scan the directory the ADR goes to for the highest existing number and increment by one.

## When to offer an ADR

Only for a decision meeting the three ADR criteria in the global `CLAUDE.md`; [SKILL.md](./SKILL.md) ("Offer ADRs sparingly") explains them.

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.
