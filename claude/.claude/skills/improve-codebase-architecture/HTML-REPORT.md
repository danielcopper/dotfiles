# HTML Report Format

The architectural review is rendered as a single self-contained HTML file in the session scratchpad. Tailwind and Mermaid both come from CDNs, each pinned to an exact version. Mermaid handles graph-shaped diagrams reliably; hand-built divs and inline SVG handle the more editorial visuals (mass diagrams, cross-sections). Mix the two — don't lean on Mermaid for everything, it'll start to look generic.

## Scaffold

The page's colours, typography and spacing come from the `show-page` skill's design pass; the scaffold only fixes where they go. Tailwind supplies layout utilities; every colour outside Mermaid's `classDef` is a token, used through `var(--…)`, also inside Tailwind's arbitrary values (`bg-[var(--surface)]`).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Architecture review — {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* Tokens from the design pass: light values here, dark ones below. */
      :root { --bg: …; --surface: …; --fg: …; --muted: …; --rule: …; --accent: …; --leak: …; --warn: …;
              --strong: …; --explore: …; --speculative: …; color-scheme: light; }
      @media (prefers-color-scheme: dark) { :root { --bg: …; /* every token again */ color-scheme: dark; } }
      body { background: var(--bg); color: var(--fg); }
      main { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
      /* small custom layer for things Tailwind doesn't cover cleanly:
         dashed seam lines, hand-drawn-feeling arrow heads, etc. */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: var(--leak); }
      .deep { background: var(--fg); color: var(--bg); }
      /* Before and after side by side on a wide screen, one below the other on a phone. */
      .before-after { display: grid; gap: 1.5rem; }
      @media (min-width: 48rem) { .before-after { grid-template-columns: 1fr 1fr; } }
    </style>
  </head>
  <body>
    <main class="max-w-5xl mx-auto py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Repo name, date, and a compact legend: solid box = module, dashed line = seam, a leak-coloured arrow or node = leakage (the `--leak` token, or classDef's literal colour in a Mermaid graph), a thick filled box = deep module. No introduction paragraph — straight into the candidates.

## Candidate card

The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms ([LANGUAGE.md](LANGUAGE.md)) without ceremony.

Each candidate is one `<article>`:

- **Title** — short, names the deepening (e.g. "Collapse the Order intake pipeline").
- **Badge row** — recommendation strength (`Strong`, `Worth exploring`, `Speculative`, in the `--strong`, `--explore` and `--speculative` tokens), plus a tag for the dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
- **Files** — monospaced list, `font-mono text-sm`.
- **Before / After diagram** — the centrepiece. Two columns side by side, one below the other at phone width (`.before-after`). See patterns below.
- **Problem** — one sentence. What hurts.
- **Solution** — one sentence. What changes.
- **Wins** — bullets, ≤6 words each. e.g. "Tests hit one interface", "Pricing logic stops leaking", "Delete 4 shallow wrappers".
- **ADR callout** (if applicable) — one line in a box tinted with the `--warn` token.

No paragraphs of explanation. If the diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

Pick the pattern that fits the candidate. Mix them. Don't make every diagram look the same — variety is part of the point.

### Mermaid graph (the workhorse for dependencies / call flow)

Use a Mermaid `flowchart` or `graph` when the point is "X calls Y calls Z, and look at the mess." Wrap it in a card styled from the tokens so it doesn't feel parachuted in. Style with classDef to colour leakage nodes and the deep module; classDef takes literal colours only (a `var(--leak)` there is a syntax error in Mermaid 11.4.1), so pick ones that read on both themes' backgrounds. Sequence diagrams work well for "before: 6 round-trips; after: 1."

```html
<div class="rounded-lg border border-[color:var(--rule)] bg-[var(--surface)] p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### Hand-built boxes-and-arrows (when Mermaid's layout fights you)

Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements positioned absolutely over a relative container. Reach for this when you want the "after" diagram to feel like one thick filled box for the deep module (`.deep`) with its internals faded inside it — Mermaid won't render that with the right weight.

### Cross-section (good for layered shallowness)

Stack horizontal bands (`h-12 border-l-4`) to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band labelled with the consolidated responsibility.

### Mass diagram (good for "interface as wide as implementation")

Two rectangles per module — one for interface surface area, one for implementation. Before: interface rectangle is nearly as tall as the implementation rectangle (shallow). After: interface rectangle is short, implementation rectangle is tall (deep).

### Call-graph collapse

Before: a tree of function calls rendered as nested boxes. After: the same tree collapsed into one box, with the now-internal calls shown faded inside it.

## Style guidance

- Lean editorial, not corporate-dashboard; palette, type and spacing come from the design pass.
- Colour by role, each role a token: one accent, one colour for leakage, one for warnings, one per recommendation strength.
- Keep diagrams ~320px tall so before/after sits comfortably side by side on a wide screen without scrolling.
- Use `text-xs uppercase tracking-wider` for module labels inside diagrams — they should read as schematic, not as UI.
- The only scripts are the Tailwind CDN and the Mermaid ESM import. The report is otherwise static — no app code, no interactivity beyond Mermaid's own rendering.

## Top recommendation section

One larger card. Candidate name, one sentence on why, anchor link to its card. That's it.

## Tone

Plain English, concise — but the architectural nouns and verbs come straight from [LANGUAGE.md](LANGUAGE.md). Concision is not an excuse to drift.

**Use exactly:** module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

**Never substitute:** component, service, unit (for module) · API, signature (for interface) · boundary (for seam) · layer, wrapper (for module, when you mean module).

**Phrasings that fit the style:**

- "Order intake module is shallow — interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen: one interface, one place to test."
- "Two adapters justify the seam: HTTP in prod, in-memory in tests."

**Wins bullets** name the gain in glossary terms: *"locality: bugs concentrate in one module"*, *"leverage: one interface, N call sites"*, *"interface shrinks; implementation absorbs the wrappers"*. Don't write *"easier to maintain"* or *"cleaner code"* — those terms aren't in the glossary and don't earn their place.

No hedging, no throat-clearing, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it. If a term isn't in [LANGUAGE.md](LANGUAGE.md), reach for one that is before inventing a new one.
