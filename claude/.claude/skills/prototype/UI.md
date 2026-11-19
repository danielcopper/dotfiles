# UI Prototype

Generate **several radically different UI variations** of one screen — a web page or a terminal UI — switchable while it runs. The user flips between variants, picks one (or steals bits from each); the rest stays on the prototype branch.

If the question is about logic/state rather than what something looks like, this is the wrong branch. Use [LOGIC.md](LOGIC.md).

## When this is the right shape

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- "How should the new board page in the TUI be laid out?"
- Any time the user would otherwise spend a day picking between three vague mockups in their head.

## Two sub-shapes: strongly prefer sub-shape A

A UI prototype is much easier to judge when it's **butting up against the rest of the app**: real header, real sidebar, real data, real density. A throwaway screen on its own is a vacuum: every variant looks fine in isolation. Default to sub-shape A whenever there's a plausible existing screen to host the variants. Only reach for sub-shape B if the prototype genuinely has no nearby home. Both hold for a web page and a terminal UI alike.

### Sub-shape A: adjustment to an existing screen (preferred)

The screen already exists. Variants are rendered **on the same screen**, gated by a variant switch (below). The existing data fetching, params, and auth all stay. Only the rendering swaps. This is the default; pick it unless there's a specific reason not to.

If the prototype is for something that doesn't yet have a screen but _would naturally live inside one_ (a new section of the dashboard, a new card on the settings screen, a new step in an existing flow, a new page of an existing TUI), it's still sub-shape A. Mount the variants inside the host screen.

### Sub-shape B: a new screen (last resort)

Only use this when the thing being prototyped genuinely has no existing screen to live inside (e.g. an entirely new top-level surface, or a flow that can't be embedded anywhere sensible).

Create a **throwaway route** or entry point following whatever convention the project already uses. Don't invent a new top-level structure. Name it so it's obviously a prototype (e.g. include the word `prototype` in the path or filename).

Before committing to sub-shape B, sanity-check: is there really no existing screen this could be embedded in? An empty screen hides design problems that a populated one would expose.

## Process

### 1. State the question and pick N

Default to **3 variants**. More than 5 stops being radically different and starts being noise, so cap there.

Write down the plan in one line, in the prototype's location or a top-of-file comment:

> "Three variants of the settings page, switchable via `?variant=`, on the existing `/settings` route."

### 2. Generate radically different variants

Draft each variant. Hold each one to:

- The screen's purpose and the data it has access to.
- The project's component library / styling system (TailwindCSS, shadcn, MUI, plain CSS, the TUI's widget library, whatever).
- A clear name per variant, e.g. `VariantA`, `VariantB`, `VariantC`.

Variants must be **structurally different**: different layout, different information hierarchy, different primary affordance, not just different colours. Three slightly-tweaked card grids isn't a UI prototype, it's wallpaper. If two drafts come out too similar, redo one with explicit "do not use a card grid" guidance.

### 3. Wire the switch

**Web page.** A single switcher component on the route, reading a `?variant=` URL search param:

```tsx
// pseudo-code, adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

For sub-shape A, keep all the existing data fetching above the switcher; only the rendered subtree changes per variant. The switcher is a small fixed-position bar at the bottom-centre of the screen:

- **Left arrow** cycles to the previous variant, **right arrow** to the next (both wrap around).
- **Variant label** shows the current variant key and its name, e.g. `B (Sidebar layout)`.
- Clicking an arrow updates the URL search param through the framework's router (`router.replace` on Next, `navigate` on React Router, etc.), so the variant is shareable and reload-stable.
- The `←` and `→` keys also cycle, except while an `<input>`, `<textarea>`, or `[contenteditable]` is focused.
- Visually distinct from the page (e.g. high-contrast pill, subtle shadow) so it's obviously not part of the design being evaluated.

Put the switcher in one shared component, wherever shared UI lives in the project.

**Terminal UI.** A `--variant <key>` flag selects the variant at start; a long-running TUI also cycles variants on a key the app leaves free. Where the TUI starts per invocation and a flag doesn't fit, one runnable command per variant. Either way a status line shows the current variant key and name, styled apart from the design being judged.

### 4. Hand it over

Show it and let the user pick, as the [SKILL](SKILL.md)'s "Show it" and "The user picks" say: a web page by its link with the `?variant=` keys, a terminal UI by the exact command (and the cycle key) to run in the user's own terminal. The interesting feedback is usually **"I want the header from B with the sidebar from C"**, which is the actual design they want.

Your own test runs of a terminal UI stay off the user's session, as `~/Memory/global/agents-keep-off-the-owners-session.md` says.

### Static views

When screens are shown as a static page instead (captured terminal screens, a layout study), they stack vertically, as `~/Memory/global/mockups-stack-vertically.md` says, and every string, value and width in them comes from the producing code, as `~/Memory/global/mockup-values-come-from-code.md` says. The page is served like any other, per "Show it".

### 5. Capture the answer

Once the user has picked, capture the decision and the prototype the way the [SKILL](SKILL.md)'s "Capture" says. The decision names the winning variant (or the combination) and why; the full set of variants and the switch land on the prototype branch.

## Anti-patterns

- **Variants that differ only in colour or copy.** That's a tweak, not a prototype. Real variants disagree about structure.
- **Sharing too much code between variants.** A shared `<Header>` is fine; a shared `<Layout>` defeats the point. Each variant should be free to throw out the layout.
- **Wiring variants to real mutations.** Read-only prototypes are fine. If a variant needs to mutate, point it at a stub: the question is "what should this look like", not "does the backend work".
- **Treating variant code as production code.** It was written under prototype constraints (no tests, minimal error handling); the implementation rewrites the winner properly.
