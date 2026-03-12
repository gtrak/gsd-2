# Code Review Feature

## Overview

GSD-2's Code Review feature adds a systematic review cycle after each task execution. This dual-agent hierarchy uses a smart orchestrator model for planning and code execution, with a dedicated code reviewer that finds issues and cycles until quality standards are met.

## How It Works

### The Flow

```
execute-task → (writes SUMMARY.md) → review-task → CODE-REVIEW.md
                                                              ↓
                                                    issue-free?
                                                ↙          ↘
                                             YES            NO
                                            ↓               ↓
                                    continue     fix-task → re-review → repeat (max 5 cycles)
```

### Unit Types

| Unit Type | Phase | Model | Purpose |
|-----------|-------|-------|---------|
| `execute-task` | Execution | Execution model | Main task implementation |
| `review-task` | Reviewing | Code review model | Finds issues in completed work |
| `fix-task` | Fixing | Execution model | Fixes issues identified by review |

## Configuration

### Preferences

Add to your `~/.gsd/prefernces.md` or `.gsd/prefernces.md`:

```yaml
models:
  planning: claude-opus-4-6          # Smart model for planning
  execution: claude-haiku-4-5        # Dumber/faster model for execution
  review: claude-sonnet-4-6          # Mid-tier reviewer
  fix: claude-haiku-4-5              # Fix with same dumb model

auto_supervisor:
  soft_timeout_minutes: 20
  idle_timeout_minutes: 10
  hard_timeout_minutes: 30

code_review_enabled: true           # Enable/disable code review
code_review_max_cycles: 5           # Max review-fix cycles (default: 5)
```

### Model Assignment

The review flow allows per-phase model selection:

- **Planning**: Use expensive model (Opus) for high-quality plans
- **Execution**: Use cheaper model (Haiku/Sonnet) for implementation
- **Review**: Use balanced model (Sonnet) for quality checks
- **Fix**: Use cheaper model (Haiku) for issue fixes

## Reviewer Agent

The `gsd-code-reviewer` agent is antagonistic and methodical:

### Review Categories

1. **Plan Drift** — Tasks not completed, features missing
2. **Partial Implementation** — TODOs/FIXMEs, stubs, placeholders
3. **Incomplete Stubs** — Mocks that don't perform function, empty catches
4. **Useless Tests** — Always pass, no assertions
5. **Duplicate Tests** — Redundant coverage
6. **Code Quality** — Naming, complexity, duplication
7. **Bugs** — Null/undefined, race conditions, logic errors
8. **Security** — Injection, auth, validation, secrets, XSS
9. **Performance** — N+1 queries, indexes, loops, algorithms
10. **Best Practices** — Error handling, logging, formatting

### Severity Levels

| Severity | Meaning | Blocking? |
|----------|---------|-----------|
| **Critical** | Security, crashes, broken core functionality | YES |
| **Major** | Incomplete work, broken secondary features | YES |
| **Minor** | Code style, suggestions | Only if "trivially fixable" |

## Review Cycle Behavior

### Cycle 1: Initial Review

1. **Run**: Execute task completes SUMMARY.md
2. **Trigger**: Code reviewer agent runs
3. **Output**: `T01-CODE-REVIEW.md` with issues list
4. **Decision**:
   - No blocking issues → continue to next task
   - Blocking issues → fix cycle

### Cycle 2-N: Fix and Re-Review

1. **Fix**: Agent fixes all Critical/Major/trivial Minor issues
2. **Re-review**: Code reviewer checks fixes
3. **Track**: Mark previous issues FIXED or STILL_OPEN
4. **Decision**:
   - All blocking issues fixed → continue
   - Issues remain → next cycle

### Max Cycles (default: 5)

After 5 cycles:
- **Critical/Major issues remain** → STOP with error
- **Only non-trivial Minor issues** → Continue with warning

## Output Files

### CODE-REVIEW.md Format

```markdown
# Code Review: T01 - Build Parser

**Review Cycle:** 2/5
**Date:** 2026-03-11T15:30:00Z

## Previous Issues Status

### From Cycle 1
- [C-1] SQL injection → **FIXED**
- [M-1] Incomplete stub → **STILL_OPEN**

## Current Issues

### Critical
None.

### Major
- [M-2] Logout doesn't invalidate session
  - **Location:** `src/auth/logout.js:15`
  - **Issue:** Logout endpoint doesn't clear session token
  - **Severity:** Major
  - **Category:** Partial Implementation
  - **Fix:** `await redis.delete(\`session:\${token}\`)`

### Minor
- [m-1] Inconsistent naming

## Summary

| Status | Critical | Major | Minor |
|--------|----------|-------|-------|
| Previous Fixed | 1 | 0 | 0 |
| Previous Remaining | 0 | 1 | 0 |
| New | 0 | 0 | 1 |
| **Total Open** | **0** | **1** | **1** |

**Previous Issues:** 1 fixed, 1 remaining
**New Issues:** 0 critical, 0 major, 1 minor
**Status**: ISSUES_RESOLVED or CYCLE_N
---
*Reviewed by: gsd-code-reviewer | Cycle: 2*
```

### REVIEW-STATE.json

Tracks cycle count and state:

```json
{
  "activeTaskId": "T01",
  "cycle": 2,
  "issues": [],
  "lastReviewPath": ".gsd/milestones/M001/slices/S01/tasks/T01-CODE-REVIEW.md"
}
```

## State Machine Integration

The review cycle integrates into GSD-2's state machine:

1. **Post-task**: After `handleAgentEnd()` on `execute-task`
2. **Check**: If `code_review_enabled` and task summary exists
3. **Initialize**: Create REVIEW-STATE.json for the task
4. **Dispatch**: On next `dispatchNextUnit()` call:
   - If no review file yet → dispatch `review-task`
   - If review complete and blocking issues → dispatch `fix-task`
   - If review complete and clean → clear state, continue normal flow

## Disabling Code Review

### Per-Project

`.gsd/prefernces.md`:

```yaml
code_review_enabled: false
```

### Per-Task (Manual)

Skip review by adding to task plan:

```markdown
## Tasks
- [ ] **T02: Quick Fix** `est:5m` `[no-review]`
  Trivial fix, no review needed.
```

## Cost Considerations

Review adds ~1-2 turns per task:

| Phase | Turns (review found issues) | Turns (review clean) |
|-------|---------------------------|----------------------|
| Execute | 1 | 1 |
| Review | 1 | 1 |
| Fix (if needed) | 1-2 | 0 |
| **Total** | **3-4 turns** | **2 turns** |

**Tips to minimize cost:**
- Use cheaper model for reviews (`Sonnet` vs `Opus`)
- Use faster model for fixes (`Haiku` vs `Sonnet`)
- Disable for trivial tasks with `[no-review]` tag
- High-quality plans reduce issues found

## Testing

Run integration tests:

```bash
npm test -- src/resources/extensions/gsd/tests/code-review-state.test.ts
npm test -- src/resources/extensions/gsd/tests/code-review-integration.test.ts
```

## Troubleshooting

### Review Loop Stuck

**Symptom**: Same task re-reviews indefinitely

**Check**:
- Are `T01-CODE-REVIEW.md` and `REVIEW-STATE.json` out of sync?
- Does status line exist but issues aren't being marked FIXED?

**Fix**:
```bash
rm .gsd/milestones/M001/slices/S01/tasks/T01-REVIEW-STATE.json
/gsd auto
```

### False Positives

**Symptom**: Reviewer flagging non-issues

**Common causes**:
- TODO comments left in code
- Stub functions not yet implemented
- Edge cases intentionally not handled

**Mitigation**:
- Mark non-blocking with `// TODO: future work` comment
- Use `[no-review]` for intentional placeholders
- Update review prompt to skip known patterns

## Future Enhancements

- [ ] Configuration to exclude specific files from review
- [ ] Custom review rules per project
- [ ] Integration with static analysis tools
- [ ] Review metrics dashboard
- [ ] Smart skip: no review if changes < X lines
