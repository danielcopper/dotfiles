---
name: commit-message
description: Use this skill when helping users create git commit messages. Enforces Conventional Commits format with type(scope): subject structure, includes breaking change notices and issue references. Adapts detail level based on change complexity.
---

# Commit Message Guidelines

You are helping craft git commit messages following Conventional Commits specification.

## Format Structure

All commit messages MUST follow this format:

```
type(scope): subject

[optional body]

[optional footer(s)]
```

### Type (Required)

Use one of these standard types:
- `feat`: New feature for the user
- `fix`: Bug fix for the user
- `docs`: Documentation changes only
- `style`: Formatting, missing semicolons, etc (no code change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `build`: Changes to build system or dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Scope (Optional)

Specify the area of change (component, module, file):
- Examples: `auth`, `api`, `ui`, `database`, `config`
- Use lowercase, no spaces
- Omit parentheses if no scope: `feat: add login`

### Subject (Required)

- Use imperative mood: "add feature" not "added feature" or "adds feature"
- No capitalization of first letter
- No period at the end
- Maximum 72 characters
- Be concise but descriptive

## Body (Flexible)

**When to include a body:**
- Complex changes requiring explanation
- Multiple related changes
- Non-obvious implementation decisions
- Changes affecting multiple areas

**When to omit:**
- Simple, self-explanatory changes
- Single-line fixes
- Obvious refactoring

**Body format:**
- Wrap at 72 characters
- Separate from subject with blank line
- Explain WHAT and WHY, not HOW
- Use bullet points for multiple items
- Can include multiple paragraphs

## Footer (When Applicable)

### Breaking Changes (REQUIRED for breaking changes)

```
BREAKING CHANGE: describe what breaks backward compatibility
```

Alternative syntax:
```
feat(api)!: change authentication flow

BREAKING CHANGE: JWT tokens now expire after 1 hour instead of 24 hours
```

### Issue References (REQUIRED when fixing/closing issues)

```
Closes #123
Fixes #456
Refs #789
Related to #101
```

Use GitHub keywords for auto-closing:
- `Closes`, `Fixes`, `Resolves` (closes the issue)
- `Refs`, `References`, `Related to` (links without closing)

## Examples

### Simple commit (no body needed)
```
fix(auth): validate email format before submission
```

### Complex commit with body
```
feat(api): add pagination to user list endpoint

Implement cursor-based pagination to improve performance
for large user datasets. Uses base64-encoded cursors for
forward and backward navigation.

- Add limit and cursor query parameters
- Return next/previous cursor in response
- Default limit set to 50 items
- Maximum limit capped at 100 items

Closes #234
```

### Breaking change
```
refactor(database)!: change user table schema

BREAKING CHANGE: user.name field split into firstName and lastName.
Migration required for existing databases.

Refs #567
```

### Multiple issues
```
fix(ui): resolve form validation edge cases

Fixes #123, #124
Related to #125
```

## Decision-Making Guide

**Assess change complexity:**

1. **Simple (subject only)**
   - Single file change
   - Self-explanatory modification
   - < 10 lines changed

2. **Moderate (subject + brief body)**
   - Multiple files
   - Needs context about "why"
   - 10-50 lines changed

3. **Complex (subject + detailed body + footer)**
   - Architectural changes
   - Breaking changes
   - Multiple interconnected modifications
   - > 50 lines changed
   - Requires migration or setup

**Always include:**
- Breaking change notices
- Issue references when applicable
- Co-authored-by when relevant

## Verification Checklist

Before finalizing, ensure:
- [ ] Type is valid and appropriate
- [ ] Subject uses imperative mood
- [ ] Subject is ≤ 72 characters
- [ ] Body explains "what" and "why" (if included)
- [ ] Breaking changes documented in footer
- [ ] Issue references included with correct keywords
- [ ] No typos or grammar errors
