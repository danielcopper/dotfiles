---
name: wayfinder
description: Plan an effort too big for one session as a private map of open questions in ~/Memory/<repo>/, and resolve them one per session until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **map** (one private Markdown file), then works its **questions** (each one resolved by a decision, not a slice of a build) one per session until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every question. It might be a spec to hand off, a decision to lock before planning starts, or a change made in place like a data-structure migration.

## Plan, never do

Every session ends in a decision, never a deliverable. The map is done when the way is clear, with nothing left to decide before someone builds the thing; building happens after the hand-off, through `/to-prd` → `/to-issues`. This holds for every map, whatever its Notes or any other line in it says. The pull to just do the work is the signal you've reached the edge of the map: record the decision and stop.

## The map

The map is one file per effort: `~/Memory/<repo>/wayfinder-<slug>.md`, `<repo>` as `~/.claude/skills/implement/repo-config.md` defines it. It never becomes GitHub issues. Its front matter follows `~/Memory/global/README.md`, and the repo index `~/Memory/<repo>/MEMORY.md` carries one line for it with the marker `TIME-BOUND, delete when the PRD is published` (README, "TTL marker"); once `/to-prd` publishes the PRD, it archives the map.

The map is read top-down: the low-resolution sections first, then a question's entry when you zoom in. A decision lives in exactly one place, its question's **Answer**; **Decisions so far** is the index that gists it by the question's title.

```markdown
---
name: wayfinder-<slug>
description: Wayfinder map — <the destination in one line>
type: project
---

# Wayfinder — <effort>

## Destination

<what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a question.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index: one line per resolved question, enough to judge relevance; the detail is in the question's Answer -->

- <question title>: <one-line gist of the answer>

## Questions

### <question title>

- **Type:** grilling | research | prototype | task
- **Blocked by:** <question titles> | none
- **Status:** open | resolved

<the question this entry resolves, sized to one session>

**Answer:** <on resolution: the decision and why, short; longer detail in a linked note (research note, ADR, prototype branch)>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't phrase as a question yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; never graduates -->
```

A question is referred to by its **title**, in the map and in everything the user reads; titles are unique within the map. A question is **unblocked** when every question it is blocked by is resolved; the **frontier** is the open, unblocked questions in file order, the edge of the known. Sessions run one at a time, so a question needs no claim.

A decision that changes is struck through in its Answer and the new one follows with its date, the way `repo-config.md`, "Questions and decisions in an issue", changes a decision; its line in Decisions so far is rewritten.

## Question types

Every question is either **HITL** (human in the loop, worked _with_ the user, who speaks for themselves) or **AFK**, driven by the agent alone. A HITL question only resolves through that live exchange; the agent never stands in for the user's side of it, and asks one question per message.

- **Grilling** (HITL): conversation, the default case. Call the Skill tool with `grill-with-docs`.
- **Research** (AFK): reading documentation, third-party APIs, or upstream sources to surface a fact a decision waits on. Call the Skill tool with `research`; its note lands in `~/Memory/<repo>/`, and the Answer links it. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): raise the fidelity of the discussion with a cheap, concrete artifact to react to. Call the Skill tool with `prototype`; the user picks, and the Answer points to the prototype branch. Use when "how should it look" or "how should it behave" is the key question, and reach for it early: a concrete artifact exposes what a long grill only circles.
- **Task** (HITL or AFK): manual work that must happen before a _decision_ can be made: signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. It earns its place by unblocking a decision, never by delivering part of the destination; a task that reads like a slice of the build is mis-typed: rephrase it as the question it unblocks, or rule it out of scope. The agent drives it alone where it can (AFK); otherwise it hands the user a precise checklist (HITL). Resolved when the work is done; the Answer records what was done and any resulting facts (credentials location, new URLs, row counts) later questions depend on.

## Fog of war

The map is _deliberately_ incomplete: chart only what you can see. Beyond the open questions lies the **fog of war**: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a question clears the fog ahead of it, graduating whatever's now specifiable into fresh questions, one at a time, until the way to the destination is clear and no open question remains.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. Everything there is in scope, just not sharp enough to be a question. Write as loosely or as fully as the view allows.

**Fog or question?** The test is whether you can state the question precisely now, _not_ whether you can answer it now.

- **Question when** it is already sharp, even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Leave the fog coarse: one patch may graduate into several questions, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided, what's already a question, and what's out of scope.

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope**: it isn't fog. It gets its own **Out of scope** section: work consciously ruled out of _this_ effort. Out-of-scope work never graduates; it returns only if the destination is redrawn, and then as a fresh effort.

When a question turns out to sit past the destination (mis-scoped while charting, or exposed by a resolution), remove its entry and leave one line in **Out of scope**: the gist plus why it's out. It stays out of **Decisions so far**, which records the route actually walked.

## Invocation

Two modes. Either way, **resolve one question per session**, research questions excepted.

### Chart the map

The user invokes with a loose idea.

1. **Name the destination.** Grill with `grill-with-docs` to pin down what this map is finding its way to: the spec, decision, or change. Keep it bounded (one epic, not "all of V1"): a map scoped too wide plans questions that earlier answers invalidate. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: across the whole space rather than deep on any one thread, still one question per message, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** (the way is already clear, the whole journey small enough for one session), there is no map to chart: stop and say the effort fits one session — `/grill-with-docs`, then `/to-prd` → `/to-issues`.
3. **Write the map file**: Destination and Notes filled in, Decisions so far empty, the fog sketched into **Not yet specified**; add its `TIME-BOUND` line to the repo index.
4. **Add the questions you can specify now**, each with its type and what it is blocked by. Everything you can't yet specify stays in **Not yet specified**.
5. **Fire the research.** Call the Skill tool with `research` for each research question; as each note lands, record its Answer and its line in Decisions so far.
6. Stop: charting resolves no other question.

### Work through the map

The user invokes with a map (its path or slug); a question is optional.

1. Load the **map**: the low-resolution sections, then the entries you need.
2. Choose the question. If the user named one, use it. Otherwise take the first question on the frontier.
3. Resolve it as its **Type** says (see [Question types](#question-types)). **Zoom as needed**: read linked notes and resolved Answers on demand; call the Skill tool for whichever skills the Notes name.
4. Record the resolution: the **Answer** under the entry, **Status** resolved, one line in **Decisions so far**.
5. Add newly surfaced questions; graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new question. If the answer shows a question sits beyond the destination, **rule it out of scope**. If the decision invalidates other parts of the map, update or remove those entries.
6. Stop. When no open question remains and **Not yet specified** is empty, the map is cleared: offer the hand-off, `/to-prd` pointed at the map file, then `/to-issues`.
