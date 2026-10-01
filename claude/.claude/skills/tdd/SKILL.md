---
name: tdd
description: Test-driven development with a red-green loop at pre-agreed seams. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: Where Tests Go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, propose the seams under test and get the user's confirmation. No test is written at an unconfirmed seam. When choosing seams:

- Prefer existing seams to new ones.
- Use the highest seam that covers the behavior. A test there exercises the most real code and survives the most internal change.
- Keep the number small. The ideal is one seam per feature.
- If no existing seam fits, propose a new one at the highest point you can, and say that it is new.

**You can't test everything.** Agreeing the seams up front is how testing effort lands on critical paths and complex logic instead of every possible edge case.

## Anti-Pattern: Tautological Tests

**DO NOT compute the expected value the way the code computes it.** A tautological test recomputes the expected value using the same logic as the code under test (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself). It passes by construction and can never disagree with the code.

The warning sign: the assertion mirrors the implementation. Such a test stays green even when the code is wrong, because both sides repeat the same mistake.

**Correct approach**: Expected values come from an independent source of truth — a known-good literal, a worked example, or the spec.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Planning

When exploring the codebase, use the project's domain glossary so that test names and interface vocabulary match the project's language, and respect ADRs in the area you're touching.

Before writing any code:

- [ ] Propose the seams under test (see [Seams](#seams-where-tests-go))
- [ ] List the behaviors to test at each seam (not implementation steps), prioritized. When the work comes from an issue with a `## Done when` section, derive the list from it: one behavior per criterion; those marked "(device)" need a manual check on hardware instead
- [ ] If a new seam is needed, shape it as a [deep module](deep-modules.md) (small interface, deep implementation) and design it for [testability](interface-design.md)
- [ ] Get the user's confirmation on seams and behaviors

Present the proposed seams and ask: "Should we test at these seams?" Confirm the behavior list as a separate question once the seams are agreed.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet - proves the path works end-to-end.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:

- Only at agreed seams. A test that needs a new seam goes back to the user first
- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### No Refactor Stage

The loop is red → green and ends at green. Refactoring is not a TDD stage: it belongs to the review stage that follows implementation (plan → implement → review → PR). Don't refactor inside the loop; leave cleanup for review.

## Checklist Per Cycle

```
[ ] Test sits at an agreed seam
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```
