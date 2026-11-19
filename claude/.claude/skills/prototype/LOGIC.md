# Logic Prototype

A single, self-contained HTML page that lets the user drive a state model by clicking buttons. Use this when the question is about **business logic, state transitions, or data shape**: the kind of thing that looks reasonable on paper but only feels wrong once you push it through real cases.

## When this is the right shape

- "I'm not sure if this state machine handles the edge case where X then Y."
- "Does this data model actually let me represent the case where..."
- "I want to feel out what the API should look like before writing it."
- Anything where someone wants to **press buttons and watch state change**.

If the question is "what should this look like," this is the wrong branch. Use [UI.md](UI.md).

## Process

### 1. State the question

Before writing code, write down what state model and what question you're prototyping. One paragraph, at the top of the page (in a visible intro, not just a comment). A logic prototype that answers the wrong question is pure waste, so make the question explicit so the user can check it.

### 2. Isolate the logic in a portable module

Put the actual logic (the bit that's answering the question) in a single `<script>` block written as a small, pure module. The page around it is throwaway; the module is the part worth keeping.

The right shape depends on the question:

- **A pure reducer**: `(state, action) => state`. Good when actions are discrete events and state is a single value.
- **A state machine**: explicit states and transitions. Good when "which actions are even legal right now" is part of the question.
- **A small set of pure functions** over a plain data type. Good when there's no implicit current state, just transformations.
- **A class or module with a clear method surface** when the logic genuinely owns ongoing internal state.

Pick whichever shape best fits the question being asked, _not_ whichever is easiest to wire to a page. Keep it pure: no DOM, no `document`, no button handlers reaching inside it. The page calls into it; nothing flows the other direction. This is what makes the module liftable past the prototype's lifetime.

### 3. Build the HTML page

One file, plain HTML/CSS/JS: no framework, no bundler, no backend, everything inline, so the static server in the [SKILL](SKILL.md)'s "Show it" hands it out as-is.

Every label is in **domain language**, not code (the glossary's terms where the repo has one): buttons and state read like the domain, not the reducer. Explain in plain words what's happening.

Lay it out with a clean hierarchy, top to bottom:

1. **Title and one-line explanation** of what this page lets you explore (the question from step 1).
2. **Current state**: the full relevant state, rendered as a readable panel (labelled fields, not a raw JSON dump), re-rendered after every click so the change is visible. Call out what just changed.
3. **Free-play buttons**: one button per action, always available, so the user can poke at the model in any order. Each click dispatches its action and re-renders the state.
4. **Guided walkthroughs**: a set of **scenarios**, one per tab. Each tab holds a short plain-language description of the scenario (the situation it sets up and what to watch for) and underneath it, the ordered **buttons to press** for that scenario. Each step is a real button: clicking it performs that action and moves to the next step. Starting a walkthrough resets to a known initial state so the scenario runs the same way every time.

Choose scenarios that demonstrate the awkward cases, the ones hard to reason about on paper: the happy path, a tricky edge case, an attempt at something that should be illegal.

Keep it beautiful but restrained: clean typography, generous spacing, one accent colour. No animations, no gimmicks: nothing that competes with the state and the buttons.

### 4. Hand it over

Show it and let the user pick, as the [SKILL](SKILL.md)'s "Show it" and "The user picks" say. The interesting moments are when they say "wait, that shouldn't be possible" or "huh, I assumed X would be different"; those are the bugs in the _idea_, which is the whole point. If they want new actions or a new scenario, add them. Prototypes evolve.

### 5. Capture the answer and the prototype

Once the user has answered the question, capture both the way the [SKILL](SKILL.md)'s "Capture" says. The decision names the validated model (its shape and the cases it settled); the page and its module stay on the prototype branch, where the single file remains trivially re-runnable.

## Anti-patterns

- **Don't add tests.** A prototype that needs tests is no longer a prototype.
- **Don't wire it to the real database.** Use in-memory state unless the question is specifically about persistence.
- **Don't generalise.** No "what if we wanted to support X later." The prototype answers one question.
- **Don't blur the logic and the page together.** If the pure module references the DOM, `document`, or button handlers, it's no longer liftable. Keep the page as a thin shell over a pure module.
- **Don't reach for a framework, bundler, or backend.** One static file; a React app or an API server is more than the question needs.
