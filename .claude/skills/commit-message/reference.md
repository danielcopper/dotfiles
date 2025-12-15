# Commit Message Examples Reference

This document contains real-world examples of well-crafted commit messages following Conventional Commits.

## Simple Commits (Subject Only)

### Bug Fixes
```
fix(auth): prevent duplicate login attempts
```

```
fix(ui): correct button alignment in mobile view
```

```
fix(api): handle null response in user endpoint
```

### Features
```
feat(dashboard): add export to CSV button
```

```
feat(search): implement autocomplete suggestions
```

### Chores
```
chore(deps): update axios to version 1.6.0
```

```
chore: remove unused imports
```

### Documentation
```
docs(readme): add installation instructions
```

```
docs(api): update authentication examples
```

## Moderate Commits (Subject + Body)

### Feature with Context
```
feat(notifications): add email notification system

Implement transactional email notifications using SendGrid.
Users now receive emails for account activities, password
resets, and important updates.

Closes #145
```

### Bug Fix with Explanation
```
fix(cart): prevent race condition in checkout process

The checkout flow was vulnerable to duplicate orders when
users clicked submit multiple times. Added request debouncing
and server-side duplicate detection using idempotency keys.

Fixes #203
Related to #198
```

### Refactoring
```
refactor(database): migrate to connection pooling

Replace individual connections with pg-pool to improve
performance and resource utilization. Connection pool
size is configurable via DATABASE_POOL_SIZE env variable.

- Maximum 20 connections by default
- Automatic connection recycling
- Better error handling on connection failures

Refs #312
```

## Complex Commits (Detailed Body + Footer)

### Breaking Change
```
feat(api)!: restructure authentication response format

Change JWT token response structure to separate access
and refresh tokens, improving security and enabling
token rotation without re-authentication.

Previous format:
{
  "token": "eyJhbG...",
  "expiresIn": 3600
}

New format:
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "accessTokenExpiry": 3600,
  "refreshTokenExpiry": 604800
}

Clients must update their authentication handling to use
the new response structure. Refresh token endpoint is now
required for long-lived sessions.

BREAKING CHANGE: Authentication response structure changed.
Update client code to handle accessToken and refreshToken fields.

Closes #401
```

### Feature with Multiple Changes
```
feat(reporting): implement advanced analytics dashboard

Create comprehensive analytics dashboard with the following
capabilities:

- Real-time metrics visualization using Chart.js
- Customizable date range filters
- Export to PDF and Excel formats
- User-specific view persistence
- Mobile-responsive layout

Dashboard loads asynchronously to prevent blocking main
application. Data is cached for 5 minutes to reduce server
load. Admin users can access all organization data while
regular users see only their own metrics.

Performance optimizations:
- Lazy load chart libraries
- Implement virtual scrolling for large datasets
- Use web workers for data processing

Closes #567, #568, #571
Related to #590
```

### Critical Bug Fix
```
fix(security): patch SQL injection vulnerability in search

Address critical SQL injection vulnerability in the global
search functionality. The issue allowed malicious users to
execute arbitrary SQL commands through the search query
parameter.

Changes implemented:
- Replace string concatenation with parameterized queries
- Add input validation and sanitization
- Implement query allowlist for special characters
- Add rate limiting to search endpoint

All search queries are now properly escaped and validated
before database execution. Added automated security tests
to prevent regression.

Fixes CVE-2024-XXXXX
Closes #999
```

### Migration/Infrastructure
```
build(docker): migrate to multi-stage build process

Optimize Docker images using multi-stage builds to reduce
final image size and improve deployment times.

Benefits:
- Image size reduced from 1.2GB to 180MB
- Build time decreased by 40%
- Separate build and runtime dependencies
- Enhanced security through minimal runtime image

Updated CI/CD pipelines to leverage build caching.
Added docker-compose.prod.yml for production deployment.

Breaking changes:
- Node.js base image changed from node:18 to node:18-alpine
- Volume paths updated in docker-compose.yml

BREAKING CHANGE: Docker volume paths changed. Update your
docker-compose.override.yml if using custom volumes.

Refs #712
```

## Edge Cases

### Reverting a Commit
```
revert: feat(api): add pagination to user list

This reverts commit a1b2c3d4e5f6g7h8i9j0.

Pagination implementation caused performance regression
in production. Reverting while we investigate the issue.

Related to #823
```

### Multiple Co-Authors
```
feat(payment): integrate Stripe payment processing

Implement Stripe payment gateway with support for credit
cards, Apple Pay, and Google Pay. Includes webhook handling
for payment events and automatic invoice generation.

Closes #445

Co-authored-by: Jane Developer <jane@example.com>
Co-authored-by: Bob Engineer <bob@example.com>
```

### Hotfix
```
fix(security)!: expire all active sessions after password change

Critical security fix to prevent session hijacking. All user
sessions are now invalidated when password is changed, requiring
re-authentication on all devices.

BREAKING CHANGE: Password changes now expire all active sessions.
Users will need to log in again on all devices.

Fixes #999
```

## Anti-Patterns to Avoid

### ❌ Too Vague
```
fix: update stuff
chore: changes
feat: improvements
```

### ❌ Wrong Mood
```
feat: added new feature
fix: fixed the bug
docs: updated readme
```

### ❌ Missing Context
```
fix(auth): fix bug

# What bug? How was it fixed? What was the impact?
```

### ❌ Too Much Detail
```
fix(ui): button color

Changed button-primary color from #0066cc to #0052a3 in
styles/button.css line 42 because the old color did not
meet WCAG AA contrast requirements of 4.5:1 for normal text
according to the Web Content Accessibility Guidelines version
2.1 published by W3C and we needed to ensure our application
is accessible to users with visual impairments...

# Subject line too long, body too detailed about implementation
```

## Quick Decision Tree

```
Change type?
├─ New functionality → feat
├─ Bug fix → fix
├─ Documentation → docs
├─ Code cleanup → refactor
├─ Performance → perf
└─ Other → chore/style/test/build/ci

Breaking change?
├─ Yes → Add ! to type and BREAKING CHANGE footer
└─ No → Continue

Complexity?
├─ Simple (< 10 lines) → Subject only
├─ Moderate (10-50 lines) → Add brief body
└─ Complex (> 50 lines) → Add detailed body

Issue related?
├─ Fixes issue → Add "Fixes #123"
├─ Closes issue → Add "Closes #123"
└─ References issue → Add "Refs #123"
```

## Verification Examples

### ✅ Excellent Commit
```
feat(api): add rate limiting to authentication endpoints

Implement Redis-based rate limiting to prevent brute force
attacks on login and password reset endpoints.

- 5 attempts per 15 minutes for login
- 3 attempts per hour for password reset
- Exponential backoff for repeated violations
- Admin users exempt from rate limits

Rate limit configuration is externalized via environment
variables for flexibility across environments.

Closes #678
```

**Why it's good:**
- Clear type and scope
- Imperative subject line
- Explains what and why
- Includes implementation details
- References issue
- Follows all guidelines

### ✅ Excellent Simple Commit
```
fix(validation): trim whitespace from email inputs
```

**Why it's good:**
- Clear and concise
- No body needed (change is self-explanatory)
- Uses imperative mood
- Specific scope
